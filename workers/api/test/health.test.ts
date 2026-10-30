import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { app } from '../src/index';

describe('GET /api/health', () => {
  it('returns ok with schema version from D1', async () => {
    const res = await app.request('/api/health', {}, env);
    expect(res.status).toBe(200);
    const body = await res.json<{ ok: boolean; schema: string }>();
    expect(body.ok).toBe(true);
    expect(body.schema).toBe('f0');
  });

  it('returns JSON 404 for unknown api routes', async () => {
    const res = await app.request('/api/nope', {}, env);
    expect(res.status).toBe(404);
  });
});
