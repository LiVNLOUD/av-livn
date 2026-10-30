import { Hono } from 'hono';
import type { Env } from './env';

export const app = new Hono<{ Bindings: Env }>().basePath('/api');

app.get('/health', async (c) => {
  const row = await c.env.DB.prepare("SELECT value FROM meta WHERE key = 'schema'").first<{ value: string }>();
  return c.json({ ok: true, service: 'av-livn', schema: row?.value ?? null, time: new Date().toISOString() });
});

app.notFound((c) => c.json({ ok: false, error: 'not_found' }, 404));

export default {
  fetch: app.fetch,
} satisfies ExportedHandler<Env>;
