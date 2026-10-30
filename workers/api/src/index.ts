import { Hono } from 'hono';
import { refreshWeather } from './cron';
import type { Env } from './env';
import { adminRoutes } from './routes/admin';
import { publicRoutes } from './routes/public';

export const app = new Hono<{ Bindings: Env }>().basePath('/api');

app.get('/health', async (c) => {
  const row = await c.env.DB.prepare("SELECT value FROM meta WHERE key = 'schema'").first<{ value: string }>();
  return c.json({ ok: true, service: 'av-livn', schema: row?.value ?? null, time: new Date().toISOString() });
});

app.route('/', publicRoutes);
app.route('/admin', adminRoutes);

app.notFound((c) => c.json({ ok: false, error: 'not_found' }, 404));
app.onError((err, c) => {
  console.error(err);
  return c.json({ ok: false, error: 'internal' }, 500);
});

export default {
  fetch: app.fetch,
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(
      refreshWeather(env).then((r) => {
        if (r.errors.length) console.error('refreshWeather', r);
        else console.log('refreshWeather', r);
      }),
    );
  },
} satisfies ExportedHandler<Env>;
