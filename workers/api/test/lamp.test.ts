import { describe, expect, it } from 'vitest';
import { lampState } from '../src/lib/spots';

describe('lampState (V1 lamp language)', () => {
  it('owner/field record wins: present → dogrulandi, absent → yok', () => {
    expect(lampState(1, null)).toBe('dogrulandi');
    expect(lampState(0, 'uzaktan:1')).toBe('yok');
  });
  it('from the best observation: saha verifies, a photo/remote sighting is only "seen"', () => {
    expect(lampState(null, 'saha:1')).toBe('dogrulandi');
    expect(lampState(null, 'saha:0')).toBe('yok');
    expect(lampState(null, 'uzaktan:1')).toBe('goruldu');
    expect(lampState(null, 'masabasi:1')).toBe('goruldu');
  });
  it('no record, an unseen lamp in a photo, or malformed input → bilinmiyor (never a probability)', () => {
    expect(lampState(null, null)).toBe('bilinmiyor');
    expect(lampState(undefined, 'uzaktan:0')).toBe('bilinmiyor');
    expect(lampState(null, 'saha:')).toBe('bilinmiyor');
    expect(lampState(null, 'xyz')).toBe('bilinmiyor');
  });
});
