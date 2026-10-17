You are reviewing a change to a browser-only tool called Santa's Visit at /Users/mac/Projects/santas-visit (plain HTML/JS canvas, no build step, no dependencies).

PRODUCT GOAL: a photoreal Santa is composited into a photo of the user's own living room. The user's complaint was that he looks COPY-PASTED, sized wrong, and pasted over all the furniture. Acceptance criteria, in order of importance:
 A1. Santa reads as photographed IN that room, not pasted on.
 A2. He is correctly SIZED to the room from the user's own measurement.
 A3. Furniture correctly OCCLUDES him (he stands behind the coffee table, not on it).
 A4. Nothing moves. It is a still photograph, not a film.

WHAT CHANGED THIS ROUND (engine.js is the core; index.html got the new UI):
 1. FIXED a silent draw bug: renderFrame() drew the sprite twice (once blurred, once sharp) and had an unbalanced ctx.restore(). The sharp second copy cancelled the soft edge and completely buried the light wrap. Now drawn once.
 2. FIXED the light wrap: it was painted UNDER Santa, so his opaque interior covered it and it did nothing. It is now painted after him, masked to his alpha so it cannot darken the surrounding room.
 3. FIXED light-wrap misalignment: the blurred room was sampled over a rect that did not match the destination rect, so it was offset and scaled 1.25x. sampleBehind() now takes the exact destination rect.
 4. NEW depth-of-field matching. Photos have a focus plane; a studio sprite does not, and being sharper than everything around him is a top-three pasted tell. sharpnessOf() measures mean gradient over mean level on the room patch and on Santa, then matchDefocus() searches blur radii [0.7,1.2,1.8,2.4] until his sharpness matches. Cached per size+target.
 5. NEW chroma matching, replacing a fixed 0.18 desaturation. Room chroma is measured as mean(max-min); Santa's likewise; DESAT = min(0.45, 1 - roomChroma/santaChroma).
 6. NEW film-grain matching. Room noise sigma estimated from mean |Laplacian| / 8.94; matching deterministic per-pixel noise added to Santa. Deterministic because re-rolled noise reads as video noise over a still photograph.
 7. NEW occlusion feature. scene.occlusion is a user-painted mask; applyOcclusion() lays the ORIGINAL photo back over Santa through that mask, feathered 1.2px. New UI: a checkbox, a brush-size slider and an undo button; painting on #stage; the mask is discarded when a new photo is chosen and when the user presses the Forget-my-photo privacy control.
 8. CORRECTED A FALSE CLAIM IN THE CODE. A comment asserted the sprites 'already contain the seat'. Rendering all nine sprites over a checkerboard proved they do NOT - sit is a crouch with no chair. SEATED_POSES is now {} so every pose uses STANDING_HEIGHT_M=1.85. SEATED_HEIGHT_M is kept, with a comment saying to add a pose to SEATED_POSES only together with real seated art. The pose dropdown label changed from 'sitting on the sofa' to 'squatting down to your level'.
 9. Added [hidden] { display:none !important } because label.privacy{display:flex} was overriding the hidden attribute.

VERIFIED BY ACTUALLY RUNNING, NOT ASSUMED:
 - tools/run_all.sh -> SUITE: PASS. It parses all JS and both HTML files with osascript -l JavaScript (no node on this machine), checks all 9 sprites are 1408px tall with 0.0% spread, and 17/17 requirements assertions.
 - Rendered the real room photo in a real browser. Measured the door at 613px in the 1600px canvas, door = 200cm, so Santa at 185cm = 63% of frame height. The harness prints these numbers and they were read back from the DOM.
 - Occlusion confirmed visually: with no mask he sits ON the coffee table; with the mask the table's real pixels cover his legs and the teddy bear/bookshelf reappear. Side by side in the screenshot.
 - App boots with zero console errors; the occlude checkbox reveals the help text and brush row; a click on the stage paints into the mask and re-renders.

KNOWN LIMITATIONS I AM NOT ASKING YOU TO DISMISS:
 - No automatic object/depth detection. Occlusion is a manual brush because detecting 'this is a table edge' in an arbitrary photo needs a depth model. That is a deliberate scope decision, not an oversight.
 - The nine sprites are generated photoreal cut-outs. sit has no chair, so 'seated with milk and cookies' cannot be truly delivered by the current art. I found no suitable asset in the local asset library.
 - matchDefocus() costs several getImageData passes per frame during a drag. I did not profile it.

PLEASE REVIEW AS A SENIOR ENGINEER AND ANALYST:
 - Correctness bugs, especially: canvas state handling, the globalCompositeOperation 'copy' semantics in sampleBehind/applyBlur/applyOcclusion, whether the _dofCache key can collide or go stale, integer/rounding errors in rect maths, and any path where the mask or grade is applied twice.
 - Whether the luminance match in integrateIntoRoom can push him to black or blow him out, and whether the 0.55..1.35 clamp and the 0.85 strength are sane.
 - Performance: is this too slow to drag at interactive rates on a 1600x1600 canvas? Be specific about what dominates.
 - Any way the occlusion feature can produce a visible seam, a stale mask, or leave photo-derived data behind after the user asks for their photo to be forgotten.
 - Whether the honesty fixes (SEATED_POSES, the changed label) are consistent everywhere, or whether docs/README now contradict the code.
 - Anything that is a green gate but actually wrong. Do not accept 'the tests pass' as evidence of quality.

Answer with concrete findings ranked by severity, each naming file and line. If you believe something should not ship, say DO NOT SHIP and say why. If it is good to ship, say SHIP and name anything you would still change first.