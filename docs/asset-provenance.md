# Asset provenance

Every asset that ships, where it came from, and whether it is safe to use
commercially. Requirement REQ-LIC-02 exists because the free image tiers are
**non-commercial and 16+**, which is exactly wrong for a commercial, child-facing
product.

## Product assets

| Asset | Source | Licence | Commercial use | Notes |
|---|---|---|---|---|
| `santa.js` | **Written in code** | Ours | ✅ Yes | The original vector character. Still the fallback when the photographs are unavailable. |
| `assets/santa/*.png` (9 files) | **Generated photoreal cut-outs** | ⚠️ SEE BELOW | ⚠️ UNRESOLVED | 1408px tall, alpha-keyed from a green screen. See "Generated art" below. |
| `engine.js`, `postcards.js`, `export.js` | Written in code | Ours | ✅ Yes | |
| `mobile_test.html`, `index.html`, `tools/*` | Written in code | Ours | ✅ Yes | |
| Icons (if any added) | `tools/make_icons.py` | Ours | ✅ Yes | Generated in code, not from an image service. |

## Generated art — licence NOT yet cleared

`assets/santa/` ships nine PNGs that are **generated photographs of a person**,
not code and not drawn vectors. They are not in the table above as cleared
assets because two things are unresolved and both block commercial release:

1. **Terms.** These came from a generation service, not from an artist under
   contract. The service's commercial-use and age terms have **not** been
   recorded anywhere in this repository. REQ-LIC-02 exists precisely because
   free image tiers are non-commercial and 16+, and a generated image is the
   same risk wearing a different hat. Until the generation terms are written
   down and confirmed to permit commercial use, treat this set as **not
   cleared for a commercial, child-facing product**.
2. **A real person's likeness.** The figure is photoreal. Whether it depicts a
   synthetic person, a licensed actor, or an identifiable individual determines
   what consent is required, and that has not been recorded either.

The vector `santa.js` remains the licence-clean fallback: it ships, it has no
likeness in it, and the engine still works without the PNGs.

## Size budget — OVER

The documented budget for shipped image assets is 3 MB. `assets/santa/` is
**7.9 MB** across nine PNGs. These are 1408px-tall alpha PNGs at ~850KB–1.1MB
each. Reducing them is required before release: PNG-24 with alpha compresses
poorly, so quantising to a palette, or shipping WebP/AVIF with a PNG fallback,
is the route. Until then the page ships roughly 2.6x its stated asset budget.

## Why the character is code, not a generated image (original intent)

Pollinations' published terms state that community tools are **non-commercial**,
that community features are **"intended for users 16+"**, that **"each model has
its own license"** which must be checked before use, and that **paid services
are governed by separate terms the free tier does not cover**.

A commercial children's product fails all three tests. Code has none of them:
it is free, permanently ours, ~13 KB rather than ~400 KB, crisp at any size, and
cannot be withdrawn by a third party.

## The intended production character

**Photoreal Santa, commissioned.** The engine is art-agnostic — it calls
`Santa.toCanvas()` and does not know whether the character is a photograph or
vector art — so swapping the asset requires no engine change.

When that art exists, record it here before shipping:

| Field | Value |
|---|---|
| Artist / studio | *pending* |
| Commission date | *pending* |
| Poses delivered | standing, 2 walk frames, sitting, reaching, eating, drinking, waving, cheering |
| Format | RGBA PNG, front-lit, neutral background, matched perspective |
| **Model release** | *required — the brief must state it* |
| Copyright assignment | *required in writing* |
| Commercial rights | *owned outright* |

## Rule for anything added later

Before an asset ships, this file gets a row saying who made it and that it is
safe to redistribute commercially. No row, no ship. The build check
(`tools/check_privacy.py`) covers the network side of the same promise.
