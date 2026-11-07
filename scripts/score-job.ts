// Hourly scoring job (GitHub Actions, score.yml). Reads spots + weather snapshots from D1 over the REST API,
// runs the same pure engine as the Worker would, and writes spot_scores with bound parameters (the stored
// JSON is larger than D1's 100 KB SQL-text limit, so it cannot be inlined into a .sql file).
//
// Bundle + run:  node_modules/.bin/esbuild scripts/score-job.ts --bundle --platform=node --format=esm --external:web-push --outfile=.score/job.mjs
//                node .score/job.mjs [--dry-run] [--pending] [--compare-desk out.json]
//   --pending       manual / notify-smoke only (the 15-minute schedule was removed): exit at once unless a field edit
//                   left a spot in pending_rescore; then a full v2 run
//   --compare-desk  write the current-hour v2 ranking with and without desk (masabasi) findings to out.json
// Env: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID (database id is read from workers/api/wrangler.toml).
import { readFileSync } from 'node:fs';
import { DELETE_STALE_SCORES_SQL, scoreRecords, UPSERT_SCORE_SQL } from '../workers/api/src/precompute';
import type { Snapshot } from '../workers/api/src/lib/openmeteo';
import { CLEAR_PRE_SQL, FETCHED_SQL, WEATHER_RUNS_SQL, parseWeatherRun, fetchedAt, HOURS_SQL, LIST_SQL, preBodies, WINDOWS_SQL, type HoursRow, type ListRow, type WindowsRow } from '../workers/api/src/lib/views';
import { FULL_RUN_MIN, needsFullRun, needsWeatherRefresh, nothingNew } from '../workers/api/src/lib/staleness';
import { computeSpotV2, SPECIES, DELETE_STALE_V2_SQL, fieldRecords, oceanMap, pointsFromObservations, recomputeHours, scoreRecordsV2, UPSERT_HISTORY_SQL, UPSERT_V2_SQL, type ObservationRow, type FieldDepthRow, type FieldObsRow } from '../workers/api/src/precompute_v2';
import { ACTIVE, type SpotRow } from '../workers/api/src/lib/spots';
import type { ListEntryV2 } from '../workers/api/src/precompute_v2';
import { runNotify } from './notify-send';
import { forbiddenUpdates, parseArea, type SpotPos } from '../workers/api/src/lib/forbidden';

const dryRun = process.argv.includes('--dry-run');
let pendingOnly = process.argv.includes('--pending');
// A: second pass of a field-triggered run (score.yml reason=field): edits that arrived inside the 10-minute window
const fieldFollowup = process.argv.includes('--field-followup');
// staleness fix: deploys and data refreshes force a run even when the scores already use the newest weather
const force = process.argv.includes('--force');
const compareOut = process.argv.includes('--compare-desk') ? process.argv[process.argv.indexOf('--compare-desk') + 1] : null;
// I3: ferry lamp prior sensitivity (dry run): same weather, LAMP_PRIOR.ferry 0.85 vs 0.5 at every night hour
// L1: per-driver ablation for spots whose name matches a pattern, next 21:00 local (dry run)
const ablateOut = process.argv.includes('--ablate') ? process.argv[process.argv.indexOf('--ablate') + 1] : null;
// I4: istavrit top 10 now and at the next 21:00 local (before/after a model change, same data)
const topOut = process.argv.includes('--top10') ? process.argv[process.argv.indexOf('--top10') + 1] : null;
const lampOut = process.argv.includes('--lamp-sensitivity') ? process.argv[process.argv.indexOf('--lamp-sensitivity') + 1] : null;
// R1: value of depth information (dry run): each spot's cast-range depth fixed at 1…10 m, everything else unchanged
const voiOut = process.argv.includes('--depth-voi') ? process.argv[process.argv.indexOf('--depth-voi') + 1] : null;
const token = process.env.CLOUDFLARE_API_TOKEN;
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
if (!token || !account) throw new Error('CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are required');
const toml = readFileSync(new URL('../workers/api/wrangler.toml', import.meta.url), 'utf8');
const dbId = /database_id\s*=\s*"([^"]+)"/.exec(toml)?.[1];
if (!dbId) throw new Error('database_id not found in wrangler.toml');

async function query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${dbId}/query`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ sql, params }),
    });
    const body = (await res.json().catch(() => null)) as { success: boolean; errors?: unknown[]; result?: { results: T[] }[] } | null;
    if (res.ok && body?.success) return body.result?.[0]?.results ?? [];
    if (attempt >= 3) throw new Error(`D1 query failed (${res.status}): ${JSON.stringify(body?.errors ?? body)}`);
    await new Promise((r) => setTimeout(r, 2000 * attempt));
  }
}

if (fieldFollowup) {
  // Edits saved while this run was scoring (the Worker answered "queued") wait in pending_rescore. Keep the
  // 10-minute pacing: wait until the window of the last field dispatch has passed, claim the next one, then score
  // them together through the --pending path. Edits after that wait for the next trigger (field or hourly).
  const n = (await query<{ n: number }>('SELECT COUNT(*) AS n FROM pending_rescore'))[0]?.n ?? 0;
  if (!n) { console.log('field follow-up: nothing waiting'); process.exit(0); }
  const last = (await query<{ value: string }>("SELECT value FROM meta WHERE key = 'field_dispatch_at'"))[0]?.value ?? null;
  const waitMs = last ? Math.min(10 * 60_000, Math.max(0, Date.parse(last) + 10 * 60_000 - Date.now())) : 0;
  console.log(`field follow-up: ${n} spot(s) waiting; next pass in ${Math.round(waitMs / 1000)} s`);
  await new Promise((r) => setTimeout(r, waitMs));
  await query("INSERT INTO meta (key, value) VALUES ('field_dispatch_at', ?1) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [new Date().toISOString()]);
  pendingOnly = true;
}
const t0 = performance.now();
const startedAt = new Date().toISOString();
if (pendingOnly) {
  // K0: GitHub skipped hourly runs; a --pending run does the full work when the newest score is too old
  const last = (await query<{ at: string | null }>('SELECT max(computed_at) AS at FROM spot_scores_v2'))[0]?.at ?? null;
  if (needsFullRun(last, new Date())) {
    console.log(`pending: newest score ${last} is older than ${FULL_RUN_MIN} min → full run`);
    pendingOnly = false;
  }
}
if (pendingOnly) {
  const pending = await query<{ spot_id: string }>('SELECT spot_id FROM pending_rescore');
  if (pending.length === 0) {
    console.log('pending: nothing to rescore');
    // A test notification requested in /ayarlar/ goes out within 15 minutes.
    if (!dryRun) await runNotify(query, { spots: [], nowHour: Math.floor(Date.now() / 3_600_000), testOnly: true });
    process.exit(0);
  }
  console.log(`pending: ${pending.map((p) => p.spot_id).join(', ')}`);
}
// Q1: scoring never starts on weather older than 60 min when fresh weather can be had: ask the Worker to fetch
// first (same code as its cron; it refuses within 15 min of the last fetch). On failure, score with what is there.
if (!pendingOnly && !dryRun) {
  const newest = (await query<{ at: string | null }>('SELECT max(fetched_at) AS at FROM forecast_snapshots'))[0]?.at ?? null;
  if (!needsWeatherRefresh(newest, new Date())) console.log(`weather: fresh (newest fetch ${newest})`);
  else if (!process.env.ADMIN_TOKEN) console.log(`weather: newest fetch ${newest} is older than 60 min; no ADMIN_TOKEN, scoring with it`);
  else {
    const r = await fetch('https://av.livn.tr/api/admin/weather/refresh', { method: 'POST', headers: { authorization: `Bearer ${process.env.ADMIN_TOKEN}`, 'user-agent': 'av-livn-score-job' } })
      .then(async (x) => `${x.status} ${(await x.text()).slice(0, 200)}`)
      .catch((e) => `error ${String(e)}`);
    const after = (await query<{ at: string | null }>('SELECT max(fetched_at) AS at FROM forecast_snapshots'))[0]?.at ?? null;
    console.log(`weather: newest fetch ${newest} was older than 60 min; refresh → ${r}; newest now ${after}`);
  }
}
// The Worker cron (:07) fetches weather and then starts this job; a GitHub-scheduled run that finds the scores
// already computed from the newest weather (and no field edit waiting) has nothing to do.
if (!pendingOnly && !force && !dryRun) {
  const [sc, fe, pe] = await Promise.all([
    query<{ at: string | null }>('SELECT max(computed_at) AS at FROM spot_scores_v2'),
    query<{ at: string | null }>('SELECT max(fetched_at) AS at FROM forecast_snapshots'),
    query<{ n: number }>('SELECT COUNT(*) AS n FROM pending_rescore'),
  ]);
  const scoredAt = sc[0]?.at ?? null, newestFetch = fe[0]?.at ?? null;
  if (nothingNew(scoredAt, newestFetch, pe[0]?.n ?? 0)) {
    console.log(`nothing new: scores ${scoredAt} already use the newest weather ${newestFetch}`);
    await runNotify(query, { spots: [], nowHour: Math.floor(Date.now() / 3_600_000), testOnly: true });
    process.exit(0);
  }
}
// F1: owner-drawn forbidden areas hide the spots inside them (and release those no longer covered).
if (!dryRun) {
  const areas = (await query<{ id: string; name: string; geojson: string }>('SELECT id, name, geojson FROM forbidden_area')).map(parseArea);
  const u = forbiddenUpdates(areas, await query<SpotPos>('SELECT id, lat, lon, hidden_reason FROM spots'));
  for (const id of u.hide) await query("UPDATE spots SET hidden_reason = 'forbidden' WHERE id = ?1", [id]);
  for (const id of u.unhide) await query('UPDATE spots SET hidden_reason = NULL WHERE id = ?1', [id]);
  if (u.hide.length || u.unhide.length) console.log(`forbidden areas: hid ${u.hide.length}, released ${u.unhide.length}`);
}
const rows = await query<SpotRow>(`SELECT * FROM spots WHERE ${ACTIVE} ORDER BY id`);
const snapRows = await query<{ cell_id: string; fetched_at: string; json: string }>('SELECT cell_id, fetched_at, json FROM forecast_snapshots');
// MODEL.md §18: model run behind this weather (Worker cron, meta.weather_runs), stored with the public bodies
const weatherRun = parseWeatherRun((await query<{ value: string }>(WEATHER_RUNS_SQL))[0]?.value);
const snaps = new Map(snapRows.map((r) => [r.cell_id, { snap: JSON.parse(r.json) as Snapshot, fetched_at: r.fetched_at }]));
const now = new Date();
const t1 = performance.now();
const records = pendingOnly ? [] : scoreRecords(rows, snaps, now);
const t2 = performance.now();
const bytes = records.reduce((a, r) => a + r.detail_json.length + r.list_json.length, 0);
console.log(`v1: spots ${rows.length}, snapshots ${snaps.size}, records ${records.length}, ${(bytes / 1024).toFixed(0)} KiB JSON, compute ${(t2 - t1).toFixed(0)} ms`);
const obs = await query<FieldObsRow>('SELECT * FROM field_obs');
const depths = await query<FieldDepthRow>('SELECT * FROM field_depth');
const oSeries = await query<{ spot_id: string; fetched_at: string; json: string }>('SELECT * FROM ocean_series');
const oNormal = await query<{ spot_id: string; computed_at: string; json: string }>('SELECT * FROM ocean_normal');
const t3 = performance.now();
const v2 = scoreRecordsV2(rows, snaps, now, fieldRecords(obs, depths), undefined, oceanMap(oSeries, oNormal));
// H3: levrek on the same inputs (same Monte Carlo draws count)
const lv = scoreRecordsV2(rows, snaps, now, fieldRecords(obs, depths), undefined, oceanMap(oSeries, oNormal), 'levrek');
const bySpecies = { istavrit: v2, levrek: lv } as const;
const t4 = performance.now();
const maxDetail = Math.max(...v2.map((r) => r.detail_json.length));
console.log(`v2: records ${v2.length}, field obs ${obs.length}, ocean series ${oSeries.length}, normals ${oNormal.length}, max detail ${(maxDetail / 1024).toFixed(0)} KiB, compute ${(t4 - t3).toFixed(0)} ms`);
const now0 = Math.floor(now.getTime() / 3_600_000);
for (const r of v2) {
  const e = (JSON.parse(r.list_json) as unknown[][])[now0 - r.start_hour];
  console.log(`  ${r.spot_id.padEnd(20)} total ${e?.[0]} band ${e?.[1]}–${e?.[2]} rank ${e?.[3]} · ${(e?.[6] as unknown[] | null)?.[2] ?? ''}`);
}

if (ablateOut) {
  const { explainAll, DEFAULTS, staticTerms, calibrate, rawScore } = await import('@av-livn/scoring');
  const fr = fieldRecords(obs, depths);
  const om = oceanMap(oSeries, oNormal);
  const n21 = now0 + ((18 - (now0 % 24) + 24) % 24);
  const res = rows.map((r) => computeSpotV2(r, snaps.get(r.wx_cell), r.sea_cell ? snaps.get(r.sea_cell) : undefined, now, fr.get(r.id), 0, om.get(r.id)));
  const i = n21 - res[0]!.startHour;
  const spots = res.map((x) => x.spot);
  const w = res.map((x) => x.weather[i]!);
  const all = explainAll(spots, w, DEFAULTS);
  const want = /mendire|Armutlu İskelesi|Karacaali|Kurşunlu Yat|Güzelyalı Yat Limanı – liman/;
  const out = rows.map((r, k) => ({ r, k })).filter(({ r }) => want.test(r.name)).map(({ r, k }) => {
    const s0 = spots[k]!;
    const st = staticTerms(s0, DEFAULTS);
    const h = res[k]!.hours[i]!;
    const comp = (key: string) => h.components.find((c) => c.key === key);
    const at = (lampP: number) => Math.round(calibrate(rawScore({ ...s0, lamp: null, lampP }, w[k]!, DEFAULTS).raw) * 10) / 10;
    return {
      name: r.name, total: h.total, deltas: all[k],
      sources: { derinlik: comp('derinlik')?.source, taban: comp('taban')?.source, yapi: comp('yapi')?.source, lamba: comp('lamba')?.source },
      data: { depth_200m: r.depth_200m, max_depth_100m: r.max_depth_100m, depth_used_m: Math.round(st.depthM * 10) / 10, depth_term: Math.round(st.depth * 1000) / 1000, struct_term: Math.round(st.struct * 1000) / 1000, substrate: comp('taban')?.reason, fetch_km: s0.fetchKm, length_m: s0.lengthM },
      lamp_prior_0_3: s0.lamp === null && !s0.lampP ? at(0.3) : null, lamp_prior_0_5: s0.lamp === null && !s0.lampP ? at(0.5) : null,
    };
  });
  const { writeFileSync } = await import('node:fs');
  writeFileSync(ablateOut, JSON.stringify({ at: new Date(n21 * 3_600_000).toISOString(), method: 'explainAll: score minus mean score with the driver taken from each other spot (same hour/weather), points', spots: out }, null, 1) + '\n');
  console.log(`ablate → ${ablateOut}`);
}

if (topOut) {
  const n21 = now0 + ((18 - (now0 % 24) + 24) % 24);
  const at = (h: number) => v2.map((r) => [rows.find((x) => x.id === r.spot_id)!.name, (JSON.parse(r.list_json) as (number | null)[][])[h - r.start_hour]?.[0] ?? null] as const)
    .filter((x) => x[1] !== null).sort((a, b) => (b[1] as number) - (a[1] as number)).slice(0, 10);
  const { writeFileSync } = await import('node:fs');
  writeFileSync(topOut, JSON.stringify({ now: new Date(now0 * 3_600_000).toISOString(), night: new Date(n21 * 3_600_000).toISOString(), top_now: at(now0), top_night: at(n21) }, null, 1) + '\n');
  console.log(`top10 → ${topOut}`);
}

if (voiOut) {
  // R1 (docs/audit/depth-voi.md). Same pure engine, no Monte Carlo (draws 0), istavrit. A spot's depth is fixed by
  // plumb-quality pairs every 25 m over 0–150 m (they dominate the DTM/prior there). Measured per depth:
  // best non-gated score over 72 h and today (until 06:00 local), its rank among all spots, membership of today's
  // top 3 (the plan's pick and its two alternatives) and the tackle at that spot's best hour.
  const { tackle, staticTerms, DEFAULTS } = await import('@av-livn/scoring');
  const DEPTHS = [1, 2, 3, 4, 6, 8, 10];
  const fr = fieldRecords(obs, depths);
  const om = oceanMap(oSeries, oNormal);
  const todayEnd = now0 + ((27 - (now0 % 24)) % 24 || 24); // next 03:00 UTC = 06:00 local
  type Run = ReturnType<typeof computeSpotV2>;
  const summary = (r: Run) => {
    let b72 = -1, b72i = -1, bToday = -1;
    r.hours.forEach((h, i) => {
      if (h.gated || h.total === null) return;
      if (h.total > b72) { b72 = h.total; b72i = i; }
      if (r.startHour + i < todayEnd && h.total > bToday) bToday = h.total;
    });
    return { b72, b72i, bToday };
  };
  const run = (row: SpotRow, field?: ReturnType<typeof fr.get>) => computeSpotV2(row, snaps.get(row.wx_cell), row.sea_cell ? snaps.get(row.sea_cell) : undefined, now, field, 0, om.get(row.id));
  const base = rows.map((r) => run(r, fr.get(r.id)));
  const baseSum = base.map(summary);
  const rankOf = (vals: number[], k: number) => 1 + vals.filter((v, j) => j !== k && v > vals[k]!).length;
  const top3 = (vals: number[]) => new Set(vals.map((v, j) => [v, j] as const).filter(([v]) => v >= 0).sort((a, b) => b[0] - a[0]).slice(0, 3).map(([, j]) => j));
  const baseTop = top3(baseSum.map((x) => x.bToday));
  const tk = (r: Run, i: number, row: SpotRow, depthM: number) => {
    const w = r.weather[i]!;
    const t = tackle({ depthM, currentMs: w.currentMs, windKmh: w.windKmh, gustKmh: w.gustKmh, crossKmh: null, sunAlt: w.sunAlt, lampP: null, turbidity: null, sstDev: w.sstDev, waveM: w.waveM, kind: row.kind } as never);
    return `${t.profile} ${t.jigG} g ${t.zone}`;
  };
  const out = rows.map((row, k) => {
    const f0 = fr.get(row.id);
    const per = DEPTHS.map((d) => {
      const pairs = [0, 25, 50, 75, 100, 125, 150].map((m) => ({ distance_m: m, depth_m: d, quality: 'plumb' }));
      const field = { ...(f0 ?? { latestAt: now.toISOString(), substrate: null, substrateKind: null, substrateWeight: 0, snag: null, structure: null, structureKind: null, lightColor: null, lamp: null, calibration: null, lastDepthAt: null }), depths: pairs, depthKind: 'saha' } as never;
      const r = run(row, field);
      const s0 = summary(r);
      const today = baseSum.map((x) => x.bToday); today[k] = s0.bToday;
      const all72 = baseSum.map((x) => x.b72); all72[k] = s0.b72;
      const depthM = staticTerms(r.spot, DEFAULTS).depthM;
      return { d, depthM: Math.round(depthM * 10) / 10, b72: Math.round(s0.b72 * 10) / 10, rank72: rankOf(all72, k), inTop3: top3(today).has(k), inTop3_72: top3(all72).has(k), tackle: s0.b72i >= 0 ? tk(r, s0.b72i, row, depthM) : null };
    });
    const ranks = per.map((p) => p.rank72);
    const tackles = new Set(per.map((p) => p.tackle));
    const inTop = per.filter((p) => p.inTop3).length;
    const inTop72 = per.filter((p) => p.inTop3_72).length;
    return {
      id: row.id, name: row.name, kind: row.kind,
      base: { depthM: Math.round(staticTerms(base[k]!.spot, DEFAULTS).depthM * 10) / 10, src: base[k]!.hours[0]?.components.find((c) => c.key === 'derinlik')?.source ?? null, b72: Math.round(baseSum[k]!.b72 * 10) / 10, inTop3: baseTop.has(k) },
      per,
      score_range: Math.round((Math.max(...per.map((p) => p.b72)) - Math.min(...per.map((p) => p.b72))) * 10) / 10,
      rank_range: [Math.min(...ranks), Math.max(...ranks)],
      plan_flip: inTop > 0 && inTop < per.length, // enters or leaves today's top 3 depending on depth
      flip72: inTop72 > 0 && inTop72 < per.length, // same for the best 72 h windows (day hours included)
      tackle_variants: tackles.size,
    };
  });
  out.sort((a, b) => Number(b.plan_flip) - Number(a.plan_flip) || Number(b.flip72) - Number(a.flip72) || (b.rank_range[1] - b.rank_range[0]) - (a.rank_range[1] - a.rank_range[0]) || b.tackle_variants - a.tackle_variants || b.score_range - a.score_range);
  const { writeFileSync } = await import('node:fs');
  writeFileSync(voiOut, JSON.stringify({ at: now.toISOString(), depths: DEPTHS, today_until: new Date(todayEnd * 3_600_000).toISOString(), spots: out }, null, 1) + '\n');
  console.log(`depth-voi → ${voiOut} (${out.length} spots, today flips ${out.filter((x) => x.plan_flip).length}, 72 h flips ${out.filter((x) => x.flip72).length})`);
}

if (lampOut) {
  const { LAMP_PRIOR } = await import('@av-livn/scoring');
  const base = scoreRecordsV2(rows, snaps, now, fieldRecords(obs, depths), 0, oceanMap(oSeries, oNormal));
  const was = LAMP_PRIOR.ferry;
  (LAMP_PRIOR as Record<string, number>).ferry = 0.5;
  const alt = scoreRecordsV2(rows, snaps, now, fieldRecords(obs, depths), 0, oceanMap(oSeries, oNormal));
  (LAMP_PRIOR as Record<string, number>).ferry = was;
  const lists = (recs: typeof v2) => new Map(recs.map((r) => [r.spot_id, { start: r.start_hour, list: JSON.parse(r.list_json) as (number | null)[][] }]));
  const A = lists(base), B = lists(alt);
  const ferry = rows.filter((r) => r.kind === 'ferry' || r.access === 'kisitli_feribot').map((r) => r.id);
  // night hours: 18–05 UTC+3 local over the next 72 h
  const nights = Array.from({ length: 72 }, (_, i) => now0 + i).filter((h) => { const l = (h + 3) % 24; return l >= 19 || l <= 4; });
  const at = (m: typeof A, id: string, h: number) => { const x = m.get(id)!; return x.list[h - x.start]; };
  const perSpot = ferry.map((id) => {
    const d = nights.map((h) => [at(A, id, h)?.[0], at(B, id, h)?.[0], at(A, id, h)?.[3], at(B, id, h)?.[3]] as (number | null)[]).filter((x) => x[0] != null && x[1] != null);
    const mean = (k: number) => d.reduce((a, x) => a + (x[k] as number), 0) / Math.max(1, d.length);
    return { id, name: rows.find((r) => r.id === id)!.name, nightHours: d.length, meanScore085: +mean(0).toFixed(1), meanScore050: +mean(1).toFixed(1), meanRank085: +mean(2).toFixed(1), meanRank050: +mean(3).toFixed(1), firstPlaceHours085: d.filter((x) => x[2] === 1).length, firstPlaceHours050: d.filter((x) => x[3] === 1).length };
  });
  // top 10 at the next 21:00 local
  const n21 = now0 + ((18 - (now0 % 24) + 24) % 24);
  const top = (m: typeof A) => rows.map((r) => [r.name, at(m, r.id, n21)?.[0] ?? null] as const).filter((x) => x[1] !== null).sort((a, b) => (b[1] as number) - (a[1] as number)).slice(0, 10);
  const { writeFileSync } = await import('node:fs');
  writeFileSync(lampOut, JSON.stringify({ at: new Date(n21 * 3_600_000).toISOString(), ferryPrior: [was, 0.5], perSpot, top10_085: top(A), top10_050: top(B) }, null, 1) + '\n');
  console.log(`lamp-sensitivity → ${lampOut}`);
}

if (compareOut) {
  // Same weather, same hour: field table without and with desk findings (rejected ones never count).
  const withoutDesk = scoreRecordsV2(rows, snaps, now, fieldRecords(obs.filter((o) => (o.source_kind ?? 'saha') !== 'masabasi'), depths), undefined, oceanMap(oSeries, oNormal));
  // Current hour and the next 21:00 Europe/Istanbul (18 UTC): lamp findings only act at night.
  const night = now0 + ((18 - (now0 % 24) + 24) % 24);
  const at = (recs: typeof v2, h: number) => Object.fromEntries(recs.map((r) => [r.spot_id, (JSON.parse(r.list_json) as unknown[][])[h - r.start_hour]]));
  const hours = [now0, night].map((h) => {
    const before = at(withoutDesk, h);
    const after = at(v2, h);
    return { hour: new Date(h * 3_600_000).toISOString(), spots: rows.map((r) => ({ spot_id: r.id, name: r.name, before: before[r.id], after: after[r.id] })) };
  });
  const { writeFileSync } = await import('node:fs');
  writeFileSync(compareOut, JSON.stringify({ hour: hours[0]!.hour, spots: hours[0]!.spots, night: hours[1] }, null, 1) + '\n');
  console.log(`compare-desk → ${compareOut}`);
}

if (dryRun) {
  console.log('dry run: nothing written');
} else {
  for (const r of records) await query(UPSERT_SCORE_SQL, [r.spot_id, r.species, r.computed_at, r.start_hour, r.list_json, r.detail_json]);
  await query(DELETE_STALE_SCORES_SQL);
  for (const r of [...v2, ...lv]) {
    await query(UPSERT_V2_SQL, [r.spot_id, r.model_version, r.computed_at, r.start_hour, r.list_json, r.detail_json, 0, r.species]);
    await query(UPSERT_HISTORY_SQL, [r.spot_id, r.start_hour, r.history_json, r.species]);
  }
  await query(DELETE_STALE_V2_SQL);
  // Phase F CPU: default /api/spots, /api/hours, /api/windows bodies for this and the next five hours (GitHub
  // schedules can be late or skipped; past the last stored hour the Worker builds the bodies live, which costs CPU).
  {
    const h0 = Math.floor(Date.now() / 3_600_000);
    // the weather these scores were computed with (snapshots read at the start), not a fetch that landed meanwhile
    const usedFetch = snapRows.reduce<string | null>((m, r) => (m === null || r.fetched_at > m ? r.fetched_at : m), null);
    const fet = usedFetch ? [{ at: usedFetch }] : await query(FETCHED_SQL);
    const bodies: [string, string][] = [];
    for (const species of SPECIES) {
      const [list, hrs, win] = await Promise.all([query<ListRow>(LIST_SQL, [species]), query<HoursRow>(HOURS_SQL, [species]), query<WindowsRow>(WINDOWS_SQL, [species])]);
      bodies.push(...preBodies(list, hrs, win, fetchedAt(fet), Array.from({ length: 6 }, (_, k) => h0 + k), species, weatherRun));
    }
    await query(CLEAR_PRE_SQL);
    for (const [k, v] of bodies) await query('INSERT INTO meta (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [k, v]);
    console.log(`public bodies: ${bodies.length} (${Math.round(bodies.reduce((a, [, v]) => a + v.length, 0) / 1024)} KB)`);
  }
  // Catch-log sessions whose hours predate the history table: fill them from the hourly observations.
  const partial = await query<{ id: string; spot_id: string; model_json: string }>("SELECT id, spot_id, model_json FROM catch_session WHERE freeze_status = 'partial'");
  const fields = fieldRecords(obs, depths);
  for (const ses of partial) {
    const row = rows.find((r) => r.id === ses.spot_id);
    const model = JSON.parse(ses.model_json) as { hours: { hour: number }[]; missing: number[] };
    if (!row || !model.missing.length) continue;
    const from = new Date((model.missing[0]! - 50) * 3_600_000).toISOString();
    const to = new Date((model.missing[model.missing.length - 1]! + 1) * 3_600_000).toISOString();
    const q = 'SELECT * FROM observations WHERE cell_id = ?1 AND ts >= ?2 AND ts < ?3 ORDER BY ts';
    const wx = await query<ObservationRow>(q, [row.wx_cell, from, to]);
    const sea = row.sea_cell ? await query<ObservationRow>(q, [row.sea_cell, from, to]) : [];
    const filled = recomputeHours(row, fields.get(row.id), pointsFromObservations(wx, sea), model.missing);
    const hours = [...model.hours, ...filled.filter((h) => h.total !== null)].sort((a, b) => a.hour - b.hour);
    const missing = filled.filter((h) => h.total === null).map((h) => h.hour);
    await query("UPDATE catch_session SET model_json = ?1, freeze_status = ?2 WHERE id = ?3", [
      JSON.stringify({ ...model, hours, missing, recomputed_at: new Date().toISOString() }), missing.length ? 'partial' : 'complete', ses.id,
    ]);
    console.log(`catch ${ses.id}: recomputed ${filled.length - missing.length} hours from observations, ${missing.length} without data`);
  }
  // Edits made while this run computed stay pending for the next 15-minute run.
  await query('DELETE FROM pending_rescore WHERE since <= ?1', [startedAt]);
  console.log(`wrote ${records.length} rows in ${(performance.now() - t2).toFixed(0)} ms (total ${(performance.now() - t0).toFixed(0)} ms)`);
  // D9: daily summary / opportunity / safety on the hourly run, test requests on every run.
  const names = new Map(rows.map((r) => [r.id, r.name]));
  const access = new Map(rows.map((r) => [r.id, r.access]));
  const province = new Map(rows.map((r) => [r.id, r.province ?? null]));
  const marina = new Map(rows.map((r) => [r.id, r.private_marina === 1]));
  const spotsHours = (sp: keyof typeof bySpecies) => bySpecies[sp].map((r) => ({ id: r.spot_id, name: names.get(r.spot_id) ?? r.spot_id, access: access.get(r.spot_id) ?? null, province: province.get(r.spot_id) ?? null, private_marina: marina.get(r.spot_id) ?? false, start_hour: r.start_hour, list: JSON.parse(r.list_json) as ListEntryV2[] }));
  await runNotify(query, { spots: spotsHours('istavrit'), bySpecies: { istavrit: spotsHours('istavrit'), levrek: spotsHours('levrek') }, nowHour: Math.floor(Date.now() / 3_600_000), testOnly: pendingOnly }).catch((e) => console.log(`notify failed: ${(e as Error).message}`));
}
