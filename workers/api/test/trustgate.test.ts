import { env } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';
import { app } from '../src/index';
import { calibrationPassed, parseReport, reportKey } from '../src/lib/calibration';
import { resetAndSeed } from './helpers';

const passing = { status: 'tamam', n: 34, temporal: { status: 'tamam', model_beats_baselines: true } };

describe('N3: trust cap from the forward calibration', () => {
  beforeAll(async () => { await resetAndSeed(); });
  it('passes only with ≥ 30 sessions, a fitted model and a win over every baseline', () => {
    expect(calibrationPassed(null)).toBe(false);
    expect(calibrationPassed(undefined)).toBe(false);
    expect(calibrationPassed({ status: 'yetersiz veri', n: 12 })).toBe(false);
    expect(calibrationPassed({ ...passing, n: 29 })).toBe(false);
    expect(calibrationPassed({ ...passing, n: undefined })).toBe(false);
    expect(calibrationPassed({ ...passing, temporal: null })).toBe(false);
    expect(calibrationPassed({ ...passing, temporal: { status: 'yetersiz veri' } })).toBe(false);
    expect(calibrationPassed({ ...passing, temporal: { status: 'tamam', model_beats_baselines: false } })).toBe(false);
    expect(calibrationPassed(passing)).toBe(true);
    expect([parseReport(null), parseReport('{bad'), parseReport('3')]).toEqual([null, null, null]);
    expect([reportKey('istavrit'), reportKey('levrek')]).toEqual(['calibration_report', 'calibration_report:levrek']);
  });
  it('public endpoint: verdict and count only, per species', async () => {
    const get = async (q = '') => (await app.request(`/api/trust-gate${q}`, {}, env)).json<Record<string, unknown>>();
    expect(await get()).toEqual({ ok: true, species: 'istavrit', passed: false, n: 0, min: 30 });
    await env.DB.prepare("INSERT INTO meta (key, value) VALUES ('calibration_report:levrek', ?1) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(JSON.stringify({ ...passing, coefficients: { beta: 1 } })).run();
    const lv = await get('?species=levrek');
    expect(lv).toEqual({ ok: true, species: 'levrek', passed: true, n: 34, min: 30 });
    expect(JSON.stringify(lv)).not.toMatch(/coefficients/);
    expect((await app.request('/api/trust-gate?species=kalkan', {}, env)).status).toBe(400);
    await env.DB.prepare("DELETE FROM meta WHERE key = 'calibration_report:levrek'").run();
  });
});
