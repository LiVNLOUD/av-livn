import { describe, expect, it } from 'vitest';
import { KIND_LABEL_TR, kindLabel, kindTitle, SHORE_KINDS } from '../src';

describe('kind labels (G1)', () => {
  it('every structure and shore kind has a Turkish label', () => {
    for (const k of ['pier', 'breakwater', 'groyne', 'manual', ...SHORE_KINDS]) {
      expect(KIND_LABEL_TR[k as keyof typeof KIND_LABEL_TR], k).toBeTruthy();
      expect(kindLabel(k)).not.toMatch(/undefined/i);
    }
  });
  it('unknown kinds and titles', () => {
    expect(kindLabel('zzz')).toBe('yapı');
    expect(kindTitle('beach')).toBe('Kumsal');
    expect(kindTitle('river_mouth')).toBe('Dere ağzı');
    expect(kindTitle('pier')).toBe('İskele');
  });
});
