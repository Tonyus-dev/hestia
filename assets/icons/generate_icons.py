#!/usr/bin/env python3
"""Rasteriza o icone da Heestia (assets/icons/hestia-console.svg) em PNG.

Recria o mesmo path (chama cobre/ambar sobre fundo obsidiana) usado no
favicon inline de src/routes/__root.tsx, ponto a ponto (arcos e curvas
de Bezier resolvidos manualmente), para nao depender de bibliotecas de
SVG externas (rsvg/cairosvg/inkscape indisponiveis neste ambiente).

Uso: python3 generate_icons.py
"""

import math
import os

from PIL import Image, ImageDraw

OBSIDIAN = (14, 10, 8, 255)
COPPER = (200, 135, 61, 255)
AMBER = (244, 194, 122, 255)

SUPERSAMPLE = 8  # desenha em 64*8 e reduz com LANCZOS para antialiasing.
BASE = 64
SIZES = [512, 256, 128, 64, 48]


def cubic_bezier(p0, p1, p2, p3, steps=24):
    pts = []
    for i in range(steps + 1):
        t = i / steps
        mt = 1 - t
        x = (mt**3) * p0[0] + 3 * (mt**2) * t * p1[0] + 3 * mt * (t**2) * p2[0] + (t**3) * p3[0]
        y = (mt**3) * p0[1] + 3 * (mt**2) * t * p1[1] + 3 * mt * (t**2) * p2[1] + (t**3) * p3[1]
        pts.append((x, y))
    return pts


def arc_180(cx, cy, r, start_deg=0, end_deg=180, steps=24):
    pts = []
    for i in range(steps + 1):
        t = start_deg + (end_deg - start_deg) * i / steps
        rad = math.radians(t)
        pts.append((cx + r * math.cos(rad), cy + r * math.sin(rad)))
    return pts


def outer_flame_path():
    tip = (32, 12)
    seg1 = cubic_bezier(tip, (36, 18), (42, 21), (42, 30))
    arc = arc_180(32, 30, 10, 0, 180)
    seg2 = cubic_bezier((22, 30), (22, 26), (24, 24), (26, 22))
    seg3 = cubic_bezier((26, 22), (25, 26), (27, 28), (29, 28))
    seg4 = cubic_bezier((29, 28), (29, 22), (26, 18), (32, 12))
    return seg1 + arc[1:] + seg2[1:] + seg3[1:] + seg4[1:]


def inner_flame_path():
    tip = (32, 22)
    seg1 = cubic_bezier(tip, (34, 25), (37, 27), (37, 32))
    arc = arc_180(32, 32, 5, 0, 180)
    seg2 = cubic_bezier((27, 32), (27, 29), (29, 28), (30, 27))
    seg3 = cubic_bezier((30, 27), (30, 30), (32, 30), (32, 27))
    return seg1 + arc[1:] + seg2[1:] + seg3[1:]


def rounded_rect(draw, box, radius, fill):
    draw.rounded_rectangle(box, radius=radius, fill=fill)


def render(size_px):
    scale = SUPERSAMPLE
    canvas_size = BASE * scale
    img = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    rounded_rect(draw, (0, 0, canvas_size - 1, canvas_size - 1), radius=12 * scale, fill=OBSIDIAN)

    def scaled(pts):
        return [(x * scale, y * scale) for x, y in pts]

    draw.polygon(scaled(outer_flame_path()), fill=COPPER)
    draw.polygon(scaled(inner_flame_path()), fill=AMBER)

    return img.resize((size_px, size_px), Image.LANCZOS)


def main():
    out_dir = os.path.dirname(os.path.abspath(__file__))
    for size in SIZES:
        img = render(size)
        path = os.path.join(out_dir, f"hestia-console-{size}.png")
        img.save(path)
        print(f"wrote {path}")

    # Alias generico (512px) pedido pelo plano de empacotamento.
    generic = os.path.join(out_dir, "hestia-console.png")
    render(512).save(generic)
    print(f"wrote {generic}")


if __name__ == "__main__":
    main()
