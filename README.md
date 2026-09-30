# Rest Around ☕

A cozy isometric restaurant-management sim for the browser. Seat chibi guests, take their
orders, cook, serve, sweep up, fix the arcade, grow tomatoes, level your dishes and turn a tiny
8×8 bistro into the most talked-about place in town.

Plain HTML + JavaScript ES modules. **No build step, no framework, no external dependencies.**

## Run it

ES modules need a local web server (opening `index.html` from disk won't work):

```bash
cd rest-around
python -m http.server 8000        # or: python3 -m http.server 8000
# then open http://localhost:8000
```

Any static server works (`npx serve`, `php -S localhost:8000`, …). The game works offline.

Your progress autosaves to `localStorage` every 10 seconds and when the tab closes.
**Settings → Reset game** starts over.

## How to play

1. Guests walk in through the street door, pick a free table and sit. If every seat is taken they
   leave; if a seat is only waiting to be cleared they queue by the door for a bit.
2. A **waiter** takes the order (the bubble shows the dish), a **chef** cooks it at a free stove
   (progress bar; better stoves cook faster), the waiter carries it over on a tray.
3. Guests eat, pay coins (+ a tip for fast service), earn you **gourmet points**, and leave.
4. Some also order a drink — a **bartender** mixes it at the Juice Bar and a waiter brings it.
5. Guests drop trash; a **cleaner** sweeps it (trash lowers your rating).
6. Every guest has a **patience** meter while waiting to be seated, to order and for food. If it
   runs out they storm off without paying and your rating drops.
7. After eating some guests visit the **restroom** or the **arcade** for extra coins. These break
   after a number of uses until a cleaner repairs them.

Staff get tired while working. At zero energy they finish their task and nap; feed them snacks
(bought in the Market) from the Staff panel or their info card to wake them instantly.

**Progression.** Coins buy furniture, staff, seeds, ingredients and room expansions. Gourmet points
level you up, which unlocks bigger floor plans, more staff slots, more menu slots, new furniture
and new dishes. Put ingredients from the garden, the market and the daily gift into a dish to
level it from Lv1 to Lv10 (higher price, more points).

**Rating (0–5 ★)** blends service speed, cleanliness, average dish level, decor and broken
facilities (tap the stars for the breakdown). More stars → more guests.

**Day cycle.** A day lasts about 8 real minutes: Opening → Lunch Rush → Afternoon → Dinner Rush →
Closing, then a summary card (served, lost, coins, points, rating change). The next day opens
automatically after a short countdown (toggle in Settings).

### Controls

| | |
|---|---|
| Drag | pan the camera |
| Mouse wheel / pinch | zoom |
| Click a character | info card (name, role or mood, task, energy/patience) |
| <kbd>B</kbd> | build mode (the restaurant pauses while you build) |
| <kbd>R</kbd> / <kbd>Del</kbd> / <kbd>M</kbd> | rotate / sell / move the selected item (build mode) |
| Right-click / <kbd>Esc</kbd> | stop placing, cancel a move, close things |
| <kbd>`</kbd> | hidden debug panel |

In build mode, pick an item and click the floor. The preview is green when valid and red with a
reason when not — the game refuses any layout that cuts part of the floor off from the door, blocks
the working side of a stove/bar/restroom/arcade, or leaves a chair with no side to sit down from.
Chairs automatically turn to face an adjacent table. Floors are painted by click/drag; wallpaper
covers all walls; the **Room** tab buys bigger floor plans.

## Art pipeline

All art is listed in [`assets/manifest.json`](assets/manifest.json) with its file, category, pixel
size, tile footprint, anchor, height offsets, available facings and (for characters) layer/slot.
Anything missing is replaced by a generated placeholder at load time, so the full game is playable
with no art at all. **Drop a correctly named PNG into `assets/` and reload — no code changes.**

* 2:1 dimetric isometric, **128 × 64 px tiles**, light from the top-left.
* Furniture and characters are drawn facing **front-left** and **back-left**; the other two
  facings are mirrored in code.
* Characters are **paper dolls** (body, head, faces, hair, top, bottom, hat, held item, arms,
  legs) aligned by rig slots in the manifest; all animation is procedural.
* Many items are one grey shape recoloured by tint (chairs, tables, floors, wallpaper, outfits,
  hair…), which keeps the list lean: **114 assets / 135 PNG files** in total.
* UI chrome (panel frames, buttons, HUD chips, icons, toolbar icons) is skinnable the same way
  (9-slice images).

[`ASSETS.md`](ASSETS.md) has the style-bible paragraph to prepend to image prompts, the rig
reference, and the full asset table grouped by priority. After editing the manifest you can
refresh that table with `node tools/assets-table.mjs` (optional helper; the game never needs Node).

## Why Canvas 2D (and not PixiJS)

The brief allowed either. I chose the browser's built-in Canvas 2D:

* **Zero dependencies** — nothing to pin, nothing to download, works offline and from any static
  server forever.
* **The scene is small** (≤ 196 floor tiles and ~100 sprites/layers per frame): Canvas 2D holds
  a smooth frame rate here, so WebGL batching buys little.
* **Immediate mode fits the design.** Depth order is recomputed every frame with a topological
  sort (characters walk around and sit on furniture), and each paper-doll layer is drawn with its
  own procedural transform — both are simpler as plain draw calls than as a retained scene graph.
* Tinting is handled with cached multiply-composited canvases, and mirroring with a negative
  scale; both are cheap one-time costs.

## Debug panel (<kbd>`</kbd>)

Time scale 1× / 4× / 16×, +1000 coins, +100 points, spawn a guest, break a facility, skip to
closing, drain staff energy, and overlays: pathfinding grid (walkable tiles, agent tile claims and
paths), agent state labels, and an **asset overlay** that tags everything still using placeholder
art (plus a list of all placeholder ids). A status line shows agents, jobs, trash, FPS and
stuck-agent count. For automated checks, `window.game.fastForward(seconds)` runs the simulation
without rendering and auto-opens new days.

## Project layout

```
index.html              page shell
assets/manifest.json    every asset: file, size, anchor, footprint, offsets, facings, rig slots
assets/<folder>/        drop PNGs here (floor, wall, furniture, props, character, food, ui, fonts)
ASSETS.md               art guide + generated asset table
tools/assets-table.mjs  optional: regenerate the ASSETS.md table from the manifest
src/
  main.js               boot: load assets → restore save → start loop, autosave
  assets.js             manifest loader, PNG probing, placeholders, tint cache, mirroring
  placeholder.js        placeholder art generator (iso boxes, doll parts, icons, UI frames)
  iso.js camera.js      projection math, pan/zoom camera
  renderer.js           floor, walls/door, topological depth sort, overlays, build preview
  doll.js               paper-doll assembly + procedural animation
  world.js              room grid, furniture, seats, access tiles, trash, reachability
  pathfinding.js        A* (4-dir, soft agent-avoidance costs)
  agent.js              movement, tile claims, blocked-step handling, action queue
  customer.js staff.js  customer and staff brains
  jobs.js               job board, priorities, dish salvage
  day.js rating.js      day cycle + arrivals, star rating
  economy.js            coins, points, levels, dishes, market, garden, gift, hiring, facilities
  build.js              build mode: validation, place/move/rotate/sell, paint, wallpaper, expand
  save.js audio.js      localStorage save/load, synthesized sound effects
  fx.js input.js        floating numbers & particles, mouse/touch/keyboard
  data.js               all gameplay tuning (prices, unlocks, dishes, timings)
  looks.js              character look generation
  ui/                   HUD, toolbar, panels, build tray, info card, modals, debug panel, CSS
```

Gameplay numbers (prices, cook times, patience, energy, arrival rates, level curve) are all in
`src/data.js`; art sizes/offsets are all in the manifest.

## Known issues & limitations

* **Guests in the room are not saved.** Staff, furniture, trash, dirty tables, broken
  facilities, stock, garden, dish levels, money and the clock are; after a reload the dining room
  starts empty (new guests arrive within seconds).
* **Mirrored facings flip the lighting.** Right-facing sprites are mirrors, so their highlights sit
  top-right — accepted by the brief; keep shading soft so it reads fine.
* **Crowded 1-tile corridors:** agents never deadlock, but when two meet head-on in a dead-end
  they briefly pass through each other (after ~1.6 s of waiting) instead of backing up.
* **Balance** is tuned for a relaxed first week; a big room with too few staff will lose guests
  until you hire more (that's the intended pressure, but the curve past level 8 is lightly tested).
* **Placeholder labels:** placeholders show their asset id when the image is large enough; tiny
  layers, icons and walls are identified by tooltip and the debug asset overlay instead, so the
  chibi characters stay readable.
* Missing PNGs show up as 404 lines in the browser console / server log while placeholders are in
  use — harmless.
* Audio starts after the first click or key press (browser autoplay rules).
