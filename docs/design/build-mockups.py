"""Faz V0a: home screen mockups, two compositions with the same content (A "Atlas", B "Kokpit"), desktop 1440 and
390 px (first screen + one-tap detail), plus a light-theme desktop of each. Static HTML from real data
(docs/design/mockups/data/*.json from build-mockup-data.py) and the V tokens/icons. Run: python3 docs/design/build-mockups.py
Nothing here is shipped with the app."""

from __future__ import annotations

import datetime as dt
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
M = ROOT / "docs/design/mockups"
MAP = json.loads((M / "data/map.json").read_text())
SNAP = json.loads((M / "data/snapshot.json").read_text())
SPRITE = (M / "icons.svg").read_text()
TZ = dt.timezone(dt.timedelta(hours=3))
SPOTS = {s["id"]: s for s in SNAP["spots"]["spots"]}
PLAN = SNAP["windows"]["plan"]["bursa"]
SEL_ID = "osm-way-483965349"  # Tirilye İskelesi — the live plan pick at snapshot time
ALT_IDS = ["osm-way-503770078", "osm-way-1233883494"]
UNK = next(s for s in SNAP["spots"]["spots"] if s["name"].startswith("Fıstıklı İskelesi"))
DET = SNAP["details"][SEL_ID]
PK = DET["packed"]
F0 = DET["from"]
HOURS = 24
KIND_ICON = {"pier": "iskele", "breakwater": "mendirek", "promenade": "kordon", "rocky": "kaya", "beach": "kumsal", "river_mouth": "dere-agzi", "harbour": "liman", "quay": "liman", "groyne": "mendirek", "manual": "iskele"}
KIND_TR = {"pier": "iskele", "breakwater": "mendirek", "promenade": "kordon", "rocky": "kayalık", "beach": "kumsal", "river_mouth": "dere ağzı", "harbour": "liman", "quay": "rıhtım", "groyne": "mahmuz"}
ACCESS = {"acik": ("açık", "erisim-acik", ""), "kisitli_feribot": ("kısıtlı · feribot", "erisim-kisitli", "warn"), "kisitli_marina": ("kısıtlı · marina", "erisim-kisitli", "warn"), None: ("bilinmiyor", "erisim-bilinmiyor", "warn")}
FMT_NUM = lambda x, k=0: f"{x:.{k}f}".replace(".", ",")  # noqa: E731
TAKEN = dt.datetime.fromisoformat(SNAP["taken_at"])


def i(name: str, cls: str = "i") -> str:
    return f'<svg class="{cls}" aria-hidden="true"><use href="#i-{name}"/></svg>'


def fit_cls(v) -> str:
    return "f0" if v is None or v < 30 else "f1" if v < 45 else "f2" if v < 60 else "f3" if v < 75 else "f4"


def local(ts: str) -> dt.datetime:
    return dt.datetime.fromisoformat(ts.replace("Z", "+00:00")).astimezone(TZ)


# ---------------------------------------------------------------- data for the selected spot
G = SNAP["grid_wx"]


def grid_at(var: str, hour_utc: int, lat: float, lon: float, scale=1.0):
    k = hour_utc - G["from_hour"]
    fr = G["vars"][var][k]
    best, bd = None, 1e9
    for a in range(G["nlat"]):
        for b in range(G["nlon"]):
            v = fr[a * G["nlon"] + b]
            if v is None:
                continue
            d = (G["lat0"] + a * G["dlat"] - lat) ** 2 + (G["lon0"] + b * G["dlon"] - lon) ** 2
            if d < bd:
                bd, best = d, v
    return None if best is None else best / scale


SEL = SPOTS[SEL_ID]
ROWS = []
for k in range(HOURS):
    h, t = PK["h"][F0 + k], PK["tk"][F0 + k]
    hu = int(dt.datetime.fromisoformat(h[0].replace("Z", "+00:00")).timestamp() // 3600)
    ROWS.append({
        "ts": h[0], "loc": local(h[0]), "fit": h[1], "p10": h[3], "p90": h[4], "gate": bool(h[5]),
        "wind": t[2], "gust": t[3], "sun": t[5], "wave": t[9], "cur": t[1],
        "wd": grid_at("wd", hu, SEL["lat"], SEL["lon"]), "rain": grid_at("pr", hu, SEL["lat"], SEL["lon"], 10.0),
    })
WIN = PLAN["today"]["all"]["windows"][0]
W0, W1 = local(WIN["start"]), local(WIN["end"])
SEL_K = next(k for k, r in enumerate(ROWS) if r["loc"] == local(WIN["peak"]))
SR = ROWS[SEL_K]


def wind_rel(spot: dict, wd: float | None) -> str:
    """Wind relative to the shore: from the sea, from the land, or along it (shore_normal_deg points seaward)."""
    n = spot.get("shore_normal_deg")
    if n is None or wd is None:
        return "bilinmiyor"
    d = abs((wd - n + 180) % 360 - 180)
    return "denizden" if d <= 60 else "karadan" if d >= 120 else "yandan"


def spread_at(lat, lon, k):
    cells = SNAP["spread_cells"]
    c = min(cells, key=lambda c: (c["lat"] - lat) ** 2 + (c["lon"] - lon) ** 2)
    hu = int(dt.datetime.fromisoformat(ROWS[k]["ts"].replace("Z", "+00:00")).timestamp() // 3600)
    j = hu - SNAP["windows"].get("from_hour", hu) if False else None
    # spread doc is aligned to its own from_hour; snapshot kept the arrays only — use the same offset as the grid
    j = hu - G["from_hour"]
    w = c["w"][j] if 0 <= j < len(c["w"]) else None
    return w


# town labels = centroid of the inventory's spots grouped by neighbourhood → town (real positions, no gazetteer)
TOWN = {"Armutlu": "Armutlu", "Fıstıklı": "Fıstıklı", "Kurşunlu (Gemlik)": "Kurşunlu", "Kumsaz": "Kumsaz", "Tirilye": "Tirilye",
        "Eşkel": "Eşkel", "Mesudiye": "Mesudiye", "Ömerbey Mah.": "Mudanya", "Hasanbey": "Mudanya", "Kumyaka": "Kumyaka",
        "Güzelyalı Burgaz": "Güzelyalı", "Güzelyalı Eğitim": "Güzelyalı", "Güzelyalı Yalı": "Güzelyalı", "Güzelyalı Siteler": "Güzelyalı",
        "Kumla": "Kumla", "Büyükkumla": "Kumla", "Orhaniye": "Gemlik", "Cumhuriyet": "Gemlik", "Demirsubaşı": "Gemlik", "Dr.Ziya Kaya": "Gemlik",
        "Kayhan": "Gemlik", "Balıkpazarı": "Gemlik", "Hisar": "Gemlik", "Kapaklı": "Kapaklı"}
TOWN_OFF = {"Armutlu": (0, -22, "middle"), "Fıstıklı": (14, -18, "start"), "Kumla": (0, -20, "middle"), "Kapaklı": (0, -18, "middle"),
            "Gemlik": (-24, 34, "end"), "Tirilye": (0, 34, "middle"), "Mudanya": (0, 40, "middle"), "Güzelyalı": (0, 30, "middle"),
            "Kurşunlu": (0, 26, "middle"), "Kumsaz": (0, 26, "middle"), "Kumyaka": (0, 30, "middle")}

DIRS = ["K", "KD", "D", "GD", "G", "GB", "B", "KB"]
compass = lambda d: DIRS[round(d / 45) % 8]  # noqa: E731


# ---------------------------------------------------------------- map
def map_svg(vb: tuple[float, float, float, float], labels: bool = True, mk: float = 1.0, aspect: str = "xMidYMid slice") -> str:
    x0, y0, w, h = vb
    sea = "".join(f'<path d="{t["d"]}" style="fill:var(--sea-{t["tone"]})" fill-rule="evenodd"/>' for t in sorted(MAP["tones"], key=lambda t: -t["tone"]))
    cont = "".join(f'<path d="{c["d"]}" style="fill:none;stroke:var(--contour)" stroke-width="{0.9 if c["depth"] in (10, 50) else 0.6}" vector-effect="non-scaling-stroke"/>' for c in MAP["contours"])
    land = f'<path d="{MAP["land"]}" style="fill:var(--land);stroke:var(--land-line)" stroke-width="1" vector-effect="non-scaling-stroke" fill-rule="evenodd"/>'
    # settlements: centroid of the spots of each place (real names from the spot inventory)
    places: dict[str, list] = {}
    for s in SPOTS.values():
        town = TOWN.get(s.get("place") or "")
        if town:
            places.setdefault(town, []).append(s["xy"])
    plab = ""
    if labels:
        for name, pts in places.items():
            cx = sum(p[0] for p in pts) / len(pts)
            cy = sum(p[1] for p in pts) / len(pts)
            dx, dy, anc = TOWN_OFF.get(name, (0, 26, "middle"))
            plab += f'<text x="{cx + dx * mk:.0f}" y="{cy + dy * mk:.0f}" text-anchor="{anc}" style="fill:var(--land-label);font-size:{12 * mk:.0f}px;font-weight:600;letter-spacing:.06em;text-transform:uppercase">{name}</text>'
    marks = ""
    r = 7 * mk
    for s in sorted(SPOTS.values(), key=lambda s: (s["id"] in [SEL_ID, *ALT_IDS, UNK["id"]], s["score"]["total"] or 0)):
        x, y = s["xy"]
        key = s["id"] in (SEL_ID, *ALT_IDS, UNK["id"])
        rr = r * (1.25 if key else 0.75)
        op = 1 if key else 0.55
        marks += f'<g opacity="{op}"><circle cx="{x}" cy="{y}" r="{rr:.1f}" style="fill:var(--fit-{fit_cls(s["score"]["total"])[1]});stroke:var(--ink-0)" stroke-width="{1.5 * mk:.1f}"/>'
        if key:
            ic = KIND_ICON.get(s["kind"], "iskele")
            marks += f'<use href="#i-{ic}" x="{x - rr * 0.62:.1f}" y="{y - rr * 0.62:.1f}" width="{rr * 1.24:.1f}" height="{rr * 1.24:.1f}" style="color:var(--fit-ink)"/>'
        marks += "</g>"
    sx, sy = SEL["xy"]
    marks += f'<circle cx="{sx}" cy="{sy}" r="{r * 2.1:.1f}" style="fill:none;stroke:var(--sel)" stroke-width="{2 * mk:.1f}"/>'
    def lab(s, txt, dx, dy, anchor="start", strong=False):
        x, y = s["xy"]
        return f'<text x="{x + dx:.0f}" y="{y + dy:.0f}" text-anchor="{anchor}" style="fill:var(--fg-1);font-size:{(13 if strong else 12) * mk:.0f}px;font-weight:{700 if strong else 560};paint-order:stroke;stroke:var(--ink-0);stroke-width:{3 * mk:.0f}px">{txt}</text>'
    marks += lab(SEL, "Tirilye İskelesi", 20 * mk, -14 * mk, strong=True)
    marks += lab(SPOTS[ALT_IDS[0]], "İDO Güzelyalı", 14 * mk, -12 * mk)
    marks += lab(SPOTS[ALT_IDS[1]], "Mudanya İskelesi", -14 * mk, -12 * mk, "end")
    marks += lab(UNK, "Fıstıklı İskelesi", -14 * mk, 4 * mk, "end")
    return f'<svg class="base" viewBox="{x0} {y0} {w} {h}" preserveAspectRatio="{aspect}" role="img" aria-label="Gemlik–Mudanya kıyısı: meralar uygunluk puanı renginde"><rect x="-500" y="-500" width="3000" height="3000" style="fill:var(--sea-open)"/>{sea}{cont}{land}{plab}{marks}</svg>'


# ---------------------------------------------------------------- timeline
def timeline_svg(width: int, compact: bool = False) -> str:
    n = len(ROWS)
    L = 0
    cw = width / n
    y = 0
    out = []
    def row(h):
        nonlocal y
        top = y
        y += h + 4
        return top
    hdr = row(16)
    band = row(10)
    gap = row(10)
    fit_y = row(34)
    WH = 60 if not compact else 50
    wind_y = row(WH)
    rain_y = row(18)
    wave_y = row(18)
    safe_y = row(14)
    H = y
    # hour labels
    for k, r in enumerate(ROWS):
        x = L + k * cw
        if r["loc"].hour % (6 if compact else 3) == 0 and r["loc"].hour != 0 and abs(k - SEL_K) > (2 if compact else 1):
            out.append(f'<text x="{x + 1:.1f}" y="{hdr + 11}" style="fill:var(--fg-3);font-size:11px">{r["loc"]:%H}</text>')
        if r["loc"].hour == 0:
            out.append(f'<line x1="{x:.1f}" x2="{x:.1f}" y1="{hdr}" y2="{H}" style="stroke:var(--line-2)" stroke-width="1"/>')
            out.append(f'<text x="{x + 4:.1f}" y="{hdr + 11}" style="fill:var(--fg-2);font-size:11px;font-weight:600">{["Pzt","Sal","Çar","Per","Cum","Cmt","Paz"][r["loc"].weekday()]} {r["loc"].day}</text>')
    # day / night strip (sun altitude: day > 0°, twilight −6…0°, night < −6°)
    for k, r in enumerate(ROWS):
        c = "var(--day)" if r["sun"] > 0 else "var(--twilight)" if r["sun"] > -6 else "var(--night)"
        out.append(f'<rect x="{L + k * cw:.1f}" y="{band}" width="{cw + 0.5:.1f}" height="10" style="fill:{c}"/>')
    out.append(f'<rect x="{L}" y="{band}" width="{width}" height="10" style="fill:none;stroke:var(--line)" stroke-width="1"/>')
    # suggested window
    wk0 = next(k for k, r in enumerate(ROWS) if r["loc"] == W0)
    wk1 = next((k for k, r in enumerate(ROWS) if r["loc"] == W1), n)
    out.append(f'<rect x="{L + wk0 * cw:.1f}" y="{fit_y - 3}" width="{(wk1 - wk0) * cw:.1f}" height="40" rx="4" style="fill:none;stroke:var(--fg-1)" stroke-width="1.5" stroke-dasharray="4 3"/>')
    out.append(f'<text x="{L + wk1 * cw + 4:.1f}" y="{gap + 9}" style="fill:var(--fg-2);font-size:10.5px">← {"pencere" if compact else "önerilen pencere"} {W0:%H}–{W1:%H}</text>')
    # suitability bars (with the 10–90 % band as a faint cap)
    for k, r in enumerate(ROWS):
        if r["fit"] is None:
            out.append(f'<rect x="{L + k * cw + 1:.1f}" y="{fit_y}" width="{cw - 2:.1f}" height="34" style="fill:url(#nodata)"/>')
            continue
        hh = 34 * r["fit"] / 100
        out.append(f'<rect x="{L + k * cw + 1:.1f}" y="{fit_y + 34 - hh:.1f}" width="{cw - 2:.1f}" height="{hh:.1f}" rx="1.5" style="fill:var(--fit-{fit_cls(r["fit"])[1]})"/>')
    # wind line + gust band + direction arrows (km/h, fixed 0–40 axis)
    ymax = 40
    wy = lambda v: wind_y + 14 + (WH - 14) * (1 - min(v, ymax) / ymax)  # noqa: E731
    top = " ".join(f"{L + (k + .5) * cw:.1f},{wy(r['gust']):.1f}" for k, r in enumerate(ROWS))
    bot = " ".join(f"{L + (k + .5) * cw:.1f},{wy(r['wind']):.1f}" for k, r in reversed(list(enumerate(ROWS))))
    out.append(f'<polygon points="{top} {bot}" style="fill:var(--wind-1)" opacity=".22"/>')
    out.append(f'<polyline points="{" ".join(f"{L + (k + .5) * cw:.1f},{wy(r["wind"]):.1f}" for k, r in enumerate(ROWS))}" style="fill:none;stroke:var(--wind-1)" stroke-width="2"/>')
    for v in (10, 20, 30):
        out.append(f'<line x1="{L}" x2="{width}" y1="{wy(v):.1f}" y2="{wy(v):.1f}" style="stroke:var(--line)" stroke-width="1" stroke-dasharray="2 4"/>')
    out.append(f'<text x="{width - 2}" y="{wy(20) - 3:.1f}" text-anchor="end" style="fill:var(--fg-3);font-size:10px">20</text>')
    for k, r in enumerate(ROWS):
        if k % 2 or r["wd"] is None:
            continue
        cx, cy = L + (k + .5) * cw, wind_y + 6
        a = (r["wd"] + 180) % 360  # arrow: where the wind blows to
        out.append(f'<g transform="translate({cx:.1f},{cy:.1f}) rotate({a:.0f})"><path d="M0,-5 L3,2 L0,0.5 L-3,2 Z" style="fill:var(--fg-2)"/></g>')
    # rain columns (mm/h); none in this snapshot → the row says "yağış yok", not a blank
    rmax = max((r["rain"] or 0) for r in ROWS)
    if rmax < 0.1:
        out.append(f'<text x="{L + 4}" y="{rain_y + 13}" style="fill:var(--fg-3);font-size:11px">yağış yok{"" if compact else " (tahmin, 0 mm/sa)"}</text>')
    else:
        for k, r in enumerate(ROWS):
            hh = 18 * min(r["rain"] or 0, 4) / 4
            out.append(f'<rect x="{L + k * cw + 2:.1f}" y="{rain_y + 18 - hh:.1f}" width="{cw - 4:.1f}" height="{hh:.1f}" style="fill:var(--rain)"/>')
    # wave (m) — model point 7 km away: drawn thin + note
    wmax = max(r["wave"] or 0 for r in ROWS)
    if wmax < 0.05:
        out.append(f'<text x="{L + 4}" y="{wave_y + 13}" style="fill:var(--fg-3);font-size:11px">{"≈ 0 m · model noktası 7,2 km" if compact else "dalga ≈ 0 m · model noktası 7,2 km uzakta (kıyı içi korunaklılık görünmez)"}</text>')
    # safety hours: none in this snapshot
    if not any(r["gate"] for r in ROWS):
        out.append(f'<text x="{L + 4}" y="{safe_y + 11}" style="fill:var(--fg-3);font-size:11px">{"sınır aşılan saat yok" if compact else "güvenlik sınırı aşılan saat yok (hamle &lt; 40 km/sa, dalga &lt; 1 m)"}</text>')
    # selected hour: one line through every row
    sx = L + (SEL_K + .5) * cw
    out.append(f'<line x1="{sx:.1f}" x2="{sx:.1f}" y1="{band - 2}" y2="{H - 2}" style="stroke:var(--sel)" stroke-width="2"/>')
    out.append(f'<rect x="{sx - 20:.1f}" y="{hdr - 1}" width="40" height="15" rx="3" style="fill:var(--sel)"/><text x="{sx:.1f}" y="{hdr + 10.5}" text-anchor="middle" style="fill:var(--ink-0);font-size:11px;font-weight:700">{SR["loc"]:%H}:00</text>')
    defs = '<defs><pattern id="nodata" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="2" height="6" style="fill:var(--fg-3)" opacity=".5"/></pattern></defs>'
    labels = [("", hdr, 16, None), ("Gün / gece", band, 10, "ay"), ("Uygunluk", fit_y, 34, None), ("Rüzgar · hamle", wind_y, WH, "ruzgar"), ("Yağış", rain_y, 18, "yagis"), ("Dalga", wave_y, 18, "dalga"), ("Güvenlik", safe_y, 14, "guvenlik")]
    return f'<svg class="plot" viewBox="0 0 {width} {H}" width="{width}" height="{H}" role="img" aria-label="Seçili mera için 24 saatlik av zaman çizelgesi">{defs}{"".join(out)}</svg>', labels, H


def timeline_block(width: int, compact=False, title=True) -> str:
    svg, labels, H = timeline_svg(width, compact)
    lab = "".join(f'<div class="lab{" main" if h >= 30 else ""}" style="position:absolute;top:{y}px;height:{h}px">{i(ic) if ic else ""}<span>{t}</span></div>' for t, y, h, ic in labels if t)
    head = f'<div class="tl-head"><b>Av zaman çizelgesi · Tirilye İskelesi</b><span class="faint">yerel saat · 1 sütun = 1 saat · rüzgar ekseni 0–40 km/sa</span></div>' if title else ""
    return f'<div class="tl-wrap has-q">{head}<div class="tl2" style="height:{H}px"><div class="labs">{lab}</div><div class="track">{svg}</div></div><div class="q" style="right:8px;top:-6px">Bugün hangi saatlerde koşullar ve uygunluk uyuşuyor; seçili saat neyi gösteriyor?</div></div>'


# ---------------------------------------------------------------- shared content blocks
def header(compact=False) -> str:
    t0, t1 = ROWS[0]["loc"], ROWS[-1]["loc"]
    if compact:
        return f'<header class="top c"><b class="brand">av<span>.</span>livn</b><button class="chip on">İstavrit</button><button class="chip">{SR["loc"]:%H}:00</button></header>'
    return f'''<header class="top"><b class="brand">av<span>.</span>livn</b>
      <div class="sel-row has-q"><button class="chip on">İstavrit</button><button class="chip">Bursa kıyısı · Gemlik–Mudanya</button><button class="chip">Bugün {t0:%H}:00 – yarın {t1:%H}:00</button><button class="chip on">Seçili saat {SR["loc"]:%H}:00</button>
      <div class="q" style="left:0;top:40px">Hangi tür, hangi kıyı ve hangi saat aralığı için bakıyorum?</div></div>
      <nav><a class="on">Plan</a><a>Harita</a><a>Kıyı dosyaları</a><a>Model</a><button class="chip">{i("ay")} Gece</button></nav></header>'''


def decision(compact=False) -> str:
    w = WIN
    lo, hi = round(w["p10"]), round(w["p90"])
    sp = spread_at(SEL["lat"], SEL["lon"], SEL_K)
    sprd = f"modeller {round(sp[0])}–{round(sp[1])} km/sa" if sp else "karşılaştırma yok"
    trust = f'''<div class="trust3 has-q">
      <div><div class="t">Hava tahmini</div><div class="v">Uyumlu</div><div class="d">4 model, {sprd} ({SR["loc"]:%H}:00)</div></div>
      <div><div class="t">Mera bilgisi</div><div class="v">Orta</div><div class="d">lamba ve yapı sahada; derinlik yapı boyundan tahmin</div></div>
      <div><div class="t">Av verimi doğrulaması</div><div class="v lo">Yok</div><div class="d">kayıtlı av n = 0; puan yerel avla doğrulanmadı</div></div>
      <div class="q" style="right:0;top:-34px">Bu öneriye ne kadar güvenebilirim: hava mı, mera bilgisi mi, av kaydı mı eksik?</div></div>'''
    say = '''<div class="say has-q">Denemeye değer görünüyor
      <small>Güven düşük: puan yerel av kaydıyla doğrulanmadı; üç yer benzer, model birini ayıramıyor.</small>
      <div class="q" style="left:0;top:-30px">Bugün gitmeye değer mi, ne kadar emin olabilirim?</div></div>'''
    where = f'''<div class="where has-q"><span class="fit {fit_cls(w["total"])}">{round(w["total"])}</span>
      <div><div class="name">Tirilye İskelesi</div><div class="meta">iskele · erişim açık · {W0:%H}:00–{W1:%H}:00 · uygunluk {lo}–{hi} bandında</div></div>
      <div class="q" style="right:0;top:-28px">Nereye ve hangi saatlerde?</div></div>'''
    cond = f'''<div class="cond has-q">
      <span>{i("ruzgar")} {FMT_NUM(SR["wind"])} km/sa {compass(SR["wd"])} · {wind_rel(SEL, SR["wd"])}</span>
      <span>{i("hamle")} hamle {FMT_NUM(SR["gust"])}</span><span>{i("yagis")} yağış yok</span><span>{i("dalga")} ≈ 0 m</span><span>{i("ay")} {"gece" if SR["sun"] < -6 else "alacakaranlık"}</span>
      <div class="q" style="left:0;top:-30px">O saatte hava ve deniz nasıl, rüzgar kıyıya göre nereden?</div></div>'''
    method = '''<div class="method has-q"><span class="k">Başlangıç önerisi</span>
      <div>LRF 1,5 g jighead + 5 cm silikon, yüzeye yakın · <span class="tag ev-assumed">başlangıç önerisi</span></div>
      <div class="faint">Yöntem havuzu (doğal yem, dropshot) V2'de · <a>Neden? Ayrıntılar</a></div>
      <div class="q" style="right:0;top:-30px">Elimdeki takımla nasıl başlarım?</div></div>'''
    return f'<section class="decision">{say}{where}{cond}{"" if compact else trust}{"" if compact else method}</section>'


def alts_table() -> str:
    rows = [(SEL, WIN["total"], True), (SPOTS[ALT_IDS[0]], PLAN["today"]["all"]["windows"][1]["total"], False), (SPOTS[ALT_IDS[1]], PLAN["today"]["all"]["windows"][2]["total"], False), (UNK, UNK["score"]["total"], False)]
    out = ['<div class="alts has-q"><div class="h"><span>Eşdeğer seçenekler (sıra yok)</span><span>Uygunluk</span><span>Erişim</span><span>Rüzgara göre</span><span>Veri</span></div>']
    for s, tot, sel in rows:
        acc, aic, cls = ACCESS.get(s.get("access"), ACCESS[None])
        wd = grid_at("wd", int(dt.datetime.fromisoformat(SR["ts"].replace("Z", "+00:00")).timestamp() // 3600), s["lat"], s["lon"])
        data = "sahada" if s["id"] == SEL_ID else "çoğu tahmin"
        out.append(f'<div class="r{" sel" if sel else ""}"><span class="nm" title="{s["name"]}">{i(KIND_ICON.get(s["kind"], "iskele"))} {s["name"]}</span><span><span class="fit {fit_cls(tot)}">{round(tot)}</span></span>'
                   f'<span class="c{" w" if cls else ""}">{i(aic)}<span>{acc}</span></span><span class="c">{i("ruzgar")}<span>{wind_rel(s, wd)}</span></span><span class="c"><span class="tag {"ev-measured" if s["id"] == SEL_ID else "ev-assumed"}">{data}</span></span></div>')
    out.append('<div class="q" style="right:0;top:-30px">Birbirine yakın puanlı yerler nasıl farklılaşıyor (erişim, rüzgar, veri)?</div></div>')
    return "".join(out)


def states_strip() -> str:
    return f'''<div class="states has-q"><span class="k">Örnek durumlar — bugünkü veride yok, bileşenin nasıl göründüğü:</span>
      <span class="tag danger">{i("guvenlik")} 03:00–06:00 güvenlik sınırı: hamle 46 km/sa · puan tavanda</span>
      <span class="tag warn">{i("dalga")} dalga verisi yok (model noktası kapsam dışı)</span>
      <span class="tag warn">{i("erisim-bilinmiyor")} erişim bilinmiyor: açık sayılmaz</span>
      <div class="q" style="left:0;top:-30px">Bir şey ters ya da eksikse hemen fark eder miyim?</div></div>'''


def legend_mini(pos: str) -> str:
    return f'''<div class="legend-mini has-q" style="{pos}"><div><b>Uygunluk puanı</b> · {SR["loc"]:%H}:00</div>
      <div class="ramp" style="background:linear-gradient(90deg,var(--fit-0),var(--fit-1),var(--fit-2),var(--fit-3),var(--fit-4))"></div>
      <div class="faint">düşük → yüksek · <a>Lejant ve kaynaklar</a></div>
      <div class="q" style="left:0;top:-30px">Renkler ne anlama geliyor, hangi saat?</div></div>'''


def layer_chips() -> str:
    return f'<div class="layers-row has-q"><span class="chip on">Uygunluk</span><span class="chip">{i("ruzgar")} Rüzgar</span><span class="chip">{i("dalga")} Dalga</span><span class="chip">{i("akinti")} Akıntı</span><span class="chip">{i("yagis")} Yağış</span><span class="chip">{i("derinlik")} Derinlik</span><div class="q" style="left:0;top:38px">Haritada hangi bilgiyi görmek istiyorum?</div></div>'


FOOT = f'<div class="mock-foot">Örnek ekran (Faz V0). Veriler canlı av.livn.tr anlık görüntüsü, {TAKEN.astimezone(TZ):%d.%m.%Y %H:%M} (İstanbul); kıyı OSM, derinlik EMODnet DTM türevi (~115 m, sadeleştirildi). Eğitim çizimi yok. Notları göster/gizle sağ altta.</div>'


REJECTED = '<div class="rejected-band">Reddedildi — 10 Kasım: yön A ("Atlas") seçildi. Bu B ("Kokpit") maketi yalnız karşılaştırma için duruyor.</div>'


def page(name: str, body: str, theme: str, extra_css: str, w: int) -> None:
    html = f'''<!doctype html><html lang="tr" data-theme="{theme}"><head><meta charset="utf-8"><meta name="viewport" content="width={w}">
<title>{name}</title><link rel="stylesheet" href="../../../apps/web/src/styles/tokens-v.css"><link rel="stylesheet" href="mockup.css"><link rel="stylesheet" href="home.css"><style>{extra_css}</style></head>
<body>{REJECTED if name.startswith("home-b") else ""}{SPRITE}{body}<button class="notes-toggle" onclick="document.body.classList.toggle('notes')">Sorular</button></body></html>'''
    (M / f"{name}.html").write_text(html)


# ---------------------------------------------------------------- compositions
VB_A = (40, 70, 1104, 460)       # whole box; the floating panel covers the open sea west of Tirilye
VB_B = (318, 60, 434, 553)       # Tirilye–Mudanya–Fıstıklı: the selected spot and its alternatives


TL_A, TL_B, TL_M = 1440 - 32 - 520 - 24 - 104, 680 - 56 - 24 - 104, 390 - 24 - 74


def a_desktop(theme: str):
    body = f'''<div class="A">{header()}
      <main class="stage"><div class="map">{map_svg(VB_A, mk=1.0)}</div>
        <aside class="float card raised">{decision()}</aside>
        <div class="maptools">{layer_chips()}</div>{legend_mini("right:16px;bottom:16px")}
      </main>
      <section class="dock card">{timeline_block(TL_A)}<div class="dock-r">{alts_table()}{states_strip()}</div></section>{FOOT}</div>'''
    page(f"home-a-desktop{'-light' if theme == 'light' else ''}", body, theme, "", 1440)


def b_desktop(theme: str):
    body = f'''<div class="B">{header()}
      <main class="cols"><section class="left">{decision()}{timeline_block(TL_B, compact=True)}{alts_table()}{states_strip()}</section>
        <section class="right"><div class="map">{map_svg(VB_B, mk=0.62)}</div><div class="maptools">{layer_chips()}</div>{legend_mini("right:16px;bottom:16px")}</section></main>{FOOT}</div>'''
    page(f"home-b-desktop{'-light' if theme == 'light' else ''}", body, theme, "", 1440)


def mobile(kind: str, view: str, theme: str = "dark"):
    # D9: first screen = decision + small condition summary; map and the detailed timeline one tap away
    if view == "first":
        if kind == "a":
            inner = f'''<div class="m-map">{map_svg((400, 340, 300, 115), labels=False, mk=1.1)}<span class="m-map-cap">Haritayı aç</span></div>
              <div class="m-card">{decision(compact=True)}</div>
              <div class="m-tabs"><button class="btn">Saat saat çizelge</button><button class="btn quiet">3 eşdeğer yer</button></div>'''
        else:
            inner = f'''<div class="m-card">{decision(compact=True)}</div>
              <div class="m-mini has-q"><div class="faint">Uygunluk, 24 saat</div><div class="spark">{"".join(f'<i class="{fit_cls(r["fit"])}" style="height:{4 + 24 * r["fit"] / 100:.0f}px"></i>' for r in ROWS)}</div><div class="q" style="left:0;top:-28px">Gün içinde ne zaman iyi?</div></div>
              '''
        if kind == "b":
            inner += f'{FOOT}<nav class="m-seg"><button class="on">Karar</button><button>Harita</button><button>Çizelge</button><button>Seçenekler</button></nav>'
        body = f'<div class="mob {kind}">{header(compact=True)}{inner}{"" if kind == "b" else FOOT}</div>'
    else:
        inner = f'<div class="m-detail"><div class="map" style="height:280px">{map_svg((420, 300, 300, 215), mk=0.8)}</div>{legend_mini("position:static;margin:0 12px")}{timeline_block(TL_M, compact=True, title=False)}</div>'
        if kind == "a":  # A: the detail is a pushed screen with a back chip
            body = f'<div class="mob {kind}">{header(compact=True)}<div class="m-back"><button class="chip">‹ Karar</button><b>Harita ve çizelge</b></div>{inner}{FOOT}</div>'
        else:  # B: the same content under the bottom tabs (Harita + Çizelge)
            body = f'<div class="mob {kind}">{header(compact=True)}{inner}{FOOT}<nav class="m-seg"><button>Karar</button><button class="on">Harita</button><button class="on">Çizelge</button><button>Seçenekler</button></nav></div>'
    page(f"home-{kind}-mobile{'' if view == 'first' else '-detail'}{'-light' if theme == 'light' else ''}", body, theme, "", 390)


if __name__ == "__main__":
    for th in ("dark", "light"):
        a_desktop(th)
        b_desktop(th)
    for k in ("a", "b"):
        mobile(k, "first")
        mobile(k, "detail")
    mobile("a", "first", "light")  # the chosen direction also gets its daylight phone screens
    mobile("a", "detail", "light")
    print("written", sorted(p.name for p in M.glob("home-*.html")))
