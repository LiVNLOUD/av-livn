import { describe, expect, it } from 'vitest';

describe('I4: evidence letter vs basis of the number', () => {
  it('A only for measured values; season peak days are B/C with their reasoning; widths are assumptions', async () => {
    const { PARAMS, paramBasis, BASIS_TR } = await import('../../src/v2/params');
    const defs = Object.entries(PARAMS) as [string, import('../../src/v2/params').ParamDef][];
    for (const [, d] of defs) if (d.evidence === 'A') expect(paramBasis(d)).toBe('olcum');
    expect(PARAMS.season_spawn_doy).toMatchObject({ evidence: 'B', basis: 'literatur' });
    expect(paramBasis(PARAMS.season_spawn_w)).toBe('varsayim');
    expect(PARAMS.season_autumn_doy).toMatchObject({ evidence: 'C', basis: 'dolayli' });
    for (const k of ['season_spawn_doy', 'season_spawn_w', 'season_autumn_doy', 'season_autumn_w'] as const) expect(PARAMS[k].note).toBeTruthy();
    expect(Object.keys(BASIS_TR)).toEqual(['olcum', 'bolgesel_model', 'dolayli', 'literatur', 'varsayim']);
  });
});
