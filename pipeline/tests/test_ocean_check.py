import json

import pytest

from av_pipeline.ocean.check import summarize_describe

CATALOG = {
    "products": [{
        "product_id": "BLKSEA_ANALYSISFORECAST_PHY_007_001",
        "datasets": [{
            "dataset_id": "ds-x",
            "versions": [{
                "label": "202411",
                "parts": [{"services": [
                    {"service_name": "arco-time-series", "variables": []},
                    {"service_name": "arco-geo-series", "variables": [{
                        "short_name": "thetao", "units": "degrees_C",
                        "coordinates": [
                            {"coordinate_id": "depth", "values": [1, 2, 3, 4, 5, 6, 7, 8]},
                            {"coordinate_id": "latitude", "minimum_value": 40, "maximum_value": 41},
                            {"coordinate_id": "time", "minimum_value": 0, "maximum_value": 10},
                        ],
                    }]},
                ]}],
            }],
        }],
    }]
}


def test_summarize_describe_keeps_only_needed_fields():
    out = summarize_describe(json.dumps(CATALOG), "ds-x")
    assert out["product_id"] == "BLKSEA_ANALYSISFORECAST_PHY_007_001"
    (ver,) = out["versions"]
    (var,) = ver["variables"]
    assert var["short_name"] == "thetao"
    assert var["coords"]["depth"]["values"] == [1, 2, 3, 4, 5, 6]
    assert "latitude" not in var["coords"]


def test_summarize_describe_missing_dataset():
    with pytest.raises(LookupError):
        summarize_describe(json.dumps(CATALOG), "nope")


def test_static_candidates_filter_marmara_static_ids():
    from av_pipeline.ocean.static_bathy import candidate_ids

    cat = {"products": [{"datasets": [
        {"dataset_id": "cmems_mod_blk_phy-tem_anfc_mrm-500m_P1D-m"},
        {"dataset_id": "cmems_mod_blk_phy_anfc_mrm-500m_static"},
        {"dataset_id": "cmems_mod_blk_phy_anfc_2.5km_static"},
    ]}]}
    assert candidate_ids(cat) == ["cmems_mod_blk_phy_anfc_mrm-500m_static"]
    assert candidate_ids({}) == []


def test_static_check_skips_without_credentials(monkeypatch, capsys):
    from av_pipeline.ocean import static_bathy

    monkeypatch.delenv("COPERNICUSMARINE_SERVICE_USERNAME", raising=False)
    assert static_bathy.main(["x"]) == 0
    assert "skipping" in capsys.readouterr().out
