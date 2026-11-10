"""Faz V0b icon set: Tabler Icons (MIT, @tabler/icons 3.51.0) as the base, plus custom glyphs drawn to Tabler's rules
(24 grid, 2 px stroke, round caps/joins, ~2 px padding) where the library has no equivalent.

  python3 docs/design/build-icons.py <path to extracted @tabler/icons package>

Copies only the used Tabler SVGs into apps/web/src/icons/, writes the custom ones, icons.json (label, group, source),
the mockup sprite docs/design/mockups/icons.svg and the sample page docs/design/mockups/icons.html.
The package is not a dependency; its licence is kept at apps/web/src/icons/LICENSE-tabler.txt."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "apps/web/src/icons"
M = ROOT / "docs/design/mockups"
TABLER_VER = "3.51.0"

# name: (Turkish label, group, source) — source "tabler:<name>" or "custom"
SET = {
    "ruzgar": ("Rüzgar", "hava", "tabler:wind"),
    "hamle": ("Hamle (ani rüzgar)", "hava", "tabler:windsock"),
    "dalga": ("Dalga", "hava", "tabler:ripple"),
    "akinti": ("Akıntı", "hava", "tabler:arrow-wave-right-up"),
    "yagis": ("Yağış", "hava", "tabler:cloud-rain"),
    "bulut": ("Bulut", "hava", "tabler:cloud"),
    "sicaklik": ("Su sıcaklığı", "hava", "tabler:temperature"),
    "ay": ("Ay / gece", "hava", "tabler:moon"),
    "lamba": ("Aydınlatma (sokak lambası)", "yer", "custom"),
    "derinlik": ("Derinlik", "yer", "custom"),
    "guvenlik": ("Güvenlik uyarısı", "yer", "tabler:alert-triangle"),
    "erisim-acik": ("Erişim açık", "yer", "tabler:lock-open"),
    "erisim-kisitli": ("Erişim kısıtlı", "yer", "tabler:lock"),
    "erisim-bilinmiyor": ("Erişim bilinmiyor", "yer", "tabler:help-circle"),
    "iskele": ("İskele", "yapı", "custom"),
    "mendirek": ("Mendirek (dalgakıran)", "yapı", "custom"),
    "kordon": ("Kordon / taş tahkimat", "yapı", "custom"),
    "kaya": ("Kayalık kıyı", "yapı", "custom"),
    "kumsal": ("Kumsal", "yapı", "tabler:beach"),
    "dere-agzi": ("Dere ağzı", "yapı", "custom"),
    "liman": ("Liman", "yapı", "tabler:anchor"),
    "marina": ("Marina", "yapı", "tabler:sailboat"),
    "lrf": ("LRF: jighead + silikon", "yöntem", "custom"),
    "mikro-jig": ("Mikro jig", "yöntem", "custom"),
    "dropshot": ("Dropshot + yem", "yöntem", "custom"),
    "dip-takimi": ("Dip takımı", "yöntem", "custom"),
    "samandira": ("Şamandıralı takım", "yöntem", "custom"),
    "capari": ("Çapari", "yöntem", "custom"),
    "kanit-olcum": ("Kanıt: ölçüm", "kanıt", "tabler:ruler-2"),
    "kanit-model": ("Kanıt: model / tahmin", "kanıt", "tabler:chart-line"),
    "kanit-uzaktan": ("Kanıt: uzaktan gözlem (uydu)", "kanıt", "tabler:satellite"),
    "kanit-varsayim": ("Kanıt: varsayım", "kanıt", "tabler:pencil-question"),
}

WAVE = "M3 20c1.5 0 1.5 -1 3 -1s1.5 1 3 1s1.5 -1 3 -1s1.5 1 3 1s1.5 -1 3 -1s1.5 1 3 1"  # Tabler-style water line

# Custom glyphs: same grid, stroke, caps and padding as Tabler (content kept inside 2..22).
CUSTOM = {
    # depth: water surface, arrow down to the seabed (r2: Tabler arrow-bar-to-down read as "download")
    "derinlik": ["M3 5c1.5 0 1.5 -1 3 -1s1.5 1 3 1s1.5 -1 3 -1s1.5 1 3 1s1.5 -1 3 -1s1.5 1 3 1", "M12 8v10", "M9 15l3 3l3 -3", "M5 21h14"],
    # pier: a deck on piles standing in the water, walked out from the shore on the left
    "iskele": ["M3 9h18", "M6 9v8", "M12 9v8", "M18 9v8", "M3 6v3", WAVE],
    # breakwater: rubble mound of large blocks in the sea, waves breaking on the seaward side
    "mendirek": ["M8 17l2 -6h7l3 6", "M12.5 11v6", "M10 14h8", "M3 9c1.2 0 1.8 -1.5 3 -1.5", "M3 13c1.2 0 1.8 -1.5 3 -1.5", WAVE],
    # promenade / seawall: front view of a coursed stone quay wall with the sea at its foot (r3: side view read as pier/ladder)
    "kordon": ["M3 5h18", "M3 5v12", "M21 5v12", "M3 9h18", "M3 13h18", "M3 17h18", "M9 5v4", "M15 5v4", "M6 9v4", "M12 9v4", "M18 9v4", "M9 13v4", "M15 13v4", WAVE],
    # rocky shore: boulders sitting in the water
    "kaya": ["M4 17l2.5 -5l3.5 -2l3 3l3 -1.5l4 5.5", "M10 10l-1 4", "M13 13l2 4", WAVE],
    # river mouth: a winding river band (two banks) widening into the sea at the bottom right (r4: back to the v0 idea that was
    # recognised at 24 px, redrawn on the Tabler grid; r2 diverging banks read as a road, r3 vertical banks as pier legs)
    "dere-agzi": ["M4 3c2 4 -2 6 0 10s5 4 6.5 8", "M9 3c2 4 -1 6 1 9s4.5 3.5 7 5", "M14 21c1.2 0 1.8 -1 3 -1s1.8 1 3 1", "M18 17.5c1 0 1.5 -.8 2.5 -.8"],
    # street lamp: pole, arm, shade and light falling down
    "lamba": ["M7 21v-15a2 2 0 0 1 2 -2h5", "M5 21h4", "M14 4h4l-1 3h-2z", "M16 10v1.5", "M13 9.5l-.8 1.2", "M19 9.5l.8 1.2"],
    # LRF jighead: a hook whose shank carries a large round lead head (r3: bigger head)
    "lrf": ["M12 7.5a4 4 0 1 0 8 0a4 4 0 1 0 -8 0", "M16 3.5v-1.5", "M16 11.5v3.5a5 5 0 0 1 -10 0v-4l3 3"],
    # micro jig: slim metal body, assist hook on the top eye
    "mikro-jig": ["M5.5 18.5a2.1 2.1 0 0 1 0 -3l8 -8a2.1 2.1 0 0 1 3 3l-8 8a2.1 2.1 0 0 1 -3 0z", "M16.5 7.5l2 -2", "M18.5 5.5v3a1.5 1.5 0 0 0 3 0", "M9 15l3 -3"],
    # drop shot: a clear J hook tied off the line, a teardrop weight below it on the seabed (r3: hook read as a flag)
    "dropshot": ["M6 2v13", "M6 5h8v4a3 3 0 0 1 -6 0", "M6 14l-2 3a2.4 2.4 0 1 0 4 0z", "M3 21h18"],
    # bottom rig: line down to a pyramid sinker on the seabed, a J hook standing on the bottom beside it
    "dip-takimi": ["M4 3l7.5 13.5", "M9 21l2.5 -4.5l2.5 4.5z", "M15 21v-4a3 3 0 0 1 6 0v1", "M3 21h18"],
    # float rig: bobber on the surface, line below (r3: larger body)
    "samandira": ["M12 2v3", "M12 5c-2.5 0 -4 2.5 -4 5s1.5 5 4 5s4 -2.5 4 -5s-1.5 -5 -4 -5z", "M8 10h8", "M12 15v4", "M12 19a1.5 1.5 0 0 0 3 0", "M3 10h3", "M18 10h3"],
    # sabiki: one line carrying a stack of identical hooks (r3: repetition reads as 'many hooks')
    "capari": ["M7 2v20", "M7 3h4v2.5a2 2 0 0 0 4 0v-.5", "M7 10h4v2.5a2 2 0 0 0 4 0v-.5", "M7 17h4v2.5a2 2 0 0 0 4 0v-.5"],
}

ATTR = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'


def svg_file(body: str) -> str:
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" {ATTR}>{body}</svg>\n'


def tabler_body(pkg: Path, name: str) -> str:
    f = pkg / "icons/outline" / f"{name}.svg"
    if not f.exists():
        raise SystemExit(f"tabler icon missing: {name}")
    s = f.read_text()
    s = re.sub(r'<path stroke="none" d="M0 0h24v24H0z" fill="none" */>', "", s)
    inner = re.search(r"<svg[^>]*>(.*)</svg>", s, re.S).group(1)
    return re.sub(r"\s+", " ", inner).strip()


def main() -> None:
    pkg = Path(sys.argv[1])
    lic = (pkg / "LICENSE").read_text()
    assert lic.startswith("MIT License"), "unexpected Tabler licence"
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "LICENSE-tabler.txt").write_text(f"Tabler Icons {TABLER_VER} — https://tabler.io/icons\n\n{lic}")
    bodies, meta = {}, {}
    for name, (label, group, src) in SET.items():
        if src == "custom":
            body = "".join(f'<path d="{d}"/>' for d in CUSTOM[name])
        else:
            body = tabler_body(pkg, src.split(":", 1)[1])
            src = f"{src}@{TABLER_VER}"
        bodies[name] = body
        meta[name] = {"label": label, "group": group, "source": src}
        (OUT / f"{name}.svg").write_text(svg_file(body))
    (OUT / "icons.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1) + "\n")
    sprite = '<svg xmlns="http://www.w3.org/2000/svg" style="display:none">' + "".join(
        f'<symbol id="i-{n}" viewBox="0 0 24 24"><title>{meta[n]["label"]}</title><g {ATTR}>{b}</g></symbol>' for n, b in bodies.items()) + "</svg>"
    (M / "icons.svg").write_text(sprite)
    groups: dict[str, list] = {}
    for n, m in meta.items():
        groups.setdefault(m["group"], []).append(n)
    cards = ""
    for g, names in groups.items():
        cards += f'<h2>{g.capitalize()}</h2><div class="row">'
        for n in names:
            src = meta[n]["source"]
            tag = "Tabler" if src.startswith("tabler") else "özel çizim"
            u = f'<use href="#i-{n}"/>'
            cards += (f'<figure><div class="big"><svg class="i" style="width:40px;height:40px">{u}</svg></div>'
                      f'<div class="sizes"><svg style="width:16px;height:16px">{u}</svg><svg style="width:20px;height:20px">{u}</svg><svg style="width:24px;height:24px">{u}</svg></div>'
                      f'<figcaption><b>{meta[n]["label"]}</b><span class="faint">{n} · {tag}</span></figcaption></figure>')
        cards += "</div>"
    html = f'''<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Simge seti — Faz V</title><link rel="stylesheet" href="../../../apps/web/src/styles/tokens-v.css"><link rel="stylesheet" href="mockup.css">
<style>.sizes{{display:flex;gap:12px;align-items:end}} figcaption{{display:grid;gap:2px;font-size:var(--fs-2)}} figcaption .faint{{font-size:var(--fs-1)}}</style></head>
<body class="icons-page">{sprite}<header class="doc"><h1>Simge seti (V0b)</h1>
<p>Temel: Tabler Icons {TABLER_VER} (MIT). Kütüphanede karşılığı olmayan yapı tipleri ve yöntemler aynı kurallarla özel çizildi: 24 ızgara, 2 px çizgi, yuvarlak uç ve köşe. Hepsi SVG + <code>currentColor</code>. Boyutlar: 40, 16, 20, 24 px. Etiketsiz tanıma testi: <code>docs/design/icon-test/results.md</code>.</p>
<p class="faint">Önceki set reddedildi; karşılaştırma için: <a href="icons-v0-rejected/icons.html">icons-v0-rejected/icons.html</a></p></header>
<main class="sheet">{cards}</main></body></html>'''
    (M / "icons.html").write_text(html)
    print(f"{len(meta)} icons: {sum(1 for m in meta.values() if m['source'].startswith('tabler'))} Tabler, {sum(1 for m in meta.values() if m['source'] == 'custom')} custom")


if __name__ == "__main__":
    main()
