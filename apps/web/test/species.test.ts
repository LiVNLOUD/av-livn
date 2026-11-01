import { describe, expect, it } from 'vitest';
import { api, currentSpecies, isSpecies, LEGAL_MIN, link } from '../src/scripts/species';

describe('H3 species helper', () => {
  it('URL wins, default istavrit, links and API params', () => {
    expect(currentSpecies('?tur=levrek')).toBe('levrek');
    expect(currentSpecies('?tur=kalkan')).toBe('istavrit');
    expect(isSpecies('levrek') && !isSpecies('x')).toBe(true);
    expect(api('/api/spots', 'istavrit')).toBe('/api/spots');
    expect(api('/api/spots?at=1', 'levrek')).toBe('/api/spots?at=1&species=levrek');
    expect(link('/mera/?id=a', 'levrek')).toBe('/mera/?id=a&tur=levrek');
    expect(link('/', 'levrek')).toBe('/?tur=levrek');
    expect(LEGAL_MIN.levrek).toBe(25);
  });
});
