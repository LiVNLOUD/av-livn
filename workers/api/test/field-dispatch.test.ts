import { env } from 'cloudflare:workers';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { app } from '../src/index';
import { claimFieldDispatch, fireFieldDispatch } from '../src/lib/staleness';
import { resetAndSeed } from './helpers';

const NOW = new Date('2026-11-07T21:30:00Z');
const plus = (min: number) => new Date(NOW.getTime() + min * 60_000);
const meta = async (k: string) => (await env.DB.prepare('SELECT value FROM meta WHERE key = ?1').bind(k).first<{ value: string }>())?.value ?? null;
const reset = () => env.DB.prepare("DELETE FROM meta WHERE key IN ('field_dispatch_at', 'score_dispatch_log')").run();
const withToken = { ...env, GH_DISPATCH_TOKEN: 'test-dispatch' };

describe('A: field edit starts scoring at once, at most every 10 min', () => {
  beforeAll(async () => { await resetAndSeed(); });
  afterEach(() => vi.restoreAllMocks());

  it('claims one slot per 10 minutes; without a token it is off', async () => {
    await reset();
    expect(await claimFieldDispatch({ ...env, GH_DISPATCH_TOKEN: undefined }, NOW)).toBe('off');
    expect(await claimFieldDispatch(withToken, NOW)).toBe('started');
    expect(await claimFieldDispatch(withToken, plus(3))).toBe('queued');
    expect(await claimFieldDispatch(withToken, plus(9.9))).toBe('queued');
    expect(await claimFieldDispatch(withToken, plus(10))).toBe('started');
  });

  it('dispatches score.yml with reason=field and logs "saha düzeltmesi"; a failure releases the slot', async () => {
    await reset();
    const calls: { url: string; body: string }[] = [];
    const ok = (async (url: string, init: RequestInit) => { calls.push({ url, body: String(init.body) }); return new Response(null, { status: 204 }); }) as unknown as typeof fetch;
    await claimFieldDispatch(withToken, NOW);
    expect(await fireFieldDispatch(withToken, NOW, ok)).toBe('dispatched');
    expect(calls[0]!.url).toMatch(/actions\/workflows\/score\.yml\/dispatches$/);
    expect(JSON.parse(calls[0]!.body)).toEqual({ ref: 'main', inputs: { reason: 'field' } });
    expect(JSON.parse((await meta('score_dispatch_log'))!)).toEqual([{ at: NOW.toISOString(), reason: 'saha düzeltmesi', status: 'dispatched' }]);
    expect(await meta('field_dispatch_at')).toBe(NOW.toISOString());
    const later = plus(11);
    await claimFieldDispatch(withToken, later);
    expect(await fireFieldDispatch(withToken, later, (async () => new Response(null, { status: 422 })) as unknown as typeof fetch)).toBe('dispatch failed 422');
    expect(await meta('field_dispatch_at')).toBeNull(); // released: the next edit tries again
  });

  it('field POST answers with the dispatch state; a second edit inside the window is queued', async () => {
    await reset();
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(null, { status: 204 }));
    const auth = { authorization: 'Bearer test-admin-token', 'content-type': 'application/json' };
    const post = () => app.request('/api/admin/spots/osm-way-1/field', { method: 'POST', headers: auth, body: JSON.stringify({ access: 'acik', note: 'test' }) }, withToken);
    const a = await (await post()).json<{ dispatch: string }>();
    const b = await (await post()).json<{ dispatch: string }>();
    expect([a.dispatch, b.dispatch]).toEqual(['started', 'queued']);
    expect(spy.mock.calls.filter(([u]) => String(u).includes('score.yml')).length).toBe(1);
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM pending_rescore WHERE spot_id = 'osm-way-1'").first<{ n: number }>())!.n).toBe(1);
  });

  it("the owner's lamp state starts scoring only when it actually changes", async () => {
    await reset();
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(null, { status: 204 }));
    const auth = { authorization: 'Bearer test-admin-token', 'content-type': 'application/json' };
    const patch = async (body: object) => (await app.request('/api/admin/spots/osm-way-2', { method: 'PATCH', headers: auth, body: JSON.stringify(body) }, withToken)).json<{ dispatch?: string }>();
    const cur = (await env.DB.prepare("SELECT has_light FROM spots WHERE id = 'osm-way-2'").first<{ has_light: number | null }>())!.has_light;
    expect((await patch({ has_light: cur === null ? null : cur === 1, notes: 'x' })).dispatch).toBeUndefined();
    expect((await patch({ has_light: cur === 1 ? false : true })).dispatch).toBe('started');
    expect((await patch({ notes: 'y' })).dispatch).toBeUndefined();
    expect(spy.mock.calls.filter(([u]) => String(u).includes('score.yml')).length).toBe(1);
  });
});
