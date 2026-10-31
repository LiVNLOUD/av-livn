import { describe, expect, it } from 'vitest';
import { SHORE_KINDS, type SpotV2, type V2Hour, type Weather } from '@av-livn/scoring';
import { reasonText } from '../src/precompute_v2';

describe('reason lines name every spot type (G1)', () => {
  it('no "undefined" for structures and the new shore kinds', () => {
    const h = { components: [{ key: 'yapi', source: 'OSM', value: 0.8 }] } as unknown as V2Hour;
    for (const kind of ['pier', 'breakwater', 'groyne', 'manual', ...SHORE_KINDS]) {
      const spot = { kind, lengthM: kind === 'pier' ? 120 : null } as unknown as SpotV2;
      for (const d of [5, -5]) {
        const t = reasonText('yapi', d, spot, h, {} as Weather);
        expect(t, kind).not.toMatch(/undefined/i);
      }
    }
    const beach = reasonText('yapi', -3, { kind: 'beach', lengthM: null } as unknown as SpotV2, h, {} as Weather);
    expect(beach).toBe('Geri bırakan: kumsal — tip tercihi varsayım, kanıt C');
    expect(reasonText('yapi', 3, { kind: 'pier', lengthM: 168 } as unknown as SpotV2, h, {} as Weather)).toContain('iskele 168 m');
  });
});
