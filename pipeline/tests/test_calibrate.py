import importlib.util
import json
import sys
from pathlib import Path

import pytest

pytest.importorskip("statsmodels")

spec = importlib.util.spec_from_file_location("calibrate", Path(__file__).resolve().parents[2] / "analysis" / "calibrate.py")
cal = importlib.util.module_from_spec(spec)
sys.modules["calibrate"] = cal
spec.loader.exec_module(cal)


def test_below_threshold_reports_insufficient_data():
    r = cal.fit(cal.fake_sessions(12))
    assert r["status"] == "yetersiz veri"
    assert r["n"] == 12 and r["next_threshold"] == 30
    assert "coefficients" not in r


def test_empty():
    r = cal.fit([])
    assert r["status"] == "yetersiz veri" and r["n"] == 0 and r["zero_share"] is None


def test_recovers_known_beta_poisson():
    r = cal.fit(cal.fake_sessions(400, beta=1.2, lam0=3.0, seed=3))
    assert r["status"] == "tamam" and r["family"] == "poisson"
    b = r["coefficients"]["beta_log_puan"]
    assert b["ci95"][0] < 1.2 < b["ci95"][1]
    assert abs(r["coefficients"]["taban_log_lambda0"]["est"] - 1.0986) < 0.3  # log 3
    assert r["next_threshold"] is None and r["stage"].startswith("mera")
    assert len(r["gam"]["curve"]) == 7
    # GAM curve rises with the score
    c = [p["adet_saat_kamis"] for p in r["gam"]["curve"]]
    assert c[-1] > c[0]


def test_overdispersed_switches_to_negative_binomial():
    r = cal.fit(cal.fake_sessions(150, beta=1.0, seed=5, nb_alpha=1.0))
    assert r["family"] == "negatif binom" and r["nb_alpha"] > 0.2
    assert r["next_threshold"] == 300 and "lamba" in r["stage"]


def test_at_30_sessions_fits():
    r = cal.fit(cal.fake_sessions(30, seed=11))
    assert r["status"] == "tamam" and r["next_threshold"] == 100


def test_session_from_row():
    model = {"hours": [
        {"total": 60, "inputs": {"moonFrac": 0.8, "moonAlt": 10, "cloud": 50}, "components": [["bulaniklik", 0.9, "x", ""]]},
        {"total": 80, "inputs": {"moonFrac": 0.8, "moonAlt": -5, "cloud": 30}, "components": [["bulaniklik", 0.7, "x", ""]]},
    ]}
    s = cal.session_from_row({"active_min": 90, "rods": 2, "count": 4, "model_json": json.dumps(model)})
    assert s.count == 4 and s.effort_h == 3.0 and s.score == 70
    assert s.moon == pytest.approx(0.4) and s.cloud == pytest.approx(0.4) and s.turbidity == pytest.approx(0.8)
    # forecast-frozen hours carry no inputs: neutral covariates
    s2 = cal.session_from_row({"active_min": 60, "rods": None, "count": 0, "model_json": json.dumps({"hours": [{"total": 40}]})})
    assert s2.effort_h == 1.0 and s2.cloud == 0.5 and s2.turbidity == 1.0 and s2.moon == 0.0
    assert cal.session_from_row({"active_min": 60, "model_json": None}) is None
    assert cal.session_from_row({"active_min": 60, "model_json": "{bad"}) is None
    assert cal.session_from_row({"active_min": 0, "model_json": json.dumps(model)}) is None


def test_constant_covariates_are_dropped():
    ss = cal.fake_sessions(60, seed=2)
    for s in ss:
        s.turbidity = 1.0
    r = cal.fit(ss)
    assert "bulaniklik" not in r["coefficients"]


def test_cli_fake(capsys):
    assert cal.main(["--fake", "40"]) == 0
    out = json.loads(capsys.readouterr().out)
    assert out["n"] == 40 and out["status"] == "tamam"


def test_h3_species_frozen_model_and_report_keys():
    model = {"hours": [{"total": 60}], "species": {"levrek": {"hours": [{"total": 40, "inputs": {"cloud": 80}}]}}}
    row = {"active_min": 60, "rods": 1, "count": 2, "model_json": json.dumps(model)}
    assert cal.session_from_row(row).score == 60
    lv = cal.session_from_row(row, "levrek")
    assert lv.score == 40 and lv.cloud == 0.8
    assert cal.session_from_row({"active_min": 60, "model_json": json.dumps({"hours": [{"total": 50}]})}, "levrek") is None
    assert cal.report_key("istavrit") == "calibration_report" and cal.report_key("levrek") == "calibration_report:levrek"


def test_i6_only_prospective_sessions_measure_and_temporal_check():
    import dataclasses

    ss = cal.fake_sessions(80, beta=1.5, seed=3)
    for k, s in enumerate(ss):
        s.start_at = f"2027-{1 + k // 28:02d}-{1 + k % 28:02d}T18:00:00Z"
        s.spot_id = "a" if k % 2 else "b"
    retro = [dataclasses.replace(s, retro=True) for s in ss[:40]]
    recomputed = [dataclasses.replace(s, prospective=False) for s in ss[:40]]
    r = cal.fit(retro + recomputed + ss[:20])
    assert r["status"] == "yetersiz veri" and r["n"] == 20 and r["n_total"] == 100 and r["n_retro"] == 40 and r["n_recomputed"] == 40
    assert "Katsayılar değiştirilmedi" in r["message"] and "100/300" in r["fitted"]
    ok = cal.fit(ss)
    t = ok["temporal"]
    assert t["status"] == "tamam" and t["train"] == 56 and t["test"] == 24
    assert set(t["loglik"]) == {"model_log_puan", "taban_tek_oran", "taban_saat_bandi", "taban_mera"}
    assert t["model_beats_baselines"] is True  # synthetic data with a real score effect
    assert cal.temporal_check(ss[:10])["status"] == "yetersiz veri"


def test_i6_row_uses_start_forecast_only_when_frozen_before():
    fc = {"species": "istavrit", "hours": [{"hour": 1, "total": 83}]}
    row = {"active_min": 240, "rods": 1, "count": 0, "retro": 1, "start_at": "2026-11-01T15:00:00Z", "spot_id": "x",
           "model_json": json.dumps({"hours": [{"total": 80.4}], "start_forecast": fc})}
    late = cal.session_from_row({**row, "forecast_kind": "yeniden_hesaplanmis"})
    assert late.score == 80.4 and late.prospective is False and late.retro is True
    pro = cal.session_from_row({**row, "retro": 0, "forecast_kind": "dondurulmus"})
    assert pro.score == 83 and pro.prospective is True
    assert "WHERE s.target_species = ?1" in cal.SQL
