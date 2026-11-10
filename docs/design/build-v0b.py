"""Faz V0b mockups in direction A ("Atlas"): kıyı dosyası (with and without photo) and Sahadayım (day / night, 390 px).
Data: docs/design/mockups/data/{snapshot,dossier}.json (build-mockup-data.py, --dossier), the review in
docs/audit/mapillary-review.md and the 8 November field note in docs/REVISION-V.md. Run: python3 docs/design/build-v0b.py"""

from __future__ import annotations

import importlib.util
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("bm", ROOT / "docs/design/build-mockups.py")
bm = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bm)
M, i, SPRITE, TZ = bm.M, bm.i, (bm.M / "icons.svg").read_text(), bm.TZ
DOS = json.loads((M / "data/dossier.json").read_text())
KORDON, TIRILYE = "osm-way-1073087871-1", "osm-way-483965349"
SR = bm.SR
HOUR = int(__import__("datetime").datetime.fromisoformat(SR["ts"].replace("Z", "+00:00")).timestamp() // 3600)
TAKEN = bm.TAKEN.astimezone(TZ)
FOOT = (f'<div class="mock-foot">Örnek ekran (Faz V0b, yön A). Veri: canlı anlık görüntü {TAKEN:%d.%m.%Y %H:%M}; kıyı OSM; derinlik EMODnet DTM 2024 '
        '(~115 m) türevi; Mapillary CC BY-SA 4.0. "Eğitim çizimi" etiketli çizimler gerçek ölçüm değildir.</div>')
TONE = lambda dmin: 1 if dmin < 2 else 2 if dmin < 5 else 3 if dmin < 10 else 4 if dmin < 30 else 5  # noqa: E731
DIRS16 = ["K", "KKD", "KD", "DKD", "D", "DGD", "GD", "GGD", "G", "GGB", "GB", "BGB", "B", "BKB", "KB", "KKB"]


def page(name: str, body: str, theme: str, w: int) -> None:
    html = f'''<!doctype html><html lang="tr" data-theme="{theme}"><head><meta charset="utf-8"><meta name="viewport" content="width={w}">
<title>{name}</title><link rel="stylesheet" href="../../../apps/web/src/styles/tokens-v.css"><link rel="stylesheet" href="mockup.css"><link rel="stylesheet" href="home.css"><link rel="stylesheet" href="v0b.css"></head>
<body>{SPRITE}{body}<button class="notes-toggle" onclick="document.body.classList.toggle('notes')">Sorular</button></body></html>'''
    (M / f"{name}.html").write_text(html)


def q(text: str, pos: str = "right:0;top:-30px") -> str:
    return f'<div class="q" style="{pos}">{text}</div>'


# ------------------------------------------------------------------ dossier pieces
def schematic(d: dict, r: int = 230, photo: dict | None = None, label: str = "şematik görünüm", aspect: float = 1.0) -> str:
    """Plan view in metres around the spot from stored geometry only (land, DTM bands, OSM structure).
    aspect = height / width of the frame, so the label, scale bar and north arrow are never cropped."""
    ry = r * aspect
    bands = "".join(f'<path d="{b["d"]}" style="fill:var(--sea-{TONE(b["dmin"])})" fill-rule="evenodd"/>' for b in sorted(d["bands"], key=lambda b: -b["dmin"]))
    land = f'<path d="{d["land"]}" style="fill:var(--land);stroke:var(--land-line)" stroke-width="1.5" vector-effect="non-scaling-stroke" fill-rule="evenodd"/>'
    st = ""
    if d["structure"]:
        st = f'<path d="{d["structure"]["d"]}" style="fill:none;stroke:var(--fg-1)" stroke-width="5" stroke-linecap="round" vector-effect="non-scaling-stroke"/>'
    cam = ""
    if photo:
        lon, lat = photo["lonlat"]
        mx = 111320 * math.cos(math.radians(d["lat"]))
        x, y = (lon - d["lon"]) * mx, (d["lat"] - lat) * 110540
        a = math.radians(photo["compass_deg"])
        cam = (f'<g class="mk-verified"><circle cx="{x:.0f}" cy="{y:.0f}" r="7" style="fill:var(--act);stroke:var(--ink-0)" stroke-width="2" vector-effect="non-scaling-stroke"/>'
               f'<path d="M{x:.0f},{y:.0f} L{x + 60 * math.sin(a - .35):.0f},{y - 60 * math.cos(a - .35):.0f} M{x:.0f},{y:.0f} L{x + 60 * math.sin(a + .35):.0f},{y - 60 * math.cos(a + .35):.0f}" style="stroke:var(--act)" stroke-width="2" stroke-dasharray="4 3" vector-effect="non-scaling-stroke"/>'
               f'<text x="{x + 12:.0f}" y="{y + 22:.0f}" style="fill:var(--fg-1);font-size:13px;paint-order:stroke;stroke:var(--ink-0);stroke-width:3px">çekim noktası {photo["captured_at"][8:10]}.{photo["captured_at"][5:7]}.{photo["captured_at"][:4]}</text></g>')
    mk = '<circle cx="0" cy="0" r="9" style="fill:var(--fit-3);stroke:var(--sel)" stroke-width="3" vector-effect="non-scaling-stroke"/>'
    scale = f'<g transform="translate({-r + 20},{ry - 24})"><path d="M0,0h100" style="stroke:var(--fg-1)" stroke-width="3" vector-effect="non-scaling-stroke"/><text x="0" y="-8" style="fill:var(--fg-1);font-size:13px">100 m</text></g>'
    north = f'<g transform="translate({r - 30},{-ry + 34})"><path d="M0,-16 L7,6 L0,1 L-7,6 Z" style="fill:var(--fg-1)"/><text x="0" y="22" text-anchor="middle" style="fill:var(--fg-1);font-size:13px;font-weight:700">K</text></g>'
    tag = f'<text x="{-r + 14}" y="{-ry + 26}" style="fill:var(--fg-1);font-size:13px;font-weight:600;paint-order:stroke;stroke:var(--ink-0);stroke-width:3px">{label}</text>'
    return (f'<svg class="schem" viewBox="{-r} {-ry} {2 * r} {2 * ry}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="{label}">'
            f'<rect x="{-r}" y="{-ry}" width="{2 * r}" height="{2 * ry}" style="fill:var(--sea-open)"/>{bands}{land}{st}{cam}{mk}{scale}{north}{tag}</svg>')


def section(d: dict, field: dict | None, w: int = 420) -> str:
    """Shore cross-section along the seaward normal: DTM bands as a dashed range (estimate), optional raw field record."""
    H, top, left, dmax = 170, 18, 34, 8.0
    xw = (w - left - 10) / 400
    yd = lambda m: top + (H - top - 26) * m / dmax  # noqa: E731
    out = [f'<rect x="{left}" y="{top}" width="{w - left - 10}" height="{yd(dmax) - top:.0f}" style="fill:var(--sea-5)" opacity=".35"/>']
    for v in (0, 2, 4, 6, 8):
        out.append(f'<line x1="{left}" x2="{w - 10}" y1="{yd(v):.1f}" y2="{yd(v):.1f}" style="stroke:var(--line)" stroke-dasharray="2 4"/><text x="{left - 6}" y="{yd(v) + 4:.1f}" text-anchor="end" style="fill:var(--fg-3);font-size:11px">{v}</text>')
    for k in (0, 100, 200, 300, 400):
        out.append(f'<text x="{left + k * xw:.0f}" y="{H - 6}" text-anchor="middle" style="fill:var(--fg-3);font-size:11px">{k} m</text>')
    tr = d["transect"]
    for a, b in zip(tr, tr[1:]):
        x0, x1 = left + a["m"] * xw, left + b["m"] * xw
        if a.get("land"):
            out.append(f'<rect x="{x0:.1f}" y="{top - 8}" width="{x1 - x0:.1f}" height="{yd(0) - top + 8:.1f}" style="fill:var(--land)"/>')
        elif a.get("dmin") is not None:
            out.append(f'<rect x="{x0:.1f}" y="{yd(a["dmin"]):.1f}" width="{x1 - x0:.1f}" height="{yd(min(a["dmax"], dmax)) - yd(a["dmin"]):.1f}" class="band-est"/>')
    out.append(f'<line x1="{left}" x2="{w - 10}" y1="{yd(0):.1f}" y2="{yd(0):.1f}" style="stroke:var(--fg-2)" stroke-width="1.5"/>')
    if field:
        fx, fy = left + field["m"] * xw, yd(field["depth"])
        out.append(f'<line x1="{fx:.1f}" x2="{fx:.1f}" y1="{yd(0):.1f}" y2="{fy:.1f}" style="stroke:var(--fg-1)" stroke-width="1.5" stroke-dasharray="1 3"/>'
                   f'<circle cx="{fx:.1f}" cy="{fy:.1f}" r="6" style="fill:var(--fg-1);stroke:var(--ink-0)" stroke-width="2"/>'
                   f'<text x="{fx + 12:.1f}" y="{fy - 4:.1f}" style="fill:var(--fg-1);font-size:12px;font-weight:600">8 Kas saha: ~5 m</text>'
                   f'<text x="{fx + 12:.1f}" y="{fy + 11:.1f}" style="fill:var(--fg-2);font-size:11px">ham gözlem · kurşun; misina açısı belirsiz</text>')
    leg = '<div class="sect-leg"><i></i>DTM tahmini aralığı (EMODnet 2024, ~115 m hücre)' + (' · <b>●</b> saha kaydı' if field else '') + '</div>'
    return leg + f'<svg class="sect" viewBox="0 0 {w} {H}" width="100%" role="img" aria-label="Kıyı kesiti">{"".join(out)}<text x="4" y="{top - 6}" style="fill:var(--fg-3);font-size:11px">m</text></svg>'


def rose(d: dict, wd: float | None, size: int = 200) -> str:
    if not d["rose"]:
        return '<p class="faint">Bu mera için rüzgara açıklık gülü hesaplanmadı (yalnız 16 merada var, <code>docs/audit/fetch_rose.json</code>). Tahminle doldurulmadı.</p>'
    c, R = size / 2, size / 2 - 22
    rad = lambda km: 6 + (R - 6) * max(0, math.log10(max(km, .05) / .05)) / math.log10(2000)  # noqa: E731
    out = []
    for v in (0.1, 1, 10, 100):
        out.append(f'<circle cx="{c}" cy="{c}" r="{rad(v):.1f}" style="fill:none;stroke:var(--line)" stroke-dasharray="2 3"/>')
    for e in d["rose"]:
        a = math.radians(e["dir"])
        rr = rad(e["osm_km"])
        a0, a1 = a - math.radians(10), a + math.radians(10)
        out.append(f'<path d="M{c},{c} L{c + rr * math.sin(a0):.1f},{c - rr * math.cos(a0):.1f} A{rr:.1f},{rr:.1f} 0 0 1 {c + rr * math.sin(a1):.1f},{c - rr * math.cos(a1):.1f} Z" style="fill:var(--sea-1)" opacity=".85"/>')
    for k, lab in ((0, "K"), (90, "D"), (180, "G"), (270, "B")):
        a = math.radians(k)
        out.append(f'<text x="{c + (R + 12) * math.sin(a):.1f}" y="{c - (R + 12) * math.cos(a) + 4:.1f}" text-anchor="middle" style="fill:var(--fg-2);font-size:12px;font-weight:600">{lab}</text>')
    if wd is not None:
        a = math.radians(wd)
        out.append(f'<line x1="{c + R * math.sin(a):.1f}" y1="{c - R * math.cos(a):.1f}" x2="{c + 14 * math.sin(a):.1f}" y2="{c - 14 * math.cos(a):.1f}" style="stroke:var(--sel)" stroke-width="2.5" marker-end="url(#ah)"/>')
    defs = '<defs><marker id="ah" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,0 L10,5 L0,10 z" style="fill:var(--sel)"/></marker></defs>'
    return f'<svg class="rose" viewBox="0 0 {size} {size}" width="{size}" height="{size}" role="img" aria-label="Rüzgara açıklık gülü">{defs}{"".join(out)}</svg>'


def lamp3(state: str, note: str) -> str:
    states = [("dogrulandi", "Doğrulandı", "lamba var ve ışık suya düşüyor (saha/gece)"), ("goruldu", "Görüldü, suya yönü bilinmiyor", "lamba var; ışığın suya düştüğü doğrulanmadı"), ("bilinmiyor", "Bilinmiyor", "kayıt yok; 'lamba yok' demek değildir")]
    chips = "".join(f'<li class="{"on" if k == state else ""}"><b>{t}</b><span>{dsc}</span></li>' for k, t, dsc in states)
    return f'<div class="lamp3 has-q"><div class="k">{i("lamba")} Aydınlatma</div><ul>{chips}</ul><p class="faint">{note}</p>{q("Burada gece ışık var mı, bu ne kadar kesin?")}</div>'


def depth_cov(field: bool) -> str:
    rows = [("EMODnet DTM 2024", "model/enterpolasyon, ~115 m hücre", "ev-model", "var"),
            ("Yapı boyundan tahmin", "kural tabanlı, puanda kullanılan", "ev-assumed", "var"),
            ("ICESat-2 ATL24 (uydu lidar)", "Marmara'da kapsam yok", "ev-remote", "yok"),
            ("Uydu türevli derinlik (SDB)", "doğrulama verisi yok; reddedildi", "ev-remote", "yok"),
            ("Saha kaydı \"Dip: __ m\"", "ham gözlem, yöntem notlu (D4)", "ev-measured", "1 kayıt" if field else "yok")]
    tr = "".join(f'<tr><td>{a}</td><td><span class="tag {c}">{b}</span></td><td>{s}</td></tr>' for a, b, c, s in rows)
    return f'<div class="has-q"><table class="cov"><thead><tr><th>Dip bilgisi kaynağı</th><th>Nitelik</th><th>Bu merada</th></tr></thead><tbody>{tr}</tbody></table>{q("Derinlik bilgisi neye dayanıyor, eksik ne?")}</div>'


def strip_layers() -> str:
    """Tackle layer strip for Tirilye: where each method fished on 8 Nov — a teaching drawing, not a measured profile."""
    return f'''<div class="layers has-q"><div class="k">Takım katmanı · <span class="tag ev-assumed">eğitim çizimi</span></div>
      <svg viewBox="0 0 300 150" width="100%" role="img" aria-label="Su kolonu katmanları">
        <rect x="0" y="10" width="300" height="130" style="fill:var(--sea-4)" opacity=".5"/>
        <path d="M0,10 c15,-4 30,4 45,0 s30,-4 45,0 s30,4 45,0 s30,-4 45,0 s30,4 45,0 s30,-4 45,0 s30,4 30,0" style="fill:none;stroke:var(--fg-2)" stroke-width="1.5"/>
        <path d="M0,140 h300" style="stroke:var(--fg-2)" stroke-width="2"/>
        <text x="6" y="30" style="fill:var(--fg-2);font-size:11px">yüzey</text><text x="6" y="80" style="fill:var(--fg-2);font-size:11px">orta su</text><text x="6" y="134" style="fill:var(--fg-2);font-size:11px">dip ~5 m</text>
        <g transform="translate(110,22)"><circle r="5" style="fill:none;stroke:var(--fg-1)" stroke-width="2"/><path d="M5,0 h14 c4,0 6,3 4,6" style="fill:none;stroke:var(--fg-1)" stroke-width="2"/><text x="30" y="5" style="fill:var(--fg-1);font-size:12px">LRF silikon · 0 vuruş</text></g>
        <g transform="translate(110,0)"><path d="M10,10 v122" style="stroke:var(--fg-1)" stroke-width="1.5"/><path d="M10,102 h10 c0,8 -6,10 -9,6" style="fill:none;stroke:var(--fg-1)" stroke-width="2"/><path d="M10,128 l-4,6 a5,5 0 1 0 8,0 z" style="fill:var(--fg-1)"/><text x="30" y="106" style="fill:var(--fg-1);font-size:12px">dropshot + kesilmiş hamsi</text><text x="30" y="120" style="fill:var(--fg-2);font-size:11px">her atışta vuruş · ~6 kg istavrit + izmarit</text></g>
      </svg>
      <p class="faint">8 Kasım saha gözlemi, kontrollü karşılaştırma değil: yöntem sırası (önce silikon, sonra yem), süre ve sürü hareketi bilinmiyor. Çizim ölçekli değil.</p>
      {q("Bu merada hangi su katmanında ne denendi, ne oldu?")}</div>'''


def placeholder(kind: str, name: str, path: str) -> str:
    return f'<figure class="ph has-q"><div class="ph-box"><span>çizim — görsel bekleniyor</span><code>{path}</code></div><figcaption>{name} · <span class="tag">çizim</span></figcaption>{q("Bu tür / takım neye benziyor?")}</figure>'


def wind_now(d: dict):
    wd = bm.grid_at("wd", HOUR, d["lat"], d["lon"])
    return wd, bm.wind_rel({"shore_normal_deg": d["shore_normal_deg"]}, wd)


def open_sectors(d: dict) -> str:
    """Directions with > 5 km of open water (OSM fetch), merged into compass ranges, e.g. 'KB–D açık'."""
    ks = [k for k, e in enumerate(d["rose"]) if e["osm_km"] > 5]
    if not ks:
        return "her yönden korunaklı"
    runs, cur = [], [ks[0]]
    for k in ks[1:]:
        if k == cur[-1] + 1:
            cur.append(k)
        else:
            runs.append(cur)
            cur = [k]
    runs.append(cur)
    if len(runs) > 1 and runs[0][0] == 0 and runs[-1][-1] == 15:  # wrap around north
        runs[0] = runs[-1] + runs[0]
        runs.pop()
    return ", ".join(DIRS16[r[0]] if len(r) == 1 else f"{DIRS16[r[0]]}–{DIRS16[r[-1]]}" for r in runs) + " açık"


# What is known per spot; every value comes from stored data (dossier.json, snapshot, the 8 Nov field note in REVISION-V).
SPOT_FACTS = {
    TIRILYE: {"access": ("Açık", "kayıt: açık erişim"), "lamp": ("goruldu", "Lamba var", "saha kaydı; ışığın suya düştüğü doğrulanmadı"),
              "depth": ("~5 m", "saha ölçümü 8 Kas · DTM 0–2 m diyor"), "photo": None},
    KORDON: {"access": ("Açık", "kayıt: açık erişim"), "lamp": ("bilinmiyor", "Bilinmiyor", "saha kaydı yok"),
             "depth": ("0–2 m", "DTM tahmini · saha kaydı yok"), "photo": "street"},
}
LAMP_ICON = {"dogrulandi": "lamba", "goruldu": "lamba", "bilinmiyor": "erisim-bilinmiyor"}


def verdict_line(sid: str, fit) -> str:
    f = SPOT_FACTS[sid]
    lvl = "iyi" if fit is not None and fit >= 75 else "orta" if fit is not None and fit >= 60 else "zayıf"
    unknown = [n for n, bad in (("derinlik", "saha kaydı yok" in f["depth"][1]), ("lamba", f["lamp"][0] == "bilinmiyor")) if bad]
    tail = f"; {' ve '.join(unknown)} bilinmiyor" if unknown else "; av kaydıyla doğrulanmadı"
    return f'{SR["loc"]:%H}:00 için uygunluk {lvl}{tail}.'


def fact(icon: str, k: str, v: str, sub: str) -> str:
    return f'<div class="fact">{i(icon, "i l")}<div><div class="fk">{k}</div><div class="fv">{v}</div><div class="fs">{sub}</div></div></div>'


def summary(sid: str, mobile: bool) -> str:
    d, f = DOS[sid], SPOT_FACTS[sid]
    wd, rel = wind_now(d)
    facts = "".join([
        fact("erisim-acik", "Erişim", *f["access"]),
        fact(LAMP_ICON[f["lamp"][0]], "Lamba", f["lamp"][1], f["lamp"][2]),
        fact("derinlik", "Derinlik", *f["depth"]),
        fact("ruzgar", "Rüzgara açıklık", open_sectors(d), f'{SR["loc"]:%H}:00 rüzgar {bm.compass(wd)} · kıyıya göre {rel}'),
    ])
    view = schematic(d, 150 if mobile else 170, None, "şematik görünüm", aspect=10 / 16)
    link = ""
    if f["photo"] == "street":
        im = d["mapillary"]["images"][0]
        date = f'{im["captured_at"][8:10]}.{im["captured_at"][5:7]}.{im["captured_at"][:4]}'
        link = f'<a class="street" href="{im["url"]}">Yakındaki sokak görüntüsü (merayı göstermiyor) · {date} · Mapillary</a>'
    note = ("Fotoğraf yok: merayı gösteren görüntü bulunamadı. Çizim gerçek OSM geometrisinden." if f["photo"]
            else "Fotoğraf yok: 200 m içinde görüntü bulunamadı. Çizim gerçek OSM geometrisinden.")
    field = {"m": 0, "depth": 5} if sid == TIRILYE else None
    return (f'<section class="sum has-q"><p class="verdict-1">{verdict_line(sid, d["hour_fit"]["fit"])}</p>'
            f'{q("Bu merayı tek bakışta nasıl tanırım?", "right:0;top:-30px")}<div class="facts">{facts}</div></section>'
            f'<section class="view has-q"><div class="schem-frame">{view}</div><p class="vnote">{note}</p>{link}'
            f'{q("Yer nasıl görünüyor? (yalnız gerçek geometri)", "right:0;top:-30px")}</section>'
            f'<section class="mini has-q"><div class="mini-rose">{rose(d, wd, 150)}<span>Rüzgara açıklık · ok: {SR["loc"]:%H}:00 rüzgarı</span></div>'
            f'<div class="mini-sect">{section(d, field, 300)}<span>Kıyı kesiti · ayrıntı Kaynaklar sekmesinde</span></div>'
            f'{q("Hangi rüzgarlara açık, ne kadar derin?", "right:0;top:-30px")}</section>')


def sources(sid: str) -> str:
    d, f = DOS[sid], SPOT_FACTS[sid]
    chain = ""
    if f["photo"] == "street":
        im = d["mapillary"]["images"][0]
        date = f'{im["captured_at"][8:10]}.{im["captured_at"][5:7]}.{im["captured_at"][:4]}'
        chain = ('<section class="chain"><h2>Fotoğraf kanıt zinciri</h2><dl>'
                 '<dt>Merayı gösteriyor mu?</dt><dd><b class="warn-t">Hayır</b>: görüntüler meradan 130–138 m uzakta, iç sokaktan; mera ve su kareye girmiyor. Bu yüzden vitrinde değil.</dd>'
                 f'<dt>Tarih · lisans</dt><dd>{date} · {d["mapillary"]["license"]}</dd>'
                 '<dt>Direk/armatür · ışığın yönü · gece</dt><dd>bilinmiyor · bilinmiyor · doğrulanmadı</dd></dl></section>')
    conflict = ('<p><b>Derinlik çelişkisi:</b> DTM bu noktada 0–2 m diyor; 8 Kasım saha ölçümü ~5 m (kurşun; misina açısı belirsiz). '
                'İki kaynak ayrı çizilir, ortalaması alınmaz; saha kaydına belirsizlik atanır (D4).</p>') if sid == TIRILYE else ""
    field = {"m": 0, "depth": 5} if sid == TIRILYE else None
    struct = "OSM way/483965349 (man_made=pier)" if sid == TIRILYE else "OSM kıyı çizgisi"
    return (f'{chain}<section><h2>Aydınlatma</h2>{lamp3(f["lamp"][0], f["lamp"][2])}</section>'
            f'<section><h2>Kıyı kesiti</h2>{section(d, field)}{conflict}</section>'
            f'<section><h2>Dip bilgisi kaynakları</h2>{depth_cov(sid == TIRILYE)}</section>'
            f'<section><h2>Kaynaklar</h2><ul class="srcs"><li>Kıyı: OSM kara poligonu; yapı: {struct}</li>'
            '<li>Derinlik: EMODnet DTM 2024 türevi (~115 m hücre)</li>'
            '<li>Rüzgara açıklık: OSM kara poligonuna 16 yönde uzaklık (<code>fetch_km</code>, 119/119 mera)</li>'
            '<li>Rüzgar: Open-Meteo (CC BY 4.0) + DWD</li><li>Fotoğraf: Mapillary, CC BY-SA 4.0</li></ul></section>')


def dossier_header(sid: str, tab: str) -> str:
    d = DOS[sid]
    kind_tr = {"pier": "İskele", "promenade": "Kordon"}.get(d["kind"], d["kind"])
    ic = {"pier": "iskele", "promenade": "kordon"}.get(d["kind"], "iskele")
    hf = d["hour_fit"]["fit"]
    fitb = f'<div class="fitnow"><span class="fit {bm.fit_cls(hf)}">{round(hf)}</span><span>uygunluk<br>{SR["loc"]:%H}:00</span></div>'
    tabs = "".join(f'<a class="{"on" if t == tab else ""}">{t}</a>' for t in ("Özet", "Saatler", "Takım", "Kaynaklar"))
    return (f'<header class="dh has-q"><div class="dh-t">{i(ic, "i l")}<div><h1>{d["name"]}</h1>'
            f'<div class="meta">{kind_tr} · {d["length_m"] or "?"} m</div></div>{fitb}</div>'
            f'<nav class="dtabs">{tabs}</nav>{q("Bu mera ne, seçili saatte ne kadar uygun?")}</header>')


def dossier_page(name: str, sid: str, mobile: bool, tab: str = "Özet", theme: str = "dark") -> None:
    body_in = dossier_header(sid, tab) + (summary(sid, mobile) if tab == "Özet" else sources(sid))
    src = DOS[sid]["hour_fit"]["source"]
    hsrc = "anlık görüntü" if src == "snapshot" else "ayrı canlı okuma, " + src[5:] + " UTC"
    foot = FOOT.replace("</div>", f' Uygunluk {SR["loc"]:%H}:00: {hsrc}.</div>')
    if mobile:
        body = (f'<div class="mob dossier">{bm.header(compact=True)}<div class="m-back"><button class="chip">‹ Plan</button>'
                f'<b>Kıyı dosyası</b></div><div class="dwrap">{body_in}</div>{foot}</div>')
    else:
        xy = bm.SPOTS[sid]["xy"]
        W = 300  # map units across 1440 px; the spot sits mid-way in the 60 % left of the drawer
        Hh = W * 920 / 1440
        mp = bm.map_svg((xy[0] - 0.30 * W, xy[1] - Hh / 2, W, Hh), mk=0.45, sel_id=sid, sel_name=DOS[sid]["name"].split(" (")[0])
        body = (f'<div class="A">{bm.header()}<main class="stage dstage"><div class="map">{mp}</div>'
                f'<aside class="drawer card raised">{body_in}</aside></main>{foot}</div>')
    page(name, body, theme, 390 if mobile else 1440)



# ------------------------------------------------------------------ Sahadayım
def rig_drawing() -> str:
    """Dropshot + cut anchovy: the real tie-up order (hook above the weight on the same line). Teaching drawing, compact."""
    return ('<svg class="rig" viewBox="0 0 300 150" role="img" aria-label="Dropshot ve hamsi bağlantı düzeni (eğitim çizimi)">'
            '<path d="M150,4 V118" style="stroke:var(--s-fg)" stroke-width="2"/>'
            '<path d="M150,44 h9 c4,0 6,3 6,7 v8 a7,7 0 0 1 -14,0 v-3 l3,3" style="fill:none;stroke:var(--s-fg)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>'
            '<path d="M155,64 c7,-3 19,-3 27,1 c-8,5 -19,5 -27,-1 z M182,65 l6,-4 v8 z" style="fill:var(--s-fg2);stroke:var(--s-fg)" stroke-width="1.2"/>'
            '<text x="196" y="52" style="fill:var(--s-fg);font-size:15px;font-weight:600">iğne + hamsi</text>'
            '<path d="M118,46 v66" style="stroke:var(--s-fg2)" stroke-width="1.5"/><path d="M113,51 l5,-5 l5,5 M113,107 l5,5 l5,-5" style="fill:none;stroke:var(--s-fg2)" stroke-width="1.5"/>'
            '<text x="110" y="84" text-anchor="end" style="fill:var(--s-fg2);font-size:15px">30–50 cm</text>'
            '<path d="M150,116 l-8,12 a10,10 0 1 0 16,0 z" style="fill:var(--s-fg)"/>'
            '<text x="168" y="134" style="fill:var(--s-fg);font-size:15px;font-weight:600">kurşun</text>'
            '<path d="M40,146 h220" style="stroke:var(--s-fg2)" stroke-width="2.5"/></svg>')


def sahadayim(theme: str) -> None:
    """Field screen, separate from the plan: clock and conditions on top, a small rig picture, and the four log buttons
    fixed in the thumb zone at the bottom (V0b C6). Night = the app's existing red mode (body.red), with AA-checked reds."""
    d = DOS[TIRILYE]
    wd = bm.grid_at("wd", HOUR, d["lat"], d["lon"])
    night = theme == "dark"
    body = f'''<div class="saha {'red' if night else 'day'}">
      <header class="s-top"><div><div class="s-clock num">{SR["loc"]:%H}:42</div><div class="s-spot">Tirilye İskelesi · 0:42 · takım {SR["loc"]:%H}:20</div></div>
        <div class="s-tools"><button class="s-tool" title="Kırmızı gece modu" aria-pressed="{'true' if night else 'false'}">●</button><button class="s-tool">Çık</button></div></header>
      <section class="s-cond has-q">
        <div><svg class="s-arrow" viewBox="0 0 24 24" style="transform:rotate({(wd + 180) % 360:.0f}deg)"><path d="M12 3l5 14l-5 -3l-5 3z" style="fill:currentColor"/></svg><b class="num">{bm.FMT_NUM(SR["wind"])}</b><span>km/sa {bm.compass(wd)} · {bm.wind_rel(bm.SPOTS[TIRILYE], wd)}</span></div>
        <div>{i("hamle", "i l")}<b class="num">{bm.FMT_NUM(SR["gust"])}</b><span>hamle</span></div>
        <div>{i("yagis", "i l")}<b>yok</b><span>yağış</span></div>
        {q("Şu an rüzgar nereden, ne kadar; yağmur var mı?", "left:0;top:-34px")}</section>
      <section class="s-rig has-q"><div class="s-k">Dropshot + hamsi parçası <span class="tag ev-assumed">eğitim çizimi</span></div>{rig_drawing()}{q("Takımımı doğru bağladım mı?", "right:0;top:-30px")}</section>
      <div class="s-limit has-q"><b>Günlük miktar uyarısı (≥ 4 kg)</b>: yer tutucu, <i>mevzuat doğrulanacak (V2)</i>.{q("Yasal sınıra yaklaşıyor muyum? (önce mevzuat)", "left:0;top:-30px")}</div>
      <details class="s-tip"><summary>Kısa bilgi</summary><p>15 dk vuruş yoksa dropshot + hamsi parçasına geç.</p></details>
      <nav class="s-btns has-q"><button class="s-b">Vuruş aldım</button><button class="s-b">Balık aldım</button><button class="s-b">Sonuç yok</button><button class="s-b alt">Dip: __ m</button>{q("Ne olduğunu tek dokunuşla nasıl kaydederim?", "left:0;top:-34px")}</nav>
      </div>'''
    page(f"sahadayim-{'gece' if night else 'gunduz'}", body, theme, 390)



if __name__ == "__main__":
    dossier_page("dossier-kordon-desktop", KORDON, False)
    dossier_page("dossier-kordon-mobile", KORDON, True)
    dossier_page("dossier-tirilye-desktop", TIRILYE, False)
    dossier_page("dossier-tirilye-mobile", TIRILYE, True)
    dossier_page("dossier-tirilye-kaynaklar", TIRILYE, False, "Kaynaklar")
    dossier_page("dossier-kordon-kaynaklar", KORDON, True, "Kaynaklar")
    sahadayim("light")
    sahadayim("dark")
    print("written", sorted(p.name for p in M.glob("dossier-*.html")) + sorted(p.name for p in M.glob("sahadayim-*.html")))
