// V1.1 time integrity: one "selected hour" for the whole page. The map, plan card, tackle, timeline and weather layers
// subscribe to it; the URL carries it (?t=ISO hour) so the home page and /harita/ open on the same hour.
// latest(): request guard — a slow answer for an older selection never overwrites the newer one.

export const HOUR_MS = 3_600_000;

export type HourSource = 'init' | 'url' | 'timeline' | 'slider' | 'list' | 'heat' | 'plan' | 'now' | 'map';
export interface HourState { col: number; hour: number; iso: string | null; source: HourSource }
export interface HourStore {
  get(): HourState;
  /** Set by column offset from the current hour (0 = now); clamped to [0, max]. Returns the new state. */
  set(col: number, source: HourSource): HourState;
  /** Set by ISO time (rounded down to the hour). */
  setIso(iso: string | null, source: HourSource): HourState;
  subscribe(fn: (s: HourState) => void): () => void;
  readonly nowHour: number;
}

interface Opts {
  nowMs?: number;
  max?: number;
  /** current URL; when given the store reads ?t= on creation and writes it back on change */
  url?: { search: string; replace(search: string): void };
}

export function createHourStore(opts: Opts = {}): HourStore {
  const nowHour = Math.floor((opts.nowMs ?? Date.now()) / HOUR_MS);
  const max = opts.max ?? 71;
  const subs = new Set<(s: HourState) => void>();
  const make = (col: number, source: HourSource): HourState => {
    const c = Math.max(0, Math.min(max, Math.round(col)));
    const hour = nowHour + c;
    return { col: c, hour, iso: c === 0 ? null : new Date(hour * HOUR_MS).toISOString(), source };
  };
  let state = make(0, 'init');
  if (opts.url) {
    const t = new URLSearchParams(opts.url.search).get('t');
    const ms = t ? Date.parse(t) : NaN;
    if (Number.isFinite(ms)) state = make(Math.floor(ms / HOUR_MS) - nowHour, 'url');
  }
  const writeUrl = () => {
    if (!opts.url) return;
    const q = new URLSearchParams(opts.url.search);
    if (state.iso) q.set('t', state.iso); else q.delete('t');
    const s = q.toString();
    opts.url.replace(s ? `?${s}` : '');
  };
  const store: HourStore = {
    nowHour,
    get: () => state,
    set(col, source) {
      const next = make(col, source);
      const changed = next.col !== state.col;
      state = next;
      if (changed) {
        writeUrl();
        subs.forEach((f) => f(state));
      }
      return state;
    },
    setIso(iso, source) {
      if (!iso) return store.set(0, source);
      const ms = Date.parse(iso);
      return store.set(Number.isFinite(ms) ? Math.floor(ms / HOUR_MS) - nowHour : 0, source);
    },
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
  };
  return store;
}

/** Browser URL adapter for createHourStore (history.replaceState keeps the back button clean). */
export const browserUrl = () => ({
  get search() { return location.search; },
  replace(search: string) { history.replaceState(history.state, '', `${location.pathname}${search}${location.hash}`); },
});

export const STALE = Symbol('stale');
/** Latest-wins wrapper: run(p) resolves to p's value, or STALE if another run() started after it. */
export function latest() {
  let seq = 0;
  return {
    async run<T>(p: Promise<T> | (() => Promise<T>)): Promise<T | typeof STALE> {
      const my = ++seq;
      const v = await (typeof p === 'function' ? p() : p);
      return my === seq ? v : STALE;
    },
    /** true while no newer run has started since `token` was taken */
    token() { const my = ++seq; return () => my === seq; },
  };
}
