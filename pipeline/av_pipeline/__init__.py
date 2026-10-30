"""av-livn offline pipeline. Heavy data work (netCDF, GDAL) lives here, not in the Worker."""

# Candidate spots (OSM structures) are searched in BBOX; the bathymetry map covers the wider BATHY_BBOX so its
# edges sit well outside the spots, and the vector land layer covers MAP_EXTENT (the map's pan limit).
BBOX = {"south": 40.30, "west": 28.70, "north": 40.56, "east": 29.20}
BATHY_BBOX = {"south": 40.25, "west": 28.50, "north": 40.65, "east": 29.30}
MAP_EXTENT = {"south": 40.10, "west": 28.30, "north": 40.80, "east": 29.60}
