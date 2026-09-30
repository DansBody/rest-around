# Rest Around — Asset Guide (3D)

The game renders in real-time 3D with three.js. Every world object is a **glTF model** listed in
[`assets/manifest.json`](assets/manifest.json) → `models`; icons, emotes and surface textures are
**PNG images** listed under `assets`. The UI itself ("liquid glass" panels, buttons, tab bar) is
plain CSS in `src/ui/style.css`, so it needs no images.

* **Missing file → placeholder.** A model that isn't there gets a procedural low-poly stand-in
  (the restroom toilet and the arcade cabinet are placeholders today); a missing PNG gets a
  generated image. The game is always fully playable.
* **Drop-in replacement.** Put a correctly named `.gltf`/`.glb` or `.png` at the path in the
  manifest and reload — no code changes.
* **Debug:** press <kbd>`</kbd> → *Asset overlay* to tag everything that is still a placeholder.

## Where the current art comes from

| Pack | License | Used for |
|---|---|---|
| [KayKit Restaurant Bits](https://kaylousberg.itch.io/restaurant-bits) by Kay Lousberg | CC0 | tables, chairs, stoves, counters (bar), door, plates, bowls, pan, crates, burgers, stew, dinner plate, all vegetable/meat ingredients |
| [KayKit Furniture Bits](https://kaylousberg.itch.io/furniture-bits) by Kay Lousberg | CC0 | wooden table & chair, armchair, standing lamp, cacti |
| [KayKit Character Pack: Adventurers](https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0) by Kay Lousberg | CC0 | all characters + their shared animations |
| Fredoka, Nunito (Google Fonts) | SIL OFL 1.1 | UI fonts (`assets/fonts`, licences alongside) |

The character files were slimmed for the web: weapons removed, the 15 animations the game uses
moved into one shared `models/characters/animations.glb` (all five characters share the same rig,
so any character plays any clip), and each character saved as `.gltf` + `.bin` + an external
`*_texture.png`. Keep textures external: some hosts block the `blob:` URLs three.js uses for
textures embedded in a `.glb`, and the characters then render untextured (white).

## Conventions for models

| Rule | Value |
|---|---|
| Units | **1 floor tile = 2 world units** (KayKit's grid). A 1-tile item fits in 2×2 units. |
| Up / front | +Y is up. The item's **front faces +Z** (use `rotY` in the manifest to fix models that face another way — KayKit models already face +Z). |
| Origin | The loader centres the model on X/Z and puts its lowest point on the floor (`center: false` keeps the file's own origin, used for the door hinge). |
| Size | `scale` in the manifest; `surfaceHeight` (where dishes sit) and `seatHeight` are in world units. |
| Tinting | `tintable: true` models can be recoloured per shop item. Furniture is re-coloured (the texture is greyed, then tinted); food is lightly multiplied. |
| Multi-tile | `footprint: [w, h]` in tiles for the "front" orientation (e.g. the 2×1 juice bar). |
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
* UI icons (`icon_*`, `tool_*`, and the heart/angry emotes in the day summary) fall back to
  built-in vector glyphs (`src/ui/icons.js`) instead of a generated placeholder. A PNG at the
  listed path still replaces them.

## Asset tables (generated)

Regenerate with `node tools/assets-table.mjs` after editing the manifest.

<!-- ASSET-TABLE:START -->

### 3D models (64)

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
| `m_stove` | `models/restaurant/stove_single.gltf` | surface 1.2; tintable |
| `m_stove_deluxe` | `models/restaurant/stove_multi.gltf` | surface 1.2 |
| `m_counter` | `models/restaurant/kitchencounter_straight_A.gltf` |  |
| `m_counter_deco` | `models/restaurant/kitchencounter_straight_A_decorated.gltf` |  |
| `m_bar` | composite: `m_counter` + `m_counter_deco` | footprint 2×1; surface 1; tintable |

**Fun**

| id | source | notes |
|---|---|---|
| `m_toilet` | _procedural placeholder_ (`toilet`) |  |
| `m_arcade` | _procedural placeholder_ (`arcade`) | tintable |

**Decor**

| id | source | notes |
|---|---|---|
| `m_cactus` | `models/furniture/cactus_medium_A.gltf` | scale 1.3 |
| `m_cactus_b` | `models/furniture/cactus_medium_B.gltf` | scale 1.5 |
| `m_lamp` | `models/furniture/lamp_standing.gltf` | tintable |
| `m_crate_tomatoes` | `models/restaurant/crate_tomatoes.gltf` | scale 0.8 |
| `m_crate_carrots` | `models/restaurant/crate_carrots.gltf` | scale 0.8 |

**Props**

| id | source | notes |
|---|---|---|
| `m_door` | `models/restaurant/door_A.gltf` |  |
| `m_plate` | `models/restaurant/plate.gltf` |  |
| `m_plate_dirty` | `models/restaurant/plate_dirty.gltf` |  |
| `m_bowl` | `models/restaurant/bowl.gltf` |  |
| `m_pan` | `models/restaurant/pan_A.gltf` |  |
| `m_trash` | _procedural placeholder_ (`trash`) |  |
| `m_tray` | _procedural placeholder_ (`tray`) |  |
| `m_broom` | _procedural placeholder_ (`broom`) |  |
| `m_wrench` | _procedural placeholder_ (`wrench`) |  |
| `m_chefhat` | _procedural placeholder_ (`chefhat`) |  |
| `m_mug` | `models/props/mug_full.gltf` |  |

**Food & ingredients**

| id | source | notes |
|---|---|---|
| `dish_salad` | composite: `m_bowl` + `ing_lettuce_chopped` + `ing_tomato_slices` |  |
| `ing_lettuce_chopped` | `models/restaurant/food_ingredient_lettuce_chopped.gltf` |  |
| `ing_tomato_slices` | `models/restaurant/food_ingredient_tomato_slices.gltf` |  |
| `dish_onionrings` | composite: `m_plate` + `ing_onion_rings` |  |
| `ing_onion_rings` | `models/restaurant/food_ingredient_onion_rings.gltf` |  |
| `dish_soup` | `models/restaurant/stew_bowl.gltf` | tintable |
| `dish_burger` | `models/restaurant/food_burger.gltf` |  |
| `dish_veggieburger` | `models/restaurant/food_vegetableburger.gltf` |  |
| `dish_stew` | `models/restaurant/food_stew.gltf` |  |
| `dish_steak` | `models/restaurant/food_dinner.gltf` |  |
| `dish_ham` | composite: `m_plate` + `ing_ham_cooked` |  |
| `ing_ham_cooked` | `models/restaurant/food_ingredient_ham_cooked.gltf` |  |
| `dish_pudding` | _procedural placeholder_ (`pudding`) |  |
| `dish_cake` | _procedural placeholder_ (`cake`) |  |
| `dish_pie` | _procedural placeholder_ (`pie`) |  |
| `drink_lemonade` | _procedural placeholder_ (`glass`) |  |
| `drink_rootbeer` | `models/props/mug_full.gltf` | scale 1.6 |
| `drink_milkshake` | _procedural placeholder_ (`glass`) |  |
| `ing_tomato` | `models/restaurant/food_ingredient_tomato.gltf` |  |
| `ing_lettuce` | `models/restaurant/food_ingredient_lettuce.gltf` |  |
| `ing_carrot` | `models/restaurant/food_ingredient_carrot.gltf` |  |
| `ing_potato` | `models/restaurant/food_ingredient_potato.gltf` |  |
| `ing_onion` | `models/restaurant/food_ingredient_onion.gltf` |  |
| `ing_bun` | `models/restaurant/food_ingredient_bun.gltf` |  |
| `ing_steak` | `models/restaurant/food_ingredient_steak.gltf` |  |
| `ing_cheese` | `models/restaurant/food_ingredient_cheese.gltf` |  |
| `ing_ham` | `models/restaurant/food_ingredient_ham.gltf` |  |
| `ing_egg` | _procedural placeholder_ (`egg`) |  |
| `ing_milk` | _procedural placeholder_ (`bottle`) |  |
| `ing_flour` | _procedural placeholder_ (`sack`) |  |
| `ing_lemon` | _procedural placeholder_ (`lemon`) |  |

**Characters**

| id | source | notes |
|---|---|---|
| `knight` | `models/characters/Knight.gltf` | accessories: Knight_Helmet, Knight_Cape |
| `mage` | `models/characters/Mage.gltf` | accessories: Mage_Hat, Mage_Cape |
| `barbarian` | `models/characters/Barbarian.gltf` | accessories: Barbarian_Hat, Barbarian_Cape |
| `rogue` | `models/characters/Rogue.gltf` | accessories: Rogue_Cape |
| `rogue_hooded` | `models/characters/Rogue_Hooded.gltf` | accessories: Rogue_Cape |

### 2D images (74)

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
| `dish_salad` | `food/dish_salad.png` | 64×64 | rendered from model `dish_salad` unless the PNG exists |
| `dish_onionrings` | `food/dish_onionrings.png` | 64×64 | rendered from model `dish_onionrings` unless the PNG exists |
| `dish_soup` | `food/dish_soup.png` | 64×64 | rendered from model `dish_soup` unless the PNG exists |
| `dish_burger` | `food/dish_burger.png` | 64×64 | rendered from model `dish_burger` unless the PNG exists |
| `dish_veggieburger` | `food/dish_veggieburger.png` | 64×64 | rendered from model `dish_veggieburger` unless the PNG exists |
| `dish_stew` | `food/dish_stew.png` | 64×64 | rendered from model `dish_stew` unless the PNG exists |
| `dish_steak` | `food/dish_steak.png` | 64×64 | rendered from model `dish_steak` unless the PNG exists |
| `dish_ham` | `food/dish_ham.png` | 64×64 | rendered from model `dish_ham` unless the PNG exists |
| `dish_pudding` | `food/dish_pudding.png` | 64×64 | rendered from model `dish_pudding` unless the PNG exists |
| `dish_cake` | `food/dish_cake.png` | 64×64 | rendered from model `dish_cake` unless the PNG exists |
| `dish_pie` | `food/dish_pie.png` | 64×64 | rendered from model `dish_pie` unless the PNG exists |
| `drink_lemonade` | `food/drink_lemonade.png` | 64×64 | rendered from model `drink_lemonade` unless the PNG exists |
| `drink_rootbeer` | `food/drink_rootbeer.png` | 64×64 | rendered from model `drink_rootbeer` unless the PNG exists |
| `drink_milkshake` | `food/drink_milkshake.png` | 64×64 | rendered from model `drink_milkshake` unless the PNG exists |
| `ing_tomato` | `food/ing_tomato.png` | 48×48 | rendered from model `ing_tomato` unless the PNG exists |
| `ing_lettuce` | `food/ing_lettuce.png` | 48×48 | rendered from model `ing_lettuce` unless the PNG exists |
| `ing_carrot` | `food/ing_carrot.png` | 48×48 | rendered from model `ing_carrot` unless the PNG exists |
| `ing_potato` | `food/ing_potato.png` | 48×48 | rendered from model `ing_potato` unless the PNG exists |
| `ing_onion` | `food/ing_onion.png` | 48×48 | rendered from model `ing_onion` unless the PNG exists |
| `ing_bun` | `food/ing_bun.png` | 48×48 | rendered from model `ing_bun` unless the PNG exists |
| `ing_steak` | `food/ing_steak.png` | 48×48 | rendered from model `ing_steak` unless the PNG exists |
| `ing_egg` | `food/ing_egg.png` | 48×48 | rendered from model `ing_egg` unless the PNG exists |
| `ing_milk` | `food/ing_milk.png` | 48×48 | rendered from model `ing_milk` unless the PNG exists |
| `ing_cheese` | `food/ing_cheese.png` | 48×48 | rendered from model `ing_cheese` unless the PNG exists |
| `ing_flour` | `food/ing_flour.png` | 48×48 | rendered from model `ing_flour` unless the PNG exists |
| `ing_lemon` | `food/ing_lemon.png` | 48×48 | rendered from model `ing_lemon` unless the PNG exists |
| `ing_ham` | `food/ing_ham.png` | 48×48 | rendered from model `ing_ham` unless the PNG exists |
| `snack_cookie` | `food/snack_cookie.png` | 48×48 |  |
| `snack_sandwich` | `food/snack_sandwich.png` | 48×48 |  |
| `snack_bento` | `food/snack_bento.png` | 48×48 |  |
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
| `ui_logo` | `ui/ui_logo.png` | 480×160 |  |
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
| `garden_soil` | `ui/garden_soil.png` | 112×72 |  |
| `garden_sprout` | `ui/garden_sprout.png` | 48×48 |  |

<!-- ASSET-TABLE:END -->
