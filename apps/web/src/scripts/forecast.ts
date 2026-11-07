// P4: point forecast table on the spot card (Windy-style meteogram rows, our own open data). Columns are hours
// (every 3 h by default); rows: score, safety, wind (+ model range bar), gust, direction, wave, rain, cloud, SST,
// current, moon. Pure table builder + HTML renderer; the page fetches the grids and passes them in.
import { skyAt } from '@av-livn/scoring';
import { frameIndex, nearest, type Grid } from './layers';

/** Packed hour [ts, total, …, p10, p90, gated, …] and tackle inputs [depth, current m/s, wind, gust, cross, sunAlt, …, wave]. */
export type PackedHour = [string, number | null, ...unknown[]];
export interface SpreadLike { from_hour: number; cells: { lat: number; lon: number; w: ([number, number, number] | null)[] }[] }
export interface ForecastInput {
  lat: number; lon: number;
  hours: PackedHour[];
  tk: (number | null)[][];
  wx?: Grid | null; sea?: Grid | null; cur?: Grid | null; spread?: SpreadLike | null;
  step?: number;
}
export interface FCol {
  ts: string; hour: number; day: string; time: string; night: boolean;
  score: number | null; gated: boolean;
  wind: number | null; gust: number | null; range: [number, number] | null; dir: number | null;
  wave: number | null; rain: number | null; cloud: number | null; sst: number | null;
  current: number | null; curDir: number | null; moon: number | null; moonUp: boolean;
}

const wf = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', weekday: 'short', day: 'numeric' });
const tf = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', hour: '2-digit' });

const at = (g: Grid | null | undefined, name: string, hour: number, lon: number, lat: number, scale = 1): number | null => {
  if (!g) return null;
  const k = frameIndex(g, hour);
  const fr = k === null ? null : g.vars[name]?.[k];
  const v = fr ? nearest(g, fr, lon, lat) : null;
  return v === null ? null : v / scale;
};

/** Columns every `step` hours (aligned to local 0/3/6…), each carrying the values of that exact hour. */
export function forecastColumns(i: ForecastInput): FCol[] {
  const step = i.step ?? 3;
  const cell = i.spread?.cells.length ? i.spread.cells.reduce((b, c) => ((c.lat - i.lat) ** 2 + (c.lon - i.lon) ** 2 < (b.lat - i.lat) ** 2 + (b.lon - i.lon) ** 2 ? c : b)) : null;
  const out: FCol[] = [];
  i.hours.forEach((h, k) => {
    const hour = Math.floor(Date.parse(h[0]) / 3_600_000);
    if ((hour + 3) % step !== 0) return; // Istanbul is UTC+3 all year
    const d = new Date(hour * 3_600_000);
    const t = i.tk[k] ?? [];
    const sky = skyAt(d, i.lat, i.lon);
    const sk = cell && i.spread ? hour - i.spread.from_hour : -1;
    const r = cell && sk >= 0 ? cell.w[sk] ?? null : null;
    const u = at(i.cur, 'u', hour, i.lon, i.lat), v = at(i.cur, 'v', hour, i.lon, i.lat);
    const curMs = typeof t[1] === 'number' ? t[1] : null;
    out.push({
      ts: h[0], hour, day: wf.format(d), time: tf.format(d), night: sky.sunAlt < -6,
      score: h[1], gated: h[5] === 1 || h[5] === true,
      wind: t[2] ?? null, gust: t[3] ?? null, range: r ? [r[0], r[1]] : null,
      dir: at(i.wx, 'wd', hour, i.lon, i.lat),
      wave: t[9] ?? at(i.sea, 'wh', hour, i.lon, i.lat, 100),
      rain: at(i.wx, 'pr', hour, i.lon, i.lat, 10),
      cloud: at(i.wx, 'cc', hour, i.lon, i.lat),
      sst: at(i.sea, 'sst', hour, i.lon, i.lat, 10),
      current: curMs !== null ? curMs * 100 : u !== null && v !== null ? Math.hypot(u, v) : null,
      curDir: u !== null && v !== null && (u || v) ? (Math.atan2(u, v) * 180) / Math.PI : null,
      moon: sky.moonFrac, moonUp: sky.moonAlt > 0,
    });
  });
  return out;
}

/** Wind / gust colour classes (km/h): calm, breezy, windy, strong, unsafe. */
export const windClass = (v: number | null) => (v === null ? 'na' : v < 12 ? 'w0' : v < 20 ? 'w1' : v < 30 ? 'w2' : v < 40 ? 'w3' : 'w4');
const scoreClass = (v: number | null, gated: boolean) => (gated ? 'sg' : v === null ? 'na' : v >= 65 ? 's2' : v >= 40 ? 's1' : 's0');
const n0 = (v: number | null) => (v === null ? '–' : String(Math.round(v)));
const n1 = (v: number | null) => (v === null ? '–' : v.toLocaleString('tr-TR', { maximumFractionDigits: 1, minimumFractionDigits: v < 10 ? 1 : 0 }));
const arrow = (to: number | null, label: string) => (to === null ? '–' : `<span class="fc-arr" style="transform:rotate(${Math.round(to)}deg)" role="img" aria-label="${label}">↑</span>`);
const COMPASS = ['K', 'KD', 'D', 'GD', 'G', 'GB', 'B', 'KB'];
const compass = (deg: number) => COMPASS[Math.round((((deg % 360) + 360) % 360) / 45) % 8]!;

/** Range bar under the wind number: models' min–max on a 0–50 km/h track (wider = models disagree). */
function rangeBar(r: [number, number] | null): string {
  if (!r) return '';
  const x = (v: number) => Math.max(0, Math.min(100, (v / 50) * 100));
  return `<span class="fc-rng" title="Hava modelleri: ${Math.round(r[0])}–${Math.round(r[1])} km/sa"><i style="left:${x(r[0]).toFixed(1)}%;width:${Math.max(4, x(r[1]) - x(r[0])).toFixed(1)}%"></i></span>`;
}

export function renderForecast(cols: FCol[]): string {
  if (!cols.length) return '<p class="muted fs-2">Tahmin tablosu için saatlik veri yok.</p>';
  const days: { day: string; n: number }[] = [];
  for (const c of cols) { const last = days[days.length - 1]; if (last?.day === c.day) last.n++; else days.push({ day: c.day, n: 1 }); }
  const td = (c: FCol, inner: string, cls = '') => `<td class="${[c.night ? 'nt' : '', cls].filter(Boolean).join(' ')}">${inner}</td>`;
  const row = (head: string, cell: (c: FCol) => string, unit = '') => `<tr><th scope="row">${head}${unit ? ` <small>${unit}</small>` : ''}</th>${cols.map(cell).join('')}</tr>`;
  return `<table class="fc">
    <thead><tr><th class="fc-corner" rowspan="2">Saat</th>${days.map((d) => `<th class="fc-day" colspan="${d.n}" scope="colgroup">${d.day}</th>`).join('')}</tr>
    <tr>${cols.map((c) => `<th scope="col" class="${c.night ? 'nt' : ''}">${c.time}</th>`).join('')}</tr></thead>
    <tbody>
    ${row('Puan', (c) => td(c, c.gated ? '!' : n0(c.score), scoreClass(c.score, c.gated)))}
    ${row('Güvenlik', (c) => td(c, c.gated ? '<span class="fc-warn" title="Güvenlik sınırı: rüzgar/dalga">⚠</span>' : '<span class="fc-ok" aria-label="sorun yok">·</span>'))}
    ${row('Rüzgar', (c) => td(c, `${n0(c.wind)}${rangeBar(c.range)}`, windClass(c.wind)), 'km/sa')}
    ${row('Hamle', (c) => td(c, n0(c.gust), windClass(c.gust)), 'km/sa')}
    ${row('Yön', (c) => td(c, c.dir === null ? '–' : `${arrow((c.dir + 180) % 360, `${compass(c.dir)} rüzgarı`)}<small>${compass(c.dir)}</small>`))}
    ${row('Dalga', (c) => td(c, n1(c.wave)), 'm')}
    ${row('Yağış', (c) => td(c, c.rain === null ? '–' : c.rain < 0.1 ? '<span class="muted">0</span>' : n1(c.rain), c.rain !== null && c.rain >= 0.1 ? 'rn' : ''), 'mm')}
    ${row('Bulut', (c) => td(c, n0(c.cloud)), '%')}
    ${row('Su', (c) => td(c, n1(c.sst)), '°C')}
    ${row('Akıntı', (c) => td(c, `${n0(c.current)}${c.curDir === null ? '' : arrow(c.curDir, 'akıntı yönü')}`), 'cm/s')}
    ${row('Ay', (c) => td(c, c.moonUp && c.moon !== null ? `${Math.round(c.moon * 100)}` : '<span class="muted" title="Ay ufkun altında">batık</span>'), '%')}
    </tbody></table>`;
}
