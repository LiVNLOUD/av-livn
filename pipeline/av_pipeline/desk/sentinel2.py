"""c) Shallow-water bottom brightness from Sentinel-2 L2A (Microsoft Planetary Computer STAC, anonymous SAS;
Copernicus Sentinel data, free and open). Runs in Actions.

Per spot: water pixels (SCL = 6) 0–NEAR_M from the tip; brightness (B02 + B03) / 2 divided by the median of water
pixels REF_M offshore in the same scene; per-pixel median over the clear scenes of the last 3 years.
  r ≥ BRIGHT → açık (kum)      r ≤ DARK → koyu (kaya / yosun / midye: darker than open water)      else belirsiz
  (r ≈ 1 means the tip looks like open water — turbid or deep, no bottom signal — so it stays belirsiz.)
Limits (docs/DESK-DATA.md): 10 m pixels mix pier, shadow and water; turbidity brightens water; bottom signal
fades beyond ~5 m depth (dark ≠ rock); glint and wakes. Confidence: düşük, at most orta.
"""

from __future__ import annotations

import datetime as dt
import math
from statistics import median

from av_pipeline.desk.findings import Finding

NEAR_M = 150.0
REF_M = (800.0, 1500.0)
BRIGHT = 1.5
DARK = 0.85  # ratio ≈ 1 = same as offshore water: no bottom signal, not "dark bottom"
MAX_SCENES = 12


def classify(r: float) -> str:
    return "acik" if r >= BRIGHT else "koyu" if r <= DARK else "belirsiz"


def summarise(spot_id: str, ratios: list[float], scenes: int, date: str) -> Finding | None:
    """Majority class of the near-tip pixels → desk finding (or None when nothing usable)."""
    if not ratios:
        return None
    classes = [classify(r) for r in ratios]
    counts = {c: classes.count(c) for c in ("acik", "koyu", "belirsiz")}
    major = max(counts, key=counts.get)
    share = counts[major] / len(classes)
    if major == "belirsiz" or share < 0.5:
        return None
    conf = "orta" if major == "acik" and scenes >= 6 and share >= 0.6 else "düşük"
    label = {"acik": "açık dip (kum)", "koyu": "koyu dip (kaya, yosun, midye — ya da derin su)"}[major]
    return Finding(
        spot_id=spot_id, source="sentinel2", observed_at=date, substrate=["kum"] if major == "acik" else ["yosunlu"],
        note=f"Sentinel-2: {label}, uç çevresi {len(ratios)} su pikselinin %{round(share * 100)}'i, {scenes} sahne, medyan oran {round(median(ratios), 2)}",
        evidence={"source": "Copernicus Sentinel-2 L2A (Microsoft Planetary Computer)", "date": date, "confidence": conf, "license": "Copernicus açık veri",
                  "method": f"(B02+B03)/2, {REF_M[0]:.0f}–{REF_M[1]:.0f} m açık su medyanına oran, uç 0–{NEAR_M:.0f} m su pikselleri, sahneler arası medyan; ≥{BRIGHT} açık, ≤{DARK} koyu",
                  "pixels": len(ratios), "scenes": scenes, "share": round(share, 2), "median_ratio": round(median(ratios), 3)},
    )


def run(spots: list[dict], today: dt.date) -> tuple[list[Finding], dict]:  # pragma: no cover - network/raster I/O, Actions only
    import numpy as np
    import planetary_computer
    import pystac_client
    import rasterio
    from rasterio.warp import transform
    from rasterio.windows import from_bounds

    lats = [s["lat"] for s in spots]
    lons = [s["lon"] for s in spots]
    cat = pystac_client.Client.open("https://planetarycomputer.microsoft.com/api/stac/v1", modifier=planetary_computer.sign_inplace)
    items = list(cat.search(collections=["sentinel-2-l2a"], bbox=[min(lons) - 0.02, min(lats) - 0.02, max(lons) + 0.02, max(lats) + 0.02],
                            datetime=f"{today - dt.timedelta(days=3 * 365)}/{today}", query={"eo:cloud_cover": {"lt": 10}}).items())
    items.sort(key=lambda i: i.properties.get("eo:cloud_cover", 100))
    per_spot: dict[str, dict[tuple[int, int], list[float]]] = {s["id"]: {} for s in spots}
    used: dict[str, int] = {s["id"]: 0 for s in spots}
    pixels_geo: list[dict] = []
    for it in items[: MAX_SCENES * 3]:
        with rasterio.open(it.assets["B02"].href) as b2, rasterio.open(it.assets["B03"].href) as b3, rasterio.open(it.assets["SCL"].href) as scl:
            for s in spots:
                if used[s["id"]] >= MAX_SCENES:
                    continue
                xs, ys = transform("EPSG:4326", b2.crs, [s["lon"]], [s["lat"]])
                x0, y0 = xs[0], ys[0]
                w = from_bounds(x0 - REF_M[1], y0 - REF_M[1], x0 + REF_M[1], y0 + REF_M[1], b2.transform)
                a2 = b2.read(1, window=w, boundless=True, fill_value=0).astype(float)
                a3 = b3.read(1, window=w, boundless=True, fill_value=0).astype(float)
                sc = scl.read(1, window=from_bounds(x0 - REF_M[1], y0 - REF_M[1], x0 + REF_M[1], y0 + REF_M[1], scl.transform), boundless=True, fill_value=0)
                sc = np.kron(sc, np.ones((2, 2), dtype=sc.dtype))[: a2.shape[0], : a2.shape[1]]  # 20 m → 10 m
                if sc.shape != a2.shape or not a2.any():
                    continue
                n = a2.shape[0]
                yy, xx = np.mgrid[0:n, 0:a2.shape[1]]
                dist = np.hypot((xx - n / 2) * 10, (yy - n / 2) * 10)
                water = sc == 6
                bright = (a2 + a3) / 2
                ref = bright[water & (dist >= REF_M[0]) & (dist <= REF_M[1])]
                near = water & (dist <= NEAR_M)
                if ref.size < 50 or not near.any():
                    continue
                r = bright / float(np.median(ref))
                used[s["id"]] += 1
                for i, j in zip(*np.nonzero(near)):
                    per_spot[s["id"]].setdefault((int(i), int(j)), []).append(float(r[i, j]))
                if used[s["id"]] == 1:
                    per_spot[s["id"]]["_origin"] = (x0, y0, str(b2.crs))  # type: ignore[index]
    date = today.isoformat()
    out = []
    for s in spots:
        px = {k: v for k, v in per_spot[s["id"]].items() if k != "_origin"}
        meds = [median(v) for v in px.values() if len(v) >= 2]
        f = summarise(s["id"], meds, used[s["id"]], date)
        if f:
            out.append(f)
        origin = per_spot[s["id"]].get("_origin")  # type: ignore[call-overload]
        if origin:
            x0, y0, crs = origin
            n = int(2 * REF_M[1] / 10)
            for (i, j), v in px.items():
                if len(v) < 2:
                    continue
                lon, lat = transform(crs, "EPSG:4326", [x0 + (j - n / 2) * 10], [y0 - (i - n / 2) * 10])
                pixels_geo.append({"type": "Feature", "geometry": {"type": "Point", "coordinates": [round(lon[0], 6), round(lat[0], 6)]},
                                   "properties": {"c": classify(median(v)), "r": round(median(v), 2)}})
    return out, {"type": "FeatureCollection", "attribution": "Contains modified Copernicus Sentinel data", "features": pixels_geo,
                 "scenes": {k: v for k, v in used.items()}}


def metres_between(a: tuple[float, float], b: tuple[float, float]) -> float:
    r = math.pi / 180
    h = math.sin((b[0] - a[0]) * r / 2) ** 2 + math.cos(a[0] * r) * math.cos(b[0] * r) * math.sin((b[1] - a[1]) * r / 2) ** 2
    return 2 * 6371000 * math.asin(math.sqrt(h))
