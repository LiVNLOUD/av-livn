import { env } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';
import { app } from '../src/index';
import { decide, DEFAULT_SETTINGS, inQuiet, localDate, localHour, parseSettings, validateSettings, type SentRow } from '../src/lib/notify';
import type { SpotHours } from '../src/lib/windows';
import type { ListEntryV2 } from '../src/precompute_v2';
import { resetAndSeed } from './helpers';

// 14 UTC = 17:00 Istanbul
const H17 = Math.floor(Date.parse('2026-11-02T14:00:00Z') / 3_600_000);
const e = (t: number, gated: 0 | 1 = 0, band = 10, warn: string | null = null): ListEntryV2 => [t, t - band, t + band, 1, gated, warn, ['lamba', 3, 'lamba var']];
const spot = (id: string, totals: number[], start = H17, opts: { gatedAt?: number; band?: number } = {}): SpotHours => ({
  id, name: `Mera ${id}`, start_hour: start, list: totals.map((t, i) => e(t, i === opts.gatedAt ? 1 : 0, opts.band ?? 10, i === opts.gatedAt ? 'Hamle 45 km/sa' : null)),
});

describe('notify decisions', () => {
  it('settings: defaults, parse, validation', () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('{bad')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('{"threshold":75}').threshold).toBe(75);
    expect(validateSettings({ threshold: 40 })).toEqual({ ok: false, error: 'invalid_threshold' });
    expect(validateSettings({ quiet: [23, 24] })).toEqual({ ok: false, error: 'invalid_quiet' });
    expect(validateSettings({ daily: 'yes' })).toEqual({ ok: false, error: 'invalid_daily' });
    expect(validateSettings({ favourites: [1] })).toEqual({ ok: false, error: 'invalid_favourites' });
    expect(validateSettings({ channels: 'sms' })).toEqual({ ok: false, error: 'invalid_channels' });
    expect(validateSettings({ channels: 'both', favourites: ['a'] })).toMatchObject({ ok: true, value: { channels: 'both', favourites: ['a'], quiet: [23, 7] } });
  });
  it('local time and quiet hours (wrapping midnight)', () => {
    expect(localHour(H17)).toBe(17);
    expect(localDate(H17 + 8)).toBe('2026-11-03'); // 01:00 local next day
    expect(inQuiet(H17 + 6, [23, 7])).toBe(true); // 23:00
    expect(inQuiet(H17 + 13, [23, 7])).toBe(true); // 06:00
    expect(inQuiet(H17 + 14, [23, 7])).toBe(false); // 07:00
    expect(inQuiet(H17, [12, 18])).toBe(true);
    expect(inQuiet(H17, [5, 5])).toBe(false);
  });
  it('daily summary at 17:00 once per day, top 3 windows', () => {
    const spots = [spot('a', Array(24).fill(70)), spot('b', Array(24).fill(82)), spot('c', Array(24).fill(90))];
    const m = decide({ nowHour: H17, settings: { ...DEFAULT_SETTINGS, opportunity: false }, spots, sent: [] });
    expect(m.map((x) => x.kind)).toEqual(['daily']);
    expect(m[0]!.body.split('\n')).toHaveLength(3);
    expect(m[0]!.body.split('\n')[0]).toMatch(/^Pzt 17:00–05:00 Mera c · 90 \(1\.\)$/);
    expect(m[0]!.url).toContain('/mera/?id=c&t=2026-11-02T');
    const sent: SentRow[] = [{ key: 'daily:2026-11-02', kind: 'daily', spot_id: null, start_hour: null, end_hour: null }];
    expect(decide({ nowHour: H17, settings: { ...DEFAULT_SETTINGS, opportunity: false }, spots, sent })).toEqual([]);
    expect(decide({ nowHour: H17 + 1, settings: { ...DEFAULT_SETTINGS, opportunity: false }, spots, sent: [] })).toEqual([]);
    // a poor day still names the relatively best windows (85th percentile fallback); no data → says so
    expect(decide({ nowHour: H17, settings: { ...DEFAULT_SETTINGS, opportunity: false }, spots: [spot('x', Array(24).fill(10))], sent: [] })[0]!.body).toContain('Mera x · 10');
    expect(decide({ nowHour: H17, settings: { ...DEFAULT_SETTINGS, opportunity: false }, spots: [], sent: [] })[0]!.body).toBe('24 saatte öne çıkan pencere yok.');
  });
  it('opportunity: above threshold, narrow band, never the same window twice', () => {
    const now = H17 - 4; // 13:00 local, not daily time
    const spots = [spot('a', [50, 85, 86, 60], now), spot('wide', [90, 90], now, { band: 20 })];
    const m = decide({ nowHour: now, settings: DEFAULT_SETTINGS, spots, sent: [] });
    expect(m.map((x) => x.key)).toEqual([`opp:a:${now + 1}`]);
    expect(m[0]!.body).toContain('en yüksek 86 (1. sıra, bant 76–96). lamba var');
    const sent: SentRow[] = [{ key: `opp:a:${now + 2}`, kind: 'opp', spot_id: 'a', start_hour: now + 2, end_hour: now + 3 }];
    expect(decide({ nowHour: now, settings: DEFAULT_SETTINGS, spots, sent })).toEqual([]);
    expect(decide({ nowHour: now, settings: { ...DEFAULT_SETTINGS, threshold: 90 }, spots, sent: [] })).toEqual([]);
  });
  it('safety for favourites only, once per day; quiet hours hold everything but a test', () => {
    const now = H17 - 4;
    const spots = [spot('fav', [50, 50, 50], now, { gatedAt: 2 }), spot('other', [50, 50], now, { gatedAt: 0 })];
    const s = { ...DEFAULT_SETTINGS, favourites: ['fav'] };
    const m = decide({ nowHour: now, settings: s, spots, sent: [] });
    expect(m.map((x) => [x.kind, x.spot_id])).toEqual([['safe', 'fav']]);
    expect(m[0]!.body).toBe('Pzt 15:00: Hamle 45 km/sa. Kıyıdan uzak durun.');
    expect(decide({ nowHour: now, settings: s, spots, sent: [{ key: m[0]!.key, kind: 'safe', spot_id: 'fav', start_hour: null, end_hour: null }] })).toEqual([]);
    const quiet = decide({ nowHour: H17 + 7, settings: s, spots, sent: [], testAt: 't1', testDone: null });
    expect(quiet.map((x) => x.kind)).toEqual(['test']);
    expect(decide({ nowHour: now, settings: s, spots, sent: [], testAt: 't1', testDone: 't1', testOnly: true })).toEqual([]);
  });
});

describe('/api/admin/notify', () => {
  const auth = { authorization: 'Bearer test-admin-token', 'content-type': 'application/json' };
  const sub = { endpoint: 'https://push.example/abc', keys: { p256dh: 'BP'.padEnd(80, 'x'), auth: 'aa'.padEnd(20, 'y') } };
  beforeAll(async () => {
    await resetAndSeed();
  });
  it('requires the token', async () => {
    expect((await app.request('/api/admin/notify', {}, env)).status).toBe(401);
  });
  it('stores settings and subscriptions, records a test request, never leaks them publicly', async () => {
    expect((await app.request('/api/admin/notify/settings', { method: 'PUT', headers: auth, body: JSON.stringify({ threshold: 20 }) }, env)).status).toBe(400);
    expect((await app.request('/api/admin/notify/settings', { method: 'PUT', headers: auth, body: JSON.stringify({ threshold: 75, favourites: ['osm-way-1'] }) }, env)).status).toBe(200);
    expect((await app.request('/api/admin/notify/subscribe', { method: 'POST', headers: auth, body: JSON.stringify({ endpoint: 'http://x' }) }, env)).status).toBe(400);
    expect((await app.request('/api/admin/notify/subscribe', { method: 'POST', headers: auth, body: JSON.stringify(sub) }, env)).status).toBe(201);
    expect((await app.request('/api/admin/notify/subscribe', { method: 'POST', headers: auth, body: JSON.stringify(sub) }, env)).status).toBe(201);
    expect((await app.request('/api/admin/notify/test', { method: 'POST', headers: auth }, env)).status).toBe(200);
    const b = await (await app.request('/api/admin/notify', { headers: auth }, env)).json<{ settings: { threshold: number }; subscriptions: unknown[]; test: { requested_at: string }; vapid_public_key: string }>();
    expect(b.settings.threshold).toBe(75);
    expect(b.subscriptions).toHaveLength(1);
    expect(JSON.stringify(b.subscriptions)).not.toContain('push.example');
    expect(b.test.requested_at).toBeTruthy();
    expect(b.vapid_public_key).toMatch(/^B/);
    for (const path of ['/api/spots', '/api/spots/osm-way-1', '/api/windows']) {
      const text = await (await app.request(path, {}, env)).text();
      expect(text).not.toContain('push.example');
      expect(text).not.toContain('favourites');
    }
    const del = await (await app.request('/api/admin/notify/subscribe', { method: 'DELETE', headers: auth, body: JSON.stringify({ endpoint: sub.endpoint }) }, env)).json<{ deleted: number }>();
    expect(del.deleted).toBe(1);
    expect((await app.request('/api/admin/notify/subscribe', { method: 'DELETE', headers: auth, body: '{}' }, env)).status).toBe(400);
    expect((await app.request('/api/admin/notify/settings', { method: 'PUT', headers: auth, body: 'x' }, env)).status).toBe(400);
  });
});
