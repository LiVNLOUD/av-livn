// P3: 72-hour time slider for the map page — day separators and labels, night band, "now" mark; the thumb picks
// the hour every map layer shows. Pure layout helper + a small DOM builder.
import { skyAt } from '@av-livn/scoring';

const TZ = 3;
const wf = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', weekday: 'long' });
const tf = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit' });

export interface SliderLayout { days: { col: number; label: string }[]; night: [number, number][]; nowFrac: number }
/** Day starts (local midnight) and night runs (sun below −6°) over `hours` columns from epoch hour `from`. */
export function sliderLayout(from: number, hours: number, nowMs = Date.now(), lat = 40.42, lon = 28.98): SliderLayout {
  const days: { col: number; label: string }[] = [{ col: 0, label: wf.format(new Date(from * 3_600_000)) }];
  for (let c = 1; c < hours; c++) if ((from + c + TZ) % 24 === 0) days.push({ col: c, label: wf.format(new Date((from + c) * 3_600_000)) });
  const night: [number, number][] = [];
  let start: number | null = null;
  for (let c = 0; c < hours; c++) {
    const dark = skyAt(new Date((from + c + 0.5) * 3_600_000), lat, lon).sunAlt < -6;
    if (dark && start === null) start = c;
    if (!dark && start !== null) { night.push([start, c]); start = null; }
  }
  if (start !== null) night.push([start, hours]);
  return { days, night, nowFrac: (nowMs / 3_600_000 - from) / hours };
}

export function hourLabel(h: number): string {
  const d = new Date(h * 3_600_000);
  return `${wf.format(d)} ${tf.format(d)}`;
}

/** Builds the slider into `el`; onChange(hour) fires (debounced) while dragging and on keys. */
export function mountSlider(el: HTMLElement, from: number, hours: number, initial: number, onChange: (hour: number) => void): { set(hour: number): void } {
  const L = sliderLayout(from, hours);
  const pct = (c: number) => `${((c / hours) * 100).toFixed(3)}%`;
  // "now" in the first column sits on the first day's start: one label ("şimdi · Cumartesi") instead of two
  const nowFirst = L.nowFrac * hours < 1;
  if (nowFirst && L.days[0]) L.days[0].label = `şimdi · ${L.days[0].label}`;
  // a partial first day too short for its name keeps only "şimdi" (or nothing)
  // (measured in pixels: on a 390 px phone one hour is ~5 px)
  const pxPerHour = (el.clientWidth || 1200) / hours;
  if (L.days[0] && L.days[1]) {
    const room = (L.days[1].col - L.days[0].col) * pxPerHour;
    if (room < L.days[0].label.length * 7 + 8) L.days[0].label = nowFirst && room >= 46 ? 'şimdi' : '';
  }
  el.innerHTML = `<div class="ts-band" aria-hidden="true">${L.night.map(([a, b]) => `<span class="ts-night" style="left:${pct(a)};width:${pct(b - a)}"></span>`).join('')}${L.days.map((d) => `<span class="ts-day" style="left:${pct(d.col)}"><b>${d.label}</b></span>`).join('')}<span class="ts-now" style="left:${(L.nowFrac * 100).toFixed(3)}%">${nowFirst ? '' : '<i>şimdi</i>'}</span></div>
    <input class="ts-range" type="range" min="0" max="${hours - 1}" step="1" value="${initial - from}" aria-label="Haritanın saati" />
    <output class="ts-out"></output>`;
  const input = el.querySelector<HTMLInputElement>('.ts-range')!;
  const out = el.querySelector<HTMLOutputElement>('.ts-out')!;
  let t = 0;
  const show = () => { out.textContent = hourLabel(from + Number(input.value)); };
  input.addEventListener('input', () => { show(); clearTimeout(t); t = window.setTimeout(() => onChange(from + Number(input.value)), 160); });
  show();
  return { set(h) { input.value = String(Math.max(0, Math.min(hours - 1, h - from))); show(); } };
}
