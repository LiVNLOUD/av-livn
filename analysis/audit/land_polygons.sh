#!/usr/bin/env bash
# OSM land polygons (osmdata.openstreetmap.de, ODbL) clipped to the Sea of Marmara for fetch computation.
# Vector land mask, so exposure does not inherit the DTM's unreliable coastal cells.
set -euo pipefail
OUT=${1:-data/osm/land_marmara.geojson}
TMP=$(mktemp -d)
curl -sSL -o "$TMP/land.zip" https://osmdata.openstreetmap.de/download/land-polygons-split-4326.zip
unzip -q "$TMP/land.zip" -d "$TMP"
SHP=$(find "$TMP" -name 'land_polygons.shp' | head -1)
mkdir -p "$(dirname "$OUT")"
rm -f "$OUT"
# Whole Sea of Marmara so fetch rays are not truncated at the study bbox.
ogr2ogr -f GeoJSON "$OUT" "$SHP" -spat 26.4 39.9 30.1 41.4 -clipsrc 26.4 39.9 30.1 41.4 \
  -simplify 0.00003 -lco COORDINATE_PRECISION=6 -nlt PROMOTE_TO_MULTI
ls -la "$OUT"
