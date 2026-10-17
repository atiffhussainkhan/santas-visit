#!/usr/bin/env python3
"""Requirements coverage for the static, placed version of the app.

These checks used to assert three route anchors (door/sofa/table) and a
frame-paced video export. Both are gone: Santa does not walk, and both exports
are stills. The old checks kept passing anyway, because the words survived in
comments and dead code — the suite was rewarding code that no longer ran, which
is worse than having no check at all.

Each check now names the behaviour it is protecting, so a future failure points
at something real rather than at a string that happens to survive.
"""
import json
import subprocess
import sys

js = open("postcards.js", encoding="utf-8").read()
eng = open("engine.js", encoding="utf-8").read()
exp = open("export.js", encoding="utf-8").read()
doc = open("index.html", encoding="utf-8").read()
vec = open("santa.js", encoding="utf-8").read()
pho = open("santa-photo.js", encoding="utf-8").read()

def evaluate_maths(engine_source=eng, export_source=exp):
    """Execute the shipped formulae in JavaScriptCore; do not reimplement them."""
    prelude = """
var document = {
  createElement: function () {
    return { width: 0, height: 0, getContext: function () { return {}; } };
  }
};
"""
    expression = """
JSON.stringify({
  neutral: Scene.whiteBalanceGains({r:1,g:1,b:1,chroma:0}, true),
  black: Scene.whiteBalanceGains({r:0,g:0,b:0,chroma:0}, true),
  blue: Scene.whiteBalanceGains({r:0,g:0,b:2,chroma:1}, true),
  vertical: ExportVideo.verticalDimensions(560),
  verticalOdd: ExportVideo.verticalDimensions(1333),
  gaussian: Scene.combineGaussianRadii([0.7,1.2,1.8])
})
"""
    run = subprocess.run(
        ["osascript", "-l", "JavaScript", "-e",
         prelude + "\n" + engine_source + "\n" + export_source + "\n" + expression],
        capture_output=True, text=True,
    )
    if run.returncode:
        return {}, (run.stderr or run.stdout or "JavaScriptCore failed").strip()
    try:
        return json.loads(run.stdout.strip()), ""
    except Exception as exc:
        return {}, "could not parse JavaScriptCore result: %s" % exc


maths, maths_error = evaluate_maths()
neutral = maths.get("neutral", {})
blue = maths.get("blue", {})
black = maths.get("black", {})
vertical = maths.get("vertical", {})
vertical_odd = maths.get("verticalOdd", {})
gaussian = maths.get("gaussian")
close = lambda a, b, eps=1e-9: isinstance(a, (int, float)) and abs(a - b) <= eps

# Mutation controls prove these are behavioural gates. The shipped files are
# never touched: each old/broken formula is substituted only in the source
# string handed to JavaScriptCore, and its corresponding assertion must fail.
old_wb = eng.replace(
    "const adapt = (v) => 1 + (Math.max(0.65, Math.min(1.45, v)) - 1) * strength;",
    "const adapt = (v) => v;",
)
old_gaussian = eng.replace(
    "return +Math.sqrt(variance).toFixed(2);",
    "return +radii.reduce((sum, r) => sum + r, 0).toFixed(2);",
)
old_vertical = exp.replace(
    "return { width: Math.max(1, Math.round(height * 9 / 16)), height };",
    "return { width: Math.max(1, Math.round(height * 0.8)), height };",
)
mut_wb, mut_wb_error = evaluate_maths(old_wb, exp)
mut_gaussian, mut_gaussian_error = evaluate_maths(old_gaussian, exp)
mut_vertical, mut_vertical_error = evaluate_maths(eng, old_vertical)

# Match CALL SYNTAX, not bare words.
#
# The first version of this file checked for "MediaRecorder" and failed,
# because the word appears in a COMMENT explaining that the video path was
# removed. An earlier attempt fixed that by stripping comments, which was
# worse: the CSS contains a "/*" with no matching close, so the stripper ate
# the rest of the page and four unrelated checks went MISS. A regex cannot
# tell prose from code reliably here. Grepping for `new MediaRecorder(` and
# `.captureStream(` can: nobody writes that in a sentence.

CHECKS = [
    # The core of the redesign: a photograph, not a film.
    ("static placement, not a walk", "solveStatic" in eng and "buildTimeline" not in eng),
    ("one place marker + a ruler", all(k in doc for k in ("pin-santa", "pin-base", "pin-top"))),
    ("ruler drives the scale", "pxPerCm" in eng and "refCm" in eng),
    ("seated and standing heights", "SEATED_HEIGHT_M" in eng and "STANDING_HEIGHT_M" in eng),
    # The old version of this check passed whenever the two constant NAMES
    # existed, which is true even when seated sizing is switched off. It has to
    # assert the decision, and that it remains per character: the vector has
    # four seated drawings, while the photographic set has one (`sit`).
    ("seated height is decided per character, not globally",
     "isSeated(" in eng and "character.seatedPoses" in eng
     and "seatedPoses: { sit: 1" in vec),
    ("photo sprites declare the genuinely seated pose",
     "seatedPoses: { sit: 1 }" in pho),
    ("photo poses carry measured body scales", "poseScale:" in pho and "alpha" in pho),
    ("characters declare feet offsets", "feetOffset:" in pho and "feetOffset:" in vec),
    ("pose is the user's choice", 'id="pose"' in doc and "refKey" in doc),

    # Keepsakes.
    ("3 postcards", all(k in js for k in ("evidence", "certificate", "routeLog"))),
    ("AI badge on every card", js.count("badge(") >= 3),
    ("postcards draw Santa", "santa:" in doc),

    # Export: a still, and never a postcard masquerading as the picture.
    ("still export, no video recording",
     "toBlob" in doc and "ExportVideo.exportVideo(" not in doc),
    ("no video capability UI", "ExportVideo.capabilities(" not in doc),
    # The button still exists, but it reports what the app now does (a still
    # PNG and the measured height), not a video recorder it no longer uses.
    ("capability button is not about video",
     "What can this device do?" not in doc),
    ("9:16 still export", "verticalCanvas" in exp and "vertical" in doc),
    ("postcards remain current when saved",
     "cardDisplayed" in doc and 'target.toBlob(r, "image/png")' in doc),

    # Controls that must not be decorative.
    ("light toggle is wired", "matchLight" in eng and "matchLight" in doc),

    # ---- compositing ----------------------------------------------------
    # Each of these exists because a plausible-looking version of it was wrong
    # at least once, and a green gate did not catch it.
    ("room is sampled before the shadow is drawn",
     eng.index("sampleBehind(ctx, { x: dx") < eng.index("groundShadow(src, p, scene.light)")),
    ("photo sharpness is measured before generated pixels",
     eng.index("const photoSharpness = matchLight === false ? 0 : frameSharpness(ctx)") <
     eng.index("groundShadow(src, p, scene.light)")),
    ("light wrap is a rim, not a second full-body grade",
     "_erode" in eng
     and 'eg.globalCompositeOperation = "destination-in"' in eng
     and 'wg.globalCompositeOperation = "destination-out"' in eng
     and "wg.drawImage(_erode" in eng),
    ("occlusion does not depend on light matching",
     # applyOcclusion must be reachable from BOTH branches of the matchLight test
     eng.count("applyOcclusion(ctx, scene)") >= 2),
    ("white balance is neutral on a neutral room",
     all(close(neutral.get(k), 1) for k in ("r", "g", "b"))
     and all(close(black.get(k), 1) for k in ("r", "g", "b"))
     and "const wb = whiteBalanceGains(room, !!behind);" in eng),
    ("white balance stays bounded for a pure-blue room",
     all(isinstance(blue.get(k), (int, float)) and 0.6 <= blue[k] <= 1.5
         for k in ("r", "g", "b"))),
    ("white-balance gate rejects the old unbounded maths",
     not mut_wb_error and any(mut_wb.get("blue", {}).get(k, 1) < 0.6 or
                              mut_wb.get("blue", {}).get(k, 1) > 1.5
                              for k in ("r", "g", "b"))),
    ("sprite aspect is measured, not clipped",
     "ASPECT_BOX / h" in eng and "scale: 1" not in eng.split("function aspectOf")[1][:900]),
    ("defocus combines Gaussian variance",
     close(gaussian, 2.27, 0.001)
     and "const effective = combineGaussianRadii(applied);" in eng
     and "_dofCache[key] = effective" in eng),
    ("Gaussian gate rejects additive radii",
     not mut_gaussian_error and not close(mut_gaussian.get("gaussian"), 2.27, 0.001)),
    ("defocus cache is invalidated per photo", "_photoGen" in eng and "disposePhotoData" in eng),
    ("vertical export maths is exactly 9:16",
     vertical.get("height") == 560 and vertical.get("width") == round(560 * 9 / 16)
     and vertical_odd.get("height") == 1333
     and vertical_odd.get("width") == round(1333 * 9 / 16)
     and "const size = verticalDimensions(source.height);" in exp),
    ("9:16 gate rejects the old wide output",
     not mut_vertical_error and
     mut_vertical.get("vertical", {}).get("width") != round(560 * 9 / 16)),

    # ---- occlusion ------------------------------------------------------
    ("occlusion mask exists", "newOcclusionMask" in eng and 'id="occlude"' in doc),
    ("occlusion is painted, not guessed",
     all(x in doc for x in ('id="occlude-erase"', 'id="occlude-undo"',
                            'id="occlude-clear"'))),
    ("occlusion undo stores strokes, not RGBA snapshots",
     "occStrokes" in doc and "getImageData(0, 0, state.occ.width" not in doc),
    ("painted state is a flag, not a sparse scan",
     "occDirty" in doc and "i += 4 * 97" not in doc),
    ("painting uses the canvas box, not the bordered stage box",
     "cv.getBoundingClientRect()" in doc),
    ("painting does not hijack pin drags",
     "e.target !== stage && e.target !== cv" in doc),
    ("mobile brush owns its pointer",
     "touch-action:none" in doc and "setPointerCapture" in doc),
    ("repaints are frame-coalesced", "requestAnimationFrame" in doc),

    # ---- privacy --------------------------------------------------------
    # "Forget my photo" has to empty the engine's scratch canvases too, not
    # just the <img> and the visible canvas.
    ("forget clears engine photo buffers",
     "Scene.disposePhotoData()" in doc and "disposePhotoData," in eng),
    ("new photo clears the old mask", "state.occ = null" in doc),
    ("new photo resets erase mode", "state.occErase = false" in doc),

    # ---- disclosure -----------------------------------------------------
    ("every exported image is disclosed as AI",
     "stampDisclosure" in exp and exp.count("stampDisclosure(") >= 2),

    # Unchanged promises.
    ("child-friendly privacy text", "under 18" in doc),
    ("rights / complaints route", "atiff.khan@yahoo.com" in doc),
    ("kill switch", "forget" in doc),
]

bad = 0
if maths_error:
    print("  MISS  executable maths setup")
    print("        " + maths_error.splitlines()[0])
    bad += 1
for name, ok in CHECKS:
    print(f"  {'OK  ' if ok else 'MISS'}  {name}")
    if not ok:
        bad += 1
print(f"  {len(CHECKS) - bad}/{len(CHECKS)} present")

sys.exit(1 if bad else 0)
