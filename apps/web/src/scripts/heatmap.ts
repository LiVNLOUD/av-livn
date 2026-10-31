// E2: spot × hour heat map — rows = spots (sorted by the selected hour), columns = the next 72 h.
// Cell colour = score on a continuous version of the band palette; a wide 10–90 % band shows as a hatched,
// faded cell. A sky strip above the grid shows night and twilight; day separators and a "now" line.
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
}

const WIDE = 30; // same width at which the list leads with rank
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
const DAYS = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];

export function renderHeatmap(el: HTMLElement, d: HoursData, o: HeatOpts): void {
  const from = Math.floor(Date.parse(d.from) / 3_600_000);
  const rows = d.spots.filter((s) => !o.hide?.(s)).sort((a, b) => (b.t[o.selected] ?? -1) - (a.t[o.selected] ?? -1) || a.name.localeCompare(b.name, 'tr'));
  const narrow = el.clientWidth < 600;
  const L = narrow ? 132 : 220;
  const cw = Math.max(narrow ? 9 : 6, Math.floor((el.clientWidth - L - 8) / d.hours));
  const rh = 26;
  const top = 40; // day labels + sky strip
  const W = L + cw * d.hours;
  const H = top + rows.length * rh + 4;
  const x = (c: number) => L + c * cw;
  const parts: string[] = [];
  parts.push(`<defs><pattern id="hm-wide" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="1.5" height="4" fill="#0e1c27" opacity="0.7"/></pattern></defs>`);
  // sky strip: night (sun < −6°) dark, twilight (−6…0°) mid, day light
  for (let c = 0; c < d.hours; c++) {
    const alt = skyAt(new Date((from + c + 0.5) * 3_600_000), 40.42, 28.98).sunAlt;
    const fill = alt < -6 ? '#06101a' : alt < 0 ? '#2a3a63' : '#3f5d72';
    parts.push(`<rect x="${x(c)}" y="20" width="${cw}" height="10" fill="${fill}"><title>${alt < -6 ? 'gece' : alt < 0 ? 'alacakaranlık' : 'gündüz'}</title></rect>`);
  }
  // day separators and labels (local midnight), 6-hour ticks
  for (let c = 0; c <= d.hours; c++) {
    const lh = (from + c + TZ) % 24;
    if (lh === 0 || c === 0) {
      const day = new Date((from + c + TZ) * 3_600_000);
      if (c < d.hours - 2) parts.push(`<text class="hm-day" x="${x(c) + 3}" y="13">${DAYS[day.getUTCDay()]} ${day.getUTCDate()}</text>`);
      if (c > 0) parts.push(`<line class="hm-sep" x1="${x(c)}" x2="${x(c)}" y1="2" y2="${H}"/>`);
    } else if (lh % 6 === 0 && !narrow) parts.push(`<text class="hm-tick" x="${x(c) + 2}" y="13">${String(lh).padStart(2, '0')}</text>`);
  }
  rows.forEach((s, r) => {
    const y = top + r * rh;
    parts.push(`<a href="/mera/?id=${encodeURIComponent(s.id)}" class="hm-name" data-id="${esc(s.id)}"><text x="0" y="${y + rh / 2 + 4}">${esc(s.name.length > (narrow ? 17 : 28) ? s.name.slice(0, narrow ? 16 : 27) + '…' : s.name)}<title>${esc(s.name)}</title></text></a>`);
    for (let c = 0; c < d.hours; c++) {
      const v = s.t[c];
      const gated = s.g.includes(c);
      const fill = v === null ? '#132632' : gated ? '#3a1c1f' : scoreColor(v);
      const wide = (s.w[c] ?? 0) > WIDE;
      parts.push(`<rect class="hm-cell" data-id="${esc(s.id)}" data-c="${c}" x="${x(c) + 0.5}" y="${y + 1}" width="${cw - 1}" height="${rh - 2}" fill="${fill}"${wide ? ' opacity="0.72"' : ''}><title>${esc(s.name)} · ${v === null ? 'puan yok' : gated ? 'güvenlik uyarısı' : `${v}${wide ? ' (belirsizlik geniş)' : ''}`}</title></rect>`);
      if (wide && v !== null && !gated) parts.push(`<rect x="${x(c) + 0.5}" y="${y + 1}" width="${cw - 1}" height="${rh - 2}" fill="url(#hm-wide)" pointer-events="none"/>`);
    }
  });
  // selected column and "now"
  parts.push(`<rect class="hm-sel" x="${x(o.selected)}" y="18" width="${cw}" height="${H - 18}" pointer-events="none"/>`);
  const nowX = x(0) + cw * ((Date.now() / 3_600_000) % 1);
  parts.push(`<line class="hm-now" x1="${nowX}" x2="${nowX}" y1="16" y2="${H}"/><text class="hm-nowl" x="${nowX + 3}" y="${H - 4}">şimdi</text>`);
  el.innerHTML = `<svg class="heatmap" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Mera ve saat ısı haritası: ${rows.length} mera, ${d.hours} saat">${parts.join('')}</svg>`;
  el.querySelectorAll<SVGRectElement>('.hm-cell').forEach((r) =>
    r.addEventListener('click', () => o.onCell(r.dataset.id!, Number(r.dataset.c))),
  );
  el.querySelectorAll<SVGAElement>('.hm-name').forEach((a) =>
    a.addEventListener('click', (e) => {
      e.preventDefault();
      o.onCell(a.dataset.id!, o.selected);
    }),
  );
  if (o.badges)
    rows.forEach((s, r) => {
      const b = o.badges!(s);
      if (b) {
        const t = el.querySelectorAll('.hm-name text')[r]!;
        t.insertAdjacentHTML('beforeend', b);
      }
    });
}
