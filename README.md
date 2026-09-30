# Rest Around ☕

A cozy 3D restaurant-management sim for the browser. Seat chibi guests, take their orders,
cook, serve, sweep up, fix the arcade, grow tomatoes, level your dishes and turn a tiny 8×8
bistro into the most talked-about place in town.

Plain HTML + JavaScript ES modules rendered with [three.js](https://threejs.org) (r169, vendored
in `vendor/three`, MIT). **No build step, no framework, works offline.** 3D art is from Kay
Lousberg's free CC0 KayKit packs.

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
| Right-drag / Shift-drag / two-finger twist | rotate the camera |
| <kbd>Q</kbd> / <kbd>E</kbd> or the ⟲ ⟳ buttons | rotate 90° (⌂ recentres) |
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
covers all walls; the **Room** tab buys bigger floor plans. Walls between the camera and the room
drop to a low cut-away so you can always see inside, whichever way you rotate.

## Art pipeline

Everything in the world is a glTF model listed in [`assets/manifest.json`](assets/manifest.json)
(`models`: file, scale, facing correction, footprint, surface/seat heights, tint rules, character
accessories); UI images, icons and surface textures are PNGs listed under `assets`.

* **Missing → placeholder.** A missing model becomes a procedural low-poly stand-in (today: the
  toilet, the arcade cabinet, a few desserts/drinks and the held tools); a missing PNG becomes a
  generated image. The whole game is always playable.
* **Drop-in.** Put a correctly named `.gltf`/`.glb`/`.png` at the manifest path and reload — no
  code changes. Food icons in the UI are rendered from the food models automatically.
* **Scale:** 1 floor tile = 2 world units (the KayKit grid); models face +Z.
* **Characters** are rigged KayKit Adventurers with 15 shared animations (walk, carry, sit, cook,
  sweep, repair, nap, cheer…) chosen from each agent's activity; props (tray + dish, broom, wrench,
  mug) attach to the hand bone, chefs wear a toque. The wardrobe (Staff → Outfit) swaps the
  character, toggles helmet/hat/cape and tints the outfit.
* **Tints:** shop variants (mint table, rose armchair, steel stove…) re-colour one model.
* Outside: lawn, a street with passers-by (guests walk along it to the door), low-poly trees and
  garden beds that grow whatever you plant (click a bed to open the Garden panel). Lighting follows
  the clock — golden evening light, and lamps switch on for the dinner rush.

[`ASSETS.md`](ASSETS.md) documents the conventions, the sources/licences and the full generated
asset tables (`node tools/assets-table.mjs` refreshes them; optional, the game never needs Node).

### Credits

* 3D models: **Kay Lousberg** — KayKit Restaurant Bits, Furniture Bits, Character Pack:
  Adventurers (CC0). www.kaylousberg.com
* Fonts: Fredoka and Nunito (SIL Open Font License).
* three.js (MIT).

## Why three.js

The first version drew 2D sprites with Canvas 2D. Switching to free, consistent CC0 3D models made
real-time 3D the better fit: models can be used as-is (no sprite baking), characters get proper
skeletal animation, depth sorting is free (z-buffer), the camera can rotate and zoom, and lighting
and shadows make the scene feel alive. three.js is vendored at a pinned version so the game
stays offline-friendly and build-free.

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
assets/manifest.json    3D models (file, scale, footprint, heights, tints, accessories) + 2D images
assets/models/          glTF/GLB models (KayKit, CC0) — restaurant, furniture, characters, props
assets/textures|food|ui PNG drop-in folders (surface textures, food icons, UI chrome)
assets/fonts/           bundled OFL fonts (Nunito, Fredoka)
vendor/three/           three.js r169 + GLTFLoader/SkeletonUtils (MIT), loaded via an import map
ASSETS.md               asset guide + generated tables
tools/assets-table.mjs  optional: regenerate the ASSETS.md tables from the manifest
src/
  main.js               boot: load images → models → icons, restore save, start loop, autosave
  assets.js             2D image loader, PNG probing, placeholders, tint cache
  placeholder.js        generated placeholder images (textures, icons, UI frames)
  models.js             glTF loader, procedural placeholder meshes, tinting, icon rendering
  renderer.js           three.js scene: lawn/street/garden, room & cut-away walls, furniture,
                        food, trash, lighting, build preview, debug overlays, 2D overlay layer
  charview.js           animated character per agent: clip selection, props, hats, facing
  portrait.js           3D-rendered portraits, shop thumbnails and food icons
  iso.js camera.js      grid directions; orbit camera (pan/zoom/rotate)
  world.js              room grid, furniture, seats, access tiles, trash, reachability
  pathfinding.js        A* (4-dir, soft agent-avoidance costs)
  agent.js              movement, tile claims, blocked-step handling, action queue
  customer.js staff.js  customer and staff brains
  ambient.js            passers-by on the street
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
* **Characters are fantasy adventurers** (the only free, animated set in the same KayKit style that
  was reachable). Swap in townsfolk by adding another rigged glTF pack to the manifest (see
  ASSETS.md).
* **No eating animation** in the KayKit clip set: seated guests use the sitting idle, with food on
  the table and crumbs/heart effects.
* The toilet, arcade cabinet, desserts, two drinks, egg/milk/flour/lemon and the held tools are
  procedural placeholder meshes until real models are added.
* Performance: fine on any GPU; in software-rendered browsers (no WebGL acceleration) the
  frame rate is low.
* **Crowded 1-tile corridors:** agents never deadlock, but when two meet head-on in a dead-end
  they briefly pass through each other (after ~1.6 s of waiting) instead of backing up.
* **Balance** is tuned for a relaxed first week; a big room with too few staff will lose guests
  until you hire more (that's the intended pressure, but the curve past level 8 is lightly tested).
* Turn on the debug **Asset overlay** to see which models/images are still placeholders.
* Missing files show up as 404 lines in the browser console / server log while placeholders are
  in use — harmless.
* Audio starts after the first click or key press (browser autoplay rules).
