# Refillit — Asset Guide (3D)

The game renders in real-time 3D with three.js. Every world object is a **glTF model** listed in
[`assets/manifest.json`](assets/manifest.json) → `models`; icons, emotes and surface textures are
**PNG images** listed under `assets`. The UI itself ("liquid glass" panels, buttons, tab bar) is
plain CSS in `src/ui/style.css`, so it needs no images.

* **Missing file → placeholder.** A model that isn't there gets a procedural low-poly stand-in
  (the restroom toilet is a placeholder today); a missing PNG gets a
  generated image. The game is always fully playable.
* **Drop-in replacement.** Put a correctly named `.gltf`/`.glb` or `.png` at the path in the
  manifest and reload — no code changes.
* **Debug:** press <kbd>`</kbd> → *Asset overlay* to tag everything that is still a placeholder.

## Where the current art comes from

| Pack | License | Used for |
|---|---|---|
| [KayKit Restaurant Bits](https://kaylousberg.itch.io/restaurant-bits) by Kay Lousberg | CC0 | round table, chair, door, plate |
| [KayKit Furniture Bits](https://kaylousberg.itch.io/furniture-bits) by Kay Lousberg | CC0 | square table, wooden chair, armchair |
| Refillit's own props, food, drinks and icons | made with Meshy for this game | everything else in the café (see below) |
| [KayKit Character Pack: Adventurers](https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0) by Kay Lousberg | CC0 | the guests and passers-by (staff are our own characters) + their shared animations |
| Fredoka, Nunito (Google Fonts) | SIL OFL 1.1 | UI fonts (`assets/fonts`, licences alongside) |

The character files were slimmed for the web: weapons removed, the 15 animations the game uses
moved into one shared `models/characters/animations.glb` (all five characters share the same rig,
so any character plays any clip), and each character saved as `.gltf` + `.bin` + an external
`*_texture.png`. Keep textures external: some hosts block the `blob:` URLs three.js uses for
textures embedded in a `.glb`, and the characters then render untextured (white).

**Own characters.** **Mocha Latte** (`mochalatte`, the house hamster), **Bbaekko** (`bbaekko`,
the little winged white tiger), **Hee Hee** (`heehee`, the brown bear with a petal collar) and
**Cheetie** (`cheetie`, the spotted cheetah with a yellow bow on its tail) and **Oritokki**
(`oritokki`, the fluffy white bunny-eared puffball with a red bow and one little hand) are original
characters made with Meshy. Their source tasks are listed on their `CHARACTERS` entries in
`tools/build_character.py`. All are multi-image-to-3d models made from smooth-vinyl front/side/back
views of the plush photos, remeshed to ~12k triangles. Meshy's auto-rigger only takes humanoids and
rejects their chibi shapes, so `tools/build_character.py` (Python 3 + numpy + Pillow) adds a small
skeleton, skins the mesh and bakes their own clips (idle, waddle, carry, sit, work, sweep, nap,
cheer…; Bbaekko's wings flutter, Cheetie's tail swings, Oritokki's pompom wiggles). Every head is scaled to one house face width (`FACE_WIDTH`) so the
cast matches. The build can also correct colours and redraw prints (`recolor`, `decals`) and mend
geometry/texture flaws (`repairs`) when a Meshy model needs it. Only Cheetie needs one fix: Meshy
turned the tail's yellow bow brown (the colour of the spots), so a `recolor` limited to the bow's
region (`where`) repaints it. Oritokki is a ball with a single hand, so its entry sets `one_arm`
(only the +x arm is skinned and the game holds props in `hand_l`) and `face_width: 0` (the house
face-width standard would pinch its round body). The
manifest's `animations` map on each entry tells the game which clip to play for each action. To
rebuild after changing a model or a clip: download the remesh GLB and run
`python tools/build_character.py <id> <remesh.glb>`. They *are* the staff: every staff member is one of
them, named after it (`UNIQUE_NAMES` in `src/data.js`), one staff member each, so the number of staff
slots tops out at the size of the cast. They're never random guests; the KayKit characters are only guests.

**Café props, drinks, bakes and icons (Refillit's own art).** Everything that makes the place a café
was made with Meshy from text prompts (the concept art only set the mood), then slimmed by
`tools/build_prop.py`. Large models are 2 000–9 000 triangles with a 512–1024 px JPG texture
(`assets/models/cafe/`, ~10 MB in all).

| What | Models (`assets/models/cafe/`) |
|---|---|
| Counter & bar | `espresso_machine` (on `counter_plain` = `m_espresso`, the counter with its till cut off by `tools/strip_till.py`; the stainless `espresso_machine_silver` is a Meshy retexture of it [10]), `grinder` (`m_espresso_deluxe`), `oven` (the baker's bread oven), `pastry_case_empty` (the Pastry Case: empty shelves the game fills from stock, `shelves` in the manifest; the older `pastry_case` has its pastries baked in and is unused), `counter` (cashier) |
| Seating, shelves, plants | `sofa`, `bookshelf` (a stray shelf corner repaired by `tools/fix_bookshelf.py`; also the reading nook and `m_library`), `monstera`, `planter`, `flower_box`, `floor_lamp`, `teddy`, `welcome_sign`, `table_plant` (sits on every table) |
| Hung on the walls | `menu_board`, `wall_frame`, `wall_sconce`, `hanging_plant` |
| Drinks | `cup_espresso`, `cup_americano`, `cup_latte`, `cup_cappuccino`, `cup_mocha`, `mug_cocoa`, `cup_matcha`, `glass_iced` (iced americano and berry lemonade are tinted copies) |
| Bakes | `croissant`, `cookie`, `muffin`, `cheesecake` |
| Garden produce | `strawberry`, `blueberry`, `lemon`, `mint` |
| 2D | `assets/food/ing_*.png` (market goods), `assets/ui/tool_*.png` + `icon_coin.png` (tab bar and coin), `assets/textures/doormat.png` |

The 2D art came from the same text-to-image model with a pure white background; the background is cut
out with a flood fill (see "Icons" below).

Pipeline, with Meshy costs in brackets:

1. **Image** [9]: Meshy text-to-image with **gpt-image-2**. Prompt pattern: *"<the object, every
   feature>. Single game prop in cute stylized soft 3D toy style, smooth glossy materials, warm colours,
   three-quarter front view, centred, plain white background."* Look at it before spending more. (A
   reference crop plus `generate_multi_view` image-to-image [12] gives front/side/back views and a
   tighter model for big furniture; text-to-image cannot do multi-view.)
2. **3D** [30]: image-to-3d (Meshy 7, textured, GLB) from that image, or multi-image-to-3d from the views.
3. **Remesh** [5] to 2 000–9 000 triangles, origin at the bottom, and download the GLB.
4. **Build**: `python tools/build_prop.py <name> <remesh.glb> --fit W,D,H` (world units, 1 tile = 2; add
   `--stretch X,Y,Z` for a too-shallow counter, `--rot DEG` if the front isn't +Z, `--tex` for the texture size).
   It writes `models/cafe/<name>.gltf` + `.bin` + a JPG texture.
5. **Register**: a manifest model entry (compose with `parts` when it sits on a counter), then
   `node tools/assets-table.mjs`. Reload.

A model is placed on its tile by the manifest: `footprint`, `surfaceHeight` (where the finished drink
or bake is shown), `cookProp` / `cookScale` (the cup shown while the espresso machine brews), `light`
(evening glow), `tintable` + `tintMode` (`multiply` keeps the model's own colours).

**Icons.** `ing_*.png`, `tool_*.png` and `icon_coin.png` are 3D-looking illustrations from text-to-image.
Background removal is a flood fill from the corners (anything near-white that touches the border goes),
a 1 px erode and a soft edge, then a crop to the artwork. A PNG at a manifest path replaces the
vector fallback icon (or the icon rendered from the model) without code changes.

### Adding another own character

The house style: a **smooth soft-vinyl toy** (no fur), about 1.9 units tall in the source (×1.1 ≈
2.1 in game), face width 0.67 × height (applied automatically). Each step's Meshy cost is in brackets.

1. **Three views** [12]: Meshy image-to-image with **gpt-image-2** and `generate_multi_view`, using the
   plush photo as the reference. Prompt pattern: *"Recreate this exact plush … as a smooth soft-vinyl
   toy, keeping its shape, proportions, colours and details exactly: <list every feature>. Only
   change: smooth matte surface instead of fur. No keychain, chain, clasp or tag, no tail. Plain white
   background, front, side and back views."* (≤ 600 characters.) nano-banana drifts off the design
   (adds tails and bellies, moves bows, lengthens arms), so don't use it. Leave "no tail" out when the
   plush has one (Cheetie's does) and name it instead: *"short spotted tail with a yellow bow"*. Check
   that the side and back views agree on the tail's size and shape.
2. **Check the views** with the owner before spending more, and look for transparent holes: enclosed
   alpha < 10, often where a keychain ring was. Fill them with the surrounding colour.
3. **3D** [30]: multi-image-to-3d from those images (Meshy 7, textured, GLB). A started task can't be
   cancelled.
4. **Remesh** [5] to 12 000 triangles, origin at the bottom, and download the GLB.
5. **Measure** the remesh: centre it, then print the x/z extent per 0.05 of height. From that read
   off the hips/legs, the arm band (where x jumps out), the neck (narrowest point), the cheek band
   below the ears, and the ears.
6. **Add a `CHARACTERS` entry**: bones, skin bands, `face` band (copy the closest existing character and
   adjust; a tail is one `tail` bone plus the `tail_z/x/y` bands, copy Cheetie), then run `python tools/build_character.py <id> <remesh.glb>`.
7. **Register it in the game**:
   - a manifest character entry (copy an existing one; `animations` map, `hand`/`handL`/`head`, `trayPos`, `sitForward`)
   - the id in `UNIQUE_MODELS` (`src/data.js`)
   - the display name in the wardrobe `names` map (`src/ui/panels.js`)
   - this section, then `node tools/assets-table.mjs`
8. **Verify** in the running game. Hard-reload changed files (browsers cache the modules and models).
   Render the new character next to the others, front and back, plus a few clips (Walk, Cheer, Sit,
   Nap, Talk, Carry). Check that nothing pokes out or tears (collars, wings, bows).

## Conventions for models

| Rule | Value |
|---|---|
| Units | **1 floor tile = 2 world units** (KayKit's grid). A 1-tile item fits in 2×2 units. |
| Up / front | +Y is up. The item's **front faces +Z** (use `rotY` in the manifest to fix models that face another way — KayKit models already face +Z). |
| Origin | The loader centres the model on X/Z and puts its lowest point on the floor (`center: false` keeps the file's own origin, used for the door hinge). |
| Size | `scale` in the manifest; `surfaceHeight` (where dishes sit) and `seatHeight` are in world units. |
| Tinting | `tintable: true` models can be recoloured per shop item. Furniture is re-coloured (the texture is greyed, then tinted); food is lightly multiplied. |
| Multi-tile | `footprint: [w, h]` in tiles for the "front" orientation (e.g. the 2×1 library wall). |
| Composites | `parts` builds one item from several models (salad = bowl + lettuce + tomato slices). |
| Characters | A rigged glTF using the KayKit rig bone names (`handslot.r`, `head`). `accessories` lists mesh names the wardrobe can toggle. Animation names are mapped in `characterAnimations` (idle, walk, carry, sit, cook, sweep, nap, …). |

**To add a different character pack** (e.g. casual townsfolk from Kenney or Quaternius): add an
entry to `models` with `category: "character"`, point `file` at the `.gltf`, and — if its rig or
clip names differ — point `characterAnimationFile` at its animations and update
`characterAnimations`. Then add the id to `CHARACTER_MODELS` in `src/data.js`.

## Conventions for images

* Food & ingredient icons are **rendered from the 3D model with the same id** at load time; a
  PNG at the listed path overrides that.
* Surface textures (`tex_*`) are square, seamless, 256×256 (or a multiple), drawn light grey where
  marked *tintable* (floor and wallpaper colours come from the shop item's tint).
* UI icons and emotes (`icon_*`, `tool_*`, `emote_*`) fall back to built-in vector glyphs
  (`src/ui/icons.js`) instead of a generated placeholder, both in the UI and in the in-world
  speech bubbles. A PNG at the listed path still replaces them.
* Staff snacks (`snack_*`) are rendered from small procedural 3D models (cookie, sandwich,
  bento), and the Garden panel renders its plots in 3D, so no 2D art is needed for them.

## Asset tables (generated)

Regenerate with `node tools/assets-table.mjs` after editing the manifest.

<!-- ASSET-TABLE:START -->

### 3D models (70)

**Furniture**

| id | source | notes |
|---|---|---|
| `m_table_round` | `models/restaurant/table_round_A_small.gltf` | surface 1; tintable |
| `m_table_square` | `models/furniture/table_medium.gltf` | surface 1; tintable |
| `m_chair_a` | `models/restaurant/chair_A.gltf` | seat 0.55; tintable |
| `m_chair_wood` | `models/furniture/chair_A_wood.gltf` | seat 0.55; tintable |
| `m_armchair` | `models/furniture/armchair.gltf` | seat 0.55; scale 0.8; tintable |

**Kitchen**

| id | source | notes |
|---|---|---|
| `m_espresso_machine` | `models/cafe/espresso_machine.gltf` |  |
| `m_counter_cafe` | `models/cafe/counter.gltf` | surface 0.72 |
| `m_counter_plain` | `models/cafe/counter_plain.gltf` | surface 0.72 |
| `m_espresso` | composite: `m_counter_plain` + `m_espresso_machine` | surface 0.72; tintable |
| `m_espresso_machine_silver` | `models/cafe/espresso_machine_silver.gltf` |  |
| `m_espresso_silver` | composite: `m_counter_plain` + `m_espresso_machine_silver` | surface 0.72 |
| `m_espresso_deluxe` | composite: `m_counter_plain` + `m_espresso_machine` + `m_grinder` | surface 0.72 |
| `m_oven` | `models/cafe/oven.gltf` | surface 1.4 |
| `m_pastry_case` | `models/cafe/pastry_case.gltf` | surface 1.5 |
| `m_pastry_case_empty` | `models/cafe/pastry_case_empty.gltf` | surface 1.9 |

**Fun**

| id | source | notes |
|---|---|---|
| `m_toilet` | _procedural placeholder_ (`toilet`) |  |
| `m_bookshelf` | `models/cafe/bookshelf.gltf` |  |
| `m_library` | composite: `m_bookshelf` + `m_bookshelf` | footprint 2×1 |

**Decor**

| id | source | notes |
|---|---|---|
| `m_sofa` | `models/cafe/sofa.gltf` | footprint 2×1 |
| `m_monstera` | `models/cafe/monstera.gltf` |  |
| `m_monstera_big` | `models/cafe/monstera.gltf` | scale 1.22 |
| `m_planter` | `models/cafe/planter.gltf` | footprint 2×1 |
| `m_flower_box` | `models/cafe/flower_box.gltf` |  |
| `m_floor_lamp` | `models/cafe/floor_lamp.gltf` | tintable |
| `m_teddy` | `models/cafe/teddy.gltf` |  |
| `m_welcome_sign` | `models/cafe/welcome_sign.gltf` |  |

**Props**

| id | source | notes |
|---|---|---|
| `m_door` | `models/restaurant/door_A.gltf` |  |
| `m_plate` | `models/restaurant/plate.gltf` |  |
| `m_plate_dirty` | `models/restaurant/plate_dirty.gltf` |  |
| `m_trash` | _procedural placeholder_ (`trash`) |  |
| `m_tray` | _procedural placeholder_ (`tray`) |  |
| `m_broom` | _procedural placeholder_ (`broom`) |  |
| `m_wrench` | _procedural placeholder_ (`wrench`) |  |
| `m_mug` | `models/props/mug_full.gltf` |  |
| `m_grinder` | `models/cafe/grinder.gltf` |  |
| `m_table_plant` | `models/cafe/table_plant.gltf` |  |
| `m_baristahat` | _procedural placeholder_ (`baristacap`) |  |

**Food & ingredients**

| id | source | notes |
|---|---|---|
| `dish_espresso` | `models/cafe/cup_espresso.gltf` |  |
| `dish_americano` | `models/cafe/cup_americano.gltf` |  |
| `dish_latte` | `models/cafe/cup_latte.gltf` |  |
| `dish_cappuccino` | `models/cafe/cup_cappuccino.gltf` |  |
| `dish_mocha` | `models/cafe/cup_mocha.gltf` |  |
| `dish_hotchoc` | `models/cafe/mug_cocoa.gltf` |  |
| `dish_matcha` | `models/cafe/cup_matcha.gltf` |  |
| `dish_icedlatte` | `models/cafe/glass_iced.gltf` |  |
| `dish_icedamericano` | `models/cafe/glass_iced.gltf` | tintable |
| `dish_berrylemonade` | `models/cafe/glass_iced.gltf` | tintable |
| `dish_croissant` | `models/cafe/croissant.gltf` |  |
| `dish_cookie` | `models/cafe/cookie.gltf` |  |
| `dish_muffin` | `models/cafe/muffin.gltf` |  |
| `dish_cheesecake` | `models/cafe/cheesecake.gltf` |  |
| `ing_strawberry` | `models/cafe/strawberry.gltf` |  |
| `ing_blueberry` | `models/cafe/blueberry.gltf` |  |
| `ing_lemon` | `models/cafe/lemon.gltf` |  |
| `ing_mint` | `models/cafe/mint.gltf` |  |

**Characters**

| id | source | notes |
|---|---|---|
| `knight` | `models/characters/Knight.gltf` | accessories: Knight_Helmet, Knight_Cape |
| `mage` | `models/characters/Mage.gltf` | accessories: Mage_Hat, Mage_Cape |
| `barbarian` | `models/characters/Barbarian.gltf` | accessories: Barbarian_Hat, Barbarian_Cape |
| `rogue` | `models/characters/Rogue.gltf` | accessories: Rogue_Cape |
| `rogue_hooded` | `models/characters/Rogue_Hooded.gltf` | accessories: Rogue_Cape |
| `guest_b` | `models/characters/GuestB.gltf` | own rig + clips |
| `mochalatte` | `models/characters/MochaLatte.gltf` | own rig + clips |
| `bbaekko` | `models/characters/Bbaekko.gltf` | own rig + clips |
| `heehee` | `models/characters/HeeHee.gltf` | own rig + clips |
| `cheetie` | `models/characters/Cheetie.gltf` | own rig + clips |
| `oritokki` | `models/characters/Oritokki.gltf` | own rig + clips |

### 2D images (73)

| id | file | size (px) | notes |
|---|---|---|---|
| `tex_floor_wood` | `textures/tex_floor_wood.png` | 256×256 | tintable |
| `tex_floor_checker` | `textures/tex_floor_checker.png` | 256×256 | tintable |
| `tex_floor_carpet` | `textures/tex_floor_carpet.png` | 256×256 | tintable |
| `tex_wall_plain` | `textures/tex_wall_plain.png` | 256×256 | tintable |
| `tex_wall_stripe` | `textures/tex_wall_stripe.png` | 256×256 | tintable |
| `tex_grass` | `textures/tex_grass.png` | 256×256 |  |
| `tex_path` | `textures/tex_path.png` | 256×256 |  |
| `tex_road` | `textures/tex_road.png` | 256×256 |  |
| `tex_soil` | `textures/tex_soil.png` | 256×256 |  |
| `tex_doormat` | `textures/doormat.png` | 512×512 |  |
| `ui_bubble` | `ui/ui_bubble.png` | 64×60 |  |
| `emote_heart` | `ui/emote_heart.png` | 40×40 |  |
| `emote_angry` | `ui/emote_angry.png` | 40×40 |  |
| `emote_sad` | `ui/emote_sad.png` | 40×40 |  |
| `emote_zzz` | `ui/emote_zzz.png` | 40×40 |  |
| `emote_wait` | `ui/emote_wait.png` | 40×40 |  |
| `emote_sparkle` | `ui/emote_sparkle.png` | 40×40 |  |
| `emote_note` | `ui/emote_note.png` | 40×40 |  |
| `emote_broken` | `ui/emote_broken.png` | 40×40 |  |
| `emote_menu` | `ui/emote_menu.png` | 40×40 |  |
| `icon_coin` | `ui/icon_coin.png` | 40×40 |  |
| `icon_points` | `ui/icon_points.png` | 40×40 |  |
| `icon_star` | `ui/icon_star.png` | 40×40 |  |
| `icon_star_empty` | `ui/icon_star_empty.png` | 40×40 |  |
| `icon_energy` | `ui/icon_energy.png` | 40×40 |  |
| `icon_clock` | `ui/icon_clock.png` | 40×40 |  |
| `icon_gift` | `ui/icon_gift.png` | 40×40 |  |
| `icon_patience` | `ui/icon_patience.png` | 40×40 |  |
| `icon_rotate` | `ui/icon_rotate.png` | 40×40 |  |
| `icon_move` | `ui/icon_move.png` | 40×40 |  |
| `icon_sell` | `ui/icon_sell.png` | 40×40 |  |
| `icon_lock` | `ui/icon_lock.png` | 40×40 |  |
| `icon_water` | `ui/icon_water.png` | 40×40 |  |
| `icon_seed` | `ui/icon_seed.png` | 40×40 |  |
| `icon_harvest` | `ui/icon_harvest.png` | 40×40 |  |
| `icon_level` | `ui/icon_level.png` | 40×40 |  |
| `tool_build` | `ui/tool_build.png` | 64×64 |  |
| `tool_staff` | `ui/tool_staff.png` | 64×64 |  |
| `tool_menu` | `ui/tool_menu.png` | 64×64 |  |
| `tool_garden` | `ui/tool_garden.png` | 64×64 |  |
| `tool_market` | `ui/tool_market.png` | 64×64 |  |
| `tool_settings` | `ui/tool_settings.png` | 64×64 |  |
| `dish_espresso` | `food/dish_espresso.png` | 64×64 | rendered from model `dish_espresso` unless the PNG exists |
| `dish_americano` | `food/dish_americano.png` | 64×64 | rendered from model `dish_americano` unless the PNG exists |
| `dish_latte` | `food/dish_latte.png` | 64×64 | rendered from model `dish_latte` unless the PNG exists |
| `dish_cappuccino` | `food/dish_cappuccino.png` | 64×64 | rendered from model `dish_cappuccino` unless the PNG exists |
| `dish_mocha` | `food/dish_mocha.png` | 64×64 | rendered from model `dish_mocha` unless the PNG exists |
| `dish_hotchoc` | `food/dish_hotchoc.png` | 64×64 | rendered from model `dish_hotchoc` unless the PNG exists |
| `dish_matcha` | `food/dish_matcha.png` | 64×64 | rendered from model `dish_matcha` unless the PNG exists |
| `dish_icedamericano` | `food/dish_icedamericano.png` | 64×64 | rendered from model `dish_icedamericano` unless the PNG exists |
| `dish_icedlatte` | `food/dish_icedlatte.png` | 64×64 | rendered from model `dish_icedlatte` unless the PNG exists |
| `dish_berrylemonade` | `food/dish_berrylemonade.png` | 64×64 | rendered from model `dish_berrylemonade` unless the PNG exists |
| `dish_croissant` | `food/dish_croissant.png` | 64×64 | rendered from model `dish_croissant` unless the PNG exists |
| `dish_cookie` | `food/dish_cookie.png` | 64×64 | rendered from model `dish_cookie` unless the PNG exists |
| `dish_muffin` | `food/dish_muffin.png` | 64×64 | rendered from model `dish_muffin` unless the PNG exists |
| `dish_cheesecake` | `food/dish_cheesecake.png` | 64×64 | rendered from model `dish_cheesecake` unless the PNG exists |
| `ing_beans` | `food/ing_beans.png` | 48×48 |  |
| `ing_milk` | `food/ing_milk.png` | 48×48 |  |
| `ing_sugar` | `food/ing_sugar.png` | 48×48 |  |
| `ing_flour` | `food/ing_flour.png` | 48×48 |  |
| `ing_butter` | `food/ing_butter.png` | 48×48 |  |
| `ing_egg` | `food/ing_egg.png` | 48×48 |  |
| `ing_chocolate` | `food/ing_chocolate.png` | 48×48 |  |
| `ing_cream` | `food/ing_cream.png` | 48×48 |  |
| `ing_matcha` | `food/ing_matcha.png` | 48×48 |  |
| `ing_strawberry` | `food/ing_strawberry.png` | 48×48 | rendered from model `ing_strawberry` unless the PNG exists |
| `ing_blueberry` | `food/ing_blueberry.png` | 48×48 | rendered from model `ing_blueberry` unless the PNG exists |
| `ing_lemon` | `food/ing_lemon.png` | 48×48 | rendered from model `ing_lemon` unless the PNG exists |
| `ing_mint` | `food/ing_mint.png` | 48×48 | rendered from model `ing_mint` unless the PNG exists |
| `snack_cookie` | `food/snack_cookie.png` | 48×48 | rendered from model `dish_cookie` unless the PNG exists |
| `snack_sandwich` | `food/snack_sandwich.png` | 48×48 | rendered from model `dish_croissant` unless the PNG exists |
| `snack_bento` | `food/snack_bento.png` | 48×48 | rendered from model `dish_cheesecake` unless the PNG exists |
| `tool_decor` | `ui/tool_decor.png` | 64×64 |  |

<!-- ASSET-TABLE:END -->
