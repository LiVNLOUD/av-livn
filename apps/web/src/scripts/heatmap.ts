// E2: spot × hour heat map — rows = spots (sorted by the selected hour), columns = the next 72 h.
// Cell colour = score on a continuous version of the band palette, or (F5 "meraya özgü fark") the deviation from
// the hour's mean over the visible spots on a diverging sea ↔ sodium scale. Uncertainty hatching is off by default;
// when on, only cells in the widest third of band widths (relative threshold, 67th percentile) are hatched.
// A sky strip above the grid shows night and twilight; day separators and a "now" line.
import { skyAt } from '@av-livn/scoring';
import { esc } from './format';

export interface HourSpot {
  id: string; name: string; kind: string; place: string | null; access: string | null; status: string;
  t: (number | null)[]; w: (number | null)[]; g: number[];
}
export interface HoursData { from: string; hours: number; spots: HourSpot[] }
export interface HeatOpts {
  selected: number; // column index
  hide?: (s: HourSpot) => boolean;
  badges?: (s: HourSpot) => string; // extra HTML in the row label (access, legal)
  onCell: (id: string, col: number) => void;
  onColumn?: (col: number) => void;
  mode?: 'score' | 'diff';
  showUncertainty?: boolean;
  /** Row drawn with an outline (summary below the map). */
  focus?: string | null;
  /** G3: turn the sorted rows into display rows (beach group, identical rows); group rows carry `group`. */
  compose?: (rows: HourSpot[]) => HeatRow[];
  onGroup?: (key: string) => void;
}
/** A display row: one spot, or a collapsed group (name = group label, values = group summary). */
export type HeatRow = HourSpot & { group?: { key: string; ids: string[]; open: boolean } };
export interface HeatStats { meanBand: number | null; wideFrom: number | null; diffMax: number }

/** Value at quantile q (0..1) of a sorted copy, linear interpolation. */
export function quantile(xs: number[], q: number): number | null {
  if (!xs.length) return null;
  const a = [...xs].sort((x, y) => x - y);
  const i = (a.length - 1) * q;
  const lo = Math.floor(i);
  return a[lo]! + (a[Math.min(a.length - 1, lo + 1)]! - a[lo]!) * (i - lo);
}

/** Per-column mean over the given rows (null / gated cells skipped). */
export function columnMeans(rows: HourSpot[], hours: number): (number | null)[] {
  return Array.from({ length: hours }, (_, c) => {
    const v = rows.filter((s) => s.t[c] !== null && !s.g.includes(c)).map((s) => s.t[c]!);
    return v.length ? v.reduce((a, x) => a + x, 0) / v.length : null;
  });
}

const DIFF_MAX = 20; // points at which the diverging scale saturates
const DIV_NEG: [number, number, number] = [86, 160, 204]; // sea blue
const DIV_POS: [number, number, number] = [245, 168, 60]; // sodium
const DIV_MID: [number, number, number] = [27, 46, 59]; // swell
/** Diverging colour for score − hour mean. */
export function diffColor(d: number): string {
  const f = Math.max(-1, Math.min(1, d / DIFF_MAX));
  const end = f < 0 ? DIV_NEG : DIV_POS;
  const k = Math.abs(f);
  const m = DIV_MID.map((ch, i) => Math.round(ch + (end[i]! - ch) * k));
  return `rgb(${m[0]} ${m[1]} ${m[2]})`;
}
const STOPS: [number, [number, number, number]][] = [[15, [255, 122, 107]], [52, [240, 163, 94]], [82, [95, 208, 138]]];
const SEA: [number, number, number] = [14, 28, 39];

/** Continuous band palette; lower scores also fade towards the sea colour so good hours stand out. */
export function scoreColor(v: number): string {
  const x = Math.max(0, Math.min(100, v));
  let c = STOPS[0]![1];
  for (let i = 1; i < STOPS.length; i++) {
    const [a, ca] = STOPS[i - 1]!;
    const [b, cb] = STOPS[i]!;
    if (x <= a) break;
    const f = Math.min(1, (x - a) / (b - a));
    c = [0, 1, 2].map((k) => ca[k]! + (cb[k]! - ca[k]!) * f) as [number, number, number];
  }
  const k = 0.3 + 0.7 * (x / 100);
  const m = c.map((ch, i) => Math.round(SEA[i]! + (ch - SEA[i]!) * k));
  return `rgb(${m[0]} ${m[1]} ${m[2]})`;
}

const TZ = 3;
const DAYS_LONG = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const MON_SHORT = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
/** Approximate text width (px) at the header's font size. */
const textW = (t: string) => t.length * 6.6 + 8;

/**
 * H5: day label for a header span of `px` pixels (local date given as a UTC Date shifted to local time). Full
 * weekday first ("Pazar 1 Kasım" → "Pazar 1 Kas" → "Pazar 1"); when even that does not fit, the date
 * ("1 Kas"), never a cryptic two-letter day; nothing when not even the date fits.
 */
export function dayLabel(local: Date, px: number): string {
  const d = local.getUTCDate();
  const cands = [`${DAYS_LONG[local.getUTCDay()]} ${d} ${MONTHS[local.getUTCMonth()]}`, `${DAYS_LONG[local.getUTCDay()]} ${d} ${MON_SHORT[local.getUTCMonth()]}`, `${DAYS_LONG[local.getUTCDay()]} ${d}`, `${d} ${MON_SHORT[local.getUTCMonth()]}`];
  return cands.find((c) => textW(c) <= px) ?? '';
}

/** H5: hour tick step so two-digit labels never touch: the smallest of 3/6/12/24 h with ≥ 26 px between ticks. */
export function hourStep(cw: number): number {
  return [3, 6, 12, 24].find((k) => k * cw >= 26) ?? 24;
}

export function renderHeatmap(el: HTMLElement, d: HoursData, o: HeatOpts): HeatStats {
  const from = Math.floor(Date.parse(d.from) / 3_600_000);
  const rows = d.spots.filter((s) => !o.hide?.(s)).sort((a, b) => (b.t[o.selected] ?? -1) - (a.t[o.selected] ?? -1) || a.name.localeCompare(b.name, 'tr'));
  const diff = o.mode === 'diff';
  const means = diff ? columnMeans(rows, d.hours) : [];
  const widths: number[] = [];
  for (const s of rows) for (let c = 0; c < d.hours; c++) if (s.t[c] !== null && !s.g.includes(c) && s.w[c] !== null) widths.push(s.w[c]!);
  const meanBand = widths.length ? widths.reduce((a, x) => a + x, 0) / widths.length : null;
  const wideFrom = quantile(widths, 2 / 3);
  const narrow = el.clientWidth < 600;
  // H5: name column ≥ 260 px on wide screens (full name in the tooltip), 150 px on phones (horizontal scroll)
  const L = narrow ? 150 : 260;
  const minCw = narrow ? 9 : el.clientWidth >= 1700 ? 16 : 8;
  const cw = Math.max(minCw, Math.floor((el.clientWidth - L - 8) / d.hours));
  const rh = 24;
  const top = 50; // day row, hour row, sky strip
  const W = L + cw * d.hours;
  const view: HeatRow[] = o.compose ? o.compose(rows) : rows;
  const H = top + view.length * rh + 4;
  const x = (c: number) => L + c * cw;
  const parts: string[] = [];
  parts.push(`<defs><pattern id="hm-wide" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="1.2" height="4" fill="#0e1c27" opacity="0.5"/></pattern></defs>`);
  // selected column: a quiet band behind the cells
  parts.push(`<rect class="hm-selcol" x="${x(o.selected)}" y="${top - 2}" width="${cw}" height="${H - top + 2}" pointer-events="none"/>`);
  // sky strip: night (sun < −6°) dark, twilight (−6…0°) mid, day light
  for (let c = 0; c < d.hours; c++) {
    const alt = skyAt(new Date((from + c + 0.5) * 3_600_000), 40.42, 28.98).sunAlt;
    const fill = alt < -6 ? '#06101a' : alt < 0 ? '#2a3a63' : '#3f5d72';
    parts.push(`<rect x="${x(c)}" y="38" width="${cw}" height="8" fill="${fill}"><title>${alt < -6 ? 'gece' : alt < 0 ? 'alacakaranlık' : 'gündüz'}</title></rect>`);
  }
  // H5: two header rows — day names on top (span of the day), hours below (thinned so labels never touch)
  const step = hourStep(cw);
  const starts = [0];
  for (let c = 1; c < d.hours; c++) if ((from + c + TZ) % 24 === 0) starts.push(c);
  starts.forEach((c0, k) => {
    const c1 = k + 1 < starts.length ? starts[k + 1]! : d.hours;
    const label = dayLabel(new Date((from + c0 + TZ) * 3_600_000), (c1 - c0) * cw - 6);
    if (label) parts.push(`<text class="hm-day" x="${x(c0) + 4}" y="13">${label}</text>`);
    if (c0 > 0) parts.push(`<line class="hm-sep" x1="${x(c0)}" x2="${x(c0)}" y1="2" y2="${H}"/>`);
  });
  for (let c = 0; c < d.hours; c++) {
    const lh = (from + c + TZ) % 24;
    if (lh % step === 0 && (c + 1) * cw - 2 <= W - L) parts.push(`<text class="hm-tick" x="${x(c) + 2}" y="31">${String(lh).padStart(2, '0')}</text>`);
  }
  view.forEach((s, r) => {
    const y = top + r * rh;
    if (s.id === o.focus) parts.push(`<rect class="hm-focus" x="0.5" y="${y + 0.5}" width="${W - 1}" height="${rh - 1}" pointer-events="none"/>`);
    const max = narrow ? 20 : 36;
    const nm = s.name.length > max ? s.name.slice(0, max - 1) + '…' : s.name;
    parts.push(
      s.group
        ? `<a href="#" class="hm-name hm-grp" data-group="${esc(s.group.key)}" role="button" aria-expanded="${s.group.open}"><text x="0" y="${y + rh / 2 + 4}">${s.group.open ? '▾' : '▸'} ${esc(nm)}<title>${esc(s.name)}</title></text></a>`
        : `<a href="/mera/?id=${encodeURIComponent(s.id)}" class="hm-name" data-id="${esc(s.id)}"><text x="0" y="${y + rh / 2 + 4}">${esc(nm)}<title>${esc(s.name)}</title></text></a>`,
    );
    for (let c = 0; c < d.hours; c++) {
      const v = s.t[c];
      const gated = s.g.includes(c);
      const dv = diff && v !== null && means[c] !== null ? v - means[c]! : null;
      const fill = v === null ? '#132632' : gated ? '#3a1c1f' : dv !== null ? diffColor(dv) : scoreColor(v);
      const wide = !!o.showUncertainty && wideFrom !== null && s.w[c] !== null && s.w[c]! > wideFrom;
      const label = v === null ? 'puan yok' : gated ? 'güvenlik uyarısı' : dv !== null ? `${v} (saat ortalamasından ${dv >= 0 ? '+' : '−'}${Math.abs(Math.round(dv))})` : String(v);
      parts.push(`<rect class="hm-cell" data-id="${esc(s.id)}" data-c="${c}" x="${x(c) + 0.5}" y="${y + 1}" width="${cw - 1}" height="${rh - 2}" fill="${fill}"><title>${esc(s.name)} · ${label}${wide ? ' · belirsizlik geniş' : ''}</title></rect>`);
      if (wide && v !== null && !gated) parts.push(`<rect x="${x(c) + 0.5}" y="${y + 1}" width="${cw - 1}" height="${rh - 2}" fill="url(#hm-wide)" pointer-events="none"/>`);
    }
  });
  // H5: "now" as a thin line with a small label above the grid
  const nowX = x(0) + cw * ((Date.now() / 3_600_000) % 1);
  parts.push(`<line class="hm-now" x1="${nowX}" x2="${nowX}" y1="34" y2="${H}"/><text class="hm-nowl" x="${nowX + 3}" y="${top - 1}">şimdi</text>`);
  el.innerHTML = `<svg class="heatmap" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Mera ve saat ısı haritası: ${rows.length} mera, ${view.length} satır, ${d.hours} saat">${parts.join('')}</svg>`;
  el.querySelectorAll<SVGRectElement>('.hm-cell').forEach((r) =>
    r.addEventListener('click', () => o.onCell(r.dataset.id!, Number(r.dataset.c))),
  );
  el.querySelectorAll<SVGAElement>('.hm-name').forEach((a) =>
    a.addEventListener('click', (e) => {
      e.preventDefault();
      if (a.dataset.group) o.onGroup?.(a.dataset.group);
      else o.onCell(a.dataset.id!, o.selected);
    }),
  );
  if (o.badges)
    view.forEach((s, r) => {
      if (s.group) return;
      const b = o.badges!(s);
      if (b) {
        const t = el.querySelectorAll('.hm-name text')[r]!;
        t.insertAdjacentHTML('beforeend', b);
      }
    });
  return { meanBand, wideFrom, diffMax: DIFF_MAX };
}
