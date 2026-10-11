"""Draws the EarthTurn map images, map-vintage.png and map-dark.png, for either pole.

Same look as the EarthTurn maps (assets/web-earthturn): ocean disc, land with a coast stroke, lakes,
a graticule every 30 degrees over everything, and the date line dashed from the pole to the rim along
longitude 180. Coastlines are Natural Earth 1:50m (public domain), downloaded into ./data on first run;
drawn north, the result matches the EarthTurn originals to about 1% of pixels.

For the south the Antarctic ice shelves are added in a pale ice colour, outlined as coast along their
seaward edge, with only a fine line where the ice meets the ground. Without them Antarctica would show
the Ross and Weddell Seas cut almost to the pole, which is not the continent anyone knows.

    python3 make_maps.py south assets/web-earthturn-south     # EarthTurn South
    python3 make_maps.py north <scratch dir>                  # to check against the EarthTurn maps

Needs pycairo and shapely.
"""
import json, math, os, sys, urllib.request

import cairo
from shapely.geometry import MultiPolygon, Polygon, shape
from shapely.ops import unary_union

G, C, R = 450, 225.0, 225.0          # the face's grid, centre and disc radius
PX = 1024                            # delivered image size
SPAN = 150.0                         # degrees of latitude from the pole to the rim
NE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/'
DATA = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data')

STYLES = {
    'vintage': dict(ocean='#A9CBE0', land='#D9C88F', ice='#EEEBDD', coast='#6B5A3A',
                    grid='#4A4030', gridAlpha=115, ink='#3B3220'),
    'dark':    dict(ocean='#132C45', land='#2E4A3A', ice='#4A6470', coast='#5F8F6A',
                    grid='#FFFFFF', gridAlpha=31, ink='#DDDDDD'),
}
COAST_W = 1.25     # grid units; with 50m data these match the EarthTurn maps
GRID_W = 1.0
GROUNDING_W, GROUNDING_ALPHA = 0.6, 0.55
DATE_W, DATE_ON, DATE_OFF = 2.5, 9.0, 6.0


def rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))


def load(name):
    os.makedirs(DATA, exist_ok=True)
    path = os.path.join(DATA, name + '.geojson')
    if not os.path.exists(path):
        print('downloading', name)
        urllib.request.urlretrieve(NE + name + '.geojson', path)
    with open(path, encoding='utf-8') as f:
        return json.load(f)


def polygons(gj):
    for feat in gj['features']:
        g = shape(feat['geometry'])
        for poly in (g.geoms if isinstance(g, MultiPolygon) else [g]):
            yield poly


def rings_of(geom):
    for poly in (geom.geoms if isinstance(geom, MultiPolygon) else [geom]):
        if isinstance(poly, Polygon) and not poly.is_empty:
            yield list(poly.exterior.coords)
            for hole in poly.interiors:
                yield list(hole.coords)


def projector(pole):
    """(lon, lat) -> (x, y) in the 450 grid. North: east runs counter-clockwise, as EarthTurn.
    South: the view from below the South Pole, so east runs clockwise. Greenwich is up in both."""
    s = 1 if pole == 'north' else -1

    def p(lon, lat):
        r = (90 - s * lat) / SPAN * R
        a = math.radians(lon)
        return C - s * r * math.sin(a), C - r * math.cos(a)
    return p


def densify(pts, step=0.5):
    """Adds points along long edges so they bend like the parallels they follow once projected."""
    out = [pts[0]]
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        n = max(1, int(max(abs(x1 - x0), abs(y1 - y0)) / step))
        out.extend((x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n) for k in range(1, n + 1))
    return out


def seam(a, b):
    """An edge the data adds to close a polygon, not a coast: along the antimeridian or the pole."""
    return (abs(a[0]) >= 179.999 and abs(b[0]) >= 179.999) or (a[1] <= -89.99 and b[1] <= -89.99)


def add_fill(ctx, rings, p):
    for ring in rings:
        pts = [p(lon, lat) for lon, lat in densify([tuple(q[:2]) for q in ring])]
        ctx.move_to(*pts[0])
        for x, y in pts[1:]:
            ctx.line_to(x, y)
        ctx.close_path()


def add_coast(ctx, rings, p):
    """The ring as stroked lines, broken wherever it runs along a seam."""
    for ring in rings:
        ring = [tuple(q[:2]) for q in ring]
        run = [ring[0]]
        for a, b in zip(ring, ring[1:]):
            if seam(a, b):
                if len(run) > 1:
                    add_line(ctx, run, p)
                run = [b]
            else:
                run.append(b)
        if len(run) > 1:
            add_line(ctx, run, p)


def add_line(ctx, pts, p):
    xy = [p(lon, lat) for lon, lat in densify(pts)]
    ctx.move_to(*xy[0])
    for x, y in xy[1:]:
        ctx.line_to(x, y)


def draw(pole, style, out_dir):
    st = STYLES[style]
    p = projector(pole)
    land = list(polygons(load('ne_50m_land')))
    lakes = list(polygons(load('ne_50m_lakes')))
    shelves = list(polygons(load('ne_50m_antarctic_ice_shelves_polys')))
    # Antarctica and the islands frozen into its shelves take one outline with the shelves
    antarctic = [g for g in land if g.bounds[3] < -60]
    others = [g for g in land if g.bounds[3] >= -60]
    frozen = unary_union([g.buffer(0) for g in antarctic + shelves])

    surf = cairo.ImageSurface(cairo.FORMAT_ARGB32, PX, PX)
    ctx = cairo.Context(surf)
    ctx.scale(PX / G, PX / G)
    ctx.set_line_join(cairo.LINE_JOIN_ROUND)
    ctx.set_line_cap(cairo.LINE_CAP_ROUND)
    ctx.set_fill_rule(cairo.FILL_RULE_EVEN_ODD)

    ctx.arc(C, C, R, 0, 2 * math.pi)
    ctx.clip()
    ctx.set_source_rgb(*rgb(st['ocean']))
    ctx.paint()

    def fill(geoms, colour):
        ctx.new_path()
        for g in geoms:
            add_fill(ctx, rings_of(g), p)
        ctx.set_source_rgb(*rgb(colour))
        ctx.fill()

    def coast(geoms, width, alpha=1.0):
        ctx.new_path()
        for g in geoms:
            add_coast(ctx, rings_of(g), p)
        r, g_, b = rgb(st['coast'])
        ctx.set_source_rgba(r, g_, b, alpha)
        ctx.set_line_width(width)
        ctx.stroke()

    fill(shelves, st['ice'])
    fill(land, st['land'])
    coast(antarctic, GROUNDING_W, GROUNDING_ALPHA)
    coast(others + [frozen], COAST_W)
    fill(lakes, st['ocean'])
    coast(lakes, COAST_W)

    # graticule: parallels every 30 degrees inside the rim, meridians every 30 from the pole
    r, g, b = rgb(st['grid'])
    ctx.set_source_rgba(r, g, b, st['gridAlpha'] / 255)
    ctx.set_line_width(GRID_W)
    ctx.set_line_cap(cairo.LINE_CAP_BUTT)
    for k in range(1, 5):
        ctx.new_path()
        ctx.arc(C, C, k * 30 / SPAN * R, 0, 2 * math.pi)
        ctx.stroke()
    for lon in range(0, 360, 30):
        x, y = p(lon, 0)
        ctx.move_to(C, C)
        ctx.line_to(C + (x - C) * 2, C + (y - C) * 2)
        ctx.stroke()

    # the date line, dashed from the pole to the rim along 180
    x, y = p(180, 0)
    ctx.set_source_rgb(*rgb(st['ink']))
    ctx.set_line_width(DATE_W)
    ctx.set_dash([DATE_ON, DATE_OFF])
    ctx.move_to(C, C)
    ctx.line_to(C + (x - C) * 2, C + (y - C) * 2)
    ctx.stroke()

    os.makedirs(out_dir, exist_ok=True)
    surf.write_to_png(os.path.join(out_dir, 'map-%s.png' % style))


if __name__ == '__main__':
    pole, out = sys.argv[1], sys.argv[2]
    for s in STYLES:
        draw(pole, s, out)
        print('wrote', os.path.join(out, 'map-%s.png' % s))
