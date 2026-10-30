import type { Context } from 'hono';

/**
 * Serve a GET from the edge cache, computing it at most once per `ttl` seconds per URL.
 * Scoring all spots costs several ms of CPU; the free plan allows ~10 ms per request.
 * Clients always get `no-cache`: the livn.tr zone's Browser Cache TTL rewrites any
 * max-age to 4 h, which would freeze scores on phones.
 */
export async function cachedJson(c: Context, ttl: number, compute: () => Promise<Response>): Promise<Response> {
  const cache = typeof caches === 'undefined' ? undefined : caches.default;
  if (!cache) return compute();
  const key = new Request(new URL(c.req.url).toString(), { method: 'GET' });
  const hit = await cache.match(key);
  if (hit) return forClient(hit);
  const res = await compute();
  if (res.ok) {
    const stored = new Response(res.clone().body, res);
    stored.headers.set('cache-control', `public, max-age=${ttl}`);
    const put = cache.put(key, stored);
    try {
      c.executionCtx.waitUntil(put);
    } catch {
      await put; // no ExecutionContext (e.g. app.request in tests)
    }
  }
  return forClient(res);
}

function forClient(res: Response): Response {
  const out = new Response(res.body, res);
  out.headers.set('cache-control', 'no-cache');
  return out;
}

/** Best-effort purge of cached public responses for a spot (same colo only; others expire within the TTL). */
export async function purgeSpot(origin: string, id: string): Promise<void> {
  if (typeof caches === 'undefined') return;
  await Promise.all([`${origin}/api/spots`, `${origin}/api/spots/${encodeURIComponent(id)}`].map((u) => caches.default.delete(u)));
}
