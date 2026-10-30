import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { app } from '../src/index';
import { findAsset, serveAsset, type EmbeddedAsset } from '../src/assets';

const fixture: Record<string, EmbeddedAsset> = {
  '/index.html': { path: '/index.html', type: 'text/html', etag: 'a1', encoding: 'utf8', body: '<h1>hi</h1>' },
  '/admin/index.html': { path: '/admin/index.html', type: 'text/html', etag: 'a2', encoding: 'utf8', body: 'admin' },
  '/x.png': { path: '/x.png', type: 'image/png', etag: 'b1', encoding: 'base64', body: btoa('PNG') },
  '/_astro/a.js': { path: '/_astro/a.js', type: 'text/javascript', etag: 'c1', encoding: 'utf8', body: '1' },
};

describe('embedded assets', () => {
  it('resolves exact, directory and index paths', () => {
    expect(findAsset(fixture, '/')?.path).toBe('/index.html');
    expect(findAsset(fixture, '/admin/')?.path).toBe('/admin/index.html');
    expect(findAsset(fixture, '/admin')?.path).toBe('/admin/index.html');
    expect(findAsset(fixture, '/missing')).toBeUndefined();
  });

  it('serves bodies with etag, decodes base64 and honours if-none-match', async () => {
    const png = serveAsset(fixture, new Request('https://x/x.png'))!;
    expect(new Uint8Array(await png.arrayBuffer())).toEqual(new TextEncoder().encode('PNG'));
    const cached = serveAsset(fixture, new Request('https://x/', { headers: { 'if-none-match': '"a1"' } }))!;
    expect(cached.status).toBe(304);
    const head = serveAsset(fixture, new Request('https://x/', { method: 'HEAD' }))!;
    expect(await head.text()).toBe('');
    expect(serveAsset(fixture, new Request('https://x/_astro/a.js'))!.headers.get('cache-control')).toContain('immutable');
  });

  it('serves the built site and a 404 page through the app', async () => {
    const home = await app.request('/', {}, env);
    expect(home.status).toBe(200);
    expect(await home.text()).toContain('Merhaba');
    const missing = await app.request('/yok-boyle-sayfa', {}, env);
    expect(missing.status).toBe(404);
  });
});
