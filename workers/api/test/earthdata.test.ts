import { describe, expect, it } from 'vitest';
import { expiryNotice, tokenExpiry, trDate } from '../src/lib/earthdata';

const jwt = (payload: object) => `x.${btoa(JSON.stringify(payload)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')}.sig`;

describe('Faz R: Earthdata token expiry', () => {
  it('reads exp from a JWT, null for anything else', () => {
    expect(tokenExpiry(jwt({ exp: 1_799_000_000, uid: 'u' }))!.toISOString()).toBe(new Date(1_799_000_000_000).toISOString());
    expect(tokenExpiry(jwt({ uid: 'u' }))).toBeNull();
    expect(tokenExpiry('not-a-jwt')).toBeNull();
    expect(tokenExpiry('a.%%%.b')).toBeNull();
    expect(tokenExpiry(undefined)).toBeNull();
  });
  it('warns 10 days ahead and when expired, in plain Turkish with the date', () => {
    const exp = new Date('2027-01-06T21:41:00Z');
    expect(expiryNotice(exp, new Date('2026-12-20T00:00:00Z'))).toBeNull();
    const soon = expiryNotice(exp, new Date('2026-12-30T00:00:00Z'))!;
    expect(soon.level).toBe('soon');
    expect(soon.body).toContain(`Earthdata token ${trDate(exp)} içinde bitiyor (8 gün): yenile ve EARTHDATA_TOKEN secret'ını güncelle.`);
    expect(expiryNotice(exp, new Date('2027-01-07T00:00:00Z'))!.level).toBe('expired');
    expect(trDate(exp)).toMatch(/2027/);
  });
});
