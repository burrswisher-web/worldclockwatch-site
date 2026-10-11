# EarthTurn South: asset tools

EarthTurn South is EarthTurn seen from below the South Pole. These scripts make its web assets in
`assets/web-earthturn-south/` from EarthTurn's own (`assets/web-earthturn/earthturn.json`).

- `make_maps.py south assets/web-earthturn-south` draws `map-vintage.png` and `map-dark.png`
  (1024 px, south-polar azimuthal equidistant, rim at 60° N) from Natural Earth 1:50m, in EarthTurn's
  colours and line weights. Run with `north` instead to check it against the EarthTurn maps: it matches
  them to about 1% of pixels. Needs `pip install pycairo shapely`; the data downloads into `data/`.
- `make_config.py assets/web-earthturn/earthturn.json assets/web-earthturn-south/earthturn-south.json`
  writes the face's config: EarthTurn's, mirrored left to right, with the cities re-projected.

No new night masks are needed. The south mask for declination step `i` is EarthTurn's
`night-(23 - i).png` pixel for pixel, turned by `-eot/4` instead of `+eot/4`.

The same maps, the mirrored config and the reversed masks are what the watch face itself needs.
