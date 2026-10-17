/* Scene engine — Santa placed into a user's own room photo.
 *
 * Two ideas do the heavy lifting here, and they are independent:
 *
 * 1. MEASUREMENT, NOT FACE SWAPS. Every competitor transforms the person in
 *    the photo. This composites a character where the user places him, scaled
 *    from a ruler they stretch over one real object in their own room.
 *
 * 2. LIGHT MATCHING is what stops a composited character looking like a sticker.
 *    A flat sprite on a photo reads as fake because it has no relationship to
 *    the room. Three cheap corrections fix most of it, all done in code:
 *      · a contact shadow, offset along the light direction, that softens and
 *        fades with height off the floor
 *      · a colour grade sampled from the floor area, applied to Santa, so his
 *        reds sit in the same colour world as the room
 *      · a touch of the background's blur, so Santa is not sharper than the
 *        photo he is standing in
 *
 * The character is art-agnostic on purpose: Santa.toCanvas() draws whatever
 * asset set is supplied. That is what lets the engine be proved with a cheap
 * vector character now and swapped for a photoreal one later without touching
 * a line of this file. Getting the mechanism right is the expensive part;
 * the art is a swappable asset.
 */
(function (global) {
  "use strict";

  const D2R = Math.PI / 180;

  /* Real-world scale, in metres.
   *
   * These exist because Santa used to be sized in raw pixels, clamped to
   * 110..320. That number was independent of the photo, so he rendered tiny in
   * a 1600px-wide room shot and would have been absurd in a small one. Sizing
   * against the room's own span means the anchors the user already placed
   * double as a scale reference: the distance they span IS the room's width.
   */
  const SANTA_HEIGHT_M = 1.75;   // an adult, top of hat included
  const ROOM_SPAN_M = 5.2;      // door->sofa plus door->table, in metres

  /* ------------------------------------------------------------ the scene --
   * A timeline of beats. Each beat says where Santa is, what he is doing, and
   * which pose to hold. The engine only interpolates; it holds no story.
   */
  /* ------------------------------------------------------------ placement --
   * A still photograph, not a film. Santa is put where the user puts him and
   * stays there: no walk cycle, no timeline, no clock. The old build interpolated
   * a path between three anchors over 11.6s, which meant the person using it had
   * no control over where Santa ended up — only over the route he took to get
   * there. That is the wrong control for the job.
   *
   * Scale comes from a real object in the user's own photo. They stretch a
   * measuring stick up something they can see — a door, a table, themselves —
   * and tell us what it is; every pixel then has a real-world size, and Santa
   * is drawn to match the room instead of to a guessed constant. Deriving size
   * from a room's diagonal, as this used to, made him small in a wide shot and
   * huge in a tight one.
   */

  /* Heights are real, in centimetres. */
  const REFERENCES = {
    door:    { label: "Doorway",         cm: 200 },
    table:   { label: "Coffee table",    cm: 45  },
    seat:    { label: "Sofa seat",       cm: 45  },
    chair:   { label: "Dining chair",    cm: 90  },
    person:  { label: "Adult standing",  cm: 170 },
    fridge:  { label: "Fridge",          cm: 180 },
    lamp:    { label: "Floor lamp",      cm: 150 },
  };

  /* Heights are floor-to-top-of-hat, because every sprite in
   * assets/santa is anchored by its FEET (santa-photo.js draws the image with
   * its bottom edge on the placement point). So the number used has to be the
   * full silhouette, not the part above the seat.
   *
   * Seated: a 45cm seat + a ~90cm seated adult + ~15cm of hat = ~1.50m.
   * Standing: an adult plus hat, ~1.85m.
   *
   * Using one number for both was wrong twice over: seated Santa was drawn
   * short, and the standing poses were drawn at seated height. */
  const SEATED_HEIGHT_M = 1.50;
  const STANDING_HEIGHT_M = 1.85;

  /* Poses where Santa is on his feet rather than on a cushion. */
  const STANDING_POSES = { stand: 1, wave: 1, cheer: 1 };

  /* Seated-ness is per character, never inferred from a pose name. The vector
   * character seats sit/reach/drink/eat; the delivered photographs only seat
   * `sit` (bent thighs and shins, with the chair transparent). That distinction
   * selects the 1.50m projected seated height instead of shrinking unrelated
   * standing poses that happen to share a name. */
  const SEATED_POSES = {};
  function isSeated(character, pose) {
    return !!(character && character.seatedPoses && character.seatedPoses[pose]);
  }

  /* No seat lift. An earlier pass raised Santa by the seat height when the
   * user measured a sofa or chair, on the theory that the marker is on the
   * floor. It is wrong: the marker is where his boots touch, and every sprite
   * is anchored by its boots, so lifting it floats him above the cushion. */
  const SEAT_REFS = {};

  /* Where Santa sits and how big he is.
   *
   * place  — {x,y}: the floor/foreground point where the pose's lowest pixel lands.
   * stick  — {x1,y1,x2,y2}: base and top of the object the user measured.
   * refCm  — that object's real height in cm, or 0 if they have not measured yet.
   */
  function solveStatic(place, stick, refCm, w, h, pose, refKey, seated) {
    const p = place || { x: w * 0.5, y: h * 0.8 };
    const standing = !seated;

    // Pixels per centimetre, from the user's own stick against a known object.
    // A ruler that is only a few pixels long is noise, not a measurement, so
    // refuse it rather than scale a whole character off a stray drag.
    let pxPerCm = 0;
    if (stick && refCm > 0) {
      const px = Math.hypot(stick.x2 - stick.x1, stick.y2 - stick.y1);
      if (px > 12) pxPerCm = px / refCm;
    }

    const target = standing ? STANDING_HEIGHT_M : SEATED_HEIGHT_M;

    /* PERSPECTIVE. This is what actually made Santa look small.
     *
     * A ruler describes scale at its OWN depth and nowhere else. Measuring the
     * door at the back wall and then dropping Santa onto the near rug sizes him
     * as though he were still standing beside the door — but he is metres
     * closer to the camera, and anything nearer the lens is drawn larger. The
     * old code carried the door's pixels-per-centimetre straight over, so a
     * person who should have been the largest thing in the frame came out the
     * same size as something at the back of the room. That is the whole reason
     * he read as undersized rather than merely "a bit small".
     *
     * For a camera tilted down at a room, a floor point's DEPTH goes as
     * 1/(y - horizon): points nearer the camera sit LOWER in the frame, and
     * as depth grows the point climbs toward the horizon. So the apparent-size
     * ratio between two floor points is the ratio of their (y - horizon)
     * distances, and the one standing LOWER is the one standing NEARER and
     * therefore BIGGER.
     *
     * The horizon is ASSUMED high in the frame, near the top. That is what a
     * downward-looking interior shot looks like — the room fills the frame and
     * the horizon is at or above it. It is one documented assumption, and
     * getting it wrong moves the answer by tens of percent, which is why it is
     * stated here rather than buried: this is an estimate of depth, not a
     * measurement, and deriving it properly would need vanishing-point
     * detection that this does not attempt. */
    const HORIZON = 0.12;
    const yh = h * HORIZON;
    const refDepth = Math.max(1, stick.y1 - yh);
    const placeDepth = Math.max(1, p.y - yh);
    const perspective = refDepth > 0 ? placeDepth / refDepth : 1;
    // Guard both ways: a ruler in front of Santa would shrink him to nothing,
    // and a ruler far behind would balloon him.
    const persp = Math.max(0.35, Math.min(3.2, perspective));

    /* Without a measurement we do not know his depth, so this is a judgement,
     * not a calculation — and the readout says so rather than pretending. */
    let size = pxPerCm > 0 ? target * 100 * pxPerCm * persp : h * 0.58;
    const tooClose = pxPerCm > 0 && size > h * 0.95;

    // Clamps that actually keep him in the picture. The old 10%..160% of frame
    // height admitted a Santa two and a half times the height of the room.
    size = Math.max(h * 0.12, Math.min(size, h * 0.95));

    // Depth warning: one ruler only describes the scale at ITS own depth. If
    // the user measured something far behind and is placing Santa much nearer,
    // the size is not right, and pretending otherwise would be dishonest.
    const depthGap = (stick && pxPerCm > 0) ? Math.abs(place.y - stick.y1) / h : 0;
    return { x: p.x, y: p.y, size, measured: pxPerCm > 0, pxPerCm, standing, depthGap,
             perspective: persp, tooClose: tooClose };
  }

  function drawSnow(ctx, w, h, time, amount) {
    const N = amount;
    ctx.save();
    for (let i = 0; i < N; i++) {
      // Deterministic per-flake positions: the same run always renders the
      // same snow, which is what makes the output reproducible (U8).
      const s = Math.sin(i * 12.9898) * 43758.5453;
      const rx = s - Math.floor(s);
      const s2 = Math.sin(i * 78.233) * 12345.6789;
      const ry = s2 - Math.floor(s2);
      const sp = 0.5 + rx;
      const x = (rx * w + time * 14 * sp) % w;
      const y = (ry * h + time * 34 * sp) % h;
      const r = 0.8 + rx * 1.7;
      ctx.globalAlpha = 0.35 + rx * 0.45;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  /* A warm glow that tracks Santa, so the eye is pulled to him. */
  /* ------------------------------------------------- compositing helpers --
   * Santa has to be LIT BY the room, not just drawn near it. These build a
   * throwaway copy of the sprite so the grade and the shadow can be worked on
   * without touching the original pixels. */

  const _scratch = {};
  const _aspect = {};

  function characterKey(char) {
    return (char && char.cacheKey) || (char === global.PhotorealSanta ? "photo" : "vector");
  }

  function poseScaleOf(char, pose) {
    const n = char && char.poseScale && char.poseScale[pose];
    return n > 0 ? n : 1;
  }

  function feetOffsetOf(char, pose) {
    const n = char && char.feetOffset && char.feetOffset[pose];
    return n > 0 ? n : 0;
  }

  function topOffsetOf(char, pose) {
    const n = char && char.topOffset && char.topOffset[pose];
    return n > 0 ? n : char.height;
  }

  /* The real drawn aspect of a pose, measured rather than assumed. The two
   * characters differ: the vector figure is about 0.5 as wide as it is tall,
   * the photographed sprites vary per pose, and guessing wrong squashes Santa
   * horizontally — which reads instantly as fake.
   *
   * The art must be SCALED TO FIT the measuring box. This version drew the
   * sprites at scale 1 into a 300x300 canvas, so all it could see was the
   * bottom 300 rows of a 1408px figure, and because a figure's legs and boots
   * span nearly its full width at that height, almost every pose measured as
   * 1.0 instead of its true 0.43..0.52. That made the scratch patch, the room
   * sample and the ground shadow all up to twice as wide as Santa is, which
   * inflated the shadow and halved the effective sample density. */
  const ASPECT_BOX = 256;
  function aspectOf(char, pose) {
    const key = characterKey(char) + ":" + ASPECT_BOX + ":" + pose;
    if (_aspect[key]) return _aspect[key];
    const c = document.createElement("canvas");
    try {
      const h = char.height;
      if (!(h > 0)) return (_aspect[key] = { ratio: 0.45, centre: 0 });
      const scale = ASPECT_BOX / h;
      const top = topOffsetOf(char, pose) * scale;
      const foot = feetOffsetOf(char, pose) * scale;
      // Twice the nominal width prevents raised arms from being clipped while
      // measuring. The same feet-offset transform is used by offscreenFor:
      // the pose's lowest pixel, not its local origin, touches the bottom.
      c.width = ASPECT_BOX * 2;
      c.height = Math.max(1, Math.ceil(top + foot));
      const g = c.getContext("2d");
      char.toCanvas(g, char.build(pose),
                    { x: c.width / 2, y: c.height - foot, scale, flip: false });
      const all = g.getImageData(0, 0, c.width, c.height).data;
      let min = c.width, max = -1;
      for (let y = 0; y < c.height; y++) {
        for (let x = 0; x < c.width; x++) {
          if (all[(y * c.width + x) * 4 + 3] > 8) {
            if (x < min) min = x;
            if (x > max) max = x;
          }
        }
      }
      if (max < min) return (_aspect[key] = { ratio: 0.45, centre: 0 });
      return (_aspect[key] = {
        ratio: (max - min + 1) / ASPECT_BOX,
        centre: ((min + max + 1) / 2 - c.width / 2) / ASPECT_BOX,
      });
    } catch (e) { return (_aspect[key] = { ratio: 0.45, centre: 0 }); }
  }

  function offscreenFor(char, pose, p, scale) {
    const src = char.build(pose);
    if (!src || !src.length) return null;
    const nominal = char.height * scale;
    const top = topOffsetOf(char, pose) * scale;
    const foot = feetOffsetOf(char, pose) * scale;
    const measured = aspectOf(char, pose);
    const h = Math.max(1, Math.ceil(top + foot));
    const w = Math.max(1, Math.ceil(nominal * measured.ratio + 4));
    const originX = w / 2 - nominal * measured.centre;
    const originY = h - foot;
    const col = _scratch.col, mask = _scratch.mask;
    if (!col || col.width !== w || col.height !== h) {
      _scratch.col = document.createElement("canvas");
      _scratch.mask = document.createElement("canvas");
      _scratch.col.width = _scratch.mask.width = w;
      _scratch.col.height = _scratch.mask.height = h;
    }
    const c = _scratch.col.getContext("2d"), m = _scratch.mask.getContext("2d");
    c.clearRect(0, 0, w, h); m.clearRect(0, 0, w, h);
    char.toCanvas(c, src, { x: originX, y: originY, scale, flip: false });
    m.drawImage(_scratch.col, 0, 0);
    return {
      col: _scratch.col, mask: _scratch.mask, w, h,
      originX, originY, feetPx: foot,
    };
  }

  function clamp255(v) { return v < 0 ? 0 : v > 255 ? 255 : v; }

  /* What the room actually looks like where Santa is standing.
   *
   * A single average over the bottom of the frame is not enough: the lamp is on
   * the left and the window on the right, so the patch directly behind him can
   * be much darker or warmer than the frame average. Sampling his own footprint
   * is what makes the match hold up in an unevenly lit room.
   *
   * The sample rect is EXACTLY the rect Santa will be drawn into, for two
   * reasons: the blurred copy is reused for the light wrap and has to land
   * pixel-for-pixel on his edges, and a patch offset from his silhouette
   * describes the wrong part of the room.
   *
   * When part of that rect falls outside the canvas the remainder is still
   * sampled and the offset is reported back, so the blurred copy can be drawn
   * at the destination it was actually measured from. Clamping the width
   * without reporting the offset is what re-created the wrap drift this was
   * meant to remove: sample 0..999, stretch it across -200..800. */
  const _blur = document.createElement("canvas");
  function sampleBehind(ctx, rect) {
    try {
      const W = ctx.canvas.width, H = ctx.canvas.height;
      const dx = Math.round(rect.x), dy = Math.round(rect.y);
      const dw = Math.round(rect.w), dh = Math.round(rect.h);
      const x0 = Math.max(0, dx), y0 = Math.max(0, dy);
      const bw = Math.min(W, dx + dw) - x0;
      const bh = Math.min(H, dy + dh) - y0;
      if (bw < 6 || bh < 6) return null;
      const d = ctx.getImageData(x0, y0, bw, bh).data;

      let r = 0, g = 0, b = 0, n = 0;
      for (let i = 0; i < d.length; i += 16) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
      if (!n) return null;
      r /= n; g /= n; b /= n;
      const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

      // Chroma: how colourful the room is where he stands. A lamplit room is
      // muted; the sprite is a product-shot red, and leaving that difference in
      // place is one of the loudest "pasted" signals there is.
      let cSum = 0, cN = 0;
      for (let i = 0; i < d.length; i += 16) {
        const hi = d[i] > d[i + 1] ? (d[i] > d[i + 2] ? d[i] : d[i + 2])
                                   : (d[i + 1] > d[i + 2] ? d[i + 1] : d[i + 2]);
        const lo = d[i] < d[i + 1] ? (d[i] < d[i + 2] ? d[i] : d[i + 2])
                                   : (d[i + 1] < d[i + 2] ? d[i + 1] : d[i + 2]);
        cSum += hi - lo; cN++;
      }
      const chroma = cN ? (cSum / cN) / 255 : 0.25;

      // Film-grain estimate. A phone photo of a lamplit room carries real sensor
      // noise; a clean studio cut-out carries none, and that mismatch alone is
      // enough for the eye to call him "added". A Laplacian response of unit
      // noise has mean magnitude 4*sqrt(5) ~= 8.94, so sigma ~= mean/8.94.
      let as = 0, an = 0;
      const stride = bw * 4;
      for (let y = 1; y < bh - 1; y += 2) {
        for (let x = 1; x < bw - 1; x += 2) {
          const i = (y * bw + x) * 4;
          as += Math.abs(4 * d[i] - d[i - 4] - d[i + 4] - d[i - stride] - d[i + stride]);
          an++;
        }
      }
      const noise = an ? Math.min(0.035, (as / an) / 8.94 / 255) : 0;

      // A blurred copy of the room, used for the light wrap.
      if (_blur.width !== bw || _blur.height !== bh) { _blur.width = bw; _blur.height = bh; }
      const bg = _blur.getContext("2d");
      // putImageData ignores composite state and always replaces the rectangle
      // it is given, so no `copy` is needed here; the size check above is what
      // keeps a previous, differently-sized photo from surviving in the margins.
      bg.putImageData(new ImageData(new Uint8ClampedArray(d), bw, bh), 0, 0);
      bg.filter = "blur(" + Math.max(2, bw * 0.05).toFixed(1) + "px)";
      bg.drawImage(_blur, 0, 0);
      bg.filter = "none";
      return { r: r / 128, g: g / 128, b: b / 128, lum: lum, noise: noise,
               chroma: chroma, blur: _blur, w: bw, h: bh,
               ox: x0 - dx, oy: y0 - dy };
    } catch (e) { return null; }
  }

  /* How sharp is this photograph overall?
   *
   * Measured from the WHOLE frame, once per photo, and cached — not from the
   * patch behind Santa. A camera has one focus plane, so "how defocused is
   * this room" is a property of the photograph, not of the square Santa
   * happens to be standing in. Measuring locally also had a nasty failure: a
   * blank wall has almost no gradient, which reads as "totally defocused", so
   * standing him against a plain wall blurred him into a ghost.
   *
   * Caching per photo generation means dragging him costs nothing: the
   * expensive full-canvas readback happens once, not once per pointer event. */
  let _sharpCache = { gen: -1, value: 0 };
  function frameSharpness(ctx) {
    if (_sharpCache.gen === _photoGen) return _sharpCache.value;
    let value = 0;
    try {
      // A bounded region: the top-left 1024px square carries the same focus
      // information as the whole frame and keeps the one-off readback small.
      const w = Math.min(ctx.canvas.width, 1024);
      const h = Math.min(ctx.canvas.height, 1024);
      value = sharpnessOf(ctx.getImageData(0, 0, w, h).data, w, h, false);
    } catch (e) { value = 0; }
    _sharpCache = { gen: _photoGen, value: value };
    return value;
  }

  /* Mean horizontal gradient over mean level. High = crisp, low = defocused.
   * Sampled on a stride because this runs on every frame of a drag. `gated`
   * skips transparent pixels, which matters for the sprite: its alpha edges
   * are a cliff, not detail, and would score as infinite sharpness. */
  function sharpnessOf(d, w, h, gated) {
    let g = 0, n = 0, lvl = 0;
    for (let y = 2; y < h - 2; y += 3) {
      for (let x = 2; x < w - 2; x += 3) {
        const i = (y * w + x) * 4;
        // Both pixels have to be opaque. Testing only the first pixel counted
        // the step from Santa to transparency as photographic detail, which
        // made every cut-out appear much sharper than it really was and drove
        // the matcher to its maximum blur.
        if (gated && (d[i + 3] < 220 || d[i + 7] < 220)) continue;
        const a = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
        const b = 0.2126 * d[i + 4] + 0.7152 * d[i + 5] + 0.0722 * d[i + 6];
        g += Math.abs(b - a); lvl += a; n++;
      }
    }
    return n ? (g / n) / (lvl / n / 255 + 0.10) : 0;
  }

  /* Bring Santa's sharpness down to the room's. Searching a handful of radii
   * beats a closed-form guess because the relationship between a canvas blur
   * radius and the resulting gradient energy is not linear.
   *
   * applyBlur() blurs what is already there, so the radii combine. Independent
   * Gaussian passes add VARIANCES: 0.7 then 1.2 is replayed as
   * sqrt(0.7² + 1.2²), not 1.9. The key carries photo generation, character
   * identity and the measured natural sharpness as well as the target. */
  const _dof = document.createElement("canvas");
  const _dofCache = {};
  let _photoGen = 0;
  function measureSprite(col) {
    const g = col.getContext("2d");
    return sharpnessOf(g.getImageData(0, 0, g.canvas.width, g.canvas.height).data,
                       g.canvas.width, g.canvas.height, true);
  }

  /* Independent Gaussian passes combine by VARIANCE, not by adding radii. */
  function combineGaussianRadii(radii) {
    let variance = 0;
    for (const r of radii) variance += r * r;
    return +Math.sqrt(variance).toFixed(2);
  }

  function matchDefocus(col, target, charKey, poseKey) {
    const g = col.getContext("2d");
    const natural = measureSprite(col);
    // The room score includes broad walls and upholstery while the cut-out
    // score includes a beard and fur. They are useful as a direction, not as
    // equal test charts. The old 45% floor let this room drive all four blur
    // passes and dissolved Santa into a grey ghost beside a still-crisp table.
    // Keep at least 72% of his captured detail and cap the optical correction
    // to roughly one display pixel; edge integration is handled separately.
    const want = Math.max(target || 0, natural * 0.72);
    if (!(natural > 0)) return 0;
    const key = _photoGen + ":" + charKey + ":" +
                g.canvas.width + "x" + g.canvas.height + ":" + poseKey +
                ":" + natural.toFixed(2) + ":" + want.toFixed(2);
    if (_dofCache[key] !== undefined) {
      const cached = _dofCache[key];
      if (cached > 0) applyBlur(col, cached);
      return cached;
    }
    if (!(natural > want * 1.10)) { _dofCache[key] = 0; return 0; }
    const applied = [];
    for (const r of [0.45, 0.8]) {
      applied.push(r);
      applyBlur(col, r);
      if (measureSprite(col) <= want * 1.10) break;
    }
    const effective = combineGaussianRadii(applied);
    _dofCache[key] = effective;
    return effective;
  }

  function applyBlur(canvas, radius) {
    const g = canvas.getContext("2d");
    const w = canvas.width, h = canvas.height;
    if (_dof.width !== w || _dof.height !== h) { _dof.width = w; _dof.height = h; }
    const dg = _dof.getContext("2d");
    dg.globalCompositeOperation = "copy";
    dg.drawImage(canvas, 0, 0);
    dg.globalCompositeOperation = "source-over";
    g.clearRect(0, 0, w, h);
    g.filter = "blur(" + radius.toFixed(2) + "px)";
    g.drawImage(_dof, 0, 0);
    g.filter = "none";
  }

  /* Deterministic per-pixel hash. Grain has to be stable across frames: noise
   * that re-rolls while the picture is being dragged reads as live video noise
   * over a still photograph, which is its own kind of giveaway. */
  function hashNoise(i, x, y) {
    let n = (i * 2654435761 + x * 40503 + y * 2246822519) >>> 0;
    n ^= n >>> 15; n = Math.imul(n, 2246822519); n ^= n >>> 13;
    return ((n >>> 8) / 8388608) - 1;   // -1 .. 1
  }

  /* White-balance factors are deliberately bounded. A neutral sample remains
   * exactly (1,1,1), while a pure-blue wall cannot multiply blue by 10x and
   * crush the other channels. Adaptation also weakens as room chroma rises:
   * saturated furniture is an object colour, not necessarily the illuminant. */
  function whiteBalanceGains(room, hasBehind) {
    if (!hasBehind) return { r: 1, g: 1, b: 1 };
    const rl = 0.2126 * room.r, gl = 0.7152 * room.g, bl = 0.0722 * room.b;
    const sum = rl + gl + bl;
    // Black has no chromaticity to adapt to; treating zero as three zero
    // channel shares would dim every channel even though the sample is neutral.
    if (!(sum > 1e-6)) return { r: 1, g: 1, b: 1 };
    const raw = {
      r: (rl / sum) / 0.2126,
      g: (gl / sum) / 0.7152,
      b: (bl / sum) / 0.0722,
    };
    const hi = Math.max(room.r || 0, room.g || 0, room.b || 0);
    const lo = Math.min(room.r || 0, room.g || 0, room.b || 0);
    const measuredChroma = hi > 0 ? (hi - lo) / hi : 0;
    const chroma = Math.max(0, Math.min(1,
      room.chroma === undefined ? measuredChroma : room.chroma));
    // Gentler than a full adaptation, and weaker still as the sample gets more
    // colourful. The wall behind Santa's head is a BOUNCE surface lit by the
    // lamp, not the light source itself; adapting hard to it double-counts the
    // warmth and turns him orange against a cream wall.
    const strength = 0.55 * (1 - 0.80 * chroma);
    const adapt = (v) => 1 + (Math.max(0.65, Math.min(1.45, v)) - 1) * strength;
    return { r: adapt(raw.r), g: adapt(raw.g), b: adapt(raw.b) };
  }

  function despillPixels(d) {
    for (let i = 0; i < d.length; i += 4) {
      if (!d[i + 3]) continue;
      const alpha = d[i + 3];
      // Generated plates retain very faint blue/green backdrop dust well away
      // from the body. It is almost invisible on transparency but turns into a
      // coloured rectangle after blur and light wrap. Remove only translucent,
      // strongly backdrop-coloured pixels; opaque eyes, suit and fur are not
      // eligible.
      const blueBackdrop = d[i + 2] > d[i] * 1.18 &&
                           d[i + 2] > d[i + 1] * 1.06 &&
                           d[i + 2] - d[i] > 24;
      const greenBackdrop = d[i + 1] > d[i] * 1.18 &&
                            d[i + 1] > d[i + 2] * 1.08 &&
                            d[i + 1] - d[i] > 20;
      if (alpha < 18 || (alpha < 112 && (blueBackdrop || greenBackdrop))) {
        d[i] = d[i + 1] = d[i + 2] = d[i + 3] = 0;
        continue;
      }
      const rb = Math.max(d[i], d[i + 2]);
      const excess = d[i + 1] - rb;
      if (excess > 12 && d[i + 1] > d[i] * 1.08 &&
          d[i + 1] > d[i + 2] * 1.08) {
        const keep = d[i + 3] < 250 ? 0 : 0.15;
        d[i + 1] = rb + excess * keep;
      }
    }
  }

  function despillCanvas(canvas) {
    try {
      const g = canvas.getContext("2d");
      const image = g.getImageData(0, 0, canvas.width, canvas.height);
      despillPixels(image.data);
      g.putImageData(image, 0, 0);
    } catch (e) { /* tainted canvas: leave the source unchanged */ }
  }

  /* Match Santa to the room: exposure, white balance, directional light,
   * saturation and grain. */
  function integrateIntoRoom(canvas, behind, tint, light) {
    try {
      const g = canvas.getContext("2d");
      const img = g.getImageData(0, 0, canvas.width, canvas.height);
      const d = img.data;

      const room = behind || { r: tint.r, g: tint.g, b: tint.b, lum: 0.5, noise: 0, chroma: 0 };
      const targetLum = room.lum;

      // Green-screen de-spill. The delivered cut-outs retain a thin saturated
      // green key line around fur and boots; blur and light wrap otherwise
      // spread that line into a visible halo. Santa has no green costume
      // material, so only strongly green-dominant pixels are neutralised.
      despillPixels(d);

      // White balance: move Santa toward the room's chromaticity.
      // Each channel's share of the room's luminance is compared with that
      // channel's own luminance coefficient, so a NEUTRAL room gives exactly
      // (1,1,1) and changes nothing. The previous version divided by invented
      // constants (0.333 / 0.588 / 0.079), which for a grey room produced
      // gains of 0.73 / 1.16 / 0.94 — a strong green cast on every single
      // composite, in every room, including a colour-neutral one.
      const wb = whiteBalanceGains(room, !!behind);

      // Saturation is matched to the ROOM rather than dialled to a fixed guess.
      // A fixed 0.18 is right for a warm lamplit room and far too little for a
      // bright neutral one; measuring both sides gets it right either way.
      let cHi = 0, cLo = 0, cN = 0, santaLumSum = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] < 220) continue;
        const R = d[i], G = d[i + 1], B = d[i + 2];
        cHi += Math.max(R, G, B); cLo += Math.min(R, G, B); cN++;
        santaLumSum += (0.2126 * R + 0.7152 * G + 0.0722 * B) / 255;
      }
      const santaChroma = cN ? (cHi - cLo) / cN / 255 : 0.3;
      const santaLum = cN ? santaLumSum / cN : 0.45;
      // Exposure is one photographic operation over the subject. Adjusting
      // every pixel toward the same room average crushed white fur downward
      // while lifting the dark suit, removing the contrast a real camera would
      // preserve. A bounded global gain keeps whites, folds and beard texture.
      const subjectTarget = Math.max(0.24, Math.min(0.68, targetLum * 1.10));
      const rawExposure = subjectTarget / Math.max(0.08, santaLum);
      /* The gain is deliberately capped low and applied at 45% strength.
         Santa's white beard is the brightest thing on him by a wide margin,
         and a generous exposure gain aimed at a brightly-lit wall behind his
         head pushed every highlight past 255 and clipped them flat. That is
         not a subtle grade, it destroys the modelling on his face and is the
         single most obvious "cut-out" artefact at 3x zoom: the beard reads as
         a solid white shape with no form at all. Matching overall brightness
         matters less than keeping his highlights intact. */
      const exposure = 1 + (Math.max(0.80, Math.min(1.10, rawExposure)) - 1) * 0.45;

      // Pull saturation only part-way toward the room. Furniture chroma is not
      // an illuminant reading, and the earlier 45% cap washed the suit grey.
      const DESAT = room.chroma > 0 && santaChroma > room.chroma
        ? Math.min(0.32, (1 - room.chroma / santaChroma) * 0.62)
        : 0.08;

      const grain = room.noise ? Math.min(14, room.noise * 255) : 0;
      const W = canvas.width, H = canvas.height;
      const sourceLeft = !light || light.x === undefined || light.x <= 0;

      for (let y = 0, i = 0; y < H; y++) {
        for (let x = 0; x < W; x++, i += 4) {
          if (!d[i + 3]) continue;
          let R = d[i], G = d[i + 1], B = d[i + 2];

          // (a) one exposure correction, preserving subject contrast.
          R *= exposure; G *= exposure; B *= exposure;

          // (b) white balance toward the room's
          R *= wb.r;
          G *= wb.g;
          B *= wb.b;

          // (c) Directional room light. The configured source side carries a
          // warm, slightly brighter key; the opposite side receives weaker,
          // cooler window fill. Kept gentle: this stacks on top of the exposure
          // gain, and at the earlier 8.5% it was enough on its own to blow the
          // white beard out on the key side while leaving the fill side dark —
          // which reads as a studio rim light, not a room lamp.
          const u = W > 1 ? x / (W - 1) : 0.5;
          const v = H > 1 ? y / (H - 1) : 0.5;
          const keySide = sourceLeft ? 1 - u : u;
          const fillSide = 1 - keySide;
          const shape = 0.980 + keySide * 0.045 + (1 - v) * 0.012;
          R *= shape * (1 + keySide * 0.040 - fillSide * 0.012);
          G *= shape * (1 + keySide * 0.010);
          B *= shape * (1 - keySide * 0.042 + fillSide * 0.026);

          // (d) a little desaturation
          const l2 = 0.2126 * R + 0.7152 * G + 0.0722 * B;
          R = l2 + (R - l2) * (1 - DESAT);
          G = l2 + (G - l2) * (1 - DESAT);
          B = l2 + (B - l2) * (1 - DESAT);

          // (e) Highlight rolloff, the way a camera behaves. Everything above
          //     compresses toward white instead of clipping flat at 255. Without
          //     this the beard and the fur trim lose all internal detail the
          //     moment any gain is applied, and a clipped highlight is exactly
          //     what the eye reads as "this is not photographic".
          const peak = Math.max(R, G, B);
          if (peak > 232) {
            const over = peak - 232;
            const rolled = 232 + (over * 23) / (23 + over);
            const k = rolled / peak;
            R *= k; G *= k; B *= k;
          }

          // (e) grain at the room's own level, so he is not the only clean
          //     thing in a noisy photograph.
          if (grain > 0.4) {
            const nz = hashNoise(i, x, y) * grain;
            R += nz; G += nz; B += nz;
          }

          d[i] = clamp255(R); d[i + 1] = clamp255(G); d[i + 2] = clamp255(B);
        }
      }
      g.putImageData(img, 0, 0);
    } catch (e) { /* tainted canvas: leave the sprite as it is */ }
  }



  /* His silhouette projected onto the floor, plus tight contact under each
   * boot. The broad part is translucent and soft enough for rug texture to
   * remain visible; the boot cores are short and darker. */
  const _shadow = document.createElement("canvas");
  const _shadowRaw = document.createElement("canvas");
  function groundShadow(src, p, light) {
    const lx = light && light.x !== undefined ? light.x : -0.55;
    const lean = -lx * p.size * 0.18;
    const castH = Math.max(10, p.size * 0.115);
    const w = Math.max(8, Math.ceil(src.w * 0.92 + Math.abs(lean) + 20));
    const h = Math.max(8, Math.ceil(castH + p.size * 0.035));
    if (_shadow.width !== w || _shadow.height !== h ||
        _shadowRaw.width !== w || _shadowRaw.height !== h) {
      _shadow.width = w; _shadow.height = h;
      _shadowRaw.width = w; _shadowRaw.height = h;
    }
    const raw = _shadowRaw.getContext("2d");
    raw.setTransform(1, 0, 0, 1, 0, 0);
    raw.globalCompositeOperation = "source-over";
    raw.clearRect(0, 0, w, h);

    // Project the real alpha: top-of-head lands furthest from the boots.
    const baseX = w / 2, baseY = h - Math.max(3, p.size * 0.012);
    const widthScale = 0.70;
    raw.setTransform(
      widthScale, 0,
      -lean / src.h, castH / src.h,
      baseX - widthScale * src.originX + lean,
      baseY - castH
    );
    raw.drawImage(src.mask, 0, 0);
    raw.setTransform(1, 0, 0, 1, 0, 0);
    raw.globalCompositeOperation = "source-in";
    raw.fillStyle = "rgba(45,34,25,0.24)";
    raw.fillRect(0, 0, w, h);
    raw.globalCompositeOperation = "source-over";

    const g = _shadow.getContext("2d");
    g.clearRect(0, 0, w, h);
    g.filter = "blur(" + Math.max(3, p.size * 0.009).toFixed(1) + "px)";
    g.drawImage(_shadowRaw, 0, 0);
    g.filter = "none";

    // Separate boot contacts stop the projected shadow from reading as a
    // detached puddle. Their near edge is only a couple of pixels soft.
    const bootGap = Math.max(4, src.w * 0.105);
    const bootW = Math.max(4, src.w * 0.105);
    const bootH = Math.max(2, p.size * 0.008);
    g.fillStyle = "rgba(32,24,19,0.32)";
    g.beginPath();
    g.ellipse(baseX - bootGap, baseY, bootW, bootH, 0, 0, 7);
    g.ellipse(baseX + bootGap, baseY, bootW, bootH, 0, 0, 7);
    g.fill();
    return _shadow;
  }

  function drawGlow(ctx, p, size) {
    // Kept deliberately small and faint: a glow that covers the room reads as a
    // lens flare, not as warmth. It should hint at Santa, not announce him.
    const r = size * 0.5;
    const g = ctx.createRadialGradient(p.x, p.y - size * 0.45, r * 0.05, p.x, p.y - size * 0.45, r);
    g.addColorStop(0, "rgba(255,214,140,0.16)");
    g.addColorStop(0.55, "rgba(255,214,140,0.06)");
    g.addColorStop(1, "rgba(255,214,140,0)");
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(p.x, p.y - size * 0.45, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /* The sticker problem, part one: a contact shadow. Without it the character
   * floats. It is offset along a light direction (default: light from the
   * upper left, the most common in interior photos) and softens as he rises. */
  function drawContactShadow(ctx, p, size, light) {
    const lx = (light && light.x) || -0.55;
    const ly = (light && light.y) || 0.35;
    const off = size * 0.16;
    ctx.save();
    ctx.translate(p.x + lx * off, p.y + ly * off);
    ctx.scale(1, 0.26);
    const g = ctx.createRadialGradient(0, 0, size * 0.02, 0, 0, size * 0.34);
    g.addColorStop(0, "rgba(0,0,0,0.42)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, size * 0.34, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  /* The sticker problem, part two: put Santa in the same colour world as the
   * room. Sampled once from the lower part of the photo (usually floor) and
   * applied as a gentle warm/cool tint — deliberately weak, because too much
   * and it looks like a filter rather than light. */
  function sampleRoomColour(ctx, w, h) {
    try {
      const d = ctx.getImageData(Math.floor(w * 0.2), Math.floor(h * 0.82),
                                  Math.max(1, Math.floor(w * 0.6)), 8).data;
      let r = 0, g = 0, b = 0, n = 0;
      for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
      if (!n) return { r: 1, g: 1, b: 1 };
      return { r: (r / n) / 128, g: (g / n) / 128, b: (b / n) / 128 };
    } catch (e) { return { r: 1, g: 1, b: 1 }; }
  }

  /* Scratch canvas for the light wrap: the blurred room, clipped to Santa. */
  const _wrap = document.createElement("canvas");
  const _erode = document.createElement("canvas");

  /* A blank occlusion mask at photo size. White means "these pixels are in
   * front of Santa and must be laid back over him". The UI owns the brush. */
  function newOcclusionMask(w, h) {
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    return c;
  }

  /* Lay the room back over Santa through the user's mask. The mask edge is
   * feathered, because a hard-edged cut back onto a sofa arm is its own kind
   * of seam. */
  const _front = document.createElement("canvas");
  function applyOcclusion(ctx, scene) {
    const occ = scene.occlusion;
    if (!occ || !occ.width || !occ.height) return;
    try {
      const w = scene.w, h = scene.h;
      if (_front.width !== w || _front.height !== h) { _front.width = w; _front.height = h; }
      const fg = _front.getContext("2d");
      fg.globalCompositeOperation = "copy";
      fg.drawImage(scene.photo, 0, 0, w, h);
      fg.globalCompositeOperation = "destination-in";
      // Preserve the photographed furniture edge. A multi-pixel blur made the
      // table visibly softer only where it crossed Santa; half a pixel removes
      // a binary mask stair-step without inventing a fuzzy seam.
      fg.filter = "blur(0.55px)";
      fg.drawImage(occ, 0, 0, w, h);
      fg.filter = "none";
      fg.globalCompositeOperation = "source-over";
      ctx.drawImage(_front, 0, 0);
    } catch (e) { /* nothing to occlude with */ }
  }

  /* ------------------------------------------------------------ the render */
  function renderFrame(ctx, Santa, scene, timeSeconds) {
    const { w, h, place, stick, refCm, pose, refKey, photo, matchLight } = scene;
    const t = Math.max(0, Math.min(1, (timeSeconds || 0) / 11.6));

    ctx.clearRect(0, 0, w, h);
    if (photo) ctx.drawImage(photo, 0, 0, w, h);
    else return;

    // Cache the PHOTO'S sharpness before a shadow, sprite or occlusion pixels
    // can contaminate the supposedly photo-only measurement.
    const photoSharpness = matchLight === false ? 0 : frameSharpness(ctx);
    const p = solveStatic(place, stick, refCm, w, h, pose, refKey, isSeated(Santa, pose));

    const use = pose || "sit";
    const scale = p.size / Santa.height * poseScaleOf(Santa, use);
    const src = offscreenFor(Santa, use, p, scale);
    if (!src) {
      Santa.toCanvas(ctx, Santa.build(use), { x: p.x, y: p.y, scale, flip: false });
      applyOcclusion(ctx, scene);
      return;
    }

    if (matchLight === false) {
      // Light matching off: draw him straight, still with a contact shadow so
      // he is not floating. Occlusion still applies — it has nothing to do with
      // lighting, and returning early here used to silently un-hide him from
      // the furniture the user had just painted him behind.
      drawContactShadow(ctx, p, p.size, scene.light);
      despillCanvas(src.col);
      ctx.drawImage(src.col, p.x - src.originX, p.y - src.h, src.w, src.h);
      applyOcclusion(ctx, scene);
      return;
    }

    /* Blending him into the room, rather than dropping him on top of it.
     *
     * Three things used to make him read as a pasted sticker, and all three are
     * gone here:
     *
     *  1. A `screen`-blended radial GLOW the size of the whole figure. A halo
     *     is the single loudest "this was pasted on" signal there is. Removed.
     *  2. The room tint was painted over the ENTIRE canvas in `overlay` at
     *     30%, which regraded the user's own photograph and did not actually
     *     match Santa to it. The grade now applies to Santa alone.
     *  3. The contact shadow was a generic ellipse that did not follow his
     *     outline. It is now built from his own alpha, so it only darkens the
     *     floor where his body actually is. */
    // The sprite is FEET-anchored: inside the scratch canvas his boots sit on
    // the bottom edge. So the destination's top-left is (p.x - w/2, p.y - h) --
    // drawing at p.x/p.y instead puts him a whole sprite-height too low and he
    // clips off the bottom of the picture.
    const dx = p.x - src.originX;
    const dy = p.y - src.h;

    // 1. MEASURE THE ROOM BEFORE TOUCHING IT. The sample has to be the room the
    //    user photographed. An earlier order drew the ground shadow first and
    //    then measured, so luminance, sharpness, noise and white balance were
    //    partly readings of the app's own shadow rather than of the photograph.
    const behind = sampleBehind(ctx, { x: dx, y: dy, w: src.w, h: src.h });

    // 2. GROUNDING. This has to be a shadow ON THE FLOOR, not his outline
    //    drawn behind him: blurring his full silhouette and offsetting it just
    //    produces a halo hugging his edges, which is exactly the "pasted on"
    //    look this was supposed to remove. A real contact shadow is his
    //    footprint squashed flat to the floor plane and thrown in the light's
    //    direction, so it is darkest directly under his boots.
    // Remove faint keyed-backdrop dust from the alpha used to cast the shadow.
    // The colour plate receives the same cleanup during integration below.
    despillCanvas(src.mask);
    const flat = groundShadow(src, p, scene.light);
    const groundY = p.y;
    if (flat) {
      ctx.save();
      ctx.globalCompositeOperation = "multiply";
      ctx.drawImage(flat, p.x - flat.width / 2, groundY - flat.height + 3,
                    flat.width, flat.height);
      ctx.restore();
    }

    // 3. Fit him to the room. Four separate corrections, because a pasted
    //    subject usually fails all four at once:
    //
    //    a. LUMINANCE. He was shot studio-lit; the room is lamplit. Matching
    //       brightness to the pixels BEHIND him is the single biggest tell.
    //    b. COLOUR TEMPERATURE. Warm rooms warm him, cool rooms cool him.
    //    c. SATURATION. A subject lit by a room's light is never as vivid as
    //       one lit for a product shot.
    //    d. GRAIN. Phone photos of lamplit rooms are noisy; a clean cut-out in
    //       one looks like a sticker even when the light matches.
    //
    //    (a) and (b) need the room behind him, so they read real pixels rather
    //    than a single average taken from the bottom of the frame.
    integrateIntoRoom(src.col, behind, scene.tint, scene.light);
    // Defocus last: it has to measure the graded sprite, because grading changes
    // how much contrast is left for the eye to read as "sharp". The target is
    // the photograph's own focus, cached once per photo.
    if (behind) matchDefocus(src.col, photoSharpness, characterKey(Santa), use);

    // 3. Composite with a photographic edge, without blurring his face and
    // beard. Blur the ALPHA by half a pixel and keep the interior colour plate
    // intact; filtering the whole sprite was compounding the depth matcher and
    // made him markedly softer than the table beside him.
    const mg = src.mask.getContext("2d");
    mg.globalCompositeOperation = "copy";
    mg.filter = "blur(0.5px)";
    mg.drawImage(src.col, 0, 0);
    mg.filter = "none";
    mg.globalCompositeOperation = "source-over";
    const cg = src.col.getContext("2d");
    cg.globalCompositeOperation = "destination-in";
    cg.drawImage(src.mask, 0, 0);
    cg.globalCompositeOperation = "source-over";
    // Refresh the mask after matte cleanup, defocus and edge treatment so the
    // light-wrap rim follows the pixels that were actually composited.
    mg.globalCompositeOperation = "copy";
    mg.drawImage(src.col, 0, 0);
    mg.globalCompositeOperation = "source-over";
    ctx.drawImage(src.col, dx, dy, src.w, src.h);

    // 4. LIGHT WRAP — a RIM, not a second grade.
    //    The room's light catching his silhouette is what stops a cut-out
    //    boundary reading as a sticker. It must therefore touch only the rim.
    //    The previous version masked to his FULL alpha and multiplied the
    //    blurred room across his entire opaque body: since `multiply` can only
    //    darken, that was a second full-body colour treatment stacked on top
    //    of integrateIntoRoom, which made him muddier while the comment
    //    promised an edge effect it never produced.
    //    The rim is his alpha minus the same alpha knocked out from four
    //    directions — i.e. his silhouette minus its erosion, a band ~2px wide.
    if (behind) {
      const wrap = _wrap;
      if (wrap.width !== src.w || wrap.height !== src.h) {
        wrap.width = src.w; wrap.height = src.h;
      }
      if (_erode.width !== src.w || _erode.height !== src.h) {
        _erode.width = src.w; _erode.height = src.h;
      }
      const wg = wrap.getContext("2d");
      const eg = _erode.getContext("2d");
      // Erosion is the INTERSECTION of shifted masks. Build that on its own
      // canvas, then subtract it from the original alpha to leave only a rim.
      const e = src.h >= 700 ? 3 : 2;
      eg.globalCompositeOperation = "copy";
      eg.drawImage(src.mask, 0, 0);
      eg.globalCompositeOperation = "destination-in";
      eg.drawImage(src.mask, -e, 0);
      eg.drawImage(src.mask, e, 0);
      eg.drawImage(src.mask, 0, -e);
      eg.drawImage(src.mask, 0, e);
      eg.globalCompositeOperation = "source-over";

      wg.globalCompositeOperation = "copy";
      wg.drawImage(src.mask, 0, 0);
      wg.globalCompositeOperation = "destination-out";
      wg.drawImage(_erode, 0, 0);
      wg.globalCompositeOperation = "source-in";
      wg.drawImage(behind.blur, behind.ox, behind.oy, behind.w, behind.h);
      wg.globalCompositeOperation = "source-over";
      ctx.save();
      // Light entering the lens around a silhouette lifts an edge; multiply
      // could only darken it and created a cut-out outline.
      ctx.globalCompositeOperation = "screen";
      ctx.globalAlpha = 0.18;
      ctx.drawImage(wrap, dx, dy, src.w, src.h);
      ctx.restore();
    }

    // 5. OCCLUSION. Santa is pasted over every piece of furniture in the room,
    //    which is the single loudest remaining tell: he sits on top of the
    //    coffee table instead of behind it. There is no honest way to detect
    //    that from an arbitrary photograph without a depth model, so the user
    //    paints the things that stand in front of him and the ORIGINAL room
    //    pixels are laid back over him through that mask. Same pixels, exact
    //    edges, no guessing.
    applyOcclusion(ctx, scene);
  }

  /* Drop everything the engine is holding that came out of the user's photo.
   *
   * "Forget my photo" clears the <img>, the mask and the visible canvas, but
   * the engine also keeps photo-derived pixels in module-level scratch
   * canvases — the blurred room sample, the occlusion re-composite, the light
   * wrap, the graded sprite — plus a cache of sharpness answers measured from
   * the room. The page promises it holds nothing once the photo is forgotten
   * (docs/dpia-santas-visit.md), so this has to actually empty them rather
   * than leave them for the tab's lifetime. */
  function disposePhotoData() {
    for (const c of [_blur, _front, _wrap, _erode, _dof, _shadow, _shadowRaw]) {
      try { c.width = 1; c.height = 1; } catch (e) { /* detached */ }
    }
    try {
      if (_scratch.col) { _scratch.col.width = 1; _scratch.col.height = 1; }
      if (_scratch.mask) { _scratch.mask.width = 1; _scratch.mask.height = 1; }
      _scratch.col = null; _scratch.mask = null;
    } catch (e) { /* detached */ }
    for (const k in _dofCache) delete _dofCache[k];
    for (const k in _aspect) delete _aspect[k];
    _sharpCache = { gen: -1, value: 0 };
    _photoGen++;
  }

  global.Scene = {
    D2R, REFERENCES, SEATED_HEIGHT_M, STANDING_HEIGHT_M, STANDING_POSES,
    SEAT_REFS, SEATED_POSES, isSeated, solveStatic, renderFrame, newOcclusionMask,
    disposePhotoData,
    drawSnow, drawGlow, drawContactShadow, sampleRoomColour,
    whiteBalanceGains, combineGaussianRadii, despillCanvas,
  };
})(typeof window !== "undefined" ? window : globalThis);
