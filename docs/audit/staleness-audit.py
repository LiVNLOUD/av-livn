# Staleness/trigger audit. Usage: python3 <this> runs.json [END_ISO] [HOURS] (default: Q1 window, 48 h to
# 2026-11-07 18:52Z; the 72 h monitor report used 2026-11-07T20:55:00Z 72). Inputs (read-only):
#   - score.yml runs from the GitHub Actions API (runs.json: number, event, status, conclusion, created, started,
#     updated, actor, id, title), list_workflow_runs on 2026-11-07 18:5xZ;
#   - D1 observations: one row set per hour for all 50 hours 2026-11-05 17:00Z … 2026-11-07 18:00Z (no hourly
#     weather fetch missing); meta.om_last_run: last fetch 18:07:32Z, statuses [200, 200].
# Assumptions (stated in the report): a run that ran ≥ 90 s wrote scores at its end (short runs are --pending /
# "nothing new" exits; run 199 is the dry dispatch test); every hourly fetch happened at hh:07:32 (Worker cron,
# CRON_FETCH; the minute is confirmed only for the newest fetch).
import json, statistics, sys
from datetime import datetime, timedelta, timezone
t = lambda s: datetime.fromisoformat(s.replace('Z', '+00:00'))
rows = json.load(open(sys.argv[1]))
END = t(sys.argv[2] if len(sys.argv) > 2 else '2026-11-07T18:52:00Z'); HOURS = int(sys.argv[3]) if len(sys.argv) > 3 else 48; START = END - timedelta(hours=HOURS)
FIX = t('2026-11-07T15:54:00Z')  # staleness fix live (deploy run 203 started 15:54)
writes = sorted([(t(r[5]), t(r[6]), r[0]) for r in rows if r[3] == 'success' and (t(r[6]) - t(r[5])).total_seconds() >= 90 and r[0] != 199], key=lambda x: x[1])
def fetch_before(x):
    f = x.replace(minute=7, second=32, microsecond=0)
    return f if f <= x else f - timedelta(hours=1)
def age_at(m, rule):
    done = [w for w in writes if w[1] <= m]
    s0, s1, _ = max(done, key=lambda w: w[1])
    sc = (m - s1).total_seconds() / 60
    wx = (m - fetch_before(s0)).total_seconds() / 60
    return max(sc, wx) if rule == 'N5' else sc
def episodes(rule, a, b):
    eps, cur, worst = [], None, 0
    m = a
    while m < b:
        age = age_at(m, rule); worst = max(worst, age)
        if age > 120 and cur is None: cur = m
        if age <= 120 and cur is not None: eps.append((cur, m)); cur = None
        m += timedelta(minutes=1)
    if cur is not None: eps.append((cur, b))
    return eps, worst
out = {}
for name, a, b in [(f'{HOURS}h', START, END), ('before fix', START, FIX), ('after fix', FIX, END)]:
    e, worst = episodes('N5', a, b)
    out[name] = {'episodes': len(e), 'minutes': sum(int((y - x).total_seconds() // 60) for x, y in e), 'worst_age_min': round(worst), 'list': [f'{x:%d %H:%M}–{y:%d %H:%M}' for x, y in e]}
ends = [w[1] for w in writes if START <= w[1] <= END]
gaps = [(y - x).total_seconds() / 60 for x, y in zip(ends, ends[1:])]
sched = [r for r in rows if r[1] == 'schedule' and START <= t(r[5]) <= END]
disp = [r for r in rows if r[1] == 'workflow_dispatch' and START <= t(r[5]) <= END]
TOKEN = t('2026-11-07T14:00:00Z')  # GH_DISPATCH_TOKEN added; earlier dispatches were manual
worker = [r for r in disp if r[7] == 'LiVNLOUD' and t(r[5]).minute in (7, 8) and t(r[5]) >= TOKEN and r[0] != 199]
out['score_writes'] = len(ends)
out['score_gap_min'] = {'min': round(min(gaps)), 'median': round(statistics.median(gaps)), 'max': round(max(gaps))}
out['after_fix_writes'] = [f'{x:%H:%M}' for x in ends if x >= FIX]
out['schedule_runs'] = len(sched)
out['schedule_expected'] = HOURS * 4  # :23 full + :08/:38/:53 pending, every hour
out['dispatch_runs'] = {'deploy (github-actions bot)': sum(r[7] == 'github-actions[bot]' for r in disp), 'Worker trigger (:07–:08)': [f'#{r[0]} {r[5][11:16]}' for r in worker], 'dry backup test': [f'#{r[0]} {r[5][5:16]}' for r in disp if r[0] == 199], 'manual': [f'#{r[0]} {r[5][5:16]}' for r in disp if r[7] == 'LiVNLOUD' and r not in worker and r[0] != 199]}
print(json.dumps(out, indent=1, ensure_ascii=False))
