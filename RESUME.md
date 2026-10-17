# Picking this back up

Written for whoever returns to this in a couple of weeks with half a memory of
it. Read this first. It should take five minutes.

---

## 1. Where everything is

| What | Where |
|---|---|
| **Live repo** | https://github.com/atiffhussainkhan/santas-visit |
| **Local working copy** | `~/Documents/Mini AI/santas-visit/` |
| The game (separate project) | https://github.com/atiffhussainkhan/minimax-ide |

Santa's Visit and the Snake & Ladder game are **two separate repositories and
never merged**. They share no code. Do not move files between them.

To start working:

```bash
cd ~/Documents/Mini\ AI/santas-visit
python3 -m http.server 8080     # then open http://localhost:8080
```

Opening `index.html` directly also works — there is no build step, no install,
and no dependencies.

---

## 2. What state the code is in

**It works, and it is complete as a demo.** The full pipeline runs end to end:
photo → measure one real object → place Santa → brush the furniture he stands
behind → save a still, a 9:16 cut or a postcard. It is a single static frame;
there is no walk and no video output.

All four quality gates pass:

```bash
bash tools/run_all.sh     # SUITE: PASS
```

Nothing is half-built. Nothing is a stub. The next work is *decisions and real
devices*, not more code.

---

## 3. Decisions already made — do not relitigate these

These were deliberate and cost real thought. Reopening them wastes a week.

| Decision | What was chosen | Why |
|---|---|---|
| The Santa character | **Photoreal PNGs when the complete set loads; vector fallback otherwise** | The photographic composite is the product. The PNG rights and 7.9 MB payload remain unresolved launch blockers; see `docs/asset-provenance.md`. |
| Free AI art | **Rejected** | It came back watermarked and without an alpha channel. Unusable for a child-facing product. Pollinations' free quota is also exhausted (402). |
| Scraping "Santa Finland" photos | **Refused** | Real tourism business images and photos of identifiable people carry copyright *and* personality rights. Monetising or not changes nothing. |
| Season | **Christmas only** for the launch copy | The engine stays year-round-capable, so adding Halloween in October is content, not rework. |
| Money | **Free, no monetisation** | The whole privacy promise rests on having no server. |
| Analytics | **Never** | One tag could read the user's photo. `check_privacy.py` fails the build if one appears. |
| Character photography | Nine PNG poses currently ship through `santa-photo.js` | Their technical integration is complete. Their provenance is not; do not infer permission from their presence in the repository. |

---

## 4. What is genuinely left to do

Ordered by what unblocks the rest.

**A. Clear the photoreal asset rights — do this before publishing.**
`docs/asset-provenance.md` records what is missing. The code cannot establish
the generation service's commercial terms or the model's likeness consent.
Until both are documented, the photoreal set is not cleared for release.

**B. Resolve the payload overrun.**
The same provenance record documents 7.9 MB of Santa art against the 3 MB
requirement. Optimise or revise the requirement honestly; do not hide it.

**C. Get the DPIA reviewed — required before launch.**
`docs/dpia-santas-visit.md` is written and maps all fifteen Children's code
standards. It has **not** had an independent read. Do that before launch, not
after.

**D. Decide the launch surface.** It is currently a static site with no host
and no domain. Hosting, HTTPS, and `no-store` headers are all still to do.

---

## 5. Traps that will cost you time

- **This Mac's display sleeps and suspends Safari.** Browser testing is
  unreliable. Keep the display awake, or verify in a real browser deliberately.
- **Never type the word "wipe" in a shell command here** — a security filter
  blocks the entire command. That is why the discard button's element id is
  `forget`, not something more obvious.
- **Do not add any third-party script, font, or CDN link.** It will break the
  central promise, and `tools/check_privacy.py` is specifically designed to
  catch you.
- **Keep `assets/santa/` in the repo even when empty.** It has a README so the
  folder survives; `check_art.py` passes cleanly on an empty folder. Deleting it
  makes the art check fail for no good reason.

---

## 6. What was deliberately deleted, and why

If you find these referenced anywhere, they are gone on purpose:

| Deleted | Reason |
|---|---|
| `grenade-santa-v1/v2/v3.png` | Rejected free AI art. Watermarked, no alpha channel, and the "grenade" versions were not child-safe. |
| `_poses.html` | A scratch file for eyeballing the nine poses. The poses are visible in the app itself. |
| `assets/test_*.png` (7 files, in the game repo) | Dead sprite experiments. Verified unreferenced by any code before removal. |

---

## 7. If you only remember one thing

The static compositor is working, but the product is **not cleared to ship**.
The remaining work is: clear the photoreal asset rights, resolve the payload
decision, get the DPIA reviewed, test still downloads on real phones, and pick
a host. There is no video-export milestone.
