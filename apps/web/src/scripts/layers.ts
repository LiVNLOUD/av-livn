// P5: weather layers for the map page, all bound to the time slider's hour. Data: hourly grids built in GitHub
// Actions (Open-Meteo forecast and marine on a 0.1° lattice; Copernicus Marmara 500 m currents) and served as
// stored JSON (/api/grid/:name). Colour fields are drawn from the coarse grid with linear resampling (smooth, no
// invented detail); wind and current also get a light particle animation on a 2D canvas (no extra library).
import { latest } from './hour';
import type maplibregl from 'maplibre-gl';

export type LayerName = 'puan' | 'ruzgar' | 'dalga' | 'akinti' | 'sst' | 'yagis' | 'bulut' | 'uydu';
export interface Grid { from_hour: number; hours: number; lat0: number; lon0: number; dlat: number; dlon: number; nlat: number; nlon: number; source: string; built_at?: string; vars: Record<string, (number | null)[][]> }

const cache = new Map<string, Promise<Grid | null>>();
export const loadGrid = (name: 'wx' | 'sea' | 'cur') => {
  if (!cache.has(name)) cache.set(name, fetch(`/api/grid/${name}`).then((r) => (r.ok ? r.json() : null)).catch(() => null));
  return cache.get(name)!;
};

/** Bilinear value of a grid variable at (lon, lat) for frame k; null outside or next to missing cells. */
export function sample(g: Grid, frame: (number | null)[], lon: number, lat: number): number | null {
  const x = (lon - g.lon0) / g.dlon, y = (lat - g.lat0) / g.dlat;
  if (x < 0 || y < 0 || x > g.nlon - 1 || y > g.nlat - 1) return null;
  const i0 = Math.floor(y), j0 = Math.floor(x), i1 = Math.min(i0 + 1, g.nlat - 1), j1 = Math.min(j0 + 1, g.nlon - 1);
  const v = (i: number, j: number) => frame[i * g.nlon + j];
  const a = v(i0, j0), b = v(i0, j1), c = v(i1, j0), d = v(i1, j1);
  if (a == null || b == null || c == null || d == null) return a ?? b ?? c ?? d ?? null; // coast: nearest known
  const fx = x - j0, fy = y - i0;
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
}
/** Nearest non-null value (for spot glyphs on the coast). */
export function nearest(g: Grid, frame: (number | null)[], lon: number, lat: number): number | null {
  let best: number | null = null, bd = Infinity;
  for (let i = 0; i < g.nlat; i++) for (let j = 0; j < g.nlon; j++) {
    const v = frame[i * g.nlon + j];
    if (v == null) continue;
    const d = (g.lat0 + i * g.dlat - lat) ** 2 + (g.lon0 + j * g.dlon - lon) ** 2;
    if (d < bd) { bd = d; best = v; }
  }
  return best;
}
export const frameIndex = (g: Grid, hour: number) => { const k = hour - g.from_hour; return k >= 0 && k < g.hours ? k : null; };

type Stop = [number, [number, number, number, number]];
/** Colour ramps (value in display units → rgba). Precipitation and cloud start transparent: no rain, no colour. */
export const RAMPS: Record<Exclude<LayerName, 'puan'>, { stops: Stop[]; unit: string; label: string; legend: string }> = {
  ruzgar: { stops: [[0, [40, 90, 150, 0.0]], [8, [40, 120, 170, 0.55]], [20, [70, 180, 120, 0.6]], [32, [235, 200, 60, 0.65]], [45, [235, 110, 60, 0.7]], [65, [200, 50, 90, 0.75]]], unit: 'km/sa', label: 'Rüzgar', legend: 'Rüzgar hızı (km/sa), Open-Meteo tahmini. Parçacıklar akış yönünü gösterir.' },
  dalga: { stops: [[0, [40, 90, 150, 0.0]], [0.2, [60, 140, 190, 0.5]], [0.6, [90, 190, 170, 0.6]], [1.2, [235, 200, 80, 0.65]], [2, [230, 90, 70, 0.7]]], unit: 'm', label: 'Dalga', legend: 'Belirgin dalga yüksekliği (m), Open-Meteo Marine tahmini (kaba ızgara, kıyı içi korunaklı yerleri göstermez).' },
  akinti: { stops: [[0, [40, 90, 150, 0.0]], [5, [60, 130, 190, 0.45]], [15, [80, 190, 180, 0.6]], [30, [235, 200, 80, 0.65]], [50, [230, 90, 70, 0.7]]], unit: 'cm/s', label: 'Akıntı', legend: 'Yüzey akıntısı (1–5 m ortalaması, cm/s), Copernicus Marine Karadeniz/Marmara 500 m tahmini.' },
  sst: { stops: [[8, [60, 90, 200, 0.6]], [13, [60, 160, 210, 0.6]], [17, [90, 200, 160, 0.6]], [21, [235, 200, 80, 0.6]], [26, [230, 90, 70, 0.65]]], unit: '°C', label: 'Su sıcaklığı', legend: 'Deniz yüzeyi sıcaklığı (°C), Open-Meteo Marine tahmini.' },
  yagis: { stops: [[0, [80, 140, 220, 0]], [0.1, [80, 140, 220, 0.35]], [1, [80, 140, 230, 0.55]], [3, [150, 90, 220, 0.65]], [8, [220, 70, 160, 0.75]]], unit: 'mm/sa', label: 'Yağış', legend: 'Yağış (mm/sa) — tahmin, radar değil. Model ızgarası kaba; yumuşak gösterilir.' },
  bulut: { stops: [[0, [220, 230, 236, 0]], [30, [220, 230, 236, 0.15]], [70, [220, 230, 236, 0.35]], [100, [235, 240, 244, 0.5]]], unit: '%', label: 'Bulut', legend: 'Bulut örtüsü (%) — tahmin. Gece bulut, ay ışığını ve dolayısıyla ortam karanlığını etkiler (modelin ortam ışığı hesabında kullanılır).' },
};
export function rampColor(stops: Stop[], v: number): [number, number, number, number] {
  if (v <= stops[0]![0]) return stops[0]![1];
  for (let k = 1; k < stops.length; k++) {
    const [x1, c1] = stops[k]!, [x0, c0] = stops[k - 1]!;
    if (v <= x1) { const t = (v - x0) / (x1 - x0); return c0.map((a, i) => a + (c1[i]! - a) * t) as [number, number, number, number]; }
  }
  return stops[stops.length - 1]![1];
}

/** Per-layer data: which grid and how to turn a frame into display values (and u/v for particles). */
const SPEC: Record<Exclude<LayerName, 'puan'>, { grid: 'wx' | 'sea' | 'cur'; value: (g: Grid, k: number, p: number) => number | null; uv?: (g: Grid, k: number) => { u: (number | null)[]; v: (number | null)[] } }> = {
  ruzgar: {
    grid: 'wx', value: (g, k, p) => g.vars.ws?.[k]?.[p] ?? null,
    // wind blows FROM wd: the air moves towards wd + 180°
    uv: (g, k) => {
      const ws = g.vars.ws![k]!, wd = g.vars.wd![k]!;
      return { u: ws.map((s, i) => (s == null || wd[i] == null ? null : -s * Math.sin((wd[i]! * Math.PI) / 180))), v: ws.map((s, i) => (s == null || wd[i] == null ? null : -s * Math.cos((wd[i]! * Math.PI) / 180))) };
    },
  },
  dalga: { grid: 'sea', value: (g, k, p) => { const x = g.vars.wh?.[k]?.[p]; return x == null ? null : x / 100; } },
  sst: { grid: 'sea', value: (g, k, p) => { const x = g.vars.sst?.[k]?.[p]; return x == null ? null : x / 10; } },
  yagis: { grid: 'wx', value: (g, k, p) => { const x = g.vars.pr?.[k]?.[p]; return x == null ? null : x / 10; } },
  bulut: { grid: 'wx', value: (g, k, p) => g.vars.cc?.[k]?.[p] ?? null },
  akinti: {
    grid: 'cur',
    value: (g, k, p) => { const u = g.vars.u?.[k]?.[p], v = g.vars.v?.[k]?.[p]; return u == null || v == null ? null : Math.hypot(u, v); },
    uv: (g, k) => ({ u: g.vars.u![k]!, v: g.vars.v![k]! }),
  },
};

/** Field image (one pixel per grid point, north row first) as a data URL; null cells transparent. */
function fieldImage(g: Grid, k: number, name: Exclude<LayerName, 'puan'>): string {
  const c = document.createElement('canvas');
  c.width = g.nlon; c.height = g.nlat;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(g.nlon, g.nlat);
  for (let i = 0; i < g.nlat; i++) for (let j = 0; j < g.nlon; j++) {
    const v = SPEC[name].value(g, k, i * g.nlon + j);
    const o = ((g.nlat - 1 - i) * g.nlon + j) * 4;
    if (v == null) continue;
    const [r, gg, b, a] = rampColor(RAMPS[name].stops, v);
    img.data[o] = r; img.data[o + 1] = gg; img.data[o + 2] = b; img.data[o + 3] = Math.round(a * 255);
  }
  ctx.putImageData(img, 0, 0);
  return c.toDataURL();
}
const corners = (g: Grid): [[number, number], [number, number], [number, number], [number, number]] => {
  const w = g.lon0 - g.dlon / 2, e = g.lon0 + (g.nlon - 0.5) * g.dlon, s = g.lat0 - g.dlat / 2, n = g.lat0 + (g.nlat - 0.5) * g.dlat;
  return [[w, n], [e, n], [e, s], [w, s]];
};

/** Particle animation on a canvas over the map: advected by the bilinear u/v field, short fading trails. */
class Particles {
  private cv: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private pts: { lon: number; lat: number; age: number }[] = [];
  private raf = 0;
  private g: Grid | null = null;
  private u: (number | null)[] = [];
  private v: (number | null)[] = [];
  private speed = 1;
  constructor(private map: maplibregl.Map, container: HTMLElement) {
    this.cv = document.createElement('canvas');
    this.cv.className = 'particles';
    container.append(this.cv);
    this.ctx = this.cv.getContext('2d')!;
    this.resize();
    map.on('resize', () => this.resize());
    map.on('movestart', () => this.ctx.clearRect(0, 0, this.cv.width, this.cv.height));
    document.addEventListener('visibilitychange', () => (document.hidden ? this.stop() : this.g && this.start()));
  }
  private resize() {
    const r = this.map.getCanvas().getBoundingClientRect();
    this.cv.width = r.width; this.cv.height = r.height;
    this.cv.style.width = `${r.width}px`; this.cv.style.height = `${r.height}px`;
  }
  /** Fewer particles on small screens (390 px phone: ~350). */
  private count() { return Math.round(Math.min(1400, Math.max(300, (this.cv.width * this.cv.height) / 1600))); }
  set(g: Grid | null, uv: { u: (number | null)[]; v: (number | null)[] } | null, speed: number) {
    this.g = g; this.u = uv?.u ?? []; this.v = uv?.v ?? []; this.speed = speed;
    this.pts = [];
    this.ctx.clearRect(0, 0, this.cv.width, this.cv.height);
    if (g && uv) this.start(); else this.stop();
  }
  private seed() {
    const b = this.map.getBounds();
    return { lon: b.getWest() + Math.random() * (b.getEast() - b.getWest()), lat: b.getSouth() + Math.random() * (b.getNorth() - b.getSouth()), age: Math.floor(Math.random() * 80) };
  }
  // reduced motion: the colour field stays, the animation does not run
  private start() { if (!this.raf && !matchMedia('(prefers-reduced-motion: reduce)').matches) this.raf = requestAnimationFrame(() => this.frame()); }
  private stop() { cancelAnimationFrame(this.raf); this.raf = 0; }
  private frame() {
    this.raf = 0;
    const g = this.g;
    if (!g) return;
    const n = this.count();
    while (this.pts.length < n) this.pts.push(this.seed());
    const ctx = this.ctx;
    ctx.globalCompositeOperation = 'destination-in';
    ctx.fillStyle = 'rgba(0,0,0,0.86)';
    ctx.fillRect(0, 0, this.cv.width, this.cv.height);
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = 'rgba(235,242,245,0.6)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const k = 0.00004 * this.speed * Math.pow(2, 12 - this.map.getZoom()); // degrees per (unit · frame), zoom-scaled
    for (const p of this.pts) {
      const u = sample(g, this.u, p.lon, p.lat), v = sample(g, this.v, p.lon, p.lat);
      if (u == null || v == null || ++p.age > 90) { Object.assign(p, this.seed(), { age: 0 }); continue; }
      const a = this.map.project([p.lon, p.lat]);
      p.lon += u * k / Math.cos((p.lat * Math.PI) / 180);
      p.lat += v * k;
      const b = this.map.project([p.lon, p.lat]);
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();
    this.start();
  }
}

export interface LayerControl { set(name: LayerName): Promise<void>; setHour(hour: number): Promise<void>; current(): LayerName; info(): string }

/** Adds the weather layers to a map that has a 'land' layer (sea fields go under the land mask). */
export function weatherLayers(map: maplibregl.Map, container: HTMLElement, onInfo: (html: string) => void): LayerControl {
  let name: LayerName = 'puan';
  let hour = Math.floor(Date.now() / 3_600_000);
  const particles = new Particles(map, container);
  const SRC = 'wx-field';
  const clear = () => {
    if (map.getLayer(SRC)) map.removeLayer(SRC);
    if (map.getSource(SRC)) map.removeSource(SRC);
  };
  // Faz R: satellite depth — ICESat-2 laser soundings (measured points) and, only when it passed validation, the
  // Sentinel-2 estimate (opacity = uncertainty). Static files from satbathy.yml; missing files = "no data yet".
  const SAT = ['sat-pts', 'sat-sdb'];
  const clearSat = () => SAT.forEach((id) => { if (map.getLayer(id)) map.removeLayer(id); if (map.getSource(id)) map.removeSource(id); });
  async function drawSat() {
    const [pts, sdb] = await Promise.all([fetch('/tiles/atl24.geojson').then((r) => (r.ok ? r.json() : null)).catch(() => null), fetch('/tiles/sdb.json').then((r) => (r.ok ? r.json() : null)).catch(() => null)]);
    if (name !== 'uydu') return;
    clearSat();
    if (sdb?.bounds) {
      const [w, s0, e, n] = sdb.bounds as number[];
      map.addSource('sat-sdb', { type: 'image', url: '/tiles/sdb.png', coordinates: [[w!, n!], [e!, n!], [e!, s0!], [w!, s0!]] });
      map.addLayer({ id: 'sat-sdb', type: 'raster', source: 'sat-sdb', paint: { 'raster-resampling': 'nearest', 'raster-fade-duration': 0 } }, 'land');
    }
    const nPts = pts?.features?.length ?? 0;
    if (nPts) {
      map.addSource('sat-pts', { type: 'geojson', data: pts });
      map.addLayer({ id: 'sat-pts', type: 'circle', source: 'sat-pts', paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 1.5, 15, 4], 'circle-stroke-width': 0.5, 'circle-stroke-color': '#0e1c27',
        'circle-color': ['interpolate', ['linear'], ['get', 'depth'], 0, '#e6d4fb', 5, '#b48ae8', 10, '#7a4cc4', 20, '#4a2a86'],
      } }, 'spot-labels');
    }
    const years = nPts ? [...new Set((pts.features as { properties: { date: string } }[]).map((f) => f.properties.date.slice(0, 4)))].sort() : [];
    onInfo(nPts || sdb
      ? `<span class="ramp-bar" style="background:linear-gradient(90deg,#e6d4fb,#b48ae8,#7a4cc4,#4a2a86)"></span><span class="ramp-ends"><span>0</span><span>20 m</span></span>`
        + `<span>${nPts ? `Mor noktalar: uydu lazer ölçümü (ICESat-2 ATL24), ${nPts} nokta, ${years[0]}–${years[years.length - 1]}. Her nokta ölçümdür, ara değer üretilmez.` : 'Bu kıyıda uydu lazer ölçümü yok.'}</span>`
        + `<span>${sdb ? 'Renkli alan: uydu görüntüsünden derinlik tahmini (Sentinel-2), 0–10 m; soluk = belirsiz. Ölçüm değil.' : 'Uydu görüntüsünden tahmin doğrulama eşiğini geçmedi; gösterilmiyor.'}</span>`
        + `<span class="muted">Kaynak: NASA NSIDC ICESat-2 ATL24 v002 (doi:10.5067/ATLAS/ATL24.002)${sdb ? '; Copernicus Sentinel-2' : ''}</span>`
      : '<b>Uydu derinliği:</b> veri henüz yok.');
  }
  const drawReq = latest(); // V1.1: a slow grid for an older hour/layer never paints over the current choice
  async function draw() {
    const current = drawReq.token();
    if (name !== 'uydu') clearSat();
    if (name === 'uydu') { clear(); particles.set(null, null, 1); await drawSat(); return; }
    if (name === 'puan') { clear(); particles.set(null, null, 1); onInfo(''); return; }
    const spec = SPEC[name];
    const g = await loadGrid(spec.grid);
    if (!current()) return;
    const k = g ? frameIndex(g, hour) : null;
    if (!g || k === null) { clear(); particles.set(null, null, 1); onInfo(`<b>${RAMPS[name].label}:</b> bu saat için veri yok.`); return; }
    const url = fieldImage(g, k, name);
    const src = map.getSource(SRC) as maplibregl.ImageSource | undefined;
    if (src) src.updateImage({ url, coordinates: corners(g) });
    else {
      map.addSource(SRC, { type: 'image', url, coordinates: corners(g) });
      const sea = spec.grid !== 'wx';
      map.addLayer({ id: SRC, type: 'raster', source: SRC, paint: { 'raster-resampling': 'linear', 'raster-opacity': 0.85, 'raster-fade-duration': 0 } }, sea ? 'land' : 'spot-labels');
    }
    particles.set(spec.uv ? g : null, spec.uv ? spec.uv(g, k) : null, name === 'akinti' ? 6 : 0.22); // wind km/h vs current cm/s: similar on-screen pace, wind slower than raw
    const st = RAMPS[name].stops;
    const grad = st.map(([, c], i) => `rgba(${c[0]},${c[1]},${c[2]},${Math.max(c[3], 0.15)}) ${Math.round((i / (st.length - 1)) * 100)}%`).join(',');
    onInfo(`<span class="ramp-bar" style="background:linear-gradient(90deg,${grad})"></span><span class="ramp-ends"><span>${st[0]![0]}</span><span>${st[st.length - 1]![0]} ${RAMPS[name].unit}</span></span><span>${RAMPS[name].legend}</span><span class="muted">Kaynak: ${g.source}</span>`);
  }
  return {
    async set(n) { name = n; await draw(); },
    async setHour(h) { hour = h; await draw(); },
    current: () => name,
    info: () => name,
  };
}

/** P5: one image per glyph combination (16 wind directions × speed × rain × safety), drawn on demand when the
 *  style asks for it; a single icon participates in label collision, so spot names move out of its way. */
export const glyphId = (to: number | null, speed: string, rain: boolean, gated: boolean) =>
  `gl:${to === null ? 'x' : Math.round(to / 22.5) % 16}:${speed}:${rain ? 1 : 0}:${gated ? 1 : 0}`;
function drawGlyph(id: string): { width: number; height: number; data: Uint8ClampedArray } | null {
  const m = /^gl:(x|\d+):(\d*):([01]):([01])$/.exec(id);
  if (!m) return null;
  const R = 2, H = 18 * R;
  const text = m[2] ? `${m[2]} km/sa` : '';
  const probe = document.createElement('canvas').getContext('2d')!;
  probe.font = `700 ${12 * R}px system-ui, sans-serif`;
  const tw = text ? probe.measureText(text).width : 0;
  const parts = (m[4] === '1' ? 1 : 0) + (m[3] === '1' ? 1 : 0) + (m[1] !== 'x' ? 1 : 0);
  const W = Math.ceil(8 * R + parts * 17 * R + tw);
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const c = cv.getContext('2d')!;
  c.fillStyle = 'rgba(14,28,39,0.82)';
  c.beginPath(); c.roundRect(0, 0, W, H, 9 * R); c.fill();
  let x = 4 * R;
  const cy = H / 2;
  if (m[4] === '1') { // safety
    c.fillStyle = '#ff7a6b';
    c.beginPath(); c.moveTo(x + 7.5 * R, cy - 6.5 * R); c.lineTo(x + 15 * R, cy + 6 * R); c.lineTo(x, cy + 6 * R); c.closePath(); c.fill();
    c.fillStyle = '#0e1c27'; c.fillRect(x + 6.6 * R, cy - 2.5 * R, 1.8 * R, 4.5 * R); c.fillRect(x + 6.6 * R, cy + 3 * R, 1.8 * R, 1.6 * R);
    x += 17 * R;
  }
  if (m[3] === '1') { // rain
    c.fillStyle = '#7fb4ef';
    c.beginPath(); c.moveTo(x + 7 * R, cy - 7 * R); c.bezierCurveTo(x + 7 * R, cy - 7 * R, x + 2 * R, cy, x + 2 * R, cy + 2 * R); c.arc(x + 7 * R, cy + 2 * R, 5 * R, Math.PI, 0, true); c.bezierCurveTo(x + 12 * R, cy, x + 7 * R, cy - 7 * R, x + 7 * R, cy - 7 * R); c.fill();
    x += 17 * R;
  }
  if (m[1] !== 'x') { // arrow towards where the wind blows
    c.save(); c.translate(x + 7.5 * R, cy); c.rotate((Number(m[1]) * 22.5 * Math.PI) / 180);
    c.fillStyle = '#f3f6f7';
    c.beginPath(); c.moveTo(0, -7 * R); c.lineTo(5.5 * R, 0); c.lineTo(1.8 * R, 0); c.lineTo(1.8 * R, 7 * R); c.lineTo(-1.8 * R, 7 * R); c.lineTo(-1.8 * R, 0); c.lineTo(-5.5 * R, 0); c.closePath(); c.fill();
    c.restore();
    x += 17 * R;
  }
  if (text) { c.font = `700 ${12 * R}px system-ui, sans-serif`; c.fillStyle = '#f3f6f7'; c.textBaseline = 'middle'; c.fillText(text, x, cy + R); }
  const img = c.getImageData(0, 0, W, H);
  return { width: W, height: H, data: img.data };
}

export interface GlyphSpot { id: string; lat: number; lon: number; gated: boolean }
/** P5: per-spot glyph features at the hour — wind arrow (towards) + speed, rain drop (≥ 0.1 mm/h), safety icon. */
export function glyphFeatures(g: Grid | null, hour: number, spots: GlyphSpot[]): GeoJSON.FeatureCollection {
  const k = g ? frameIndex(g, hour) : null;
  return {
    type: 'FeatureCollection',
    features: spots.map((s) => {
      const ws = g && k !== null ? nearest(g, g.vars.ws?.[k] ?? [], s.lon, s.lat) : null;
      const wd = g && k !== null ? nearest(g, g.vars.wd?.[k] ?? [], s.lon, s.lat) : null;
      const pr = g && k !== null ? nearest(g, g.vars.pr?.[k] ?? [], s.lon, s.lat) : null;
      return {
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [s.lon, s.lat] },
        properties: { id: s.id, img: glyphId(wd === null || ws === null ? null : (wd + 180) % 360, ws === null ? '' : `${Math.round(ws)}`, pr !== null && pr >= 1, s.gated) },
      };
    }),
  };
}
/** Adds the glyph layer (zoom ≥ 14) under a 'glyphs' source; returns a refresher for (hour, spots). */
export function spotGlyphs(map: maplibregl.Map): (hour: number, spots: GlyphSpot[]) => Promise<void> {
  // MapLibre 6: only a missing-image resolver can supply the image for the current layout (a 'styleimagemissing'
  // listener is too late, the glyph then appeared only on a later placement)
  const resolve = (id: string) => {
    if (!id.startsWith('gl:') || map.hasImage(id)) return;
    const img = drawGlyph(id);
    if (img) map.addImage(id, img, { pixelRatio: 2 });
  };
  const m = map as maplibregl.Map & { setMissingStyleImageResolver?: (f: (id: string) => void) => void };
  if (m.setMissingStyleImageResolver) m.setMissingStyleImageResolver(resolve);
  else map.on('styleimagemissing', (e: { id: string }) => resolve(e.id));
  map.addSource('glyphs', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  // below the disc; placed before the labels (top layer), so spot names move out of its way; glyphs never overlap each other
  map.addLayer({ id: 'glyphs', type: 'symbol', source: 'glyphs', minzoom: 14, layout: { 'icon-image': ['get', 'img'], 'icon-anchor': 'top', 'icon-offset': [0, 12], 'icon-allow-overlap': false, 'icon-ignore-placement': false, 'icon-padding': 1 } });
  return async (hour, spots) => {
    const g = await loadGrid('wx');
    (map.getSource('glyphs') as maplibregl.GeoJSONSource | undefined)?.setData(glyphFeatures(g, hour, spots));
  };
}
