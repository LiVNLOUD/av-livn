from datetime import datetime, timedelta, timezone
Z=timezone.utc
def t(s): return datetime.fromisoformat(s).replace(tzinfo=Z)
# score.yml runs that wrote scores (success, > ~1 min), start–end, UTC (GitHub Actions history)
runs=[("2026-11-06T14:58:34","2026-11-06T15:02:55"),("2026-11-06T18:02:45","2026-11-06T18:05:44"),
("2026-11-06T22:04:45","2026-11-06T22:07:30"),("2026-11-06T22:07:49","2026-11-06T22:10:08"),("2026-11-06T22:08:02","2026-11-06T22:13:10"),
("2026-11-06T22:16:55","2026-11-06T22:20:17"),("2026-11-06T22:20:48","2026-11-06T22:23:51"),("2026-11-06T22:23:06","2026-11-06T22:27:58"),
("2026-11-06T22:24:58","2026-11-06T22:30:35"),("2026-11-06T22:33:26","2026-11-06T22:36:18"),("2026-11-06T22:37:16","2026-11-06T22:40:08"),
("2026-11-06T22:50:49","2026-11-06T22:53:05"),("2026-11-06T22:52:30","2026-11-06T22:55:01"),("2026-11-06T23:11:14","2026-11-06T23:14:34"),
("2026-11-06T23:14:10","2026-11-06T23:17:12"),("2026-11-07T01:21:35","2026-11-07T01:23:46"),("2026-11-07T02:51:58","2026-11-07T02:54:58"),
("2026-11-07T07:44:47","2026-11-07T07:47:01"),("2026-11-07T10:16:51","2026-11-07T10:19:17"),("2026-11-07T10:19:06","2026-11-07T10:21:07"),
("2026-11-07T10:21:57","2026-11-07T10:23:59"),("2026-11-07T13:47:45","2026-11-07T13:49:48"),("2026-11-07T13:52:07","2026-11-07T13:54:24"),
("2026-11-07T14:04:57","2026-11-07T14:06:55"),("2026-11-07T15:21:43","2026-11-07T15:24:34"),("2026-11-07T15:24:50","2026-11-07T15:26:49")]
runs=[(t(a),t(b)) for a,b in runs]
def fetch_before(x):  # Worker cron fetch at hh:07:32 every hour (observations: every hour present, no errors)
    f=x.replace(minute=7,second=32,microsecond=0)
    return f if f<=x else f-timedelta(hours=1)
end=t("2026-11-07T15:51:00"); start=end-timedelta(hours=24)
def episodes(rule):
    eps=[]; cur=None; mins=0; worst_all=0
    m=start
    while m<end:
        done=[r for r in runs if r[1]<=m]
        s_end=max(r[1] for r in done); s_start=[r for r in done if r[1]==s_end][0][0]
        sc=(m-s_end).total_seconds()/60; wx=(m-fetch_before(s_start)).total_seconds()/60
        age=max(sc,wx) if rule=='N5' else sc
        worst_all=max(worst_all,age)
        on=age>120
        if on: mins+=1
        if on and cur is None: cur=m
        if not on and cur is not None: eps.append((cur,m)); cur=None
        m+=timedelta(minutes=1)
    if cur: eps.append((cur,end))
    return eps,mins,worst_all
for rule in ['N5','score-only']:
    eps,mins,w=episodes(rule)
    print(rule, len(eps),'episodes', mins,'min', f'max age {w:.0f} min')
    for a,b in eps: print('  ',a.strftime('%m-%d %H:%M'),'→',b.strftime('%H:%M'), int((b-a).total_seconds()/60),'min')
# after the fix: every hourly fetch (:07:32) dispatches; observed dispatch→start 3 s, run 2–3 min
worst=0
for h in range(24):
    f=start.replace(minute=7,second=32)+timedelta(hours=h)
    nxt_end=f+timedelta(hours=1,minutes=3)
    worst=max(worst,(nxt_end-f).total_seconds()/60)
print('after fix: max used-fetch age ≈',round(worst),'min (limit 120) → 0 episodes unless a fetch or dispatch fails; one missed hour peaks at ≈',round(worst+60),'min')
