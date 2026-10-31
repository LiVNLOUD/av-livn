from av_pipeline.spots.geo import to_lonlat, to_xy
from av_pipeline.spots.naming import describe_singles


def feat(name, kind, place, dx=0.0, src="generated"):
    x, y = to_xy(28.9, 40.4)
    lon, lat = to_lonlat(x + dx, y)
    return {"geometry": {"coordinates": [lon, lat]}, "properties": {"name": name, "kind": kind, "place": place, "name_source": src}}


def test_generic_names_become_place_plus_type_with_side_when_far():
    places = [{"name": "Fıstıklı", "xy": to_xy(28.9, 40.4)}]
    fs = [feat("İskele (Fıstıklı)", "pier", "Fıstıklı"), feat("Mahmuz (Fıstıklı)", "groyne", "Fıstıklı", dx=-900),
          feat("Armutlu Devlet Limanı – batı mendireği", "breakwater", "Armutlu"), feat("İskele (Fıstıklı)", "pier", "Fıstıklı", src="osm")]
    assert describe_singles(fs, places) == 2
    assert [f["properties"]["name"] for f in fs] == ["Fıstıklı İskelesi", "Fıstıklı Mahmuzu (Fıstıklı batısı)", "Armutlu Devlet Limanı – batı mendireği", "İskele (Fıstıklı)"]
