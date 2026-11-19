#!/usr/bin/env python3
"""Build the macOS app icon: the artwork inside Apple's 824 px rounded square,
centred on a transparent 1024 px canvas with a subtle drop shadow.
Writes <out>.png (Dock icon in dev) and <out>.icns (packaged app).

Usage: python3 scripts/make-mac-icon.py <source-image> [out.png]

resources/icon-mac.png was made from the 2048 px master in the docs repo:
  python3 scripts/make-mac-icon.py ../docs/assets/images/Dissonance_Logo.psd
Needs only macOS `sips`, `iconutil` and the Python standard library.
The .icns is made with iconutil because the one electron-builder generates
from a PNG renders scrambled at 16 and 32 px in Finder.
"""
import math
import os
import struct
import subprocess
import sys
import tempfile
import zlib

CANVAS = 1024
TILE = 824
RADIUS = 185
MARGIN = (CANVAS - TILE) // 2
SHADOW_OFFSET_Y = 10
SHADOW_BLUR = 24
SHADOW_ALPHA = 0.3
BGRA_MASKS = (0x00FF0000, 0x0000FF00, 0x000000FF, 0xFF000000)
ICONSET_SIZES = (16, 32, 128, 256, 512)


def load_tile_bgra(src):
    """Resize the source to TILE x TILE with sips and return top-down BGRA rows."""
    with tempfile.TemporaryDirectory() as tmp:
        bmp = os.path.join(tmp, 'tile.bmp')
        subprocess.run(
            ['sips', '-s', 'format', 'bmp', '-z', str(TILE), str(TILE), src, '--out', bmp],
            check=True,
            capture_output=True,
        )
        with open(bmp, 'rb') as f:
            data = f.read()
    offset = struct.unpack_from('<I', data, 10)[0]
    width, height, _, bpp = struct.unpack_from('<iiHH', data, 18)
    masks = struct.unpack_from('<4I', data, 54)
    if (width, abs(height), bpp, masks) != (TILE, TILE, 32, BGRA_MASKS):
        sys.exit(f'Unexpected BMP from sips: {width}x{height} {bpp}bpp masks={masks}')
    stride = TILE * 4
    rows = [data[offset + i * stride : offset + (i + 1) * stride] for i in range(TILE)]
    return rows if height < 0 else rows[::-1]


def rounded_rect_distance(x, y, cy):
    """Signed distance from (x, y) to the tile's rounded square centred at (CANVAS/2, cy)."""
    half = TILE / 2 - RADIUS
    qx = abs(x - CANVAS / 2) - half
    qy = abs(y - cy) - half
    outside = math.hypot(max(qx, 0), max(qy, 0))
    return outside + min(max(qx, qy), 0) - RADIUS


def shadow_alpha(x, y):
    d = rounded_rect_distance(x, y, CANVAS / 2 + SHADOW_OFFSET_Y)
    if d <= 0:
        return SHADOW_ALPHA
    t = min(d / SHADOW_BLUR, 1.0)
    return SHADOW_ALPHA * (1 - t) ** 2


def render(tile):
    out = bytearray(CANVAS * CANVAS * 4)
    for y in range(CANVAS):
        for x in range(CANVAS):
            cx, cy = x + 0.5, y + 0.5
            cover = min(max(0.5 - rounded_rect_distance(cx, cy, CANVAS / 2), 0.0), 1.0)
            shadow = shadow_alpha(cx, cy) * (1 - cover)
            alpha = cover + shadow
            if alpha <= 0:
                continue
            i = (y * CANVAS + x) * 4
            if cover > 0:
                row, col = tile[y - MARGIN], (x - MARGIN) * 4
                b, g, r = row[col], row[col + 1], row[col + 2]
                # Shadow is black, so it only adds alpha; un-premultiply the colour.
                out[i : i + 3] = bytes(round(c * cover / alpha) for c in (r, g, b))
            out[i + 3] = round(alpha * 255)
    return out


def write_png(path, rgba):
    raw = b''.join(b'\x00' + rgba[y * CANVAS * 4 : (y + 1) * CANVAS * 4] for y in range(CANVAS))

    def chunk(kind, body):
        return struct.pack('>I', len(body)) + kind + body + struct.pack('>I', zlib.crc32(kind + body))

    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n')
        f.write(chunk(b'IHDR', struct.pack('>IIBBBBB', CANVAS, CANVAS, 8, 6, 0, 0, 0)))
        f.write(chunk(b'IDAT', zlib.compress(raw, 9)))
        f.write(chunk(b'IEND', b''))


def write_icns(png_path, icns_path):
    with tempfile.TemporaryDirectory() as tmp:
        iconset = os.path.join(tmp, 'icon.iconset')
        os.mkdir(iconset)
        for size in ICONSET_SIZES:
            for scale, suffix in ((1, ''), (2, '@2x')):
                px = str(size * scale)
                name = os.path.join(iconset, f'icon_{size}x{size}{suffix}.png')
                subprocess.run(['sips', '-z', px, px, png_path, '--out', name], check=True, capture_output=True)
        subprocess.run(['iconutil', '-c', 'icns', iconset, '-o', icns_path], check=True)


def alpha_at(rgba, x, y):
    return rgba[(y * CANVAS + x) * 4 + 3]


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    out_path = sys.argv[2] if len(sys.argv) > 2 else 'resources/icon-mac.png'
    rgba = render(load_tile_bgra(sys.argv[1]))
    # Self-check: transparent canvas corners and rounded-off tile corners, opaque centre.
    assert alpha_at(rgba, 0, 0) == 0 and alpha_at(rgba, CANVAS - 1, 0) == 0
    assert alpha_at(rgba, MARGIN + 2, MARGIN + 2) == 0
    assert alpha_at(rgba, CANVAS // 2, CANVAS // 2) == 255
    write_png(out_path, rgba)
    icns_path = os.path.splitext(out_path)[0] + '.icns'
    write_icns(out_path, icns_path)
    print(f'Wrote {out_path} and {icns_path}')


if __name__ == '__main__':
    main()
