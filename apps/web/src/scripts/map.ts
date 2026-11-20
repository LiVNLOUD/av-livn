import 'maplibre-gl/dist/maplibre-gl.css';
import * as maplibregl from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { PMTiles, Protocol, type RangeResponse, type Source } from 'pmtiles';
import { esc, KIND_TR, lampV2 } from './format';
import { getToken } from './admin';
import { badgeLabel, declutter, mergeBadges, placeBadges, spotFeatures } from './declutter';
/** O1: zoom when going to a spot. */
export const FOCUS_ZOOM = 15.5;
import { api, link, type Species } from './species';
import { latest, STALE } from './hour';
import { skyAt } from '@av-livn/scoring';
import { icon, type IconName } from './icons';

// V1.5 map identity: colours come from the design tokens (tokens-v.css) of the current theme — at most five sea
// tones by depth (0–2, 2–5, 5–10, 10–30, > 30 m), quiet land, the suitability scale for spots, white selection ring.
// BATHY_BBOX mirrors pipeline av_pipeline/__init__.py.
const DEPTH_EDGES = [0, 2, 5, 10, 30] as const;
const BATHY_BBOX = { south: 40.25, west: 28.05, north: 40.65, east: 29.3 };
type Pal = Record<'sea1' | 'sea2' | 'sea3' | 'sea4' | 'sea5' | 'open' | 'land' | 'landLine' | 'contour' | 'fg1' | 'fg2' | 'fg3' | 'ink0' | 'sel' | 'danger' | 'warn' | 'f0' | 'f1' | 'f2' | 'f3' | 'f4' | 't0' | 't1' | 't2' | 't3' | 't4' | 'labelLand', string>;
function palette(): Pal {
  const cs = getComputedStyle(document.documentElement);
  const v = (n: string, d: string) => cs.getPropertyValue(n).trim() || d;
  return {
    sea1: v('--sea-1', '#2c8f98'), sea2: v('--sea-2', '#1f7380'), sea3: v('--sea-3', '#185d6b'), sea4: v('--sea-4', '#134a58'), sea5: v('--sea-5', '#0f3946'),
    open: v('--sea-open', '#0c2f3b'), land: v('--land', '#262e34'), landLine: v('--land-line', '#3b4750'), contour: v('--contour', 'rgba(214,236,240,.32)'),
    fg1: v('--fg-1', '#e8eff3'), fg2: v('--fg-2', '#b0c2cc'), fg3: v('--fg-3', '#8ea3b0'), ink0: v('--ink-0', '#08111a'), sel: v('--sel', '#f5f8fa'),
    danger: v('--danger', '#ff7666'), warn: v('--warn', '#f2b84b'), labelLand: v('--land-label', '#9aa8b1'),
    f0: v('--fit-0', '#46277a'), f1: v('--fit-1', '#30608d'), f2: v('--fit-2', '#1f928b'), f3: v('--fit-3', '#4fbf6a'), f4: v('--fit-4', '#a6dc4a'),
    t0: v('--fit-t0', '#e8eff3'), t1: v('--fit-t1', '#e8eff3'), t2: v('--fit-t2', '#04121e'), t3: v('--fit-t3', '#04121e'), t4: v('--fit-t4', '#04121e'),
  };
}
let PAL = palette();
const depthColor = () => ['step', ['get', 'dmin'], PAL.sea1, 2, PAL.sea2, 5, PAL.sea3, 10, PAL.sea4, 30, PAL.sea5];
/** Suitability step colour for a spot's total (−1 = no score) — the same steps as the timeline (timeline.ts FIT_STEPS). */
const fitColor = () => ['step', ['get', 'total'], PAL.fg3, 0, PAL.f0, 30, PAL.f1, 45, PAL.f2, 60, PAL.f3, 75, PAL.f4];
const fitInk = () => ['step', ['get', 'total'], PAL.ink0, 0, PAL.t0, 30, PAL.t1, 45, PAL.t2, 60, PAL.t3, 75, PAL.t4];
const OFM = 'https://tiles.openfreemap.org';
const NAME = ['coalesce', ['get', 'name:tr'], ['get', 'name']];

type Spot = {
  id: string; name: string; kind: string; place: string | null; lat: number; lon: number; alt: { lat: number; lon: number } | null;
  access: string | null; lamp_state?: string; score: { total: number | null; p10: number | null; p90: number | null; rank: number | null; gated: boolean };
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
  /** O1: fly to a spot (zoom ~15.5) and ring it. */
  focus(id: string): void;
  /** P5: the MapLibre map once its layers are in place (null when the map could not start). */
  ready: Promise<maplibregl.Map | null>;
  /** P5: spots as currently shown (position, safety cap at the selected hour). */
  spotsNow(): { id: string; lat: number; lon: number; gated: boolean }[];
  /** V1.4: keep the part of the map under a floating panel out of the way (camera padding in px). */
  setPadding(p: { left?: number; top?: number; right?: number; bottom?: number }): void;
}

/** I2: MapLibre 6 needs WebGL2. Without it the map is replaced by a note; list, plan and heat map keep working. */
export function webgl2Ok(): boolean {
  try {
    return !!document.createElement('canvas').getContext('webgl2');
  } catch {
    return false;
  }
}
const NOOP: MapApi = { setHour: async () => {}, setSpecies: async () => {}, resize: () => {}, flyTo: () => {}, highlight: () => {}, focus: () => {}, ready: Promise.resolve(null), spotsNow: () => [], setPadding: () => {} };
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
// P0: at close zoom the depth data is too coarse — say so where the fill fades out
const coarse = document.createElement('div');
coarse.className = 'map-coarse';
coarse.hidden = true;
coarse.textContent = 'Bu ölçekte derinlik verisi yetersiz (EMODnet DTM ~115 m); yalnız sığ konturlar kesikli gösteriliyor.';
o.container.append(coarse);
let at: string | null = o.at ?? null;
let species: Species = o.species ?? 'istavrit';
let pickId: string | null = o.highlight ?? null;
let setPick: (id: string | null) => void = () => {};

const scaleEl = ui('scale');
const drawScale = () => {
  if (scaleEl) scaleEl.innerHTML = DEPTH_EDGES.map((d, i) => `<li style="background:${[PAL.sea1, PAL.sea2, PAL.sea3, PAL.sea4, PAL.sea5][i]};color:${PAL.fg1}">${d}${i === DEPTH_EDGES.length - 1 ? '+' : ''}</li>`).join('');
};
drawScale();
// V1 / D2: the legend starts closed at every width; its small summary (scale, unit, hour) is always visible

/** V1.5: structure-type glyphs (and the lamp) as map images — the icon set drawn on a small dark disc, both themes. */
const KIND_IMAGES: IconName[] = ['iskele', 'mendirek', 'kordon', 'kaya', 'kumsal', 'dere-agzi', 'liman', 'marina', 'lamba'];
async function addKindImages(map: maplibregl.Map) {
  const S = 48; // drawn at 2× for sharpness (pixelRatio 2 → 24 px)
  await Promise.all(KIND_IMAGES.map((name) => new Promise<void>((res) => {
    const svg = icon(name, { size: 30 }).replace('<svg ', `<svg xmlns="http://www.w3.org/2000/svg" style="color:${PAL.fg1}" `).replace(/currentColor/g, PAL.fg1);
    const img = new Image(30, 30);
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = S; c.height = S;
      const g = c.getContext('2d')!;
      g.fillStyle = PAL.ink0; g.globalAlpha = 0.85; g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 1, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1;
      g.drawImage(img, (S - 30) / 2, (S - 30) / 2, 30, 30);
      const id = `k-${name}`;
      const data = g.getImageData(0, 0, S, S);
      if (map.hasImage(id)) map.updateImage(id, data); else map.addImage(id, data, { pixelRatio: 2 });
      res();
    };
    img.onerror = () => res();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  })));
}

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
  // V1.5: west edge past the Karacabey spots (lon 28.19); at 28.3 the camera could not reach them (no marker, ring or label)
  maxBounds: [[27.95, 40.1], [29.6, 40.8]],
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
      { id: 'bg', type: 'background', paint: { 'background-color': PAL.open } },
      {
        id: 'bands', type: 'fill', source: 'bathy', 'source-layer': 'bands',
        // P0: the ~115 m DTM must not look like close-range detail — the fill fades out from zoom 15 to 16
        paint: { 'fill-color': depthColor() as never, 'fill-antialias': false, 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 15, 1, 16, 0] as never },
      },
      // G5: "belirsiz derinlik" (interpolated DTM) is optional, off by default; the hatch image is registered on
      // load before the layer can be shown (tiles laid out before the image existed drew no hatch).
      { id: 'interp', type: 'fill', source: 'bathy', 'source-layer': 'interp', layout: { visibility: 'none' }, paint: { 'fill-pattern': 'hatch', 'fill-opacity': 0.55 } },
      {
        id: 'contours', type: 'line', source: 'bathy', 'source-layer': 'contours', filter: ['!=', ['get', 'q'], 0], maxzoom: 15,
        paint: {
          'line-color': PAL.contour,
          // V1.5: readable 5 / 10 / 20 / 50 m lines, the others faint
          'line-opacity': ['match', ['get', 'depth'], [5, 10, 20, 50], 1, 0.45],
          'line-width': ['interpolate', ['linear'], ['zoom'], 9, 0.4, 14, 1.2],
        },
      },
      {
        // contours over interpolated (GEBCO-filled) cells: dashed and faint
        id: 'contours-i', type: 'line', source: 'bathy', 'source-layer': 'contours', filter: ['==', ['get', 'q'], 0], maxzoom: 15,
        paint: {
          'line-color': PAL.contour,
          'line-opacity': ['match', ['get', 'depth'], [5, 10, 20, 50], 0.6, 0.3],
          'line-width': ['interpolate', ['linear'], ['zoom'], 9, 0.4, 14, 1],
          'line-dasharray': [3, 3],
        },
      },
      {
        // P0: close in, only the shallowest contours stay — dashed and faint (the DTM cannot resolve this scale)
        id: 'contours-near', type: 'line', source: 'bathy', 'source-layer': 'contours', minzoom: 15, filter: ['<=', ['get', 'depth'], 10],
        paint: { 'line-color': PAL.contour, 'line-opacity': 0.5, 'line-width': 1, 'line-dasharray': [3, 3] },
      },
      {
        id: 'survey-line', type: 'line', source: 'bathy', 'source-layer': 'survey',
        paint: { 'line-color': PAL.fg2, 'line-opacity': 0.75, 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.8, 14, 1.4] },
      },
      { id: 'fade', type: 'fill', source: 'fade', paint: { 'fill-color': PAL.open, 'fill-opacity': ['get', 'a'], 'fill-antialias': false } },
      { id: 'land', type: 'fill', source: 'bathy', 'source-layer': 'land', paint: { 'fill-color': PAL.land, 'fill-outline-color': PAL.landLine } },
      { id: 'lakes', type: 'fill', source: 'ofm', 'source-layer': 'water', filter: ['in', ['get', 'class'], ['literal', ['lake', 'river', 'pond']]], paint: { 'fill-color': PAL.sea4 } },
      {
        id: 'roads', type: 'line', source: 'ofm', 'source-layer': 'transportation', minzoom: 9,
        filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary', 'secondary', 'tertiary']]],
        paint: { 'line-color': PAL.landLine, 'line-width': ['interpolate', ['linear'], ['zoom'], 9, ['match', ['get', 'class'], ['motorway', 'trunk'], 1.2, 0.5], 14, ['match', ['get', 'class'], ['motorway', 'trunk'], 3, 1.6]] },
      },
      {
        id: 'water-names', type: 'symbol', source: 'ofm', 'source-layer': 'water_name',
        layout: { 'text-field': NAME as never, 'text-font': ['Noto Sans Italic'], 'text-size': ['interpolate', ['linear'], ['zoom'], 9, 12, 13, 15], 'text-letter-spacing': 0.08, 'text-max-width': 8 },
        paint: { 'text-color': PAL.fg2, 'text-halo-color': PAL.open, 'text-halo-width': 1.2 },
      },
      {
        id: 'places', type: 'symbol', source: 'ofm', 'source-layer': 'place',
        filter: ['in', ['get', 'class'], ['literal', ['city', 'town', 'village', 'suburb', 'hamlet', 'island']]],
        layout: {
          'text-field': NAME as never, 'text-font': ['Noto Sans Regular'], 'text-max-width': 8,
          'text-size': ['match', ['get', 'class'], ['city', 'town'], 14, 11.5],
          'symbol-sort-key': ['match', ['get', 'class'], 'city', 0, 'town', 1, 'village', 2, 3],
        },
        paint: { 'text-color': PAL.labelLand, 'text-halo-color': PAL.land, 'text-halo-width': 1.4 },
      },
      {
        id: 'capes', type: 'symbol', source: 'labels', minzoom: 10,
        layout: {
          'text-field': ['get', 'name'], 'text-font': ['Noto Sans Italic'], 'text-size': 11, 'text-max-width': 7,
          'text-variable-anchor': ['left', 'right', 'top', 'bottom'], 'text-radial-offset': 0.4,
        },
        paint: { 'text-color': ['match', ['get', 'kind'], 'cape', PAL.labelLand, PAL.fg2], 'text-halo-color': PAL.ink0, 'text-halo-width': 1.2 },
      },
      {
        id: 'survey-label', type: 'symbol', source: 'bathy', 'source-layer': 'survey',
        layout: { 'symbol-placement': 'line', 'symbol-spacing': 420, 'text-field': 'ölçülmüş alan', 'text-font': ['Noto Sans Italic'], 'text-size': 11, 'text-offset': [0, 0.9] },
        paint: { 'text-color': PAL.fg2, 'text-halo-color': PAL.ink0, 'text-halo-width': 1.2 },
      },
    ],
  },
});
// e2e hook (O1/O2 checks read zoom and rendered labels); no data beyond what the page shows
(o.container as HTMLElement & { __avMap?: unknown }).__avMap = map;

map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
const showCoarse = () => { coarse.hidden = map.getZoom() < 15; };
map.on('zoom', showCoarse);
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
const spotsReq = latest(); // V1.1: an older hour's answer never replaces the newer one
/** Loads the spots for the current hour and species; false if a newer request superseded this one. */
const fetchSpots = async (): Promise<boolean> => {
  const res = await spotsReq.run(() => fetch(api(`/api/spots${at ? `?at=${encodeURIComponent(at)}` : ''}`, species), { cache: 'no-cache' }).then((r) => r.json()).catch(() => ({ spots: [] })));
  if (res === STALE) return false;
  spots = res.spots ?? [];
  spotCount = spots.length;
  byId = new Map(spots.map((s) => [s.id, s]));
  return true;
};
const spotsReady = fetchSpots();
let layout: () => void = () => {};
let markReady: (m: maplibregl.Map) => void = () => {};
const ready = new Promise<maplibregl.Map | null>((r) => (markReady = r));

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
  map.addLayer({ id: 'forb-line', type: 'line', source: 'forbidden', paint: { 'line-color': PAL.danger, 'line-width': 1.2, 'line-opacity': 0.8 } });
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
    paint: { 'icon-color': PAL.fg3, 'icon-halo-color': PAL.ink0, 'icon-halo-width': 1.5 },
  });
  map.addLayer({
    id: 'cand-labels', type: 'symbol', source: 'cands', minzoom: 12.5,
    layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Regular'], 'text-size': 10.5, 'text-offset': [0, 1.2], 'text-anchor': 'top', 'text-max-width': 9 },
    paint: { 'text-color': PAL.fg2, 'text-halo-color': PAL.ink0, 'text-halo-width': 1.3 },
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
  map.addLayer({ id: 'leaders', type: 'line', source: 'leaders', paint: { 'line-color': PAL.fg2, 'line-opacity': 0.7, 'line-width': 1 } });
  map.addLayer({ id: 'true-pos', type: 'circle', source: 'leaders', filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-radius': 2.5, 'circle-color': PAL.fg2 } });
  const color = fitColor();
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
      // O2: one label per spot, from the spot's own feature (the selected one in sodium, always placed)
      'text-field': ['get', 'label'], 'text-font': ['Noto Sans Bold'], 'text-size': ['interpolate', ['linear'], ['zoom'], 9, 10.5, 14, 13],
      'text-variable-anchor': ['left', 'right', 'top', 'bottom', 'top-left', 'bottom-right', 'bottom-left', 'top-right'],
      'text-radial-offset': ['interpolate', ['linear'], ['zoom'], 9, 1.35, 14, 1.7], 'text-max-width': 9,
      'symbol-sort-key': ['case', ['get', 'pick'], -1, ['get', 'rank']] as never,
    },
    paint: { 'text-color': ['case', ['get', 'pick'], PAL.sel, ['get', 'gated'], PAL.danger, PAL.fg1] as never, 'text-halo-color': PAL.ink0, 'text-halo-width': 1.6 },
  });
  map.addLayer({
    id: 'spots', type: 'symbol', source: 'spots',
    layout: { 'icon-image': 'disc', 'icon-size': ['interpolate', ['linear'], ['zoom'], 9, 0.55, 14, 0.85], 'icon-allow-overlap': true },
    // O3: a safety-capped score is not a plain low score: dark red disc, red halo, "!" instead of the number
    paint: { 'icon-color': color as never, 'icon-halo-color': ['case', ['get', 'gated'], PAL.danger, PAL.ink0] as never, 'icon-halo-width': ['case', ['get', 'gated'], 3, 1.5] as never, 'icon-opacity': ['case', ['get', 'pick'], 1, 0.9] as never },
  });
  map.addLayer({
    id: 'spot-score', type: 'symbol', source: 'spots', minzoom: 11,
    layout: { 'text-field': ['to-string', ['get', 'score']], 'text-font': ['Noto Sans Bold'], 'text-size': 10, 'text-allow-overlap': true, 'text-ignore-placement': true },
    paint: { 'text-color': ['case', ['get', 'gated'], PAL.danger, fitInk()] as never },
  });
  // O1/O2: ring around the selected spot, drawn from the same feature as its marker and label
  map.addLayer({ id: 'pick-ring', type: 'circle', source: 'spots', filter: ['==', ['get', 'pick'], true], paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 10, 16, 18], 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': PAL.sel, 'circle-stroke-width': 2.5 } });
  // V1.5: structure-type glyph beside each spot (close zoom) and a small light only where the lamp is field-verified
  map.addLayer({ id: 'spot-kind', type: 'symbol', source: 'spots', minzoom: 12.5, layout: { 'icon-image': ['concat', 'k-', ['get', 'kicon']] as never, 'icon-size': 0.5, 'icon-offset': [-30, -30], 'icon-allow-overlap': true, 'icon-ignore-placement': true } });
  map.addLayer({ id: 'spot-lamp', type: 'symbol', source: 'spots', minzoom: 12.5, filter: ['==', ['get', 'lamp'], true], layout: { 'icon-image': 'k-lamba', 'icon-size': 0.5, 'icon-offset': [30, -30], 'icon-allow-overlap': true, 'icon-ignore-placement': true } });
  void addKindImages(map);

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
      'text-field': ['get', 'label'], 'text-font': ['Noto Sans Bold'], 'text-size': 12, 'text-max-width': 40, // N4: one line (merge uses the one-line size)
    },
    // N4/M3: the badge that holds the plan's pick gets an orange outline at far zoom
    paint: { 'icon-color': color as never, 'icon-halo-color': ['case', ['get', 'pick'], PAL.sel, PAL.ink0] as never, 'icon-halo-width': ['case', ['get', 'pick'], 3, 1.5] as never, 'text-color': fitInk() as never },
  });

  setPick = (id) => {
    pickId = id;
    layout();
  };
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
    const { badges: raw, single } = far
      ? placeBadges(spots.map((s) => ({ id: s.id, place: s.place, lon: s.lon, lat: s.lat, total: s.score.total })))
      : { badges: [], single: spots.map((s) => s.id) };
    // N4: neighbouring settlements whose badges would overlap on screen become one "… çevresi" badge
    const badges = mergeBadges(raw, (lon, lat) => map.project([lon, lat]));
    const keep = new Set(single);
    const shownSpots = spots.filter((s) => keep.has(s.id));
    (map.getSource('badges') as maplibregl.GeoJSONSource).setData({
      type: 'FeatureCollection',
      features: badges.map((b) => ({
        type: 'Feature', geometry: { type: 'Point', coordinates: [b.lon, b.lat] },
        properties: { place: badgeLabel(b).replace(/ · \d+ mera$/, ''), ids: b.ids.join(','), total: b.best ?? -1, label: badgeLabel(b), pick: !!pickId && b.ids.includes(pickId) },
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
      features: spotFeatures(feats.map(({ s, ll }) => ({ s: { id: s.id, name: s.name, lon: s.lon, lat: s.lat, total: s.score.total, gated: !!s.score.gated, rank: s.score.rank, kind: s.kind, lamp_state: s.lamp_state ?? null }, lon: ll.lng, lat: ll.lat })), pickId),
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
        if (o.onSpot) o.onSpot(s.id); // O1: the page's single "go to spot" path zooms and rings it
        else { map.easeTo({ center: [s.lon, s.lat], zoom: Math.max(map.getZoom(), 14.5) }); showCard(s); }
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
  // V1.5: night hours soften the whole palette (a dark veil under the spots); instant with reduced motion
  map.addSource('night', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[26, 39], [31, 39], [31, 42], [26, 42], [26, 39]]] } } });
  map.addLayer({ id: 'night', type: 'fill', source: 'night', paint: { 'fill-color': '#000', 'fill-opacity': 0, 'fill-opacity-transition': { duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 220, delay: 0 } } }, 'leaders');
  applyNight();
  o.container.dataset.ready = String(spots.length);
  markReady(map);
});

/** Selected hour at night (sun below −6° at the map centre) → veil; twilight half; day none. */
function applyNight() {
  if (!map.getLayer('night')) return;
  const c = map.getCenter();
  const t = at ? new Date(at) : new Date();
  const alt = skyAt(new Date(Math.floor(t.getTime() / 3_600_000) * 3_600_000 + 1_800_000), c.lat, c.lng).sunAlt;
  const light = document.documentElement.dataset.theme === 'light';
  const k = alt > 0 ? 0 : alt > -6 ? 0.5 : 1;
  map.setPaintProperty('night', 'fill-color', light ? '#142330' : '#000');
  map.setPaintProperty('night', 'fill-opacity', k * (light ? 0.14 : 0.24));
}

/** V1.0/V1.5: the theme switch repaints the map from the tokens of the new theme. */
function applyTheme() {
  PAL = palette();
  drawScale();
  const set = (id: string, prop: string, v: unknown) => { if (map.getLayer(id)) map.setPaintProperty(id, prop, v as never); };
  set('bg', 'background-color', PAL.open);
  set('bands', 'fill-color', depthColor());
  for (const id of ['contours', 'contours-i', 'contours-near']) set(id, 'line-color', PAL.contour);
  set('fade', 'fill-color', PAL.open);
  set('land', 'fill-color', PAL.land);
  set('land', 'fill-outline-color', PAL.landLine);
  set('lakes', 'fill-color', PAL.sea4);
  set('spots', 'icon-color', fitColor());
  set('spots', 'icon-halo-color', ['case', ['get', 'gated'], PAL.danger, PAL.ink0]);
  set('spot-score', 'text-color', ['case', ['get', 'gated'], PAL.danger, fitInk()]);
  set('spot-labels', 'text-color', ['case', ['get', 'pick'], PAL.sel, ['get', 'gated'], PAL.danger, PAL.fg1]);
  set('spot-labels', 'text-halo-color', PAL.ink0);
  set('pick-ring', 'circle-stroke-color', PAL.sel);
  set('badges', 'icon-color', fitColor());
  set('badges', 'icon-halo-color', ['case', ['get', 'pick'], PAL.sel, PAL.ink0]);
  set('badges', 'text-color', fitInk());
  void addKindImages(map);
  applyNight();
}
addEventListener('av-theme', () => applyTheme());

return {
  async setSpecies(next) {
    species = next;
    loading.hidden = false;
    if (!(await fetchSpots())) return;
    layout();
    loading.hidden = true;
  },
  async setHour(next) {
    at = next;
    applyNight();
    loading.hidden = false;
    if (!(await fetchSpots())) return; // superseded: the newer call lays out and hides the spinner
    layout();
    loading.hidden = true;
  },
  resize: () => map.resize(),
  setPadding: (p) => map.easeTo({ padding: { left: 0, top: 0, right: 0, bottom: 0, ...p }, duration: 0 }),
  ready,
  spotsNow: () => spots.map((s) => ({ id: s.id, lat: s.lat, lon: s.lon, gated: !!s.score.gated })),
  highlight(id) {
    const changed = id !== pickId;
    setPick(id);
    const s = id ? byId.get(id) : undefined;
    if (changed && s) map.easeTo({ center: [s.lon, s.lat] });
  },
  // O1: every "go to this spot" (plan chip, map, list, heat map) — smooth zoom to ~15.5 with the ring on it
  focus(id) {
    const s = byId.get(id);
    setPick(id);
    if (s) map.flyTo({ center: [s.lon, s.lat], zoom: FOCUS_ZOOM, duration: 1200, essential: true });
  },
  flyTo(id) {
    const s = byId.get(id);
    if (s) map.easeTo({ center: [s.lon, s.lat], zoom: Math.max(map.getZoom(), 12.5) });
  },
};
}
