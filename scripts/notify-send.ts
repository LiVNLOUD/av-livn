// D9 sender, called by score-job.ts. Decides with workers/api/src/lib/notify.ts and delivers over web push
// (VAPID_PRIVATE_KEY) and/or ntfy (NTFY_TOPIC). Secrets come from the Actions environment and are never
// printed; logs carry counts, kinds and HTTP status codes only. A message is recorded as sent once at
// least one channel delivered it, so a missing secret does not swallow alerts.
import webpush from 'web-push';
import { decide, parseSettings, type Message, type SentRow } from '../workers/api/src/lib/notify';
import { VAPID_PUBLIC_KEY, VAPID_SUBJECT } from '../workers/api/src/lib/vapid';
import type { SpotHours } from '../workers/api/src/lib/windows';

type Query = <T>(sql: string, params?: unknown[]) => Promise<T[]>;
type Sub = { id: string; endpoint: string; p256dh: string; auth: string; fail_count: number };

const NTFY = 'https://ntfy.sh';

export async function viaPush(subs: Sub[], m: Message, query: Query, key: string): Promise<{ ok: number; failed: number }> {
  let ok = 0;
  let failed = 0;
  const payload = JSON.stringify({ title: m.title, body: m.body, url: m.url, tag: m.kind === 'opp' || m.kind === 'safe' ? m.key : m.kind });
  for (const s of subs) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, {
        TTL: m.ttl, urgency: m.kind === 'safe' ? 'high' : 'normal', vapidDetails: { subject: VAPID_SUBJECT, publicKey: VAPID_PUBLIC_KEY, privateKey: key },
      });
      ok++;
      await query('UPDATE push_subscription SET last_ok_at = ?1, fail_count = 0 WHERE id = ?2', [new Date().toISOString(), s.id]);
    } catch (e) {
      failed++;
      const code = (e as { statusCode?: number }).statusCode ?? 0;
      console.log(`push ${s.id.slice(0, 6)}: HTTP ${code}`);
      if (code === 404 || code === 410 || s.fail_count >= 9) await query('DELETE FROM push_subscription WHERE id = ?1', [s.id]);
      else await query('UPDATE push_subscription SET fail_count = fail_count + 1 WHERE id = ?1', [s.id]);
    }
  }
  return { ok, failed };
}

export async function viaNtfy(topic: string, m: Message): Promise<boolean> {
  const res = await fetch(NTFY, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ topic, title: m.title, message: m.body, click: m.url, tags: [m.kind === 'safe' ? 'warning' : m.kind === 'opp' ? 'fish' : 'bell'], priority: m.kind === 'safe' ? 4 : 3 }),
  }).catch(() => null);
  console.log(`ntfy: HTTP ${res?.status ?? 'network error'}`);
  return !!res?.ok;
}

export async function runNotify(query: Query, opts: { spots: SpotHours[]; nowHour: number; testOnly: boolean }): Promise<void> {
  const key = process.env.VAPID_PRIVATE_KEY ?? '';
  const topic = process.env.NTFY_TOPIC ?? '';
  const meta = Object.fromEntries((await query<{ key: string; value: string }>("SELECT key, value FROM meta WHERE key IN ('notify_test_at', 'notify_test_done')")).map((r) => [r.key, r.value]));
  const settings = parseSettings((await query<{ json: string }>('SELECT json FROM notify_settings WHERE id = 1'))[0]?.json);
  const sent = await query<SentRow>('SELECT key, kind, spot_id, start_hour, end_hour FROM notify_sent WHERE sent_at >= ?1', [new Date(Date.now() - 3 * 86_400_000).toISOString()]);
  await query("INSERT INTO meta (key, value) VALUES ('notify_secrets', ?1) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [JSON.stringify({ push: !!key, ntfy: !!topic })]);
  const msgs = decide({ nowHour: opts.nowHour, settings, spots: opts.spots, sent, testAt: meta.notify_test_at, testDone: meta.notify_test_done, testOnly: opts.testOnly });
  if (!msgs.length) {
    console.log('notify: nothing to send');
    return;
  }
  const subs = await query<Sub>('SELECT id, endpoint, p256dh, auth, fail_count FROM push_subscription');
  const wantPush = settings.channels !== 'ntfy';
  const wantNtfy = settings.channels !== 'push';
  for (const m of msgs) {
    const r: Record<string, unknown> = {};
    // A test goes to every configured channel, whatever the setting, so each can be checked.
    if ((wantPush || m.kind === 'test') && key && subs.length) r.push = await viaPush(subs, m, query, key);
    else if (wantPush || m.kind === 'test') r.push = key ? 'abonelik yok' : 'VAPID_PRIVATE_KEY yok';
    if ((wantNtfy || m.kind === 'test') && topic) r.ntfy = await viaNtfy(topic, m);
    else if (wantNtfy || m.kind === 'test') r.ntfy = 'NTFY_TOPIC yok';
    const delivered = (typeof r.push === 'object' && (r.push as { ok: number }).ok > 0) || r.ntfy === true;
    console.log(`notify ${m.kind}: ${JSON.stringify(r)}`);
    if (m.kind === 'test') {
      await query("INSERT INTO meta (key, value) VALUES ('notify_test_done', ?1) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [meta.notify_test_at]);
      await query("INSERT INTO meta (key, value) VALUES ('notify_test_result', ?1) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [JSON.stringify({ at: new Date().toISOString(), ...r })]);
    }
    if (delivered)
      await query('INSERT INTO notify_sent (key, kind, spot_id, start_hour, end_hour, sent_at, channels) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7) ON CONFLICT(key) DO NOTHING', [
        m.key, m.kind, m.spot_id ?? null, m.start_hour ?? null, m.end_hour ?? null, new Date().toISOString(), JSON.stringify(r),
      ]);
  }
}

/**
 * E8 operations alert for the owner: scoring failed, or the newest score is older than 2 h. Goes to every
 * registered PWA push subscription and to ntfy only when NTFY_TOPIC is set. At most once per 6 h per fault.
 */
export async function runWatchdog(query: Query, o: { failed: boolean; scoredAt: string | null; now?: Date }): Promise<string> {
  const now = o.now ?? new Date();
  const ageH = o.scoredAt ? (now.getTime() - Date.parse(o.scoredAt)) / 3_600_000 : Infinity;
  const kind = o.failed ? 'failed' : ageH > 2 ? 'stale' : null;
  if (!kind) return 'ok';
  const metaKey = `alert_${kind}_at`;
  const last = (await query<{ value: string }>('SELECT value FROM meta WHERE key = ?1', [metaKey]))[0]?.value;
  if (last && now.getTime() - Date.parse(last) < 6 * 3_600_000) return `${kind}: already alerted at ${last}`;
  const age = Number.isFinite(ageH) ? `${Math.floor(ageH)} saat` : 'bilinmeyen süre';
  const m: Message = {
    key: `ops:${kind}:${now.toISOString()}`, kind: 'test', ttl: 6 * 3600, url: 'https://github.com/LiVNLOUD/av-livn/actions/workflows/score.yml',
    title: kind === 'failed' ? 'av.livn: puanlama işi başarısız' : 'av.livn: puanlar eski',
    body: kind === 'failed' ? `Son puanlama çalışması hata verdi. En son puan ${age} önce.` : `En son puan ${age} önce hesaplandı (sınır 2 saat). Actions'ı kontrol edin.`,
  };
  const key = process.env.VAPID_PRIVATE_KEY ?? '';
  const topic = process.env.NTFY_TOPIC ?? '';
  const subs = await query<Sub>('SELECT id, endpoint, p256dh, auth, fail_count FROM push_subscription');
  const r: Record<string, unknown> = {};
  r.push = key && subs.length ? await viaPush(subs, m, query, key) : key ? 'abonelik yok' : 'VAPID_PRIVATE_KEY yok';
  if (topic) r.ntfy = await viaNtfy(topic, m);
  const delivered = (typeof r.push === 'object' && (r.push as { ok: number }).ok > 0) || r.ntfy === true;
  if (delivered) await query("INSERT INTO meta (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [metaKey, now.toISOString()]);
  return `${kind}: ${JSON.stringify(r)}`;
}
