import { describe, expect, it } from 'vitest';
import { checkToken, cleanToken, LOGIN_TEXT } from '../src/scripts/admin';

const res = (status: number) => (async () => new Response('{}', { status })) as unknown as typeof fetch;

describe('admin login', () => {
  it('cleans pasted keys (spaces, line breaks, zero-width) at both ends only', () => {
    expect(cleanToken('  abc def\n')).toBe('abc def');
    expect(cleanToken('​abc\r\n﻿')).toBe('abc');
  });
  it('maps ping status to a distinct message', async () => {
    expect(await checkToken('t', res(200))).toBe('ok');
    expect(await checkToken('t', res(401))).toBe('wrong');
    expect(await checkToken('t', res(503))).toBe('disabled');
    expect(await checkToken('t', res(500))).toBe('error');
    expect(await checkToken('t', (async () => { throw new TypeError('offline'); }) as unknown as typeof fetch)).toBe('offline');
    expect(LOGIN_TEXT.wrong).toMatch(/Anahtar hatalı/);
    expect(LOGIN_TEXT.offline).toMatch(/Bağlantı yok/);
    expect(LOGIN_TEXT.disabled).toMatch(/yapılandırılmamış/);
  });
});
