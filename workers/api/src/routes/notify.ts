// /api/admin/notify/* (ADMIN_TOKEN): push subscriptions, settings, test request, delivery status.
// Nothing here is reachable from public endpoints. Sending happens in score.yml (scripts/notify-send.ts).
import { Hono } from 'hono';
import type { Env } from '../env';
import { parseSettings, validateSettings } from '../lib/notify';
import { VAPID_PUBLIC_KEY } from '../lib/vapid';

export const notifyRoutes = new Hono<{ Bindings: Env }>();

async function subId(endpoint: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint));
  return [...new Uint8Array(d)].slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('');
}

notifyRoutes.get('/', async (c) => {
  const [settings, subs, sent, meta] = await c.env.DB.batch([
    c.env.DB.prepare('SELECT json FROM notify_settings WHERE id = 1'),
    c.env.DB.prepare('SELECT id, ua, created_at, last_ok_at, fail_count FROM push_subscription ORDER BY created_at'),
    c.env.DB.prepare('SELECT key, kind, spot_id, sent_at, channels FROM notify_sent ORDER BY sent_at DESC LIMIT 20'),
    c.env.DB.prepare("SELECT key, value FROM meta WHERE key IN ('notify_test_at', 'notify_test_done', 'notify_test_result', 'notify_secrets')"),
  ]);
  const m = Object.fromEntries((meta!.results as { key: string; value: string }[]).map((r) => [r.key, r.value]));
  return c.json({
    ok: true,
    vapid_public_key: VAPID_PUBLIC_KEY,
    settings: parseSettings((settings!.results[0] as { json: string } | undefined)?.json),
    subscriptions: subs!.results,
    sent: sent!.results,
    test: { requested_at: m.notify_test_at ?? null, done: m.notify_test_done ?? null, result: m.notify_test_result ? JSON.parse(m.notify_test_result) : null },
    secrets: m.notify_secrets ? JSON.parse(m.notify_secrets) : null,
  });
});

notifyRoutes.put('/settings', async (c) => {
  const b = await c.req.json<Record<string, unknown>>().catch(() => null);
  if (!b || typeof b !== 'object') return c.json({ ok: false, error: 'invalid_json' }, 400);
  const v = validateSettings(b);
  if (!v.ok) return c.json(v, 400);
  await c.env.DB.prepare('INSERT INTO notify_settings (id, json, updated_at) VALUES (1, ?1, ?2) ON CONFLICT(id) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at')
    .bind(JSON.stringify(v.value), new Date().toISOString())
    .run();
  return c.json({ ok: true, settings: v.value });
});

notifyRoutes.post('/subscribe', async (c) => {
  const b = await c.req.json<{ endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } }>().catch(() => null);
  const ep = b?.endpoint;
  const k = b?.keys;
  if (typeof ep !== 'string' || !/^https:\/\//.test(ep) || ep.length > 1000 || typeof k?.p256dh !== 'string' || typeof k?.auth !== 'string' || k.p256dh.length > 200 || k.auth.length > 100)
    return c.json({ ok: false, error: 'invalid_subscription' }, 400);
  const id = await subId(ep);
  await c.env.DB.prepare(
    `INSERT INTO push_subscription (id, endpoint, p256dh, auth, ua, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
     ON CONFLICT(id) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth, ua = excluded.ua, fail_count = 0`,
  ).bind(id, ep, k.p256dh, k.auth, (c.req.header('user-agent') ?? '').slice(0, 160), new Date().toISOString()).run();
  return c.json({ ok: true, id }, 201);
});

notifyRoutes.delete('/subscribe', async (c) => {
  const b = await c.req.json<{ endpoint?: unknown }>().catch(() => null);
  if (typeof b?.endpoint !== 'string') return c.json({ ok: false, error: 'invalid_subscription' }, 400);
  const r = await c.env.DB.prepare('DELETE FROM push_subscription WHERE id = ?1').bind(await subId(b.endpoint)).run();
  return c.json({ ok: true, deleted: r.meta.changes });
});

/** The 15-minute scoring run sends it (the private key lives only in Actions). */
notifyRoutes.post('/test', async (c) => {
  const at = new Date().toISOString();
  await c.env.DB.prepare("INSERT INTO meta (key, value) VALUES ('notify_test_at', ?1) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(at).run();
  return c.json({ ok: true, requested_at: at });
});
