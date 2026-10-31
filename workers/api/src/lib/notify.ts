// D9 notifications: settings and the pure decision of what to send at a given hour. Sending (web push, ntfy)
// happens in the scoring Actions job (scripts/notify-send.ts); the Worker only stores settings/subscriptions.
import type { ListEntryV2 } from '../precompute_v2';
import { bestWindows, type SpotHours, type Window } from './windows';

export type Channel = 'push' | 'ntfy' | 'both';
export interface NotifySettings {
  daily: boolean;
  opportunity: boolean;
  safety: boolean;
  /** Opportunity threshold (score). */
  threshold: number;
  /** Quiet hours, Europe/Istanbul [from, to): nothing but a test is sent. */
  quiet: [number, number];
  favourites: string[];
  channels: Channel;
}

export const DEFAULT_SETTINGS: NotifySettings = { daily: true, opportunity: true, safety: true, threshold: 80, quiet: [23, 7], favourites: [], channels: 'push' };
export const DAILY_LOCAL_HOUR = 17;
export const NARROW_BAND = 30; // same width at which the list leads with rank instead of score
const TZ = 3; // Europe/Istanbul, UTC+3 all year
const SITE = 'https://av.livn.tr';

export function parseSettings(json: string | null | undefined): NotifySettings {
  if (!json) return { ...DEFAULT_SETTINGS };
  try {
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(json) as Partial<NotifySettings>) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

const hourOk = (h: unknown) => Number.isInteger(h) && (h as number) >= 0 && (h as number) <= 23;

export function validateSettings(b: Record<string, unknown>): { ok: true; value: NotifySettings } | { ok: false; error: string } {
  const v = { ...DEFAULT_SETTINGS, ...b } as NotifySettings;
  for (const k of ['daily', 'opportunity', 'safety'] as const) if (typeof v[k] !== 'boolean') return { ok: false, error: `invalid_${k}` };
  if (typeof v.threshold !== 'number' || !(v.threshold >= 50 && v.threshold <= 95)) return { ok: false, error: 'invalid_threshold' };
  if (!Array.isArray(v.quiet) || v.quiet.length !== 2 || !v.quiet.every(hourOk)) return { ok: false, error: 'invalid_quiet' };
  if (!Array.isArray(v.favourites) || v.favourites.length > 50 || !v.favourites.every((f) => typeof f === 'string' && f.length <= 80)) return { ok: false, error: 'invalid_favourites' };
  if (!['push', 'ntfy', 'both'].includes(v.channels)) return { ok: false, error: 'invalid_channels' };
  return { ok: true, value: { daily: v.daily, opportunity: v.opportunity, safety: v.safety, threshold: v.threshold, quiet: [v.quiet[0], v.quiet[1]], favourites: v.favourites, channels: v.channels } };
}

export const localHour = (h: number) => (((h + TZ) % 24) + 24) % 24;
export const localDate = (h: number) => new Date((h + TZ) * 3_600_000).toISOString().slice(0, 10);

/** Quiet window [from, to) in local hours; wraps midnight when from > to; from = to means no quiet hours. */
export function inQuiet(h: number, [from, to]: [number, number]): boolean {
  const l = localHour(h);
  if (from === to) return false;
  return from < to ? l >= from && l < to : l >= from || l < to;
}

export interface SentRow {
  key: string;
  kind: string;
  spot_id: string | null;
  start_hour: number | null;
  end_hour: number | null;
}

export interface Message {
  key: string;
  kind: 'daily' | 'opp' | 'safe' | 'test';
  title: string;
  body: string;
  url: string;
  spot_id?: string;
  start_hour?: number;
  end_hour?: number;
  /** Seconds the push service may hold it (an opportunity is worthless after its window). */
  ttl: number;
}

const DAYS = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
function when(h: number): string {
  const d = new Date((h + TZ) * 3_600_000);
  return `${DAYS[d.getUTCDay()]} ${String(d.getUTCHours()).padStart(2, '0')}:00`;
}
const until = (h: number) => `${String(localHour(h)).padStart(2, '0')}:00`;
const range = (w: Window) => `${when(w.start)}–${until(w.end)}`;
const url = (id: string, h: number) => `${SITE}/mera/?id=${encodeURIComponent(id)}&t=${new Date(h * 3_600_000).toISOString()}`;
const n0 = (x: number) => Math.round(x);

export interface DecideInput {
  nowHour: number;
  settings: NotifySettings;
  spots: SpotHours[];
  sent: SentRow[];
  /** meta.notify_test_at and the last one handled. */
  testAt?: string | null;
  testDone?: string | null;
  testOnly?: boolean;
}

export function decide(i: DecideInput): Message[] {
  const out: Message[] = [];
  const { nowHour: now, settings: s } = i;
  if (i.testAt && i.testAt !== i.testDone) {
    out.push({ key: `test:${i.testAt}`, kind: 'test', title: 'av.livn test bildirimi', body: 'Bildirimler çalışıyor. Dokununca ana sayfa açılır.', url: `${SITE}/`, ttl: 3600 });
  }
  if (i.testOnly || inQuiet(now, s.quiet)) return out;
  const sentKeys = new Set(i.sent.map((r) => r.key));

  if (s.daily && localHour(now) === DAILY_LOCAL_HOUR && !sentKeys.has(`daily:${localDate(now)}`)) {
    const { windows } = bestWindows(i.spots, now, 24, { n: 3, perSpot: 1 });
    out.push({
      key: `daily:${localDate(now)}`, kind: 'daily', title: 'Önümüzdeki 24 saatin en iyileri',
      body: windows.length ? windows.map((w) => `${range(w)} ${w.name} · ${n0(w.total)} (${w.rank}.)`).join('\n') : '24 saatte öne çıkan pencere yok.',
      url: windows[0] ? url(windows[0].spot_id, windows[0].peak) : `${SITE}/`, ttl: 6 * 3600,
    });
  }

  if (s.opportunity) {
    const { windows } = bestWindows(i.spots, now, 12, { threshold: s.threshold, n: 20, perSpot: 1 });
    for (const w of windows) {
      if (w.p10 === null || w.p90 === null || w.p90 - w.p10 > NARROW_BAND) continue;
      // Never the same window twice: an earlier alert for this spot overlapping this window counts as sent.
      const dup = i.sent.some((r) => r.kind === 'opp' && r.spot_id === w.spot_id && r.start_hour !== null && r.end_hour !== null && r.start_hour < w.end && w.start < r.end_hour);
      if (dup) continue;
      out.push({
        key: `opp:${w.spot_id}:${w.start}`, kind: 'opp', title: `Fırsat: ${w.name}`,
        body: `${range(w)}, en yüksek ${n0(w.total)} (${w.rank}. sıra, bant ${n0(w.p10)}–${n0(w.p90)}).${w.reason ? ' ' + w.reason : ''}`,
        url: url(w.spot_id, w.peak), spot_id: w.spot_id, start_hour: w.start, end_hour: w.end, ttl: Math.max(600, (w.end - now) * 3600),
      });
    }
  }

  if (s.safety) {
    for (const sp of i.spots) {
      if (!s.favourites.includes(sp.id)) continue;
      const key = `safe:${sp.id}:${localDate(now)}`;
      if (sentKeys.has(key)) continue;
      for (let h = now; h < now + 12; h++) {
        const e: ListEntryV2 | undefined = sp.list[h - sp.start_hour];
        if (e && e[4] === 1) {
          out.push({ key, kind: 'safe', title: `Güvenlik: ${sp.name}`, body: `${when(h)}: ${e[5] ?? 'rüzgar/dalga eşiği aşılıyor'}. Kıyıdan uzak durun.`, url: url(sp.id, h), spot_id: sp.id, start_hour: h, end_hour: h + 1, ttl: 12 * 3600 });
          break;
        }
      }
    }
  }
  return out;
}
