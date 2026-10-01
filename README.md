# Refillit ☕

A cozy 3D café-management sim for the browser (formerly *Rest Around*). Seat chibi guests, take their
orders, cook, serve, sweep up, fix the arcade, grow tomatoes, level your dishes and turn a tiny 8×8
nook into the most talked-about place in town.

Plain HTML + JavaScript ES modules rendered with [three.js](https://threejs.org) (r169, vendored
in `vendor/three`, MIT). **No build step, no framework, works offline.** The art is original (made with
Meshy) plus a few free CC0 KayKit pieces.

## Run it

ES modules need a local web server (opening `index.html` from disk won't work):

```bash
cd rest-around
python -m http.server 8000        # or: python3 -m http.server 8000
# then open http://localhost:8000
```

Any static server works (`npx serve`, `php -S localhost:8000`, …). The game works offline. While
developing, `python tools/devserver.py` serves the same folder with `Cache-Control: no-store`, so a plain
reload always picks up edited modules and models.

**Hosting:** if your host refuses `.gltf`/`.glb`/`.bin` files, upload them under other names and define
`window.RA_MODEL_URL = (url) => newUrl` in a script before `src/main.js`; the model loader passes every
model and texture URL through it.

Your progress autosaves to `localStorage` every 10 seconds and when the tab closes.
**Settings → Reset game** starts over.

## How to play

1. Guests walk in through the street door, pick a free table and sit. If every seat is taken they
   leave; if a seat is only waiting to be cleared they queue by the door for a bit.
2. A **server** takes the order (the bubble shows the drink), a **barista** brews it at a free
   **espresso station** (progress bar; better machines are faster), the server carries it over on a tray.
3. Many guests add a bake: a **baker** plates it at the **pastry case** and a server brings that too.
4. Guests sip, pay coins (+ a tip for fast service), earn you **café points**, and leave.
5. Guests drop trash; a **cleaner** sweeps it (mess lowers your rating).
6. Every guest has a **patience** meter while waiting to be seated, to order and for their order. If it
   runs out they storm off without paying and your rating drops.
7. After their coffee some guests visit the **restroom** or browse the **reading nook** for extra coins.
   These break after a number of uses until a cleaner fixes them.

Staff get tired while working. At zero energy they finish their task and nap; feed them snacks
(a cookie, a croissant, a cheesecake slice from the Market) from the Staff panel or their info card to
wake them instantly.

**The menu.** Fourteen drinks and bakes in four groups — **Coffee** (espresso, americano, latte,
cappuccino, mocha), **Cocoa & Tea** (hot chocolate, matcha latte), **Iced Drinks** (iced americano, iced
latte, berry lemonade) and **Bakery** (croissant, choc-chip cookie, blueberry muffin, strawberry
cheesecake). Each group has a limited number of menu slots that grow with your level.

**Daily goal.** Every morning a new goal appears top-left (brew N drinks, serve N guests, plate N bakes
or earn N coins). Finish it for coins and points.

**Decor.** The **Decor** tab sells wall decorations (chalk menu board, framed prints, hanging plants,
wall lamps). They hang up on their own, light up in the evening and raise your *café charm*, one of the
rating's parts. Furniture, plants, lamps, the sofa and the Welcome sign live in Build → Decor.

**Music.** A small lo-fi café loop plays (Settings → Café music). It is synthesized, there are no audio files.

**Skills & retraining.** Every finished job earns the staff member experience in their current
role, raising their skill from Novice → Apprentice → Skilled → Expert → Master (★1–5); each level
makes them walk and work faster (up to +35%). **Staff → Change job** retrains them into another
role for half that role's hiring fee. Experience in every role is kept, so going back to a job
they're already Apprentice or better at is free.

**Abilities.** From Apprentice on, each role has an ability that charges while the staff member
works (the ring around their portrait, bottom-left) and fires by itself at a good moment:

| Role | Ability | Fires when | Effect |
|---|---|---|---|
| Server | Quick Refill | guests are waiting (2+ open tasks or an impatient guest) | +90% walk & serve speed for 8 s |
| Barista | Latte Art | a drink has just started brewing | drink jumps 40% ahead, then brews 2× for 10 s |
| Cleaner | Sparkle Sweep | 2+ bits of trash within 3 tiles | tidies all of it at once |
| Baker | Fresh Batch | a bake has just started | bake jumps 40% ahead, then bakes 2× for 10 s |

You can see it coming: a coloured ring glows under the staff member from 70% charge and pulses
when full; right before release they gather power for a moment (ring contracts, motes fly in, a
filling "!" appears overhead), then a light beam and shockwave go off, the ability name pops up and
a cut-in card slides in from the left. While it lasts the ring stays lit.

A charged ability that finds no good moment for 20 s settles for a smaller one. Expert and Master
staff charge faster. Tuning lives in `ABILITIES` in `src/data.js`.

**Progression.** Coins buy furniture, staff, seeds, ingredients and room expansions. Café points
level you up, which unlocks bigger floor plans, more staff slots, more menu slots, new furniture,
wall decor and new drinks. Put ingredients from the garden (mint, strawberries, lemons, blueberries), the
market (coffee beans, milk, sugar, flour, butter, eggs, chocolate, cream, matcha) and the daily gift
into a drink or bake to level it from Lv1 to Lv10 (higher price, more points).

**Rating (0–5 ★)** blends service speed, cleanliness, average menu level, decor and broken
facilities (tap the stars for the breakdown). More stars → more guests.

**Day cycle.** A day lasts about 8 real minutes: First Brew → Brunch Rush → Slow Sips → Tea-Time
Rush → Evening Glow, then a summary card (served, lost, coins, points, rating change). The next day opens
automatically after a short countdown (toggle in Settings).

### Controls

| | |
|---|---|
| Drag | pan the camera |
| Right-drag / Shift-drag / two-finger twist | rotate the camera |
| <kbd>Q</kbd> / <kbd>E</kbd> or the ⟲ ⟳ buttons | rotate 90° (⌂ recentres) |
| Mouse wheel / pinch | zoom |
| Click a character | info card (name, role or mood, task, energy/patience) |
| <kbd>B</kbd> | build mode (the café pauses while you build) |
| <kbd>R</kbd> / <kbd>Del</kbd> / <kbd>M</kbd> | rotate / sell / move the selected item (build mode) |
| Right-click / <kbd>Esc</kbd> | stop placing, cancel a move, close things |
| <kbd>`</kbd> | hidden debug panel |

In build mode, pick an item and click the floor. The preview is green when valid and red with a
reason when not — the game refuses any layout that cuts part of the floor off from the door, blocks
the working side of an espresso station, pastry case, restroom or reading nook, or leaves a chair with no side to sit down from.
Chairs automatically turn to face an adjacent table. Floors are painted by click/drag; wallpaper
covers all walls; the **Room** tab buys bigger floor plans. Walls between the camera and the room
drop to a low cut-away so you can always see inside, whichever way you rotate.

## Art pipeline

Everything in the world is a glTF model listed in [`assets/manifest.json`](assets/manifest.json)
(`models`: file, scale, facing correction, footprint, surface/seat heights, tint rules, character
accessories); UI images, icons and surface textures are PNGs listed under `assets`.

* **Missing → placeholder.** A missing model becomes a procedural low-poly stand-in (today: the
  toilet, the barista cap and the held tools); a missing PNG becomes a
  generated image. The whole game is always playable.
* **Drop-in.** Put a correctly named `.gltf`/`.glb`/`.png` at the manifest path and reload — no
  code changes. Food icons in the UI are rendered from the food models automatically.
* **Scale:** 1 floor tile = 2 world units (the KayKit grid); models face +Z.
* **Characters** are our own rigged plush characters (staff) and rigged KayKit Adventurers (guests) with
  shared animation names (walk, carry, sit, brew, sweep, repair, nap, cheer…) chosen from each agent's
  activity; props (tray + cup, broom, wrench, mug) attach to the hand bone, baristas wear a cap. The wardrobe (Staff → Outfit) swaps the
  character, toggles helmet/hat/cape and tints the outfit.
* **Tints:** shop variants (mint table, rose armchair, silver espresso station…) re-colour one model.
* Outside: lawn, a street with passers-by (guests walk along it to the door), low-poly trees and
  garden beds that grow whatever you plant (click a bed to open the Garden panel). Lighting follows
  the clock — golden evening light, and lamps switch on for the dinner rush.

[`ASSETS.md`](ASSETS.md) documents the conventions, the sources/licences and the full generated
asset tables (`node tools/assets-table.mjs` refreshes them; optional, the game never needs Node).

### Credits

* Café props, drinks, bakes, icons and the plush staff: made for this game with Meshy (see ASSETS.md).
* A few 3D models: **Kay Lousberg** — KayKit Restaurant Bits, Furniture Bits, Character Pack:
  Adventurers (CC0). www.kaylousberg.com
* Fonts: Fredoka and Nunito (SIL Open Font License).
* three.js (MIT).

## Languages

**Settings → Language** switches between English and 繁體中文 (Traditional Chinese) instantly;
the first visit follows the browser language. Strings live in `src/lang/zh-TW.js`, keyed by the
English text (`t('Hello {name}', { name })` in `src/i18n.js`); game data names (dishes,
furniture, roles…) are localized in place. To add a language, copy `zh-TW.js`, translate the
values and register it in `LANGS`/`DICTS` in `src/i18n.js`. The hidden debug panel stays in
English.

## UI style

The interface is "liquid glass": translucent frosted layers (HUD capsules, a floating tab bar,
side sheets, the build tray) over the 3D scene, with a bright specular rim, soft depth shadows,
iOS-style switches and SF-Symbols-like vector icons (`src/ui/icons.js`). On Chromium browsers
`src/ui/glass.js` adds real lens refraction at the rims (an SVG displacement map sized to each
element, used as a `backdrop-filter`); other browsers keep the frosted blur. The colours are CSS
variables at the top of `src/ui/style.css`, and `prefers-reduced-transparency` switches to solid
panels.

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
assets/models/          glTF models: cafe/ (our own props, drinks, bakes), characters/, plus a few KayKit (CC0) pieces
assets/textures|food|ui PNG drop-in folders (surface textures, food icons, UI icons)
assets/fonts/           bundled OFL fonts (Nunito, Fredoka)
vendor/three/           three.js r169 + GLTFLoader/SkeletonUtils (MIT), loaded via an import map
ASSETS.md               asset guide + generated tables
tools/assets-table.mjs  optional: regenerate the ASSETS.md tables from the manifest
tools/build_prop.py     Meshy GLB → slim static prop glTF (see ASSETS.md); build_character.py does the characters
tools/devserver.py      no-cache static dev server
src/
  main.js               boot: load images → models → icons, restore save, start loop, autosave
  assets.js             2D image loader, PNG probing, placeholders, tint cache
  placeholder.js        generated placeholder images (textures, icons, emotes)
  models.js             glTF loader, procedural placeholder meshes, tinting, icon rendering
  renderer.js           three.js scene: lawn/street/garden, room & cut-away walls, furniture,
                        food, trash, lighting, build preview, debug overlays, 2D overlay layer
  charview.js           animated character per agent: clip selection, props, hats, facing
  abilityfx.js          staff ability visuals: charge ring, build-up, beam/shockwave, juggling
  plots.js              garden plot meshes (3D garden + Garden panel thumbnails)
  i18n.js lang/         t() translation helper; lang/zh-TW.js Traditional Chinese strings
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
  ui/                   HUD, tab bar, panels, build tray, info card, modals, debug panel, CSS;
                        icons.js (vector UI glyphs), glass.js (liquid-glass rim refraction)
```

Gameplay numbers (prices, cook times, patience, energy, arrival rates, level curve) are all in
`src/data.js`; art sizes/offsets are all in the manifest.

## Known issues & limitations

* **Guests in the room are not saved.** Staff, furniture, trash, dirty tables, broken
  facilities, stock, garden, dish levels, money and the clock are; after a reload the dining room
  starts empty (new guests arrive within seconds).
* **Guests are KayKit fantasy adventurers** (the staff are our own plush characters). Swap in townsfolk
  or café regulars by adding another rigged glTF pack to the manifest (see ASSETS.md).
* **No eating animation** in the KayKit clip set: seated guests use the sitting idle, with food on
  the table and crumbs/heart effects.
* The toilet, the barista cap and the held tools (tray, broom, wrench) are procedural placeholder meshes
  until real models are added.
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
* **Liquid glass refraction** (the lens bending at the edge of panels and the tab bar) needs a
  Chromium browser (Chrome, Edge, Arc…). Safari and Firefox show the same frosted glass without
  the bending. It can be turned off in Settings if a slow GPU struggles.
