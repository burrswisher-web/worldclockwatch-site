"""Writes earthturn-south.json from EarthTurn's own earthturn.json.

EarthTurn South is EarthTurn seen from below the South Pole. Everything the face draws on top of the
map (time block, zone blocks, the +1d label's obstacles) is symmetric about the vertical, so the whole
face is EarthTurn mirrored left to right, with a south-polar map under it:

- the map turns clockwise (mapAngle = 360 u - 180 instead of 180 - 360 u, u = UTC minutes / 1440),
  and the numerals, the pointer, the date line and the wedge are the mirror images of EarthTurn's;
- the label table is the same minute for minute, with every angle negated;
- the night mask for declination step i is EarthTurn's mask 23 - i, exactly (the sun's altitude at
  (lat, lon) for declination d equals that at (-lat, -lon) for -d, and the two projections put those
  points on the same pixel), turned by -eot/4 instead of +eot/4;
- the city dots are re-projected; cities north of 60 degrees are pulled in to sit just inside the rim.

    python3 make_config.py assets/web-earthturn/earthturn.json assets/web-earthturn-south/earthturn-south.json
"""
import copy, json, math, sys

G, C, R, SPAN = 450, 225.0, 225.0, 150.0
DOT_RIM = 218.0      # a dot centre no further out than this keeps the whole 14 px dot on the disc


def neg(a):
    """The mirror of a screen angle."""
    return None if a is None else -a


def frame(a):
    return (360 - a) % 360


def south_xy(lat, lon):
    r = (90 + lat) / SPAN * R
    clamped = r > DOT_RIM
    r = min(r, DOT_RIM)
    a = math.radians(lon)
    return round(C + r * math.sin(a), 4), round(C - r * math.cos(a), 4), clamped


def main(src, dst):
    with open(src, encoding='utf-8') as f:
        n = json.load(f)
    s = copy.deepcopy(n)

    s['about'] = ("EarthTurn South watch face, everything needed to draw it live. EarthTurn seen from below the "
                  "South Pole: the same face mirrored left to right, over a south-polar map. All positions and sizes "
                  "are in the face's 450 x 450 grid (centre 225,225, disc radius 225); multiply by imagePx/450 for the "
                  "delivered images. Angles are degrees clockwise from straight up, the Watch Face Format convention. "
                  "Written by tools/earthturn-south/make_config.py from EarthTurn's earthturn.json.")

    s['projection'] = {
        'type': 'azimuthal equidistant, South Pole at the centre, seen from below (from space over Antarctica)',
        'latMax': 60,
        'radiusOf': 'r(lat) = (90 + lat) / 150 * 225; latitudes above 60 sit on the rim',
        'point': 'x = 225 + r * sin(lon), y = 225 - r * cos(lon), lon in degrees east; so longitude 0 is straight up and east runs clockwise in the unrotated map image',
        'mapImageOrientation': "map-<style>.png has longitude 0 (Greenwich) straight up; this is the face's rotation zero, which the watch shows at 12:00 UTC",
        'mapImages': 'map-vintage.png and map-dark.png, drawn by tools/earthturn-south/make_maps.py from Natural Earth 1:50m, in the EarthTurn style, with the Antarctic ice shelves in colors.<style>.ice',
    }

    s['rotation'] = {
        'mapAngleDeg': '360 * (utcMinutesOfDay / 1440) - 180',
        'sign': 'positive is clockwise; the angle rises through the day, so the map turns clockwise on screen, one turn per day',
        'rotationOrigin': 'at 00:00 UTC the angle is -180 and longitude 180 points straight up; at 12:00 UTC it is 0 and Greenwich points up; the numeral a place points at is its local solar hour',
        'rotatesWithMap': n['rotation']['rotatesWithMap'],
        'fixed': n['rotation']['fixed'],
    }

    night = s['night']
    night['images'] = ("EarthTurn's own masks, ../web-earthturn/night-00.png .. night-23.png, used in reverse: "
                       "the south mask for index i is the file night-(23 - i). " + n['night']['images'].split(', ', 1)[1].capitalize())
    night['maskFile'] = 'file = 23 - index'
    night['dayOfYearToMask'] = [23 - i for i in n['night']['dayOfYearToMask']]
    night['dayOfYearToMaskNote'] = n['night']['dayOfYearToMaskNote'] + '; these are file numbers, already reversed'
    night['maskAngleDeg'] = 'eotMinutes / 4, counter-clockwise (that is, -eotMinutes / 4 clockwise), applied to the mask group about the centre'

    dl = s['dateLine']
    dl['drawn'] = n['dateLine']['drawn']
    w = dl['wedge']
    w['meaning'] = ("the part of the world on the other date from the wearer's, so the wearer is never inside the tint: "
                    "before the wearer's midnight it is tomorrow's sector, from midnight at the bottom of the dial clockwise "
                    "round to the date line; after it, the remainder still on yesterday")
    w['lineAngleDeg'] = '((360 * utcMinutesOfDay / 1440 + 180) mod 360) - 180   (where the date line points, clockwise from up, in [-180, 180))'
    w['startAngleDeg'] = w['lineAngleDeg']
    w['outsideShape'] = 'wearer outside (inWedge false): filled sector of the whole disc from 180 clockwise round to lineAngleDeg + 360'
    w['insideShape'] = 'wearer inside (inWedge true): filled sector from lineAngleDeg clockwise to 180 (the rest of the disc)'

    lab = dl['label']
    br = lab['branches']
    for side in br.values():
        side['frameAngle'] = frame(side['frameAngle'])
        for e in side['list']:
            e['pinScreenAngle'] = neg(e['pinScreenAngle'])
    lab['placement'] = ('70 x 32 box centred 165 from the disc centre, in the rotating map frame: at 168 degrees '
                        '(12 counter-clockwise of the line, inside the wedge) for +1d, at 192 degrees for -1d; the box is '
                        'counter-rotated so the text stays upright')
    lab['screenAngle'] = 'theta = wrap180(A - 180 + utcMinutesOfDay / 4), clockwise from up, A = 192 for -1d and 168 for +1d'
    lab['pinned'] = ("EarthTurn's rule mirrored: while theta is within 55 degrees of up (the time block) the label is pinned "
                     "at radius 165 and exactly +/-55 degrees, upright and fixed on screen; while theta is within 50 degrees "
                     "of down (the zone blocks) likewise at +/-130. +1d may sit anywhere from the line counter-clockwise round "
                     "to 180, -1d anywhere from the line clockwise to 180")
    lab['branchesHow'] = lab['branchesHow'].replace('Generated from the face\'s own table, so it matches the watch minute for minute.',
                                                    "EarthTurn's table with every angle mirrored.")

    num = s['numerals']
    num['angleDeg'] = 'h * 15 - 180 (so 6 is at the left, 12 at the top, 18 at the right, 24 at the bottom: the ring runs clockwise like the map)'
    num.pop('fallbackImages', None)

    ptr = s['pointer']
    ptr['angleDeg'] = '360 * (localMinutesOfDay / 1440) - 180, about the centre'
    ptr.pop('image', None)

    s['colors']['vintage']['ice'] = '#EEEBDD'
    s['colors']['dark']['ice'] = '#4A6470'

    zones = s['cityDots']['zones']
    for z in zones.values():
        z['x'], z['y'], clamped = south_xy(z['lat'], z['lon'])
        if clamped:
            z['onRim'] = True
        else:
            z.pop('onRim', None)
    s['cityDots']['rim'] = 'cities north of about 55 degrees would put part of the dot off the disc; they sit at radius %g instead, on their own longitude (onRim)' % DOT_RIM
    s['cityDots']['defaults'] = {'zone1': 'jnb', 'zone2': 'scl', 'home': 'syd'}

    s.pop('reference', None)
    s['renderChecklist'] = [
        "Everything in EarthTurn's checklist holds; the differences are only the signs above: the map, the numerals, the pointer, the date line and the wedge are mirrored, the night mask file is 23 - index, and the mask turns by -eot/4.",
    ] + n['renderChecklist']

    with open(dst, 'w', encoding='utf-8') as f:
        json.dump(s, f, indent=2, ensure_ascii=False)
        f.write('\n')
    print('wrote', dst)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
