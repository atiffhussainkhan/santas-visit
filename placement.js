/* placement.js — let the photograph decide where Santa goes.
 *
 * The app originally asked the user to do three things the photograph already
 * knows: where the floor is, how big a person is at that depth, and which bits
 * of furniture are nearer the camera than he is. That is why the first result
 * always looked pasted on — the one thing a compositor must never guess, the
 * relative depth of an object in front of its subject, was left to the user.
 *
 * This module reads those three things off the image with classical image
 * analysis — no model, no network, no upload. It is deliberately conservative:
 * every answer it returns carries a confidence, and anything it is not sure
 * about it declines rather than guesses. A wrong automatic placement is worse
 * than none, because the user stops looking at the picture and starts looking
 * at the tool.
 *
 * Method notes, so the thresholds are not magic numbers:
 *   - Edges are scored by mean gradient ACROSS the column band, multiplied by
 *     the fraction of columns that agree. A real floor line or table edge is
 *     long and continuous; texture, rug pattern and floorboard joints are
 *     locally strong but incoherent, so they score low on agreement. That
 *     agreement term is what separates a real edge from a busy patch.
 *   - All thresholds are relative to the image's own contrast, so the same
 *     numbers work on a dim phone photo and a bright one.
 */
(function (global) {
  "use strict";

  /* Luma of the image, subsampled. One readback per analysis, reused for every
   * measurement, because getImageData is the expensive part and a full-frame
   * readback on every drag is what makes this unusable. */
  function lumaMap(ctx, w, h, maxSide) {
    const s = Math.min(1, (maxSide || 320) / Math.max(w, h));
    const mw = Math.max(4, Math.round(w * s));
    const mh = Math.max(4, Math.round(h * s));
    const c = document.createElement("canvas");
    c.width = mw; c.height = mh;
    const g = c.getContext("2d");
    g.drawImage(ctx.canvas, 0, 0, w, h, 0, 0, mw, mh);
    const d = g.getImageData(0, 0, mw, mh).data;
    const l = new Float32Array(mw * mh);
    for (let i = 0, p = 0; p < l.length; p++, i += 4) {
      l[p] = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
    }
    return { l: l, w: mw, h: mh, sx: mw / w, sy: mh / h };
  }

  /* How strong is the horizontal edge between rows y and y-1, across columns
   * [xa, xb]? Returns 0..1, combining raw contrast with how much of the band
   * agrees on it. */
  function edgeScore(m, y, xa, xb) {
    const { l, w } = m;
    if (y < 1 || y >= m.h) return 0;
    const a = Math.max(0, Math.min(w - 1, Math.round(xa)));
    const b = Math.max(a + 1, Math.min(w, Math.round(xb)));
    let sum = 0, hits = 0, n = 0;
    for (let x = a; x < b; x++) {
      const d = Math.abs(l[y * w + x] - l[(y - 1) * w + x]);
      sum += d; n++;
      if (d > 0.055) hits++;
    }
    if (!n) return 0;
    const mean = sum / n;
    const agree = hits / n;
    // Agreement is weighted heavily: a long continuous edge is what a floor
    // line or a table edge is, and texture never has it.
    return Math.min(1, mean * 6) * (agree * agree);
  }

  /* Row texture: mean horizontal gradient across the full width. A wall is
   * smooth, a floor is boards and grain, so this jumps hard at the junction
   * even when the luminance step there is subtle — which it usually is in a
   * room where the wall and the floor are similar tones. */
  function rowTexture(m) {
    const { l, w, h } = m;
    const t = new Float32Array(h);
    for (let y = 0; y < h; y++) {
      let sum = 0;
      const row = y * w;
      for (let x = 1; x < w; x++) sum += Math.abs(l[row + x] - l[row + x - 1]);
      t[y] = sum / (w - 1);
    }
    return t;
  }

  /* Median-smoothed row texture.
   *
   * A MEAN is fooled by isolated strong rows: a bookshelf has a hard edge on
   * every shelf, so each of those rows spikes the average and the detector
   * declares the top of the bookcase to be the floor. A median over a short
   * vertical window ignores anything that is only a few rows tall, which is
   * exactly what a shelf edge is and what a floor really is not. */
  function smoothTexture(m) {
    const t = rowTexture(m);
    const h = m.h;
    const half = Math.max(2, Math.round(h * 0.025));
    const win = half * 2 + 1;
    const buf = new Float32Array(win);
    const out = new Float32Array(h);
    for (let y = 0; y < h; y++) {
      let n = 0;
      for (let k = y - half; k <= y + half; k++) {
        if (k < 0 || k >= h) continue;
        buf[n++] = t[k];
      }
      const slice = Array.prototype.slice.call(buf, 0, n).sort(function (a, b) { return a - b; });
      out[y] = slice[Math.floor(n / 2)];
    }
    return out;
  }

  /* The floor line: where the picture stops being wall and starts being floor.
   *
   * Two signals agree here, which is why neither is trusted alone. The
   * luminance EDGE at the junction is often weak — a beige wall above a brown
   * floor barely steps — so an edge-only detector slides down onto the rug
   * border or a floorboard seam, which are stronger and lower. The TEXTURE
   * JUMP is far more reliable, so it leads; the edge only has to corroborate.
   */
  function floorLine(ctx, w, h) {
    const m = lumaMap(ctx, w, h, 320);
    const t = smoothTexture(m);

    // Typical wall texture: the quietest third of the upper half.
    const wall = [];
    for (let y = Math.floor(m.h * 0.08); y < Math.floor(m.h * 0.30); y++) wall.push(t[y]);
    wall.sort(function (a, b) { return a - b; });
    const wallTex = wall.length ? wall[Math.floor(wall.length * 0.6)] : 0.01;

    const from = Math.floor(m.h * 0.22), to = Math.floor(m.h * 0.96);
    let best = { y: Math.floor(m.h * 0.78), score: 0 };
    for (let y = from; y < to; y++) {
      // How much busier this row is than the wall.
      const jump = t[y] / Math.max(0.008, wallTex);
      // Require it to STAY busy for a while, so a single noisy row cannot win.
      let stay = 0, cnt = 0;
      for (let k = y; k < Math.min(to, y + Math.floor(m.h * 0.06)); k++) { stay += t[k]; cnt++; }
      stay /= Math.max(1, cnt);
      const sustain = stay / Math.max(0.008, wallTex);
      const edge = edgeScore(m, y, 0, m.w);
      const s = Math.min(1.6, jump) * Math.min(2.2, sustain) * (0.55 + 0.45 * edge);
      if (s > best.score) best = { y: y, score: s };
    }
    // A detection is only trusted once the floor is clearly busier than the wall.
    const ratio = t[best.y] / Math.max(0.008, wallTex);
    return {
      y: best.y / m.sy,
      score: best.score,
      textureRatio: ratio,
      confident: ratio > 1.7 && best.score > 0.5,
    };
  }

  /* A person's plausible height when there is no ruler.
   *
   * This is an ASSUMPTION, not a measurement, and it must agree with
   * engine.solveStatic's visible fallback. The old floorY-h*0.34 estimate made
   * the analyser search a child-sized box while the renderer drew an adult, so
   * furniture edges crossing Santa's real torso were never considered. */
  function autoHeight(floorY, h) {
    const est = h * 0.58;
    return Math.max(h * 0.25, Math.min(est, h * 0.82));
  }

  /* Furniture standing between the camera and Santa.
   *
   * Looks for a strong, continuous horizontal edge crossing the lower part of
   * his silhouette — a table top, a counter, the front edge of a sofa. If one
   * exists, everything from that edge down to his feet belongs in front of him.
   *
   * Only looks below his waist on purpose. An edge higher up that crosses him
   * is a picture rail or a windowsill BEHIND him, and masking that would erase
   * his face. */
  function furnitureInFront(ctx, w, h, box) {
    const m = lumaMap(ctx, w, h, 320);
    const xa = (box.x / w) * m.w - m.w * 0.06;
    const xb = ((box.x + box.w) / w) * m.w + m.w * 0.06;
    const yFeet = (box.y + box.h) / h * m.h;
    const yTop = box.y / h * m.h;
    const yWaist = yTop + (yFeet - yTop) * 0.45;

    let best = { y: -1, score: 0 };
    for (let y = Math.ceil(yWaist); y < Math.ceil(yFeet); y++) {
      const s = edgeScore(m, y, xa, xb);
      if (s > best.score) best = { y: y, score: s };
    }
    if (best.y < 0 || best.score < 0.18) {
      return { found: false, score: best.score, y: null };
    }
    return {
      found: true,
      score: best.score,
      confident: best.score > 0.32,
      y: best.y / m.sy,
    };
  }

  /* A soft-edged mask covering the furniture band, so the original pixels can
   * be laid back over Santa through it. Feathered because a hard cut across a
   * table edge is its own kind of seam. */
  function bandMask(w, h, box, edgeY, feather) {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const g = c.getContext("2d");
    // The photographed edge already contains the camera's softness. A 10px
    // feather on a 893px image made the same table visibly blurrier only where
    // it crossed Santa. Leave only enough transition to hide mask stair-steps;
    // engine.js adds the final half-pixel at composite time.
    const f = feather === undefined
      ? Math.max(2, Math.min(4, Math.round(h * 0.003)))
      : feather;
    const x0 = Math.max(0, box.x - box.w * 0.25);
    const x1 = Math.min(w, box.x + box.w * 1.25);
    const y0 = Math.max(0, edgeY - f);
    const y1 = Math.min(h, box.y + box.h + h * 0.06);

    g.save();
    g.filter = "blur(" + Math.round(f / 2) + "px)";
    g.fillStyle = "#fff";
    g.fillRect(x0, y0, x1 - x0, y1 - y0);
    g.restore();
    return c;
  }

  /* The whole thing in one call, for the "sort him out yourself" button. */
  function analyse(ctx, w, h, place, size) {
    const floor = floorLine(ctx, w, h);
    const feet = place ? place.y : floor.y;
    const height = size || autoHeight(floor.y, h);
    const box = {
      x: (place ? place.x : w * 0.5) - (height * 0.30),
      y: feet - height,
      w: height * 0.60,
      h: height,
    };
    const furn = furnitureInFront(ctx, w, h, box);
    return {
      floor: floor,
      height: height,
      box: box,
      furniture: furn,
      mask: furn.found ? bandMask(w, h, box, furn.y) : null,
    };
  }

  global.Placement = {
    floorLine, autoHeight, furnitureInFront, bandMask, analyse,
  };
})(typeof window !== "undefined" ? window : globalThis);