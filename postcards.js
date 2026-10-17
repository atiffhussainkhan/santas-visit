/* Postcards — three shareable keepsakes built from the user's own room.
 *
 * The scene is the payload, so a postcard is not a filter with a border; each
 * one earns its share by giving the viewer something the plain still cannot:
 *
 *   1. THE EVIDENCE  — the visit as a captured moment, no framing tricks, with
 *                      the honest-AI badge. The share people actually want.
 *   2. CERTIFICATE   — the fun keepsake. Names the visitor, the date, and what
 *                      Santa thought of the house. This is the one a parent
 *                      prints and the one a child keeps.
 *   3. WHERE HE SAT  — where he was placed in the room, marked on the
 *                      photograph, with the measurement the size came from.
 *                      Nobody else can make this, because nobody else has
 *                      your ruler.
 *
 * Drawn on canvas so they export as PNG with no server, no upload, and no
 * dependency on the character art — a photoreal Santa drops in unchanged.
 */
(function (global) {
  "use strict";

  const INK = {
    paper: "#fdfbf4", edge: "#e2d9c4", deep: "#2a2118", mute: "#7d6a52",
    red: "#c1272d", gold: "#d9a441", green: "#2f6b4f",
  };
  const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif';

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
    else {
      ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y, x, y, r);
      ctx.arcTo(x, y + h, x + w, y, r); ctx.closePath();
    }
  }
  function centerText(ctx, text, cx, y, size, colour, weight) {
    ctx.fillStyle = colour; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.font = (weight || 600) + " " + size + "px " + FONT;
    ctx.fillText(text, cx, y);
  }
  function wrap(ctx, text, cx, y, maxW, lh, size, colour, align) {
    ctx.fillStyle = colour; ctx.font = "400 " + size + "px " + FONT;
    ctx.textAlign = align || "center"; ctx.textBaseline = "middle";
    const words = String(text).split(" ");
    let line = "", yy = y;
    for (const w of words) {
      const test = line ? line + " " + w : w;
      if (ctx.measureText(test).width > maxW && line) {
        ctx.fillText(line, cx, yy); yy += lh; line = w;
      } else line = test;
    }
    ctx.fillText(line, cx, yy);
    return yy + lh;
  }

  /* The AI-disclosure mark. Not decoration: the Children's code standard on
   * transparency and MyHeritage's own practice both point the same way. Shown
   * on every export, small, once. */
  const BADGE_TEXT = "✦ AI-generated — Santa is not real";
  function badge(ctx, x, y, s) {
    ctx.save();
    ctx.globalAlpha = 0.86;
    ctx.font = "600 " + (s * 1.05) + "px " + FONT;
    ctx.textAlign = "left"; ctx.textBaseline = "middle";
    // Size the pill to the text. A fixed width looked right at one card size
    // and silently clipped the disclosure on another — and a clipped
    // disclosure is a compliance failure, not a cosmetic one.
    const tw = ctx.measureText(BADGE_TEXT).width;
    const padX = s * 0.85, pillW = tw + padX * 2, pillH = s * 1.9;
    roundRect(ctx, x, y, pillW, pillH, pillH / 2);
    ctx.fillStyle = "rgba(18,20,28,0.72)"; ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.fillText(BADGE_TEXT, x + padX, y + pillH / 2);
    ctx.restore();
    return pillW;
  }

  /* ---------------------------------------------------------------- 1. The
   * Evidence — the visit as a still, framed like a photograph, nothing faked. */
  function evidence(ctx, opts) {
    const { w, h, room, santa, place, tint } = opts;
    ctx.fillStyle = INK.paper; ctx.fillRect(0, 0, w, h);
    const m = w * 0.055, foot = h * 0.19;
    const px = m, py = m, pw = w - m * 2, ph = h - m - foot;

    // The captured frame
    ctx.save();
    roundRect(ctx, px, py, pw, ph, w * 0.012); ctx.clip();
    ctx.drawImage(room, px, py, pw, ph);
    if (tint) { ctx.globalCompositeOperation = "overlay"; ctx.globalAlpha = 0.22;
                ctx.fillStyle = tint; ctx.fillRect(px, py, pw, ph); ctx.globalAlpha = 1; }
    // snow
    ctx.fillStyle = "rgba(255,255,255,.75)";
    for (let i = 0; i < 40; i++) {
      const x = px + ((i * 97.13) % 1) * 0; // deterministic
      const rx = (Math.sin(i * 12.9898) * 43758.5453) % 1;
      const ry = (Math.sin(i * 78.233) * 12345.6789) % 1;
      ctx.globalAlpha = 0.3 + Math.abs(rx) * 0.5;
      ctx.beginPath();
      ctx.arc(px + Math.abs(rx) * pw, py + Math.abs(ry) * ph, 1.2 + Math.abs(ry) * 1.8, 0, 7);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (santa) santa(ctx, px, py, pw, ph);
    ctx.restore();

    // A hairline frame, like a mounted print
    ctx.strokeStyle = INK.edge; ctx.lineWidth = Math.max(1, w * 0.002);
    roundRect(ctx, px, py, pw, ph, w * 0.012); ctx.stroke();
    badge(ctx, px + w * 0.022, py + ph - h * 0.055, w * 0.0072);
  }

  /* ---------------------------------------------------------------- 2. The
   * Certificate — the keepsake. This is the one that gets printed. */
  function certificate(ctx, opts) {
    const { w, h, room, santa, name, date, wish } = opts;
    ctx.fillStyle = INK.paper; ctx.fillRect(0, 0, w, h);

    // Double border, like a certificate. Scaled off the SHORT side: off the
    // long side, a wide letterbox card lost so much height to the border that
    // the body copy had negative room left.
    const b = Math.min(w, h) * 0.045;
    ctx.strokeStyle = INK.gold; ctx.lineWidth = w * 0.009;
    roundRect(ctx, b, b, w - b * 2, h - b * 2, w * 0.02); ctx.stroke();
    ctx.strokeStyle = INK.edge; ctx.lineWidth = w * 0.0025;
    roundRect(ctx, b * 1.5, b * 1.5, w - b * 3, h - b * 3, w * 0.014); ctx.stroke();

    // A strip of the room across the top — their actual house, in the frame
    /* Lay this card out from a VERTICAL BUDGET, not from a scale factor.
     *
     * Two earlier attempts failed here. The original scaled every font from w
     * and every advance from h, which on a 900x560 card let a 65px name advance
     * 48px until the copy and the signature rule overprinted. The second used
     * u = min(w, h*1.25), which is 700 for this card -- so the title alone
     * landed at y=356 while the signature block started at 322. bodyRoom came
     * out NEGATIVE and wrap() was handed a negative line height, stacking lines
     * upward. Scaling a fixed recipe is what broke it both times.
     *
     * So: measure the space that actually exists, then give each element a
     * share of it. Every advance is at least 1.2x its own font, and the body
     * is handed a line height it can honour rather than one it must survive. */
    const inner = h - b * 3;          // inside both borders
    const photoH = inner * 0.16;

    ctx.save();
    roundRect(ctx, b * 1.9, b * 1.9, w - b * 3.8, photoH, w * 0.012); ctx.clip();
    ctx.drawImage(room, b * 1.9, b * 1.9, w - b * 3.8, photoH);
    if (santa) santa(ctx, b * 1.9, b * 1.9, w - b * 3.8, photoH);
    ctx.restore();

    // Reserve the signature block FIRST, so the body can never grow into it.
    // Positioned from the TOP of the block: anchoring to h put "North Pole"
    // below the inner border, where it ran off the bottom of the card.
    const sigH = inner * 0.17;
    const sigBottom = h - b * 2.3;
    const sigTop = sigBottom - sigH;
    const sy = sigTop + sigH * 0.42;

    const titleSize  = inner * 0.070;
    const awardSize  = inner * 0.038;
    const nameSize   = inner * 0.095;
    const bodySize   = inner * 0.046;

    let y = b * 1.9 + photoH + inner * 0.045;

    // Fit the title to the width that is actually there. Sized purely from
    // height it overflowed a square card: at 400x400 the title measured ~395px
    // inside a 346px border.
    const titleMax = w - b * 4.2;
    let titleFit = titleSize;
    ctx.save();
    ctx.font = "700 " + titleFit + "px " + FONT;
    const tWidth = ctx.measureText("CERTIFICATE OF GOOD BEHAVIOUR").width;
    if (tWidth > titleMax) titleFit = titleFit * (titleMax / tWidth);
    ctx.restore();
    centerText(ctx, "CERTIFICATE OF GOOD BEHAVIOUR", w / 2, y, titleFit, INK.deep, 700);
    y += titleFit * 1.3;

    centerText(ctx, "awarded to", w / 2, y, awardSize, INK.mute, 400);
    y += awardSize * 1.7;

    const who = (name || "a very good child").slice(0, 26);
    ctx.save();
    ctx.fillStyle = INK.red; ctx.font = "italic 700 " + nameSize + "px " + FONT;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(who, w / 2, y);
    const tw = ctx.measureText(who).width;
    ctx.strokeStyle = INK.gold; ctx.lineWidth = Math.max(1, w * 0.0035);
    ctx.beginPath();
    ctx.moveTo(w / 2 - tw / 2 - nameSize * 0.3, y + nameSize * 0.62);
    ctx.lineTo(w / 2 + tw / 2 + nameSize * 0.3, y + nameSize * 0.62);
    ctx.stroke();
    ctx.restore();
    y += nameSize * 1.05;

    // Whatever is left between the name rule and the signature, and nothing
    // more. Named bodyRoom, not `room`: `room` is already destructured from
    // opts above, and redeclaring it in the same scope is a SyntaxError that
    // stops this entire file from parsing. A brace-counting gate called it
    // fine; a browser kept serving a cached copy so the screen looked correct.
    const bodyRoom = Math.max(bodySize * 1.2, sigTop - y);
    wrap(ctx, wish || "for a very good house indeed \u2014 Santa approved.",
         w / 2, y, w * 0.66, bodyRoom / 2, bodySize, INK.deep);

    ctx.strokeStyle = INK.edge; ctx.lineWidth = Math.max(1, w * 0.002);
    ctx.beginPath();
    ctx.moveTo(w * 0.18, sy); ctx.lineTo(w * 0.44, sy);
    ctx.moveTo(w * 0.56, sy); ctx.lineTo(w * 0.82, sy);
    ctx.stroke();
    centerText(ctx, "Santa Claus", w * 0.31, sy + sigH * 0.26, bodySize, INK.deep, 500);
    centerText(ctx, date || "", w * 0.69, sy + sigH * 0.26, bodySize, INK.mute, 400);
    centerText(ctx, "North Pole", w * 0.31, sy + sigH * 0.66, bodySize * 0.85, INK.mute, 400);
    // Scaled off the SHORT side and clamped inside the border: at w=2000,h=400
    // the old w-based radius put it at y~405 on a 400px card, i.e. off the edge.
    const badgeR = Math.min(w, h) * 0.0068;
    badge(ctx, b * 1.5, Math.min(h - b * 1.4, h - badgeR * 1.2), badgeR);
  }

  /* ---------------------------------------------------------------- 3. Where
   * Santa sat — the one thing this product knows that nobody else can: the
   * exact spot in YOUR room that you chose.
   *
   * This was a "Route Log" drawing a dashed path through three anchors. There
   * is no route any more, so the card used to show three coincident dots, three
   * icons stacked on one point, and copy claiming a journey that never
   * happened. It now shows the single mark the user placed, and says so. */
  function routeLog(ctx, opts) {
    const { w, h, room, santa, place, tint } = opts;
    ctx.fillStyle = INK.paper; ctx.fillRect(0, 0, w, h);
    const m = w * 0.05;
    const ph = h * 0.56;
    const px = m, py = m * 1.2, pw = w - m * 2;

    ctx.save();
    roundRect(ctx, px, py, pw, ph, w * 0.014); ctx.clip();
    ctx.globalAlpha = 0.82;
    ctx.drawImage(room, px, py, pw, ph);
    if (santa) santa(ctx, px, py, pw, ph);
    ctx.globalAlpha = 1;

    if (place) {
      const q = {
        x: px + (place.x / (opts.roomW || w)) * pw,
        y: py + (place.y / (opts.roomH || h)) * ph,
      };
      // A single ring on the spot, not a path.
      ctx.beginPath(); ctx.arc(q.x, q.y, w * 0.042, 0, 7);
      ctx.strokeStyle = INK.red; ctx.lineWidth = w * 0.007; ctx.stroke();
      ctx.beginPath(); ctx.arc(q.x, q.y, w * 0.030, 0, 7);
      ctx.fillStyle = "rgba(253,251,244,.95)"; ctx.fill();
      ctx.strokeStyle = INK.red; ctx.lineWidth = w * 0.005; ctx.stroke();
      centerText(ctx, "\u{1F385}", q.x, q.y + w * 0.004, w * 0.030, INK.deep, 400);
      centerText(ctx, "right here", q.x, q.y + w * 0.068, w * 0.024, INK.mute, 600);
    }
    ctx.restore();
    ctx.strokeStyle = INK.edge; ctx.lineWidth = Math.max(1, w * 0.002);
    roundRect(ctx, px, py, pw, ph, w * 0.014); ctx.stroke();

    let y = py + ph + h * 0.075;
    centerText(ctx, "WHERE HE SAT", w / 2, y, w * 0.050, INK.deep, 700);
    y += h * 0.048;
    centerText(ctx, "You chose the spot, so this is the only one that is yours.",
               w / 2, y, w * 0.028, INK.mute, 400);
    badge(ctx, m, h - m * 1.5, w * 0.0072);
  }

  const TEMPLATES = {
    evidence: { label: "The Evidence", draw: evidence },
    certificate: { label: "Certificate of Good Behaviour", draw: certificate },
    route: { label: "Where He Sat", draw: routeLog },
  };

  function render(ctx, key, opts) {
    const t = TEMPLATES[key];
    if (!t) throw new Error("unknown postcard: " + key);
    ctx.clearRect(0, 0, opts.w, opts.h);
    t.draw(ctx, opts);
    return t.label;
  }

  global.Postcards = { TEMPLATES, render, INK, FONT };
})(typeof window !== "undefined" ? window : globalThis);
