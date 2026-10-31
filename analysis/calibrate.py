"""F4 calibration (docs/MODEL.md §8a, Hoyle et al. 2024 = RESEARCH R21).

Catch per session is modelled with a log link and a log(effort) offset, effort = active hours × rods:
  count ~ Poisson / NegBin( exp(log effort + b0 + b1·log(score/100) + b2·moon + b3·cloud + b4·turbidity) )
plus a simple GAM (B-spline in the score). Zero catches stay in the data. Below MIN_SESSIONS nothing is
fitted and the report says "yetersiz veri". The report holds coefficients and n only, never session rows.

Usage (GitHub Actions, calibrate.yml):  python analysis/calibrate.py --d1 [--write]
Local / tests:                           python analysis/calibrate.py --fake 120
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import math
import sys
from dataclasses import dataclass

import numpy as np

MIN_SESSIONS = 30
THRESHOLDS = (30, 100, 300)
OVERDISPERSION = 1.5
STAGE = {
    30: "puan eğimi (β) ve taban (λ₀)",
    100: "gece/gündüz ve lamba kolları",
    300: "mera statik terimleri ve mevsim genlikleri",
}


@dataclass
class Session:
    count: int
    effort_h: float  # active hours × rods
    score: float  # frozen model score, mean over session hours (0–100)
    moon: float  # moon illumination when above horizon, 0..1
    cloud: float  # 0..1
    turbidity: float  # model term, 1 = clear


def next_threshold(n: int) -> int | None:
    return next((t for t in THRESHOLDS if n < t), None)


def _mean(xs: list[float]) -> float | None:
    xs = [x for x in xs if x is not None and not (isinstance(x, float) and math.isnan(x))]
    return sum(xs) / len(xs) if xs else None


def session_from_row(row: dict) -> Session | None:
    """D1 row {active_min, rods, count, model_json} → Session; None when the frozen model is missing."""
    try:
        model = json.loads(row.get("model_json") or "null") or {}
    except json.JSONDecodeError:
        return None
    hours = model.get("hours") or []
    score = _mean([h.get("total") for h in hours if isinstance(h.get("total"), (int, float))])
    if score is None or not row.get("active_min"):
        return None
    moon, cloud, turb = [], [], []
    for h in hours:
        w = h.get("inputs") or {}
        if w.get("moonFrac") is not None:
            moon.append(w["moonFrac"] if (w.get("moonAlt") or 0) > 0 else 0.0)
        if w.get("cloud") is not None:
            cloud.append(w["cloud"] / 100)
        for c in h.get("components") or []:
            if c[0] == "bulaniklik" and c[1] is not None:
                turb.append(c[1])
    return Session(
        count=int(row.get("count") or 0),
        effort_h=row["active_min"] / 60 * max(1, int(row.get("rods") or 1)),
        score=max(1.0, score),
        moon=_mean(moon) or 0.0,
        cloud=_mean(cloud) if cloud else 0.5,
        turbidity=_mean(turb) if turb else 1.0,
    )


def _design(s: list[Session]) -> tuple[np.ndarray, np.ndarray, np.ndarray, list[str]]:
    y = np.array([x.count for x in s], float)
    off = np.log(np.array([x.effort_h for x in s], float))
    X = np.column_stack([
        np.ones(len(s)),
        np.log(np.array([x.score for x in s]) / 100),
        [x.moon for x in s],
        [x.cloud for x in s],
        [x.turbidity for x in s],
    ])
    names = ["taban_log_lambda0", "beta_log_puan", "ay", "bulut", "bulaniklik"]
    # drop covariates without variation (e.g. all sessions on clear water)
    keep = [0] + [j for j in range(1, X.shape[1]) if np.ptp(X[:, j]) > 1e-9]
    return y, off, X[:, keep], [names[j] for j in keep]


def _coefs(res, names: list[str]) -> dict:
    ci = np.asarray(res.conf_int())
    return {n: {"est": round(float(b), 4), "se": round(float(se), 4), "ci95": [round(float(lo), 4), round(float(hi), 4)], "p": round(float(p), 4)}
            for n, b, se, (lo, hi), p in zip(names, np.asarray(res.params), np.asarray(res.bse), ci, np.asarray(res.pvalues))}


def fit(sessions: list[Session], now: dt.datetime | None = None) -> dict:
    now = now or dt.datetime.now(dt.timezone.utc)
    n = len(sessions)
    base = {"computed_at": now.isoformat(timespec="seconds"), "n": n, "min_sessions": MIN_SESSIONS, "next_threshold": next_threshold(n),
            "zero_share": round(sum(1 for s in sessions if s.count == 0) / n, 3) if n else None}
    if n < MIN_SESSIONS:
        return {**base, "status": "yetersiz veri", "message": f"{n} seans; model {MIN_SESSIONS} seansta kurulur."}

    import statsmodels.api as sm
    from statsmodels.gam.api import BSplines, GLMGam

    y, off, X, names = _design(sessions)
    pois = sm.GLM(y, X, family=sm.families.Poisson(), offset=off).fit()
    dispersion = float(pois.pearson_chi2 / pois.df_resid) if pois.df_resid > 0 else float("nan")
    family = "poisson"
    res = pois
    alpha = None
    if dispersion > OVERDISPERSION:
        # NB2 with alpha from the moment estimator (Cameron & Trivedi), then the GLM at that alpha
        mu = pois.mu
        alpha = max(1e-4, float(np.sum(((y - mu) ** 2 - y) / mu**2) / pois.df_resid))
        res = sm.GLM(y, X, family=sm.families.NegativeBinomial(alpha=alpha), offset=off).fit()
        family = "negatif binom"

    # GAM: smooth in log score, other covariates linear
    gam_out: dict = {}
    try:
        xs = X[:, [1]]
        bs = BSplines(xs, df=[4], degree=[3])
        other = np.delete(X, 1, axis=1)
        fam = sm.families.Poisson() if alpha is None else sm.families.NegativeBinomial(alpha=alpha)
        g = GLMGam(y, exog=other, smoother=bs, alpha=1.0, family=fam, offset=off).fit()
        grid = np.linspace(xs.min(), xs.max(), 7)
        ex = np.column_stack([np.ones(7)] + [np.full(7, other[:, j].mean()) for j in range(1, other.shape[1])])
        pred = g.predict(exog=ex, exog_smooth=grid[:, None], offset=np.zeros(7))
        gam_out = {"aic": round(float(g.aic), 2), "curve": [{"puan": round(float(100 * math.exp(v)), 1), "adet_saat_kamis": round(float(p), 3)} for v, p in zip(grid, pred)]}
    except Exception as e:  # noqa: BLE001 — GAM is a diagnostic; the GLM result stands without it
        gam_out = {"error": type(e).__name__}

    beta = res.params[names.index("beta_log_puan")] if "beta_log_puan" in names else float("nan")
    return {
        **base,
        "status": "tamam",
        "family": family,
        "dispersion": round(dispersion, 3),
        "nb_alpha": None if alpha is None else round(alpha, 4),
        "aic": round(float(res.aic), 2),
        "coefficients": _coefs(res, names),
        "gam": gam_out,
        "stage": STAGE[max(t for t in THRESHOLDS if n >= t)],
        "summary": (f"β = {beta:.2f}: puan 2 katına çıkınca beklenen av {2 ** beta:.2f} kat" if not math.isnan(beta) else "puan değişkeni sabit"),
    }


def fake_sessions(n: int, beta: float = 1.2, lam0: float = 3.0, seed: int = 7, nb_alpha: float | None = None) -> list[Session]:
    """Synthetic sessions with a known beta (tests and the --fake mode)."""
    r = np.random.default_rng(seed)
    out = []
    for _ in range(n):
        eff = float(r.uniform(0.5, 4.0) * r.integers(1, 3))
        score = float(r.uniform(15, 95))
        moon, cloud, turb = float(r.uniform(0, 1)), float(r.uniform(0, 1)), float(r.uniform(0.6, 1))
        mu = eff * lam0 * (score / 100) ** beta
        if nb_alpha:
            mu = r.gamma(1 / nb_alpha, mu * nb_alpha)
        out.append(Session(int(r.poisson(mu)), eff, score, moon, cloud, turb))
    return out


SQL = """SELECT s.active_min, s.rods, s.model_json, COALESCE((SELECT SUM(i.count) FROM catch_item i WHERE i.session_id = s.id AND i.species = 'istavrit'), 0) AS count
FROM catch_session s ORDER BY s.start_at"""


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--fake", type=int, help="fit synthetic sessions instead of D1")
    ap.add_argument("--d1", action="store_true", help="read sessions from D1 (CLOUDFLARE_* env)")
    ap.add_argument("--write", action="store_true", help="store the report in D1 meta.calibration_report")
    a = ap.parse_args(argv)
    if a.fake:
        report = fit(fake_sessions(a.fake))
    elif a.d1:
        sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parents[1] / "pipeline"))
        from av_pipeline.ocean.marmara import D1

        d1 = D1()
        sessions = [s for s in (session_from_row(r) for r in d1.query(SQL)) if s]
        report = fit(sessions)
        if a.write:
            d1.query("INSERT INTO meta (key, value) VALUES ('calibration_report', ?1) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [json.dumps(report, ensure_ascii=False)])
    else:
        ap.error("--fake N or --d1")
    # coefficients and n only: safe for the Actions log
    print(json.dumps(report, ensure_ascii=False, indent=1))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
