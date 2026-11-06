"""av-livn offline pipeline. Heavy data work (netCDF, GDAL) lives here, not in the Worker."""

# Candidate spots (OSM structures) are searched in BBOX; the bathymetry map covers the wider BATHY_BBOX so its
# edges sit well outside the spots, and the vector land layer covers MAP_EXTENT (the map's pan limit).
# I5: west edge moved from 28.70 to 28.15 so the whole Bursa coast (Mudanya → Karacabey) is in; spots get a province
BBOX = {"south": 40.30, "west": 28.15, "north": 40.56, "east": 29.20}
BATHY_BBOX = {"south": 40.25, "west": 28.05, "north": 40.65, "east": 29.30}
MAP_EXTENT = {"south": 40.10, "west": 27.90, "north": 40.80, "east": 29.60}
