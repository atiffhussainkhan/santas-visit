/* Photoreal Santa — the drop-in replacement for the vector character.
 *
 * The engine is art-agnostic: it asks for `build(pose)` and then draws whatever
 * comes back through `toCanvas` / `toSVG`. This module satisfies that same
 * interface using photographic poses, so commissioned art swaps in without a
 * single change to engine.js, postcards.js or export.js.
 *
 * WHY THIS EXISTS. The vector Santa proved the mechanism — placement, walk path,
 * perspective, light matching — but a flat cartoon on a photograph reads as a
 * sticker. A photographed Santa, graded into the room's light, is the product.
 * The integration point is built now so that when the art arrives it is a file
 * drop, not a refactor.
 *
 * EXPECTED ART (see docs/commission-brief.md for the full brief):
 *   assets/santa/stand.png, walk.png, walk2.png, sit.png, reach.png,
 *   drink.png, eat.png, wave.png, cheer.png
 * Each is a transparent PNG of the same person at the same scale, feet on a
 * common baseline, front-lit and neutral so the grade can place him in any room.
 *
 * This module degrades honestly: with no art present it reports exactly what is
 * missing rather than rendering a broken figure.
 */
(function (global) {
  "use strict";

  // Must match Santa.poses in santa.js, or the timeline's pose names will not
  // resolve. The engine asks for a pose by name; this is the translation table.
  const REQUIRED = ["stand", "walk", "walk2", "sit", "reach", "drink", "eat", "wave", "cheer"];

  const state = {
    images: {},        // pose -> HTMLImageElement
    loaded: false,
    missing: [],
    // Feet-anchored: the source is drawn with its baseline at y=0, so the
    // composer can scale him by height and place his feet on the floor line.
    sourceHeight: 0,   // px tall in the source image
    anchorRatio: 1,    // fraction of sourceHeight from the TOP to the feet
    bodyPixels: {},    // pose -> measured central hat/head-to-boot alpha span
    poseScale: {},     // pose -> sourceHeight/bodyPixels correction
  };

  /* Resolve the sprite folder against THIS SCRIPT, not against the page.
   *
   * `new URL("assets/santa/", location.href)` is page-relative, so it resolves
   * correctly only while the page happens to sit next to the assets folder. The
   * moment it does not — a subdirectory, a harness under tools/, a CDN path —
   * every sprite 404s and load() resolves with loaded=false, and the app
   * silently falls back to the cartoon vector Santa. That failure looks like
   * "the art is a cartoon" rather than "the art failed to load", which is
   * exactly how it was misdiagnosed twice.
   *
   * Resolving against this file's own URL makes it correct from any location. */
  const SELF_URL = (typeof document !== "undefined" && document.currentScript)
    ? document.currentScript.src : null;

  function base() {
    if (SELF_URL) return new URL("assets/santa/", SELF_URL).href;
    return new URL("assets/santa/", location.href).href;
  }

  /* Load the set. Returns a report rather than throwing, so the UI can tell the
   * user precisely which pose is missing rather than failing opaquely. */
  function load(onProgress) {
    const names = REQUIRED.slice();
    let done = 0;
    state.missing = [];
    state.images = {};
    state.loaded = false;
    state.sourceHeight = 0;
    state.bodyPixels = {};
    for (const k in state.poseScale) delete state.poseScale[k];

    return new Promise((resolve) => {
      const finish = () => {
        if (done !== names.length) return;
        measurePoseScales();
        state.loaded = state.missing.length === 0;
        resolve(report());
      };
      names.forEach((pose) => {
        const img = new Image();
        img.onload = () => {
          if (!state.sourceHeight) {
            state.sourceHeight = img.naturalHeight;
            // The feet sit on the bottom edge of the frame by convention, but a
            // delivered sprite often has a few px of margin; the brief asks for
            // feet exactly on the bottom row, so the default is 1.0.
            state.anchorRatio = 1;
          }
          state.images[pose] = img;
          done++;
          if (onProgress) onProgress(done / names.length, pose);
          finish();
        };
        img.onerror = () => {
          state.missing.push(pose);
          done++;
          if (onProgress) onProgress(done / names.length, pose);
          finish();
        };
        img.src = base() + pose + ".png";
      });
    });
  }

  /* Pose scale is measured from the delivered alpha, not from the equal 1408px
   * FILE frames. Method (also reproducible offline with check_art.py): alpha
   * threshold >8; boot row = last alpha anywhere; hat/head row = first alpha
   * in the central 30–70% of frame width. That corridor deliberately excludes
   * wave's raised hand and cheer's two raised hands. The resulting
   * head-to-boot pixel span is exposed by report(). A scale of H/span makes
   * that measured body span, rather than transparent margin or raised hands,
   * the physical height engine.js asks for. No number is guessed or inferred
   * from the common frame height.
   *
   * Source frames, checked from the actual PNG IHDRs:
   * stand 628×1408; walk 609×1408; walk2 634×1408; sit 731×1408;
   * reach 617×1408; drink 675×1408; eat 616×1408; wave 742×1408;
   * cheer 928×1408. `sit` is a genuinely seated person, not a squat, and is
   * therefore also declared in seatedPoses below. */
  function measurePoseScales() {
    const c = document.createElement("canvas");
    const g = c.getContext("2d", { willReadFrequently: true });
    for (const pose of REQUIRED) {
      const img = state.images[pose];
      if (!img) continue;
      const w = img.naturalWidth, h = img.naturalHeight;
      c.width = w; c.height = h;
      g.clearRect(0, 0, w, h);
      g.drawImage(img, 0, 0);
      let top = h, bottom = -1;
      try {
        const d = g.getImageData(0, 0, w, h).data;
        const x0 = Math.floor(w * 0.30), x1 = Math.ceil(w * 0.70);
        for (let y = 0; y < h; y++) {
          let row = false, central = false;
          for (let x = 0; x < w; x++) {
            if (d[(y * w + x) * 4 + 3] <= 8) continue;
            row = true;
            if (x >= x0 && x <= x1) central = true;
          }
          if (central && top === h) top = y;
          if (row) bottom = y;
        }
      } catch (e) {
        top = 0; bottom = h - 1;
      }
      const span = bottom >= top ? bottom - top + 1 : h;
      state.bodyPixels[pose] = span;
      state.poseScale[pose] = h / span;
    }
    c.width = c.height = 1;
  }

  function report() {
    return {
      loaded: state.loaded,
      required: REQUIRED,
      present: REQUIRED.filter((p) => state.images[p]),
      missing: state.missing.slice(),
      sourceHeight: state.sourceHeight,
      bodyPixels: Object.assign({}, state.bodyPixels),
      poseScale: Object.assign({}, state.poseScale),
      /* Why the photographs did not load. A bare `missing` array reads as
       * "some poses are absent"; the URL actually asked for is what tells you
       * the folder moved or a base path is wrong. */
      base: base(),
      failed: state.missing.length > 0,
    };
  }

  /* Interface-compatible with Santa.build(): returns shape objects, but each is
   * a single image blit with the destination computed at draw time. */
  function build(poseName) {
    const pose = state.images[poseName] ? poseName
              : state.images[Object.keys(state.images)[0]] ? Object.keys(state.images)[0]
              : null;
    if (!pose) return [];
    return [{ t: "santaImage", pose }];
  }

  function draw(ctx, shapes, opts) {
    const o = opts || {};
    const scale = o.scale === undefined ? 1 : o.scale;
    ctx.save();
    ctx.translate(o.x || 0, o.y || 0);
    ctx.scale(o.flip ? -scale : scale, scale);
    for (const s of shapes) {
      if (s.t !== "santaImage") continue;
      const img = state.images[s.pose];
      if (!img) continue;
      const h = state.sourceHeight || img.naturalHeight;
      // Same convention as the vector character: local y = 0 is the feet, and
      // the caller passes a height. So draw the image with its bottom edge on
      // the origin and its top at -h.
      const w = img.naturalWidth;
      ctx.drawImage(img, -w / 2, -h, w, h);
    }
    ctx.restore();
  }

  function toCanvas(ctx, shapes, opts) { draw(ctx, shapes, opts); }

  function toSVG(shapes, opts) {
    const o = opts || {};
    const scale = o.scale === undefined ? 1 : o.scale;
    let out = "";
    for (const s of shapes) {
      if (s.t !== "santaImage") continue;
      const img = state.images[s.pose];
      if (!img) continue;
      const h = state.sourceHeight || img.naturalHeight;
      const w = img.naturalWidth;
      const href = img.src;
      const flip = o.flip ? -scale : scale;
      out += `<image href="${href}" x="${-w / 2}" y="${-h}" width="${w}" height="${h}" `
           + `transform="translate(${o.x || 0} ${o.y || 0}) scale(${flip} ${scale})" `
           + `preserveAspectRatio="none"/>`;
    }
    return out;
  }

  global.PhotorealSanta = {
    cacheKey: "photoreal-santa-v1",
    REQUIRED, load, report, build, toCanvas, toSVG,
    /* `sit.png` has bent thighs and shins and is genuinely seated, even though
     * the chair itself is transparent. The other delivered poses stand. */
    seatedPoses: { sit: 1 },
    /* PNG sprites put their origin at the frame bottom; none paints below it. */
    feetOffset: {
      stand: 0, walk: 0, walk2: 0, sit: 0, reach: 0,
      drink: 0, eat: 0, wave: 0, cheer: 0,
    },
    poseScale: state.poseScale,
    get ready() { return state.loaded; },
    /* engine.js computes scale as p.size / Santa.height, so this module has to
     * expose the same property as the vector character or the scale resolves to
     * NaN and nothing draws at all. The source sprite is feet-anchored, so its
     * full pixel height IS the character height — no unit conversion needed. */
    get height() {
      const h = state.sourceHeight;
      if (!h) throw new Error("PhotorealSanta.height read before load()");
      return h;
    },
  };
})(typeof window !== "undefined" ? window : globalThis);
