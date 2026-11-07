// Faz R: first step of satbathy.yml. Reads the expiry of EARTHDATA_TOKEN (JWT exp; the token itself is never
// printed), stores it in meta.earthdata_token_exp and warns the owner through push/ntfy when ≤ 10 days remain or it
// has expired (once a day). Exits 1 with a plain message when the token is missing, unreadable or expired, so only
// the satellite job stops. --test-alert sends one real test message through the same channels.
import { readFileSync } from 'node:fs';
import { expiryNotice, tokenExpiry, trDate } from '../workers/api/src/lib/earthdata';
import { opsAlert } from './notify-send';

const token = process.env.CLOUDFLARE_API_TOKEN;
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
if (!token || !account) throw new Error('CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are required');
const dbId = /database_id\s*=\s*"([^"]+)"/.exec(readFileSync(new URL('../workers/api/wrangler.toml', import.meta.url), 'utf8'))?.[1];
async function query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${dbId}/query`, {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ sql, params }),
  });
  const b = (await res.json()) as { success: boolean; result?: { results: T[] }[]; errors?: unknown };
  if (!b.success) throw new Error(`D1 query failed: ${JSON.stringify(b.errors)}`);
  return b.result?.[0]?.results ?? [];
}
const URL_SECRETS = 'https://github.com/LiVNLOUD/av-livn/settings/secrets/actions';
const now = new Date();
const ed = process.env.EARTHDATA_TOKEN;
if (!ed) {
  console.error('EARTHDATA_TOKEN tanımlı değil (repo secret). Uydu derinliği işi durdu; diğer işler etkilenmez.');
  process.exit(1);
}
const exp = tokenExpiry(ed);
if (!exp) {
  console.error("EARTHDATA_TOKEN okunamadı (JWT değil ya da 'exp' alanı yok). Yeni token üretip secret'ı güncelleyin.");
  process.exit(1);
}
await query("INSERT INTO meta (key, value) VALUES ('earthdata_token_exp', ?1) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [exp.toISOString()]);
const days = Math.floor((exp.getTime() - now.getTime()) / 86_400_000);
console.log(`Earthdata token bitişi: ${trDate(exp)} (${exp.toISOString()}), kalan ${days} gün`);
if (process.argv.includes('--test-alert')) {
  console.log(`test alert → ${await opsAlert(query, { metaKey: 'alert_earthdata_test_at', gapH: 0, force: true, url: URL_SECRETS, title: 'av.livn: Earthdata token uyarı testi', body: `Test: Earthdata token ${trDate(exp)} içinde bitiyor (${days} gün). Bu bir deneme mesajıdır.` })}`);
}
const n = expiryNotice(exp, now);
if (n) console.log(`${n.level} → ${await opsAlert(query, { metaKey: 'alert_earthdata_at', gapH: 24, url: URL_SECRETS, title: n.title, body: n.body })}`);
if (n?.level === 'expired') {
  console.error("EARTHDATA_TOKEN süresi dolmuş: yenileyip secret'ı güncelleyin.");
  process.exit(1);
}
