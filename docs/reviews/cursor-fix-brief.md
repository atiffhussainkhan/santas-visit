Look at the pictures first. Open these two files with your file/image tools before reading any code:

  docs/renders/review-00-source-room.jpg   the user's own living-room photo, untouched
  docs/renders/review-01-current.jpg      what the tool currently produces from it

review-01-current.jpg is a verification page, not just one picture. Read it top to bottom:
  - the strip at the top is all nine sprites over a checkerboard
  - the two large frames underneath are the SAME placement twice: the upper one is Santa
    pasted over the coffee table, the lower one is Santa standing BEHIND it, with the
    table's top, the books, the mug and the teddy bear laid back in front of him
  - the yellow line at the bottom is the measured readout

THE USER'S TWO COMPLAINTS, and where they stand:

1. "Santa should have a very long beard just like Greenland Santa."
   I regenerated all nine sprites for this: long, heavy, braided white beards cascading
   down the chest. They are in assets/santa/, generated through the image connector and
   keyed by tools/key_green.py (backdrop-relative green key plus despill). LOOK AT THE
   STRIP and tell me honestly whether the beards actually read as Greenland-style, or
   whether some poses lost them. Fix any that did not.

2. "This Santa is micro size once added to that picture."
   FIXED, and I want you to check my arithmetic rather than take it. The no-measurement
   fallback was h*0.34 of frame height. In this photo the front door spans 613px of an
   893px canvas and is a 200cm door, so it fills 69% of the frame; a 185cm adult at that
   depth should be 63%. He was rendering at 34% — about half his correct size. The
   fallback is now h*0.58 (engine.js, solveStatic) and the default pose is `stand`
   rather than the seated one. The readout now says 185cm = 63% of frame height.
   Verify that against the picture: is he now correctly scaled for THIS room, and does
   he still look like a normal adult next to the sofa and the coffee table?

THE REAL REMAINING QUESTION, which is what the user means by "not pretend fake pic":

Even with correct size, correct beard and working occlusion, he may still read as pasted
on. Everything below is a candidate tell. Judge each one FROM THE PICTURE, name the
specific pixels or region that gives it away, and fix the ones that matter:

  a. Contact. Does he look like his boots are ON the floor, or is he hovering? The
     ground shadow is a squashed ellipse, not a real cast shadow, and a photograph of a
     person standing on a rug has a shadow whose direction, softness and darkness follow
     the room's light.
  b. Depth of field. Is he as sharp as the furniture beside him? If the room behind is
     soft and he is crisp, the eye reads "added". There IS a defocus matcher
     (matchDefocus/frameSharpness in engine.js) - is it actually working on this image,
     or is it a no-op?
  c. Light. Does the light on him agree with the lamp in this room? He is lit
     studio-flat. The room has a strong warm lamp upper-left and cool window light
     right. A real person standing there would have a warm side and a cool side.
  d. Edge. Is his silhouette still a cut-out edge, or does it have the soft, slightly
     fuzzy quality of an object photographed at a distance?
  e. Scale cues. Does his size agree with the coffee table and the sofa, or does
     something still disagree?
  f. Occlusion quality. Look at the lower frame. Is the table in front of him convincing,
     or is the cut obviously artificial - a straight horizontal line, a mismatch in
     sharpness across the boundary, or the table's edge not lining up?

YOU HAVE EDIT PERMISSION. Fix what you find, in engine.js and placement.js. Do not
restructure the product and do not undo work that is already correct.

Two things you must NOT change:
  - assets/santa/ are freshly generated. Do not regenerate or overwrite them; the
    keying is done and tools/check_art.py passes on them.
  - docs/asset-provenance.md already records the licence and size-budget blocker
    honestly. Leave it alone; it stays a known blocker and is not yours to solve.

Verify before you report:
  1. bash tools/run_all.sh -> SUITE: PASS.
  2. Serve the project root and open /tools/quality-check.html in a real browser. LOOK at
     the output. Report what you actually see, not what you intended.
  3. Say plainly whether the result now looks like a photograph of Santa standing in
     that room, or whether it still looks composited. If it still looks composited, name
     the single biggest remaining reason and fix it. That judgement is the deliverable —
     a green test suite is not.