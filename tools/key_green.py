#!/usr/bin/env python3
"""Key green-screen Santa sprites to alpha, with despill.

The generated frames are shot against a lit green backdrop, so two things go
wrong if you key them naively:

  1. The backdrop is not flat. It is a lit sweep, brighter in the middle and
     darker at the edges, and a fixed threshold either eats into the white fur
     on one side or leaves a green curtain on the other. So the key is measured
     RELATIVE to the backdrop's own green excess at that pixel, sampled from the
     image border, rather than against a hard-coded green.

  2. The green bounces back onto the subject. Black boots and white fur trim
     come back with a green cast, which is the single most obvious "this was
     cut out" artefact once he is standing in a warm room. Despill pulls the
     green channel down to the average of red and blue wherever green exceeds
     it, which is exactly the condition that "green spill" describes and which
     never touches a genuinely green subject pixel.

Framing convention, matching what the engine expects: every sprite lands on a
canvas of the same height with his BOOTS on the bottom edge, so the composer can
scale by height and put his feet on the floor line.
"""
import sys, os, glob
import numpy as np
from PIL import Image

CANVAS_H = 1408
FIGURE_H = 1250          # alpha height of the figure within that canvas


def key_one(path):
    im = Image.open(path).convert("RGB")
    a = np.asarray(im).astype(np.float32)
    r, g, b = a[:, :, 0], a[:, :, 1], a[:, :, 2]

    # Backdrop reference from the border ring: how green is pure background here?
    ring = np.concatenate([
        a[:6].reshape(-1, 3), a[-6:].reshape(-1, 3),
        a[:, :6].reshape(-1, 3), a[:, -6:].reshape(-1, 3)])
    bg_r, bg_g, bg_b = np.median(ring, axis=0)
    bg_excess = max(12.0, bg_g - max(bg_r, bg_b))

    # Green excess of each pixel, relative to that backdrop level.
    excess = np.maximum(0.0, g - np.maximum(r, b))
    alpha = 1.0 - np.clip(excess / bg_excess, 0.0, 1.0)

    # Guard against a backdrop that is not quite the sampled green: where a
    # pixel is neither green-dominant nor close to the backdrop colour, keep it.
    #
    # This rescue MUST NOT be a plain saturation test. The backdrop itself is
    # highly saturated — it is chroma green — so "is this colourful?" answers
    # yes for every background pixel and the whole backdrop survives as an
    # opaque blue rectangle behind Santa. Only pixels that are NOT
    # green-dominant are eligible to be rescued this way.
    near_bg = (np.abs(r - bg_r) + np.abs(g - bg_g) + np.abs(b - bg_b)) < 150.0
    green_dominant = g > np.maximum(r, b)
    sat = a.max(axis=2) - a.min(axis=2)
    rescue = np.clip((sat - 40.0) / 45.0, 0.0, 1.0)
    alpha = np.where(green_dominant | near_bg, alpha, np.maximum(alpha, rescue))
    alpha = np.where((r + g + b) < 42.0, 0.0, alpha)   # black backdrop shadows

    # Despill: green never rises above the mean of red and blue.
    rb = (r + b) * 0.5
    g = np.minimum(g, np.maximum(rb, g * 0.0 + rb))
    # And a touch of saturation back into the red, which loses punch when green
    # is pulled out of a red suit.
    r = np.clip(r * 1.03, 0, 255)

    out = np.dstack([r, g, b, alpha * 255.0]).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


def trim(img, thresh=8):
    """Crop to the ALPHA bounds, not the RGB bounds.
    PIL's getbbox() on RGBA asks whether ANY channel is non-zero, and after
    despilling the backdrop pixels still carry a dark RGB value under alpha 0.
    So getbbox() returns the whole frame, the trim silently does nothing, and
    the figure keeps the backdrop's empty space below its boots — which the art
    check correctly reports as "he will float above the floor"."""
    a = np.asarray(img)
    mask = a[:, :, 3] > thresh
    if not mask.any():
        return img
    rows = np.where(mask.any(axis=1))[0]
    cols = np.where(mask.any(axis=0))[0]
    return img.crop((int(cols[0]), int(rows[0]), int(cols[-1]) + 1, int(rows[-1]) + 1))


def _alpha_bbox(img, thresh=8):
    a = np.asarray(img)
    m = a[:, :, 3] > thresh
    if not m.any():
        return None
    rows = np.where(m.any(axis=1))[0]
    cols = np.where(m.any(axis=0))[0]
    return int(cols[0]), int(rows[0]), int(cols[-1]) + 1, int(rows[-1]) + 1


def frame(img, canvas_h=CANVAS_H, figure_h=FIGURE_H):
    bb = _alpha_bbox(img)
    if bb:
        img = img.crop(bb)
    w, h = img.size
    s = figure_h / h
    nw, nh = max(1, int(round(w * s))), max(1, int(round(h * s)))
    img = img.resize((nw, nh), Image.LANCZOS)
    # Crop again AFTER the resize. Lanczos resampling pulls the transparent
    # border into the edge pixels, which left a 2-4% band of near-zero alpha
    # under the boots and made him float a few pixels above the floor line.
    bb = _alpha_bbox(img)
    if bb:
        img = img.crop(bb)
        nw, nh = img.size
    canvas = Image.new("RGBA", (canvas_h, canvas_h), (0, 0, 0, 0))
    # Paste WITHOUT passing the image as its own mask. That form blends the
    # source into a transparent destination using the source alpha as the mask,
    # so the stored alpha becomes alpha*alpha/255 — squaring it. The
    # anti-aliased bottom edge of the boots then falls below any sane
    # threshold and reads as empty, which is the "he will float above the
    # floor" failure. The destination here is empty, so a direct paste is
    # exactly equivalent and preserves alpha untouched.
    canvas.paste(img, ((canvas_h - nw) // 2, canvas_h - nh))
    return canvas


def main(src_dir, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    files = sorted(glob.glob(os.path.join(src_dir, "*")))
    files = [f for f in files if f.lower().endswith((".jpg", ".jpeg", ".png"))]
    if not files:
        print("no source images in", src_dir); return 1
    for f in files:
        name = os.path.splitext(os.path.basename(f))[0]
        name = name.split("-")[-1]
        dst = os.path.join(out_dir, name + ".png")
        frame(trim(key_one(f))).save(dst)
        print("  %-8s %s" % (name, dst))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1], sys.argv[2]))