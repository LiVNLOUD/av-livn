import { Hono } from 'hono';
import type { Env } from './env';
import { serveAsset } from './assets';
import { ASSETS } from './generated/assets';

export const app = new Hono<{ Bindings: Env }>();

app.get('/api/health', async (c) => {
  const row = await c.env.DB.prepare("SELECT value FROM meta WHERE key = 'schema'").first<{ value: string }>();
  return c.json({ ok: true, service: 'av-livn', schema: row?.value ?? null, time: new Date().toISOString() });
});

app.all('/api/*', (c) => c.json({ ok: false, error: 'not_found' }, 404));

app.on(['GET', 'HEAD'], '*', (c) => {
  const res = serveAsset(ASSETS, c.req.raw);
  if (res) return res;
  const notFound = ASSETS['/404.html'];
  return c.html(notFound?.body ?? '<h1>404</h1>', 404);
});

export default {
  fetch: app.fetch,
} satisfies ExportedHandler<Env>;
