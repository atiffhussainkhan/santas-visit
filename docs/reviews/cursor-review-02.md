You reviewed Santa's Visit at /Users/mac/Projects/santas-visit and returned DO NOT SHIP with 13 findings. Here is what I did about each one, and what I did NOT fix. Re-review and tell me whether to ship.

I checked your findings against the code rather than taking them on trust. All thirteen were real. The white-balance one I reproduced numerically before touching it.

=========================================================
WHAT I FIXED
=========================================================

1. GREEN CAST — FIXED. Confirmed by reproduction: for a neutral room the old divisors produced gains 0.729 / 1.162 / 0.935. Dividing each channel's share of luminance by that channel's own luminance coefficient gives exactly (1,1,1) for a neutral room. This had tinted every composite in every room.

2. LIGHT WRAP WAS A SECOND FULL-BODY GRADE — FIXED. It is now a real rim: Santa's alpha minus the same alpha knocked out from four directions (`destination-out` at +/-e), leaving a band ~2px wide, then the blurred room composited into that band with `source-in` and multiplied at 0.45. Only the silhouette edge takes the room's colour now.

3. OCCLUSION DISABLED BY matchLight — FIXED. The early return now calls applyOcclusion() before returning.

4. PRIVACY LEAK — FIXED. Added Scene.disposePhotoData(), which empties _blur, _front, _wrap, _dof, _shadow and _scratch.col/.mask (set to 1x1), deletes every _dofCache and _aspect entry, and resets the sharpness cache. It is called from both Forget-my-photo and the new-photo path.

5. ASSET PROVENANCE — PARTIALLY FIXED, AND STILL BLOCKING. docs/asset-provenance.md no longer claims "there are no image assets". It now records the nine PNGs as generated photoreal cut-outs with an explicit "licence NOT yet cleared" section naming the two unresolved items (generation-service commercial terms unrecorded; likeness/consent unrecorded) and an explicit "Size budget — OVER" section (7.9MB actual vs 3MB documented). I did NOT clear the licence and I am not going to invent provenance I do not have. Treat this as still blocking release; tell me if you think documenting it honestly is enough to unblock, or whether it needs resolving outside the code.

6. DEFOCUS CACHE — FIXED. The radii accumulate, so the cache now stores the running total (`total = +(total + r).toFixed(2)`), which replays identically on a hit. The key now carries a `_photoGen` counter, canvas size, pose name and the target. `_sharpCache` is also reset on disposal.

7. SEATED HEIGHT / VECTOR FALLBACK — FIXED. Seated-ness is now per character: `santa.js` exports `seatedPoses: {sit:1, reach:1, drink:1, eat:1}` (which is what it actually draws — thighs forward, shins down) and `santa-photo.js` exports `seatedPoses: {}`. solveStatic takes an explicit `seated` argument and renderFrame passes `isSeated(Santa, pose)`. Your point that 1408px frames do not prove a crouching figure is 1.85m is right and is now written into the comment, but I cannot derive a true crouch height without per-pose metadata, so `sit` is still drawn at standing height and the label says "squatting down to your level". I have NOT invented a crouch height number.

8. aspectOf() MEASUREMENT — FIXED. It drew 1408px art at scale 1 into a 300x300 box, so it only saw the bottom 300 rows and measured ~1.0 for nearly every pose. It now scales the art to a 256px measuring box (`scale: ASPECT_BOX / char.height`) and scans that. The scratch patch, the room sample and the ground shadow are now all the width of Santa rather than up to twice it.

9. SAMPLE CONTAMINATION AND EDGE MATH — FIXED. sampleBehind() now runs BEFORE the ground shadow is drawn. When the destination rect hangs off the canvas, the remainder is still sampled and the offset (ox, oy) is returned so the blurred copy is drawn at the rect it was measured from, instead of being stretched across a different one.

10. OCCLUSION PAINTING — FIXED. `occPainted()` is now a dirty flag rather than a scan that sampled every 97th alpha byte. Coordinates come from cv.getBoundingClientRect() instead of the bordered stage box. Pin drags no longer paint (`e.target !== stage && e.target !== cv`). Added an Erase toggle and 10-deep stroke undo, because tracing a furniture edge with only an all-or-nothing clear is genuinely brittle.

11. PERFORMANCE — PARTIALLY FIXED, AND I THINK YOU WERE RIGHT ABOUT THE CAUSE. Two changes: (a) fixing aspectOf removed the ~2x pixel inflation you identified, which was the single biggest win; (b) the depth-of-field target is no longer measured from the patch behind Santa at all. It is measured once per photo from a bounded region of the whole frame and cached, so dragging costs zero readbacks for it. I also moved local sharpness to a global measurement for a correctness reason you did not raise: a blank wall has almost no gradient, which read as "totally defocused" and blurred Santa into a ghost. I have NOT profiled it and I am not claiming a frame rate.

12. DOCS AND GATES — FIXED. README, RESUME and the postcards.js header no longer describe walking, video, three anchors or a route map. check_requirements.py grew from 17 to 35 assertions, including ones for every finding above. The old "seated and standing heights" check passed merely because both constant NAMES existed; it now asserts the per-character decision. I also mutation-tested two of the new gates: restoring the old white-balance divisors makes "white balance is neutral on a neutral room" go MISS, and moving sampleBehind back after the shadow makes "room is sampled before the shadow is drawn" go MISS. Both restored, engine.js md5 verified identical, suite back to 35/35.

13. AI DISCLOSURE ON EXPORTS — FIXED. export.js now has stampDisclosure(), called from exportStill() and from verticalCanvas(), so the full-frame PNG and the 9:16 carry the badge and not just the postcards. It lives in the exporter rather than at call sites so a future export cannot forget.

=========================================================
WHAT I DID NOT FIX, AND WHY
=========================================================
- Asset licence and the 7.9MB size overrun (finding 5). Documented honestly instead. This is a decision about provenance and rights that I cannot settle by writing code, and inventing plausible terms would be worse than recording that they are missing.
- True physical height of the crouching `sit` pose (part of finding 7). It needs per-pose ground-to-hat metadata that only a commissioned seated sprite would provide.
- No profiling numbers (part of finding 11). I made the two structural fixes; I have no measured frame time.

=========================================================
VERIFIED BY RUNNING
=========================================================
- tools/run_all.sh -> SUITE: PASS, 35/35. Parses all JS and both HTML files with osascript -l JavaScript (there is no node on this machine), checks all 9 sprites at 1408px with 0.0% height spread.
- Mutation-tested two gates as described above; both fail when the bug is reintroduced and pass when restored.
- Rendered the real room photo in a real browser and LOOKED at it. Door 613px = 200cm, Santa 185cm = 63% of frame height, numbers read back from the DOM. Before the white-balance fix his fur was olive and his suit muddy; now the suit is a true red and the fur white, matching the lamplit room. Occlusion confirmed side by side: unmasked he sits ON the coffee table, masked the table's real pixels cover his legs and the bookshelf reappears.
- The synthetic sample room (what a first-time user actually sees) previously rendered him as a grey ghost; after fixing aspectOf, the global sharpness measurement and the self-calibrating floor of 45% of his own natural sharpness, he renders crisp and correctly coloured.

=========================================================
QUESTIONS
=========================================================
1. Did I fix the defects you raised, correctly, without introducing new ones?
2. Is anything in the code still wrong that you can now see — particularly the new rim compositing (`copy` then `destination-out` x4 then `source-in`), frameSharpness()'s caching and its interaction with _photoGen, or the new Erase/undo paths?
3. Is documenting the asset licence honestly enough to proceed, or does that genuinely block?
4. Anything that is still a green gate but actually wrong?

Answer with concrete findings ranked by severity, naming file and line. Say DO NOT SHIP or SHIP, and if SHIP, name anything you would still change first.