export interface EmbeddedAsset {
  path: string;
  type: string;
  etag: string;
  encoding: 'utf8' | 'base64';
  body: string;
}

function decode(asset: EmbeddedAsset): BodyInit {
  if (asset.encoding === 'utf8') return asset.body;
  return Uint8Array.from(atob(asset.body), (ch) => ch.charCodeAt(0));
}

/** Resolve a request path to an embedded file: exact, then /index.html, then .html. */
export function findAsset(assets: Record<string, EmbeddedAsset>, pathname: string): EmbeddedAsset | undefined {
  const clean = pathname.replace(/\/+$/, '');
  return assets[pathname] ?? assets[`${clean}/index.html`] ?? assets[`${clean}.html`];
}

export function serveAsset(assets: Record<string, EmbeddedAsset>, req: Request): Response | undefined {
  const { pathname } = new URL(req.url);
  const asset = findAsset(assets, pathname);
  if (!asset) return undefined;
  const etag = `"${asset.etag}"`;
  const immutable = pathname.startsWith('/_astro/');
  const headers = new Headers({
    'content-type': asset.type,
    etag,
    'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'public, max-age=0, must-revalidate',
    'x-content-type-options': 'nosniff',
  });
  if (req.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers });
  return new Response(req.method === 'HEAD' ? null : decode(asset), { headers });
}
