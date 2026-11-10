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
    expect(beach).toBe('Geri bırakan (−3,0 puan): kumsal tipi (tip tercihi varsayım, kanıt C)');
    // L1: the structure driver states its type and evidence, not a length it does not use (I4: length → depth only)
    expect(reasonText('yapi', 3, { kind: 'pier', lengthM: 168 } as unknown as SpotV2, h, {} as Weather)).toBe('Öne çıkaran (+3,0 puan): iskele tipi (tip tercihi varsayım, kanıt C; OSM)');
  });
});

describe('L1: reason lines carry the real contribution and its evidence type, no unsupported adjectives', () => {
  const h = { components: [
    { key: 'derinlik', source: 'DTM-interpolasyon', reason: '1.8 m (tahmini); gündüz kolunu belirler' },
    { key: 'lamba', source: 'önsel', reason: '' }, { key: 'yapi', source: 'OSM', reason: '' }, { key: 'taban', source: 'EUSeaMap', reason: 'Sandy mud' },
  ] } as unknown as V2Hour;
  const pier = { kind: 'breakwater', lengthM: 459, lamp: null, lampSource: null, ferry: false } as unknown as SpotV2;
  it('depth says the number and that it is an interpolation, never "derin"', () => {
    const t = reasonText('derinlik', 2.4, pier, h, {} as Weather);
    expect(t).toBe('Öne çıkaran (+2,4 puan): atış mesafesinde ~1.8 m su (EMODnet enterpolasyonu, ölçüm değil)');
    expect(t).not.toMatch(/derin\b|korunaklı/);
  });
  it('lamp prior, substrate and exposure name their evidence; exposure says "daha az açık", not "korunaklı"', () => {
    expect(reasonText('lamba', 1.1, pier, h, {} as Weather)).toBe('Öne çıkaran (+1,1 puan): iskele aydınlatması bilinmiyor (varsayım, kanıt yok)');
    expect(reasonText('taban', -0.5, pier, h, {} as Weather)).toBe('Geri bırakan (−0,5 puan): dip: Sandy mud (EUSeaMap bölgesel sınıflandırma)');
    const ex = reasonText('maruziyet', 3, pier, h, { windDir: 0, windKmh: 20 } as Weather);
    expect(ex).toBe('Öne çıkaran (+3,0 puan): kuzey rüzgarına daha az açık (20 km/sa) (kıyı geometrisinden hesap, OSM; rüzgar Open-Meteo modeli)');
    expect(ex).not.toMatch(/korunaklı/);
  });
  it('the home page keeps the evidence (plainReason) and flags non-measured bases as assumed', async () => {
    const { plainReason } = await import('../src/lib/windows');
    const r = plainReason('Öne çıkaran (+2,4 puan): atış mesafesinde ~1.8 m su (EMODnet enterpolasyonu, ölçüm değil)');
    expect(r).toEqual({ why: 'Atış mesafesinde ~1.8 m su (EMODnet enterpolasyonu, ölçüm değil)', assumed: true });
  });
});
