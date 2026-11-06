import 'maplibre-gl/dist/maplibre-gl.css';
import * as maplibregl from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { PMTiles, Protocol, type RangeResponse, type Source } from 'pmtiles';
import { esc, KIND_TR, lampV2 } from './format';
import { getToken } from './admin';
import { PALETTE } from './palette';
import { declutter, placeBadges } from './declutter';
import { api, link, type Species } from './species';
import { BANDS_V2 } from '@av-livn/scoring';

// Sequential depth scale: shallow = light, deep = dark (blue). Edges match bathy/contours.py BAND_EDGES_M.
const DEPTH_STOPS: [number, string][] = [
  [0, '#9fd3e6'], [2, '#7cc0dc'], [5, '#5aa9cf'], [10, '#3f90bd'], [15, '#2f78a6'], [20, '#25648f'],
  [30, '#1d5279'], [50, '#164264'], [75, '#113551'], [100, '#0d2a41'], [150, '#0a2234'], [200, '#081b2a'],
];
// Water beyond the bathymetry: mid-depth tone, so the faded edge blends in. BATHY_BBOX mirrors pipeline av_pipeline/__init__.py.
const OPEN_WATER = '#11293a';
const BATHY_BBOX = { south: 40.25, west: 28.05, north: 40.65, east: 29.3 };
const LAND = '#22313a';
const OFM = 'https://tiles.openfreemap.org';
const NAME = ['coalesce', ['get', 'name:tr'], ['get', 'name']];

type Spot = {
  id: string; name: string; kind: string; place: string | null; lat: number; lon: number; alt: { lat: number; lon: number } | null;
  access: string | null; score: { total: number | null; p10: number | null; p90: number | null; rank: number | null; gated: boolean };
};

let setUp = false;

/** The archive is small (~0.5 MB): fetched once, byte ranges served from memory (static assets ignore Range). */
class WholeFileSource implements Source {
  private buf: Promise<ArrayBuffer>;
  constructor(private url: string) {
    this.buf = fetch(url).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`tiles HTTP ${r.status}`))));
  }
  getKey(): string {
    return this.url;
  }
  async getBytes(offset: number, length: number): Promise<RangeResponse> {
    return { data: (await this.buf).slice(offset, offset + length) };
  }
}

const TILES_URL = `${location.origin}/tiles/bathy.pmtiles`;
function setup() {
  if (setUp) return;
  setUp = true;
  maplibregl.setWorkerUrl(workerUrl);
  const protocol = new Protocol();
  protocol.add(new PMTiles(new WholeFileSource(TILES_URL)));
  maplibregl.addProtocol('pmtiles', protocol.tile);
}

export interface MapOpts {
  container: HTMLElement;
  /** Selected hour (ISO); null = now. Markers are coloured for this hour. */
  at?: string | null;
  /** Spot marker tapped; default: the small floating card (needs #card in the page). */
  onSpot?: (id: string) => void;
  focusId?: string | null;
  bounds?: [[number, number], [number, number]];
  /** H3: species whose scores colour the markers. */
  species?: Species;
  /** M3: spot to highlight (the plan's pick). */
  highlight?: string | null;
}
export interface MapApi {
  setHour(at: string | null): Promise<void>;
  setSpecies(s: Species): Promise<void>;
  resize(): void;
  flyTo(id: string): void;
  /** M3: highlight the plan's pick (null clears). */
  highlight(id: string | null): void;
}

/** I2: MapLibre 6 needs WebGL2. Without it the map is replaced by a note; list, plan and heat map keep working. */
export function webgl2Ok(): boolean {
  try {
    return !!document.createElement('canvas').getContext('webgl2');
  } catch {
    return false;
  }
}
const NOOP: MapApi = { setHour: async () => {}, setSpecies: async () => {}, resize: () => {}, flyTo: () => {}, highlight: () => {} };
function noMap(container: HTMLElement, why: string): MapApi {
  const note = document.createElement('div');
  note.className = 'map-loading map-off-note';
  note.setAttribute('role', 'status');
  note.textContent = `Harita bu cihazda açılamıyor (${why}). Mera listesi, saatler ve takım önerisi çalışıyor.`;
  container.replaceChildren(note);
  container.dataset.noMap = '1';
  return NOOP;
}

export function mountMap(o: MapOpts): MapApi {
  if (!webgl2Ok()) return noMap(o.container, 'tarayıcıda WebGL2 yok');
  try {
    return mountMapInner(o);
  } catch (e) {
    console.warn('map', e);
    return noMap(o.container, 'harita motoru başlatılamadı');
  }
}

function mountMapInner(o: MapOpts): MapApi {
setup();
const ui = (id: string) => document.getElementById(id);
const loading = document.createElement('div');
loading.className = 'map-loading';
loading.setAttribute('role', 'status');
loading.textContent = 'Meralar yükleniyor…';
o.container.append(loading);
let at: string | null = o.at ?? null;
let species: Species = o.species ?? 'istavrit';
let pickId: string | null = o.highlight ?? null;
let setPick: (id: string | null) => void = () => {};

const scaleEl = ui('scale');
if (scaleEl) scaleEl.innerHTML = DEPTH_STOPS.filter((_, i) => i % 2 === 0)
  .map(([d, c], i) => `<li style="background:${c};color:${i < 2 ? '#0e1c27' : '#dbe6ea'}">${d}</li>`)
  .join('');
const legendEl = ui('legend') as HTMLDetailsElement | null;
if (legendEl && o.container.clientWidth >= 700) legendEl.open = true;

/** Soft edge: rings inside the bathymetry bbox, increasingly opaque open-water colour towards the edge, plus an
 *  opaque frame just outside it (the contoured raster reaches half a DTM cell beyond the bbox). */
function fadeRings(n = 14, width = 0.05) {
  const b = BATHY_BBOX;
  const ring = (d: number) => [[b.west + d, b.south + d], [b.east - d, b.south + d], [b.east - d, b.north - d], [b.west + d, b.north - d], [b.west + d, b.south + d]];
  const band = (d0: number, d1: number, a: number) => ({
    type: 'Feature' as const,
    properties: { a },
    geometry: { type: 'Polygon' as const, coordinates: [ring(d0), ring(d1).reverse()] },
  });
  return {
    type: 'FeatureCollection' as const,
    features: [band(-0.02, 0, 1), ...Array.from({ length: n }, (_, k) => band((width * k) / n, (width * (k + 1)) / n, 1 - (k + 0.5) / n))],
  };
}

const map = new maplibregl.Map({
  container: o.container,
  attributionControl: false,
  // Spots' extent: on a phone this keeps the coast in view instead of fitting the whole bathymetry box.
  bounds: o.bounds ?? [[28.76, 40.33], [29.18, 40.54]],
  fitBoundsOptions: { padding: { top: 50, bottom: 20, left: 10, right: 10 } },
  minZoom: 8,
  maxZoom: 16,
  maxBounds: [[28.3, 40.1], [29.6, 40.8]],
  style: {
    version: 8,
    glyphs: `${OFM}/fonts/{fontstack}/{range}.pbf`,
    sources: {
      bathy: { type: 'vector', url: `pmtiles://${TILES_URL}`, attribution: '<a href="https://emodnet.ec.europa.eu/en/bathymetry">EMODnet Bathymetry</a> DTM 2024' },
      ofm: { type: 'vector', url: `${OFM}/planet`, attribution: '<a href="https://openfreemap.org">OpenFreeMap</a> <a href="https://www.openmaptiles.org/">© OpenMapTiles</a>' },
      fade: { type: 'geojson', data: fadeRings() },
      labels: { type: 'geojson', data: '/tiles/labels.geojson' },
    },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': OPEN_WATER } },
      {
        id: 'bands', type: 'fill', source: 'bathy', 'source-layer': 'bands',
        paint: { 'fill-color': ['step', ['get', 'dmin'], DEPTH_STOPS[0]![1], ...DEPTH_STOPS.slice(1).flatMap(([d, c]) => [d, c])] as never, 'fill-antialias': false },
      },
      // G5: "belirsiz derinlik" (interpolated DTM) is optional, off by default; the hatch image is registered on
      // load before the layer can be shown (tiles laid out before the image existed drew no hatch).
      { id: 'interp', type: 'fill', source: 'bathy', 'source-layer': 'interp', layout: { visibility: 'none' }, paint: { 'fill-pattern': 'hatch', 'fill-opacity': 0.55 } },
      {
        id: 'contours', type: 'line', source: 'bathy', 'source-layer': 'contours', filter: ['!=', ['get', 'q'], 0],
        paint: {
          'line-color': '#dbe6ea',
          'line-opacity': ['match', ['get', 'depth'], [10, 20, 50, 100], 0.55, 0.28],
          'line-width': ['interpolate', ['linear'], ['zoom'], 9, 0.4, 14, 1.2],
        },
      },
      {
        // contours over interpolated (GEBCO-filled) cells: dashed and faint
        id: 'contours-i', type: 'line', source: 'bathy', 'source-layer': 'contours', filter: ['==', ['get', 'q'], 0],
        paint: {
          'line-color': '#dbe6ea',
          'line-opacity': ['match', ['get', 'depth'], [10, 20, 50, 100], 0.3, 0.16],
          'line-width': ['interpolate', ['linear'], ['zoom'], 9, 0.4, 14, 1],
          'line-dasharray': [3, 3],
        },
      },
      {
        id: 'survey-line', type: 'line', source: 'bathy', 'source-layer': 'survey',
        paint: { 'line-color': '#e9d9a6', 'line-opacity': 0.75, 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.8, 14, 1.4] },
      },
      { id: 'fade', type: 'fill', source: 'fade', paint: { 'fill-color': OPEN_WATER, 'fill-opacity': ['get', 'a'], 'fill-antialias': false } },
      { id: 'land', type: 'fill', source: 'bathy', 'source-layer': 'land', paint: { 'fill-color': LAND } },
      { id: 'lakes', type: 'fill', source: 'ofm', 'source-layer': 'water', filter: ['in', ['get', 'class'], ['literal', ['lake', 'river', 'pond']]], paint: { 'fill-color': '#1b3a4d' } },
      {
        id: 'roads', type: 'line', source: 'ofm', 'source-layer': 'transportation', minzoom: 9,
        filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary', 'secondary', 'tertiary']]],
        paint: { 'line-color': '#55697a', 'line-width': ['interpolate', ['linear'], ['zoom'], 9, ['match', ['get', 'class'], ['motorway', 'trunk'], 1.2, 0.5], 14, ['match', ['get', 'class'], ['motorway', 'trunk'], 3, 1.6]] },
      },
      {
        id: 'water-names', type: 'symbol', source: 'ofm', 'source-layer': 'water_name',
        layout: { 'text-field': NAME as never, 'text-font': ['Noto Sans Italic'], 'text-size': ['interpolate', ['linear'], ['zoom'], 9, 12, 13, 15], 'text-letter-spacing': 0.08, 'text-max-width': 8 },
        paint: { 'text-color': '#9fc3d6', 'text-halo-color': OPEN_WATER, 'text-halo-width': 1.2 },
      },
      {
        id: 'places', type: 'symbol', source: 'ofm', 'source-layer': 'place',
        filter: ['in', ['get', 'class'], ['literal', ['city', 'town', 'village', 'suburb', 'hamlet', 'island']]],
        layout: {
          'text-field': NAME as never, 'text-font': ['Noto Sans Regular'], 'text-max-width': 8,
          'text-size': ['match', ['get', 'class'], ['city', 'town'], 14, 11.5],
          'symbol-sort-key': ['match', ['get', 'class'], 'city', 0, 'town', 1, 'village', 2, 3],
        },
        paint: { 'text-color': '#c9d6dc', 'text-halo-color': LAND, 'text-halo-width': 1.4 },
      },
      {
        id: 'capes', type: 'symbol', source: 'labels', minzoom: 10,
        layout: {
          'text-field': ['get', 'name'], 'text-font': ['Noto Sans Italic'], 'text-size': 11, 'text-max-width': 7,
          'text-variable-anchor': ['left', 'right', 'top', 'bottom'], 'text-radial-offset': 0.4,
        },
        paint: { 'text-color': ['match', ['get', 'kind'], 'cape', '#e7d7b0', '#9fc3d6'], 'text-halo-color': '#0e1c27', 'text-halo-width': 1.2 },
      },
      {
        id: 'survey-label', type: 'symbol', source: 'bathy', 'source-layer': 'survey',
        layout: { 'symbol-placement': 'line', 'symbol-spacing': 420, 'text-field': 'ölçülmüş alan', 'text-font': ['Noto Sans Italic'], 'text-size': 11, 'text-offset': [0, 0.9] },
        paint: { 'text-color': '#e9d9a6', 'text-halo-color': '#0e1c27', 'text-halo-width': 1.2 },
      },
    ],
  },
});
map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
map.addControl(new maplibregl.ScaleControl({ unit: 'metric', maxWidth: 110 }), 'bottom-right');
map.addControl(
  new maplibregl.AttributionControl({ compact: true, customAttribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> katkıcıları · Copernicus Marine · Open-Meteo' }),
  'bottom-right',
);

// Diagonal hatch for the optional "belirsiz derinlik" layer (interpolated, GEBCO-filled areas).
const addHatch = (id = 'hatch', stroke = 'rgba(219,230,234,0.85)') => {
  if (map.hasImage(id)) return;
  const n = 8;
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d')!;
  g.strokeStyle = stroke;
  g.lineWidth = 1.6;
  g.beginPath();
  g.moveTo(0, n);
  g.lineTo(n, 0);
  g.moveTo(-n / 2, n / 2);
  g.lineTo(n / 2, -n / 2);
  g.moveTo(n / 2, n + n / 2);
  g.lineTo(n + n / 2, n / 2);
  g.stroke();
  map.addImage(id, g.getImageData(0, 0, n, n), { pixelRatio: 1 });
};
// M3: forbidden areas (port, industry, military) are a red hatch with a legend entry, never a text label
const addForbHatch = () => addHatch('hatch-forb', 'rgba(214,80,72,0.75)');
map.on('styleimagemissing', (e) => (e.id === 'hatch' ? addHatch() : e.id === 'hatch-forb' ? addForbHatch() : undefined));

const card = (ui('card') ?? document.createElement('aside')) as HTMLElement;
function showCard(s: Spot) {
  card.hidden = false;
  const sc = s.score;
  const band = sc.p10 !== null && sc.p90 !== null ? `bant ${Math.round(sc.p10)}–${Math.round(sc.p90)}` : '';
  card.innerHTML = `<span class="lamp" id="card-lamp"></span>
    <div><h2>${esc(s.name)}</h2><p>${esc([KIND_TR[s.kind] ?? s.kind, s.place].filter(Boolean).join(', '))}</p>
    <p>${sc.rank ? `Bu saatte ${spotCount} mera içinde <b>${sc.rank}.</b>` : 'Puan yok'}${band ? ` · ${band}` : ''}</p></div>
    <button class="x" type="button" aria-label="Kartı kapat">×</button>
    <a class="go button" href="${link(`/mera/?id=${encodeURIComponent(s.id)}`, species)}">Ayrıntılar ve 72 saat</a>`;
  lampV2(card.querySelector<HTMLElement>('#card-lamp')!, sc.total, sc.gated);
  card.querySelector('button.x')!.addEventListener('click', () => (card.hidden = true));
}

let spotCount = 0;
let spots: Spot[] = [];
let byId = new Map<string, Spot>();
const empty = { type: 'FeatureCollection' as const, features: [] };
const fetchSpots = async () => {
  const res = await fetch(api(`/api/spots${at ? `?at=${encodeURIComponent(at)}` : ''}`, species), { cache: 'no-cache' }).then((r) => r.json()).catch(() => ({ spots: [] }));
  spots = res.spots ?? [];
  spotCount = spots.length;
  byId = new Map(spots.map((s) => [s.id, s]));
};
const spotsReady = fetchSpots();
let layout: () => void = () => {};

map.on('load', async () => {
  addHatch();
  const unc = ui('show-interp') as HTMLInputElement | null;
  unc?.addEventListener('change', () => map.setLayoutProperty('interp', 'visibility', unc.checked ? 'visible' : 'none'));
  // D1/E4: forbidden commercial ports and inventory proposals (approved ones are already in the spot list).
  const [cand, forb, drawn] = await Promise.all(['/tiles/candidates.geojson', '/tiles/forbidden.geojson', '/api/forbidden'].map((u) => fetch(u).then((r) => (r.ok ? r.json() : empty)).catch(() => empty)));
  // F1: commercial ports from OSM plus owner-drawn areas (e.g. Gemport, Roda)
  forb.features = [...(forb.features ?? []), ...(drawn.features ?? [])];
  await spotsReady;
  cand.features = (cand.features ?? []).filter((f: { properties: { id: string } }) => !byId.has(f.properties.id));
  map.addSource('forbidden', { type: 'geojson', data: forb });
  addForbHatch();
  map.addLayer({ id: 'forb-fill', type: 'fill', source: 'forbidden', paint: { 'fill-pattern': 'hatch-forb', 'fill-opacity': 0.9 } });
  map.addLayer({ id: 'forb-line', type: 'line', source: 'forbidden', paint: { 'line-color': '#d65048', 'line-width': 1.2, 'line-opacity': 0.8 } });
  // Candidates: hollow diamonds (shape differs from the scored discs, not only colour), 14–22 px.
  const D = 32;
  const diamond = new ImageData(2 * D, 2 * D);
  for (let y = 0; y < 2 * D; y++)
    for (let x = 0; x < 2 * D; x++) {
      const m = Math.abs(x + 0.5 - D) + Math.abs(y + 0.5 - D);
      const edge = Math.abs(m - D * 0.8);
      diamond.data[(y * 2 * D + x) * 4 + 3] = m <= D * 0.95 ? Math.max(0, Math.min(255, Math.round(255 - edge * 18))) : 0;
    }
  map.addImage('diamond', diamond, { sdf: true, pixelRatio: 2 });
  map.addSource('cands', { type: 'geojson', data: cand });
  map.addLayer({
    id: 'cands', type: 'symbol', source: 'cands',
    layout: { 'icon-image': 'diamond', 'icon-size': ['interpolate', ['linear'], ['zoom'], 9, 0.45, 14, 0.7], 'icon-allow-overlap': true },
    paint: { 'icon-color': '#b9c4c9', 'icon-halo-color': '#0e1c27', 'icon-halo-width': 1.5 },
  });
  map.addLayer({
    id: 'cand-labels', type: 'symbol', source: 'cands', minzoom: 12.5,
    layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Regular'], 'text-size': 10.5, 'text-offset': [0, 1.2], 'text-anchor': 'top', 'text-max-width': 9 },
    paint: { 'text-color': '#b9c4c9', 'text-halo-color': '#0e1c27', 'text-halo-width': 1.3 },
  });
  const toggle = (box: string, layers: string[]) => {
    const el = ui(box) as HTMLInputElement | null;
    el?.addEventListener('change', () => layers.forEach((l) => map.setLayoutProperty(l, 'visibility', el.checked ? 'visible' : 'none')));
  };
  toggle('show-cand', ['cands', 'cand-labels']);
  toggle('show-forb', ['forb-fill', 'forb-line']);

  // E4: the explanation opens next to the point; the owner can approve/reject/rename right there.
  const popup = new maplibregl.Popup({ closeButton: true, maxWidth: '300px', className: 'av-pop' });
  map.on('click', 'cands', (e) => {
    const f = e.features?.[0];
    const p = f?.properties as { id: string; name: string; type_tr: string; place: string | null } | undefined;
    if (!f || !p) return;
    const admin = !!getToken();
    const place = p.place && p.place !== 'null' ? `, ${esc(p.place)}` : '';
    popup
      .setLngLat((f.geometry as GeoJSON.Point).coordinates as [number, number])
      .setHTML(`<b>${esc(p.name)}</b><p>${esc(p.type_tr)}${place}</p><p>Aday mera: OpenStreetMap'ten önerildi, onaylanınca puanlanır.</p>${
        admin
          ? `<div class="actions"><button class="btn small" data-act="candidate">Onayla</button><button class="btn small secondary" data-act="rejected">Reddet</button><a class="link" href="/admin/adaylar/?id=${encodeURIComponent(p.id)}">Düzenle</a></div><p class="pop-msg" role="status"></p>`
          : `<a class="link" href="/admin/adaylar/?id=${encodeURIComponent(p.id)}">Yönetici olarak onayla</a>`
      }`)
      .addTo(map);
    popup.getElement().querySelectorAll<HTMLButtonElement>('button[data-act]').forEach((btn) =>
      btn.addEventListener('click', async () => {
        const r = await fetch(`/api/admin/spots/${encodeURIComponent(p.id)}`, { method: 'PATCH', headers: { authorization: `Bearer ${getToken()}`, 'content-type': 'application/json' }, body: JSON.stringify({ status: btn.dataset.act }) });
        const msg = popup.getElement().querySelector('.pop-msg')!;
        msg.textContent = r.ok ? (btn.dataset.act === 'candidate' ? 'Onaylandı: sonraki saatlik puanlamada listeye girer.' : 'Reddedildi.') : `Kaydedilmedi (${r.status}).`;
        if (r.ok) {
          cand.features = cand.features.filter((x: { properties: { id: string } }) => x.properties.id !== p.id);
          (map.getSource('cands') as maplibregl.GeoJSONSource).setData(cand);
        }
      }),
    );
  });
  map.on('mouseenter', 'cands', () => (map.getCanvas().style.cursor = 'pointer'));
  map.on('mouseleave', 'cands', () => (map.getCanvas().style.cursor = ''));

  // F1: owner draws a forbidden area (polygon): tap the corners, name it, save. Spots inside are hidden.
  if (getToken()) {
    const ctl = document.createElement('div');
    ctl.className = 'maplibregl-ctrl maplibregl-ctrl-group';
    ctl.innerHTML = '<button type="button" class="add-spot" title="Erişim yasak alan çiz" aria-label="Erişim yasak alan çiz">▱</button>';
    map.addControl({ onAdd: () => ctl, onRemove: () => ctl.remove() }, 'top-right');
    const pts: [number, number][] = [];
    map.addSource('draw', { type: 'geojson', data: empty });
    map.addLayer({ id: 'draw-line', type: 'line', source: 'draw', paint: { 'line-color': '#f5a83c', 'line-width': 2, 'line-dasharray': [2, 1] } });
    map.addLayer({ id: 'draw-pts', type: 'circle', source: 'draw', filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-radius': 4, 'circle-color': '#f5a83c' } });
    const panel = document.createElement('div');
    panel.className = 'draw-panel';
    panel.hidden = true;
    panel.innerHTML = `<p class="fs-2"><b>Erişim yasak alan</b> · köşelere dokunun (<span data-n>0</span> nokta)</p>
      <label>Ad<input data-name maxlength="80" placeholder="Gemport" /></label>
      <div class="actions"><button type="button" class="btn small" data-save disabled>Kaydet</button><button type="button" class="btn small secondary" data-cancel>İptal</button></div><p class="fs-2" data-msg role="status"></p>`;
    o.container.append(panel);
    let drawing = false;
    const redraw = () => {
      const ring = pts.length > 2 ? [...pts, pts[0]!] : pts;
      (map.getSource('draw') as maplibregl.GeoJSONSource).setData({
        type: 'FeatureCollection',
        features: [
          ...(ring.length > 1 ? [{ type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: ring } }] : []),
          ...pts.map((c) => ({ type: 'Feature' as const, properties: {}, geometry: { type: 'Point' as const, coordinates: c } })),
        ],
      });
      panel.querySelector('[data-n]')!.textContent = String(pts.length);
      (panel.querySelector('[data-save]') as HTMLButtonElement).disabled = pts.length < 3;
    };
    const stop = () => { drawing = false; pts.length = 0; redraw(); panel.hidden = true; map.getCanvas().style.cursor = ''; map.doubleClickZoom.enable(); };
    ctl.querySelector('button')!.addEventListener('click', () => {
      if (drawing) return stop();
      drawing = true;
      panel.hidden = false;
      map.doubleClickZoom.disable();
      map.getCanvas().style.cursor = 'crosshair';
    });
    map.on('click', (e) => {
      if (!drawing) return;
      pts.push([+e.lngLat.lng.toFixed(6), +e.lngLat.lat.toFixed(6)]);
      redraw();
    });
    panel.querySelector('[data-cancel]')!.addEventListener('click', stop);
    panel.querySelector('[data-save]')!.addEventListener('click', async () => {
      const name = (panel.querySelector('[data-name]') as HTMLInputElement).value.trim();
      const msg = panel.querySelector('[data-msg]')!;
      if (name.length < 2) return void (msg.textContent = 'Ad girin.');
      const r = await fetch('/api/admin/forbidden', { method: 'POST', headers: { authorization: `Bearer ${getToken()}`, 'content-type': 'application/json' }, body: JSON.stringify({ name, ring: pts }) });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) return void (msg.textContent = `Kaydedilmedi (${r.status}).`);
      forb.features.push({ type: 'Feature', properties: { id: b.id, name }, geometry: { type: 'Polygon', coordinates: [[...pts, pts[0]]] } });
      (map.getSource('forbidden') as maplibregl.GeoJSONSource).setData(forb);
      msg.textContent = `Kaydedildi; ${b.hide?.length ?? 0} mera gizlendi.`;
      drawing = false;
      pts.length = 0;
      redraw();
      map.getCanvas().style.cursor = '';
      map.doubleClickZoom.enable();
      setTimeout(() => (panel.hidden = true), 2500);
    });
  }

  // E4: owner adds a spot by tapping the map (e.g. a harbour missing in OSM).
  if (getToken()) {
    const ctl = document.createElement('div');
    ctl.className = 'maplibregl-ctrl maplibregl-ctrl-group';
    ctl.innerHTML = '<button type="button" class="add-spot" title="Haritaya dokunarak mera ekle" aria-label="Mera ekle">＋</button>';
    map.addControl({ onAdd: () => ctl, onRemove: () => ctl.remove() }, 'top-right');
    let adding = false;
    ctl.querySelector('button')!.addEventListener('click', () => {
      adding = !adding;
      map.getCanvas().style.cursor = adding ? 'crosshair' : '';
      ctl.querySelector('button')!.classList.toggle('on', adding);
    });
    map.on('click', (e) => {
      if (!adding) return;
      adding = false;
      map.getCanvas().style.cursor = '';
      ctl.querySelector('button')!.classList.remove('on');
      const dirs = ['K', 'KD', 'D', 'GD', 'G', 'GB', 'B', 'KB'];
      const add = new maplibregl.Popup({ maxWidth: '300px', className: 'av-pop' })
        .setLngLat(e.lngLat)
        .setHTML(`<b>Yeni mera</b><label>Ad<input name="n" maxlength="80" placeholder="Mudanya balıkçı barınağı" /></label>
          <label>Denize bakan yön<select name="d">${dirs.map((d, i) => `<option value="${i * 45}">${d}</option>`).join('')}</select></label>
          <div class="actions"><button class="btn small" data-save>Ekle</button></div><p class="pop-msg" role="status"></p>`)
        .addTo(map);
      const el = add.getElement();
      el.querySelector('[data-save]')!.addEventListener('click', async () => {
        const name = (el.querySelector('[name=n]') as HTMLInputElement).value.trim();
        if (!name) return ((el.querySelector('.pop-msg') as HTMLElement).textContent = 'Ad girin.');
        const r = await fetch('/api/admin/spots', {
          method: 'POST', headers: { authorization: `Bearer ${getToken()}`, 'content-type': 'application/json' },
          body: JSON.stringify({ name, lat: +e.lngLat.lat.toFixed(6), lon: +e.lngLat.lng.toFixed(6), shore_normal_deg: Number((el.querySelector('[name=d]') as HTMLSelectElement).value) }),
        });
        (el.querySelector('.pop-msg') as HTMLElement).textContent = r.ok ? 'Eklendi: hava verisi ve puan sonraki saatlik güncellemede gelir.' : `Eklenmedi (${r.status}).`;
      });
    });
  }

  map.addSource('spots', { type: 'geojson', data: empty });
  map.addSource('leaders', { type: 'geojson', data: empty });
  map.addLayer({ id: 'leaders', type: 'line', source: 'leaders', paint: { 'line-color': '#dbe6ea', 'line-opacity': 0.7, 'line-width': 1 } });
  map.addLayer({ id: 'true-pos', type: 'circle', source: 'leaders', filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-radius': 2.5, 'circle-color': '#dbe6ea' } });
  const color = ['step', ['get', 'total'], PALETTE.neutral.color, 0, PALETTE.bad.color, BANDS_V2.warn, PALETTE.warn.color, BANDS_V2.good, PALETTE.good.color];
  const R = 32;
  const disc = new ImageData(2 * R, 2 * R);
  for (let y = 0; y < 2 * R; y++)
    for (let x = 0; x < 2 * R; x++) {
      const d = Math.hypot(x + 0.5 - R, y + 0.5 - R);
      disc.data[(y * 2 * R + x) * 4 + 3] = Math.max(0, Math.min(255, Math.round(192 - (d - R * 0.75) * 24)));
    }
  map.addImage('disc', disc, { sdf: true, pixelRatio: 2 });
  map.addLayer({
    id: 'spot-labels', type: 'symbol', source: 'spots', minzoom: 12, // M3: far zoom shows settlement badges only
    layout: {
      'text-field': ['get', 'name'], 'text-font': ['Noto Sans Bold'], 'text-size': ['interpolate', ['linear'], ['zoom'], 9, 10.5, 14, 13],
      'text-variable-anchor': ['left', 'right', 'top', 'bottom', 'top-left', 'bottom-right', 'bottom-left', 'top-right'],
      'text-radial-offset': ['interpolate', ['linear'], ['zoom'], 9, 1.35, 14, 1.7], 'text-max-width': 9,
      'symbol-sort-key': ['get', 'rank'],
    },
    paint: { 'text-color': '#f3f6f7', 'text-halo-color': '#0e1c27', 'text-halo-width': 1.6 },
  });
  map.addLayer({
    id: 'spots', type: 'symbol', source: 'spots',
    layout: { 'icon-image': 'disc', 'icon-size': ['interpolate', ['linear'], ['zoom'], 9, 0.55, 14, 0.85], 'icon-allow-overlap': true },
    paint: { 'icon-color': color as never, 'icon-halo-color': '#0e1c27', 'icon-halo-width': 2 },
  });
  map.addLayer({
    id: 'spot-score', type: 'symbol', source: 'spots', minzoom: 11,
    layout: { 'text-field': ['to-string', ['get', 'score']], 'text-font': ['Noto Sans Bold'], 'text-size': 10, 'text-allow-overlap': true, 'text-ignore-placement': true },
    paint: { 'text-color': '#0e1c27' },
  });

  // G5: settlement badges at far zoom (visual grouping only; every spot keeps its own data and card).
  const P = 24;
  const pill = new ImageData(2 * P, 2 * P);
  for (let y = 0; y < 2 * P; y++)
    for (let x = 0; x < 2 * P; x++) {
      const dx = Math.max(0, Math.abs(x + 0.5 - P) - P * 0.35);
      const dy = Math.max(0, Math.abs(y + 0.5 - P) - P * 0.35);
      const d = Math.hypot(dx, dy);
      pill.data[(y * 2 * P + x) * 4 + 3] = Math.max(0, Math.min(255, Math.round(192 - (d - P * 0.5) * 24)));
    }
  map.addImage('pill', pill, { sdf: true, pixelRatio: 2, content: [P * 0.6, P * 0.6, P * 1.4, P * 1.4], stretchX: [[P * 0.9, P * 1.1]], stretchY: [[P * 0.9, P * 1.1]] });
  map.addSource('badges', { type: 'geojson', data: empty });
  map.addLayer({
    id: 'badges', type: 'symbol', source: 'badges',
    layout: {
      'icon-image': 'pill', 'icon-text-fit': 'both', 'icon-text-fit-padding': [3, 7, 3, 7], 'icon-allow-overlap': true, 'text-allow-overlap': true,
      'text-field': ['get', 'label'], 'text-font': ['Noto Sans Bold'], 'text-size': 12,
    },
    paint: { 'icon-color': color as never, 'icon-halo-color': '#0e1c27', 'icon-halo-width': 1.5, 'text-color': '#0e1c27' },
  });

  // M3: the plan's pick, highlighted at every zoom (ring + name), above badges and markers
  map.addSource('pick', { type: 'geojson', data: empty });
  map.addLayer({ id: 'pick-ring', type: 'circle', source: 'pick', paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 9, 14, 15], 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': '#f5a83c', 'circle-stroke-width': 3 } });
  map.addLayer({
    id: 'pick-label', type: 'symbol', source: 'pick',
    layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Bold'], 'text-size': 13, 'text-anchor': 'top', 'text-offset': [0, 1.3], 'text-max-width': 12, 'text-allow-overlap': true },
    paint: { 'text-color': '#f5a83c', 'text-halo-color': '#0e1c27', 'text-halo-width': 1.8 },
  });
  setPick = (id) => {
    pickId = id;
    const s = id ? byId.get(id) : undefined;
    (map.getSource('pick') as maplibregl.GeoJSONSource | undefined)?.setData({
      type: 'FeatureCollection',
      features: s ? [{ type: 'Feature', geometry: { type: 'Point', coordinates: [s.lon, s.lat] }, properties: { name: s.name } }] : [],
    });
  };
  setPick(pickId);
  const p0 = pickId ? byId.get(pickId) : undefined;
  if (p0 && !o.focusId) map.jumpTo({ center: [p0.lon, p0.lat] });

  /**
   * G5: below BADGE_ZOOM the spots of one settlement show as one badge ("Armutlu · 18 mera", best score colour);
   * above it every spot sits at its true position. Overlapping markers are spread on a ring (leader lines to the
   * true position) only at close zoom (≥ SPIDER_ZOOM) and for groups of at most SPIDER_MAX.
   */
  const BADGE_ZOOM = 12;
  const SPIDER_ZOOM = 14;
  const SPIDER_MAX = 8;
  layout = () => {
    const far = map.getZoom() < BADGE_ZOOM;
    const { badges, single } = far
      ? placeBadges(spots.map((s) => ({ id: s.id, place: s.place, lon: s.lon, lat: s.lat, total: s.score.total })))
      : { badges: [], single: spots.map((s) => s.id) };
    const keep = new Set(single);
    const shownSpots = spots.filter((s) => keep.has(s.id));
    (map.getSource('badges') as maplibregl.GeoJSONSource).setData({
      type: 'FeatureCollection',
      features: badges.map((b) => ({
        type: 'Feature', geometry: { type: 'Point', coordinates: [b.lon, b.lat] },
        properties: { place: b.place, ids: b.ids.join(','), total: b.best ?? -1, label: `${b.place} · ${b.count} mera` },
      })),
    });
    const px = shownSpots.map((s) => map.project([s.lon, s.lat]));
    const shown = map.getZoom() >= SPIDER_ZOOM ? declutter(px, 24, SPIDER_MAX) : px;
    const feats = shownSpots.map((s, i) => {
      const ll = map.unproject([shown[i]!.x, shown[i]!.y]);
      return { s, ll, moved: Math.hypot(shown[i]!.x - px[i]!.x, shown[i]!.y - px[i]!.y) > 1 };
    });
    (map.getSource('spots') as maplibregl.GeoJSONSource).setData({
      type: 'FeatureCollection',
      features: feats.map(({ s, ll }) => ({
        type: 'Feature', geometry: { type: 'Point', coordinates: [ll.lng, ll.lat] },
        properties: { id: s.id, name: s.name, total: s.score.total ?? -1, score: s.score.total === null ? '–' : Math.round(s.score.total), rank: s.score.rank ?? 99 },
      })),
    });
    (map.getSource('leaders') as maplibregl.GeoJSONSource).setData({
      type: 'FeatureCollection',
      features: feats.filter((f) => f.moved).flatMap(({ s, ll }) => [
        { type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: [[s.lon, s.lat], [ll.lng, ll.lat]] } },
        { type: 'Feature' as const, properties: {}, geometry: { type: 'Point' as const, coordinates: [s.lon, s.lat] } },
      ]),
    });
  };
  // Badge click: the settlement's spots as a list (best first); a row flies to the spot and opens its card.
  const listPop = new maplibregl.Popup({ closeButton: true, maxWidth: '320px', className: 'av-pop' });
  map.on('click', 'badges', (e) => {
    const f = e.features?.[0];
    const p = f?.properties as { place: string; ids: string } | undefined;
    if (!f || !p) return;
    const rows = p.ids.split(',').map((id) => byId.get(id)!).filter(Boolean).sort((a, b) => (b.score.total ?? -1) - (a.score.total ?? -1));
    listPop
      .setLngLat((f.geometry as GeoJSON.Point).coordinates as [number, number])
      .setHTML(`<b>${esc(p.place)} · ${rows.length} mera</b><ol class="pop-list">${rows
        .map((s) => `<li><button type="button" data-id="${esc(s.id)}"><span>${esc(s.name)}</span><b>${s.score.total === null ? '–' : Math.round(s.score.total)}</b></button></li>`)
        .join('')}</ol>`)
      .addTo(map);
    listPop.getElement().querySelectorAll<HTMLButtonElement>('button[data-id]').forEach((btn) =>
      btn.addEventListener('click', () => {
        const s = byId.get(btn.dataset.id!);
        if (!s) return;
        listPop.remove();
        map.easeTo({ center: [s.lon, s.lat], zoom: Math.max(map.getZoom(), 14.5) });
        if (o.onSpot) o.onSpot(s.id);
        else showCard(s);
      }),
    );
  });
  map.on('mouseenter', 'badges', () => (map.getCanvas().style.cursor = 'pointer'));
  map.on('mouseleave', 'badges', () => (map.getCanvas().style.cursor = ''));
  layout();
  loading.hidden = true;
  map.on('zoomend', layout);
  map.on('moveend', layout);

  map.on('click', 'spots', (e) => {
    const id = e.features?.[0]?.properties?.id as string | undefined;
    if (!id) return;
    if (o.onSpot) o.onSpot(id);
    else if (byId.get(id)) showCard(byId.get(id)!);
  });
  map.on('mouseenter', 'spots', () => (map.getCanvas().style.cursor = 'pointer'));
  map.on('mouseleave', 'spots', () => (map.getCanvas().style.cursor = ''));
  const f = o.focusId ? byId.get(o.focusId) : undefined;
  if (f) {
    map.jumpTo({ center: [f.lon, f.lat], zoom: 14 });
    if (!o.onSpot) showCard(f);
  }
  o.container.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show');
  o.container.dataset.ready = String(spots.length);
});

return {
  async setSpecies(next) {
    species = next;
    loading.hidden = false;
    await fetchSpots();
    layout();
    loading.hidden = true;
  },
  async setHour(next) {
    at = next;
    loading.hidden = false;
    await fetchSpots();
    layout();
    loading.hidden = true;
  },
  resize: () => map.resize(),
  highlight(id) {
    const changed = id !== pickId;
    pickId = id;
    setPick(id);
    const s = id ? byId.get(id) : undefined;
    if (changed && s) map.easeTo({ center: [s.lon, s.lat] });
  },
  flyTo(id) {
    const s = byId.get(id);
    if (s) map.easeTo({ center: [s.lon, s.lat], zoom: Math.max(map.getZoom(), 12.5) });
  },
};
}
