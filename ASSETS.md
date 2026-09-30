# Rest Around — Art & Asset Guide

Everything the game draws comes from PNG files listed in [`assets/manifest.json`](assets/manifest.json).
When a file is missing the game generates a clean placeholder at load time (same size, same anchor,
soft rounded shape in the category color, labeled with its id), so the whole game is playable with
zero art. **Drop a correctly named PNG into `assets/…` and reload — it replaces its placeholder with
no code changes.**

Press <kbd>`</kbd> in game → tick **Asset overlay** to see which assets are still placeholders
(the debug panel also lists every placeholder id).

---

## 1. Style bible (prepend this to every image prompt)

> Cozy chibi game art for a cute isometric restaurant-management game, in the spirit of 2009-era
> social browser games. Soft, rounded, friendly shapes with slightly chunky proportions; clean
> 2–3 px warm dark-cocoa outlines (#5b3a28), never pure black. Pastel palette — cream #fff4e0,
> peach #f9c9a4, rose #f2a7b5, mint #a8dcc4, sky #a9cbe8, butter #f7df8c, lavender #c9b6e3 — with
> gentle cel shading: one soft shadow tone and one small highlight per material, no gradients noise,
> no texture grain, no hard specular. Light always comes from the TOP-LEFT: top faces brightest,
> left-facing sides mid-tone, right-facing sides in shade. Strict 2:1 dimetric isometric view
> (floor tiles are 128×64 px diamonds, lines at 26.57°), seen from the same camera angle for every
> object. Single object, centered, fully visible, on a fully transparent background, no ground
> plane, no cast shadow on the floor, no text, no watermark, no border.

**Extra line for tintable assets** (marked *tintable* in the table):

> Render it in light neutral greys only (no hue, values between 65 % and 100 % brightness), keeping
> all shading as value changes, so the game can recolor it by multiplying a tint.

**Extra line for character layers:**

> This is one paper-doll layer of a chibi character (about 130 px tall in total with a big round
> head); draw ONLY the named part, everything else transparent, positioned exactly as described.

---

## 2. Conventions

| Rule | Value |
|---|---|
| Tile | **128 × 64 px**, 2:1 dimetric. A w×h-tile footprint is `(w+h)·64` px wide. |
| Light | Top-left, in every asset (mirrored copies are accepted as-is). |
| Background | Transparent PNG (sRGB, 8-bit RGBA). |
| Resolution | Draw at the listed size **or an exact multiple** (2× recommended). The game scales the image to the manifest size, so the anchor stays in the same *relative* spot. |
| Anchor | The pixel (in the listed size) that is placed on the object's reference point. Furniture & floors: centre of the footprint on the floor. Walls: middle of the wall's base line. Character layers: the rig slot (see §4). Icons: their centre. |
| Facings | `fl` = **front-left**: the object's front faces the viewer's lower-left. `bl` = **back-left**: its front faces the upper-left (you mostly see its back). The game mirrors `fl`→`fr` and `bl`→`br`. Symmetric things have a single view. |
| Tinting | *Tintable* assets are drawn light grey and multiplied by a colour in code (one chair shape → oak, mint, rose… chairs; outfits → any colour). |
| Height data | `surfaceHeight` (tables, stoves, bar: where dishes sit), `seatHeight` (chairs: where a seated character's feet go) and `heightOffset` (lifts a sprite) are pixel distances **above the anchor**. If your art's table top or seat is higher/lower, edit just that number in the manifest. |
| Names | The file path in the table is exactly where the game looks (`{dir}` is replaced by `fl`/`bl`). |

### Isometric footprint cheat-sheet

```
 1×1 furniture, 128 px wide             2×1 bar counter (fl), 192 px wide
          ^  top corner                           ^
        /   \                                  /     \
      /  ·A  \   A = anchor = tile centre    /    ·A   \      A = centre of both tiles
      \      /       (64, image_h − 32)      \         /          (96, image_h − 48)
        \   /                                  \     /
          v  bottom corner                        v
```

Walls: one segment per floor tile along the back-left wall, 64×224 px, drawn for the LEFT wall
(base line runs from the upper-right to the lower-left); the right wall is the same image mirrored
and slightly shaded. The door replaces one left-wall segment (`door_frame` + `door_leaf`).

---

## 3. Keeping the list lean (reuse built into the manifest)

* **1 table, 2 chair shapes, 1 stove shape + 1 deluxe, 1 lamp** → 20 buyable furniture items via tints.
* **3 floor patterns, 2 wall patterns** → 6 floors and 5 wallpapers via tints.
* **Characters are paper dolls**: 4 hair styles × any colour, 3 tops, 2 bottoms, 3 hats, 6 skin tones
  → thousands of customers and fully customisable staff outfits from ~39 small images.
* Dish/ingredient icons are reused everywhere: menu, order bubbles, trays, tables, garden, market.

---

## 4. Character rig (paper doll)

A character is assembled from layers at runtime. All motion (walk bob, squash & stretch, arm swing,
sitting, eating, working, napping, emote pops) is procedural, so **each layer is a single still
image** (two facings for most).

The **root** is the point between the feet on the floor. Each rig *slot* below is a pixel offset
from the root (x → right, y → down, so negative y is up). Each layer image is drawn with *its own
anchor* placed on its slot. Slot values live in `manifest.json → characterRig.slots` and can be
edited if your art needs different proportions.

| slot | fl (x, y) | used by | notes |
|---|---|---|---|
| `legL`, `legR` | −8, −15 / 8, −15 | `char_leg` | hip joints; legs hang down, step procedurally |
| `hip` | 0, −15 | `bottom_*` | waistband centre |
| `body` | 0, −12 | `char_body`, `top_*` | bottom-centre of the torso |
| `shoulderL`, `shoulderR` | −15, −39 / 15, −39 | `char_arm` | arm pivots (arms rotate here) |
| `neck` | 0, −40 | `char_head` | head pivots here for tilts |
| `face` | 0, −60 | `face_*` | centre of the face decal (front view only) |
| `crown` | 0, −72 | `hair_*` | centre of the hair piece |
| `hatTop` | 0, −93 | `hat_*` | top of the head |
| `carry` | 2, −38 | `held_tray` | tray held in front with both hands |
| `handOffset` | 0, 19 | tools | hand position relative to the shoulder (tools rotate with the arm) |
| `emote` | 0, −124 | bubbles | emote bubble tail tip |

Draw order (front view): legs → body → bottom → top → left arm → head → face → hair → hat → held
item → right arm. Back view hides the face and draws the held item first (behind the body).

**Easiest way to make a consistent set:** generate one full chibi in the front-left view and one in
the back-left view on a 128×160 canvas with the feet at (64, 150); then cut it into the layers in an
image editor using the slot table (e.g. the head image is 62×58 with its bottom-centre at the
neck, 40 px above the feet). Hair/outfits in other styles can then be generated "to fit this
template". Keep the head big (≈52 px across) and the body tiny — that's what makes it chibi.

---

## 5. Prompt examples

* **Furniture:** `<style bible> + <tintable line> A small square café table on a single pedestal leg with rounded corners, isometric, 128×128 px, the table's footprint diamond centred at the bottom (centre at x 64, y 96).`
* **Directional furniture:** `…A compact enamel stove with two burners and an oven door with a round window. FRONT-LEFT view: the oven door faces the lower-left.` and then the same prompt with `BACK-LEFT view: we see the plain back of the stove; the front faces the upper-left.`
* **Character layer:** `<style bible> + <character line> + <tintable line> Hair piece only: a short rounded bob with straight bangs, front-left view, 68×52 px; the bangs end about 34 px below the top edge so the face stays visible.`
* **Icon:** `<style bible> A plump strawberry icon, 48×48 px, centred, thick outline, readable at 24 px.`

---

## 6. Asset table

Grouped by priority so the most visible art can be generated first. Sizes are the manifest sizes
(you may deliver exact multiples).

<!-- ASSET-TABLE:START -->

_114 assets, 135 PNG files. Generated from `assets/manifest.json` by `node tools/assets-table.mjs`._

### Priority 1 — most visible (generate these first)

| id | file(s) | size (px) | facing | anchor | notes | description |
|---|---|---|---|---|---|---|
| `floor_wood` | `floor/floor_wood.png` | 128×64 | single view | 64, 32 | **tintable** (draw light grey) | Isometric floor tile of light wooden planks running along the tile diagonal, drawn in light warm grey so it can be tinted; edges tile seamlessly. |
| `floor_checker` | `floor/floor_checker.png` | 128×64 | single view | 64, 32 | **tintable** (draw light grey) | Isometric floor tile, 2x2 checkerboard of glossy ceramic squares in light grey tones (tintable); seamless. |
| `floor_carpet` | `floor/floor_carpet.png` | 128×64 | single view | 64, 32 | **tintable** (draw light grey) | Isometric soft carpet tile with a tiny stitched dot pattern in light grey (tintable); seamless. |
| `wall_plain` | `wall/wall_plain.png` | 64×224 | fl only (mirrored in code for the right wall) | 32, 208 | **tintable** (draw light grey) | One segment of the LEFT back wall (runs up-right to down-left), 192px tall, plain plaster with a wooden skirting board and a top trim, light grey (tintable). Mirrored in code for the right wall. |
| `wall_stripe` | `wall/wall_stripe.png` | 64×224 | fl only (mirrored in code for the right wall) | 32, 208 | **tintable** (draw light grey) | Same wall segment as wall_plain but with vertical wallpaper stripes and a wainscot panel at the bottom, light grey (tintable). |
| `door_frame` | `wall/door_frame.png` | 64×224 | fl only (left wall) | 32, 208 |  | Left-wall segment containing an arched doorway: warm wooden frame, dark shadowy opening, small welcome sign above. Same geometry as wall_plain. |
| `door_leaf` | `wall/door_leaf.png` | 64×224 | fl only (left wall) | 32, 208 | hingeX 17 | The door panel only (rounded-top wooden door with a round window and brass knob) positioned exactly inside door_frame's opening; everything else transparent. The hinge line is at x = hingeX (17px). |
| `table_square` | `furniture/table_square.png` | 128×128 | single view | 64, 96 | surface 38px up; **tintable** (draw light grey) | Small square café table on a single pedestal leg, rounded corners, light neutral wood (tintable). Top surface ~38px above the floor. |
| `chair_wood` | `furniture/chair_wood_fl.png`<br>`furniture/chair_wood_bl.png` | 128×128 | fl + bl (fr/br = mirrored) | 64, 96 | seat 20px up; **tintable** (draw light grey) | Simple wooden bistro chair with a rounded backrest, light neutral wood (tintable). fl = seat faces front-left, backrest at the back-right. |
| `stove_basic` | `furniture/stove_basic_fl.png`<br>`furniture/stove_basic_bl.png` | 128×144 | fl + bl (fr/br = mirrored) | 64, 112 | surface 46px up; **tintable** (draw light grey) | Compact enamel stove with two burners on top and an oven door with a round window on the front face, light grey (tintable). fl = front faces front-left. |
| `dirty_plate` | `props/dirty_plate.png` | 48×32 | single view | 24, 22 |  | Empty plate with crumbs and a sauce smear and a fork, seen from the isometric angle. |
| `trash_pile` | `props/trash_pile.png` | 64×40 | single view | 32, 26 | **tintable** (draw light grey) | Small floor mess: crumpled napkin, a paper cup and crumbs, light grey (tinted in code for variety), lies flat on the floor. |
| `char_body` | `character/char_body_fl.png`<br>`character/char_body_bl.png` | 40×34 | fl + bl (fr/br = mirrored) | 20, 32 | slot body; **tintable** (draw light grey) | Small chibi torso (no arms/legs), light grey skin tone (tinted per character). Bottom-center is the hip. |
| `char_head` | `character/char_head_fl.png`<br>`character/char_head_bl.png` | 62×58 | fl + bl (fr/br = mirrored) | 31, 56 | slot neck; **tintable** (draw light grey) | Big round chibi head with small ears, no face/hair, light grey skin (tinted). Bottom-center is the neck. |
| `char_arm` | `character/char_arm.png` | 12×24 | single view | 6, 4 | slot shoulderL/shoulderR; **tintable** (draw light grey) | Stubby hanging arm with a mitten hand, light grey skin (tinted). Pivot (anchor) is the shoulder at the top. |
| `char_leg` | `character/char_leg.png` | 14×18 | single view | 7, 3 | slot legL/legR; **tintable** (draw light grey) | Stubby leg ending in a round shoe, light grey (tinted as shoe color). Pivot is the hip joint at the top. |
| `face_neutral` | `character/face_neutral_fl.png` | 38×24 | fl only | 19, 12 | slot face | Face decal only (transparent elsewhere): calm dot eyes, small smile. Front view only. |
| `face_happy` | `character/face_happy_fl.png` | 38×24 | fl only | 19, 12 | slot face | Face decal only (transparent elsewhere): closed ^^ eyes, open smile, blush. Front view only. |
| `face_angry` | `character/face_angry_fl.png` | 38×24 | fl only | 19, 12 | slot face | Face decal only (transparent elsewhere): slanted brows, frown, anger vein. Front view only. |
| `face_sleepy` | `character/face_sleepy_fl.png` | 38×24 | fl only | 19, 12 | slot face | Face decal only (transparent elsewhere): closed droopy line eyes, small o mouth. Front view only. |
| `face_eating` | `character/face_eating_fl.png` | 38×24 | fl only | 19, 12 | slot face | Face decal only (transparent elsewhere): happy closed eyes, puffed chewing cheeks. Front view only. |
| `hair_bob` | `character/hair_bob_fl.png`<br>`character/hair_bob_bl.png` | 68×52 | fl + bl (fr/br = mirrored) | 34, 30 | slot crown; **tintable** (draw light grey) | Hair: short rounded bob with straight bangs, light grey (tinted). fl leaves the face visible; bl covers the back of the head. |
| `hair_spiky` | `character/hair_spiky_fl.png`<br>`character/hair_spiky_bl.png` | 68×52 | fl + bl (fr/br = mirrored) | 34, 30 | slot crown; **tintable** (draw light grey) | Hair: short messy spiky hair, light grey (tinted). fl leaves the face visible; bl covers the back of the head. |
| `top_tee` | `character/top_tee_fl.png`<br>`character/top_tee_bl.png` | 46×34 | fl + bl (fr/br = mirrored) | 23, 32 | slot body; **tintable** (draw light grey) | Outfit top: rounded T-shirt, light grey (tinted), covers the torso, no sleeves past the shoulder. |
| `top_jacket` | `character/top_jacket_fl.png`<br>`character/top_jacket_bl.png` | 46×34 | fl + bl (fr/br = mirrored) | 23, 32 | slot body; **tintable** (draw light grey) | Outfit top: neat double-button work jacket with collar, light grey (tinted), covers the torso, no sleeves past the shoulder. |
| `bottom_pants` | `character/bottom_pants_fl.png`<br>`character/bottom_pants_bl.png` | 44×18 | fl + bl (fr/br = mirrored) | 22, 6 | slot hip; **tintable** (draw light grey) | Outfit bottom: short trousers around the hips, light grey (tinted). |
| `bottom_skirt` | `character/bottom_skirt_fl.png`<br>`character/bottom_skirt_bl.png` | 44×18 | fl + bl (fr/br = mirrored) | 22, 6 | slot hip; **tintable** (draw light grey) | Outfit bottom: flared A-line skirt around the hips, light grey (tinted). |
| `hat_chef` | `character/hat_chef_fl.png`<br>`character/hat_chef_bl.png` | 56×40 | fl + bl (fr/br = mirrored) | 28, 36 | slot hatTop | Hat: tall puffy white chef toque. Bottom-center sits on top of the head. |
| `held_tray` | `character/held_tray.png` | 60×22 | single view | 30, 11 | slot carry | Round silver serving tray seen at the isometric angle (the dish icon is drawn on top of it in code). |
| `dish_salad` | `food/dish_salad.png` | 64×64 | single view | 32, 52 |  | Garden Salad: bowl of lettuce, tomato wedges and carrot ribbons. Icon also used on tables, trays and order bubbles. |
| `dish_omurice` | `food/dish_omurice.png` | 64×64 | single view | 32, 52 |  | Omelette Rice: fluffy yellow omelette over rice with a ketchup heart. Icon also used on tables, trays and order bubbles. |
| `ui_bubble` | `ui/ui_bubble.png` | 64×60 | single view | 32, 58 |  | White rounded thought/speech bubble with a small tail at bottom-center and a soft brown outline; content is drawn inside by code. |
| `emote_heart` | `ui/emote_heart.png` | 40×40 | single view | 20, 20 |  | Emote icon: pink heart, shown inside ui_bubble. |
| `emote_angry` | `ui/emote_angry.png` | 40×40 | single view | 20, 20 |  | Emote icon: red cross-shaped anger vein, shown inside ui_bubble. |
| `emote_menu` | `ui/emote_menu.png` | 40×40 | single view | 20, 20 |  | Emote icon: small open menu card, shown inside ui_bubble. |
| `ui_panel` | `ui/ui_panel.png` | 96×96 | single view | center | 9-slice 32/32/32/32 | 9-slice panel frame: warm cream paper fill, thick rounded chocolate-brown border with a soft inner highlight and stitched dashes. Corners 32px. |
| `ui_button` | `ui/ui_button.png` | 64×48 | single view | center | 9-slice 18/18/18/18 | 9-slice chunky rounded button, butter-cream face with a darker bottom lip (3D), brown outline. |
| `ui_button_primary` | `ui/ui_button_primary.png` | 64×48 | single view | center | 9-slice 18/18/18/18 | Same as ui_button in mint green (confirm / buy). |
| `ui_chip` | `ui/ui_chip.png` | 64×48 | single view | center | 9-slice 22/22/22/22 | 9-slice pill-shaped HUD plate for the top bar: cream fill, brown outline, slight drop shadow. |
| `icon_coin` | `ui/icon_coin.png` | 40×40 | single view | 20, 20 |  | UI icon: gold coin with a embossed spoon. |
| `icon_points` | `ui/icon_points.png` | 40×40 | single view | 20, 20 |  | UI icon: gourmet point badge: little golden chef hat. |
| `icon_star` | `ui/icon_star.png` | 40×40 | single view | 20, 20 |  | UI icon: filled yellow star. |
| `icon_star_empty` | `ui/icon_star_empty.png` | 40×40 | single view | 20, 20 |  | UI icon: empty star outline. |
| `icon_energy` | `ui/icon_energy.png` | 40×40 | single view | 20, 20 |  | UI icon: lightning bolt. |

### Priority 2 — core content

| id | file(s) | size (px) | facing | anchor | notes | description |
|---|---|---|---|---|---|---|
| `chair_cushion` | `furniture/chair_cushion_fl.png`<br>`furniture/chair_cushion_bl.png` | 128×128 | fl + bl (fr/br = mirrored) | 64, 96 | seat 22px up; **tintable** (draw light grey) | Plump upholstered chair with a puffy cushion and heart-shaped backrest, light neutral fabric (tintable). |
| `stove_deluxe` | `furniture/stove_deluxe_fl.png`<br>`furniture/stove_deluxe_bl.png` | 128×160 | fl + bl (fr/br = mirrored) | 64, 128 | surface 50px up | Fancy copper-and-cream range with four burners, brass knobs and a little chimney back panel. Not tinted. |
| `bar_counter` | `furniture/bar_counter_fl.png`<br>`furniture/bar_counter_bl.png` | 192×160 | fl + bl (fr/br = mirrored) | 96, 112 | footprint 2×1 tiles; surface 54px up; **tintable** (draw light grey) | 2-tile bar counter with a wooden top, paneled front and a few bottles/glasses on a shelf behind; light neutral (tintable). fl = long side along x, serving side faces front-left. |
| `toilet` | `furniture/toilet_fl.png`<br>`furniture/toilet_bl.png` | 128×144 | fl + bl (fr/br = mirrored) | 64, 112 |  | Cute rounded porcelain toilet with a tall tank and a small privacy screen behind it, white and pastel blue. |
| `arcade` | `furniture/arcade_fl.png`<br>`furniture/arcade_bl.png` | 128×192 | fl + bl (fr/br = mirrored) | 64, 160 | **tintable** (draw light grey) | Chunky retro arcade cabinet with a glowing screen, joystick and two buttons, cabinet in light neutral (tintable), screen stays colorful. |
| `plant_fern` | `furniture/plant_fern.png` | 128×144 | single view | 64, 112 |  | Leafy fern in a round terracotta pot. |
| `hair_bun` | `character/hair_bun_fl.png`<br>`character/hair_bun_bl.png` | 68×52 | fl + bl (fr/br = mirrored) | 34, 30 | slot crown; **tintable** (draw light grey) | Hair: hair tied in a round top bun with side bangs, light grey (tinted). fl leaves the face visible; bl covers the back of the head. |
| `hair_long` | `character/hair_long_fl.png`<br>`character/hair_long_bl.png` | 68×52 | fl + bl (fr/br = mirrored) | 34, 30 | slot crown; **tintable** (draw light grey) | Hair: long wavy hair past the shoulders, light grey (tinted). fl leaves the face visible; bl covers the back of the head. |
| `top_hoodie` | `character/top_hoodie_fl.png`<br>`character/top_hoodie_bl.png` | 46×34 | fl + bl (fr/br = mirrored) | 23, 32 | slot body; **tintable** (draw light grey) | Outfit top: cozy hoodie with a front pocket, light grey (tinted), covers the torso, no sleeves past the shoulder. |
| `hat_cap` | `character/hat_cap_fl.png`<br>`character/hat_cap_bl.png` | 56×40 | fl + bl (fr/br = mirrored) | 28, 36 | slot hatTop; **tintable** (draw light grey) | Hat: round baseball cap with a short brim, light grey (tinted). Bottom-center sits on top of the head. |
| `hat_bow` | `character/hat_bow_fl.png`<br>`character/hat_bow_bl.png` | 56×40 | fl + bl (fr/br = mirrored) | 28, 36 | slot hatTop; **tintable** (draw light grey) | Hat: big ribbon bow worn on top of the head, light grey (tinted). Bottom-center sits on top of the head. |
| `held_broom` | `character/held_broom.png` | 22×76 | single view | 11, 26 | slot hand | Straw broom, handle up; anchor is the grip point. |
| `held_wrench` | `character/held_wrench.png` | 20×36 | single view | 10, 26 | slot hand | Chunky cartoon wrench, head up; anchor is the grip point. |
| `held_shaker` | `character/held_shaker.png` | 20×32 | single view | 10, 22 | slot hand | Shiny cocktail shaker; anchor is the grip point. |
| `dish_soup` | `food/dish_soup.png` | 64×64 | single view | 32, 52 |  | Tomato Soup: cream bowl of red soup with a herb sprig. Icon also used on tables, trays and order bubbles. |
| `dish_fish` | `food/dish_fish.png` | 64×64 | single view | 32, 52 |  | Fish & Chips: battered fish with fries on paper. Icon also used on tables, trays and order bubbles. |
| `dish_pudding` | `food/dish_pudding.png` | 64×64 | single view | 32, 52 |  | Caramel Pudding: wobbly flan with caramel on a small plate. Icon also used on tables, trays and order bubbles. |
| `drink_lemonade` | `food/drink_lemonade.png` | 64×64 | single view | 32, 52 |  | Lemonade: tall glass with ice, lemon slice and straw. Icon also used on tables, trays and order bubbles. |
| `ing_tomato` | `food/ing_tomato.png` | 48×48 | single view | 24, 24 |  | Ingredient icon: shiny red tomato. |
| `ing_lettuce` | `food/ing_lettuce.png` | 48×48 | single view | 24, 24 |  | Ingredient icon: crisp lettuce head. |
| `ing_carrot` | `food/ing_carrot.png` | 48×48 | single view | 24, 24 |  | Ingredient icon: orange carrot with leafy top. |
| `ing_potato` | `food/ing_potato.png` | 48×48 | single view | 24, 24 |  | Ingredient icon: lumpy brown potato. |
| `ing_strawberry` | `food/ing_strawberry.png` | 48×48 | single view | 24, 24 |  | Ingredient icon: plump strawberry. |
| `ing_herb` | `food/ing_herb.png` | 48×48 | single view | 24, 24 |  | Ingredient icon: bundle of basil leaves. |
| `ing_egg` | `food/ing_egg.png` | 48×48 | single view | 24, 24 |  | Ingredient icon: brown egg. |
| `ing_flour` | `food/ing_flour.png` | 48×48 | single view | 24, 24 |  | Ingredient icon: small flour sack. |
| `ing_milk` | `food/ing_milk.png` | 48×48 | single view | 24, 24 |  | Ingredient icon: milk bottle with a blue cap. |
| `ing_cheese` | `food/ing_cheese.png` | 48×48 | single view | 24, 24 |  | Ingredient icon: wedge of holey cheese. |
| `ing_fish` | `food/ing_fish.png` | 48×48 | single view | 24, 24 |  | Ingredient icon: blue-silver fish. |
| `ing_rice` | `food/ing_rice.png` | 48×48 | single view | 24, 24 |  | Ingredient icon: bowl of white rice grains. |
| `ing_lemon` | `food/ing_lemon.png` | 48×48 | single view | 24, 24 |  | Ingredient icon: bright lemon with a leaf. |
| `ing_tea` | `food/ing_tea.png` | 48×48 | single view | 24, 24 |  | Ingredient icon: tin of green tea leaves. |
| `emote_sad` | `ui/emote_sad.png` | 40×40 | single view | 20, 20 |  | Emote icon: blue tear drop, shown inside ui_bubble. |
| `emote_zzz` | `ui/emote_zzz.png` | 40×40 | single view | 20, 20 |  | Emote icon: three blue Z letters, shown inside ui_bubble. |
| `emote_wait` | `ui/emote_wait.png` | 40×40 | single view | 20, 20 |  | Emote icon: little hourglass, shown inside ui_bubble. |
| `emote_sparkle` | `ui/emote_sparkle.png` | 40×40 | single view | 20, 20 |  | Emote icon: yellow sparkles, shown inside ui_bubble. |
| `emote_note` | `ui/emote_note.png` | 40×40 | single view | 20, 20 |  | Emote icon: music note, shown inside ui_bubble. |
| `emote_broken` | `ui/emote_broken.png` | 40×40 | single view | 20, 20 |  | Emote icon: grey gear with a crack, shown inside ui_bubble. |
| `ui_button_danger` | `ui/ui_button_danger.png` | 64×48 | single view | center | 9-slice 18/18/18/18 | Same as ui_button in soft coral red (sell / fire). |
| `icon_clock` | `ui/icon_clock.png` | 40×40 | single view | 20, 20 |  | UI icon: round wall clock. |
| `icon_gift` | `ui/icon_gift.png` | 40×40 | single view | 20, 20 |  | UI icon: wrapped gift box with bow. |
| `icon_rotate` | `ui/icon_rotate.png` | 40×40 | single view | 20, 20 |  | UI icon: circular arrow. |
| `icon_move` | `ui/icon_move.png` | 40×40 | single view | 20, 20 |  | UI icon: four-way arrow. |
| `icon_sell` | `ui/icon_sell.png` | 40×40 | single view | 20, 20 |  | UI icon: coin with a minus sign. |
| `icon_lock` | `ui/icon_lock.png` | 40×40 | single view | 20, 20 |  | UI icon: padlock. |
| `icon_water` | `ui/icon_water.png` | 40×40 | single view | 20, 20 |  | UI icon: watering can. |
| `icon_seed` | `ui/icon_seed.png` | 40×40 | single view | 20, 20 |  | UI icon: seed packet. |
| `icon_harvest` | `ui/icon_harvest.png` | 40×40 | single view | 20, 20 |  | UI icon: basket. |
| `icon_level` | `ui/icon_level.png` | 40×40 | single view | 20, 20 |  | UI icon: ribbon rosette. |
| `tool_build` | `ui/tool_build.png` | 64×64 | single view | 32, 32 |  | Toolbar icon: hammer crossed with a paint roller. |
| `tool_staff` | `ui/tool_staff.png` | 64×64 | single view | 32, 32 |  | Toolbar icon: smiling chibi face with a chef hat. |
| `tool_menu` | `ui/tool_menu.png` | 64×64 | single view | 32, 32 |  | Toolbar icon: open menu book with a fork. |
| `tool_garden` | `ui/tool_garden.png` | 64×64 | single view | 32, 32 |  | Toolbar icon: sprout in a small pot. |
| `tool_market` | `ui/tool_market.png` | 64×64 | single view | 32, 32 |  | Toolbar icon: wicker basket with vegetables. |
| `tool_settings` | `ui/tool_settings.png` | 64×64 | single view | 32, 32 |  | Toolbar icon: cog wheel. |

### Priority 3 — polish

| id | file(s) | size (px) | facing | anchor | notes | description |
|---|---|---|---|---|---|---|
| `plant_tall` | `furniture/plant_tall.png` | 128×176 | single view | 64, 144 |  | Tall potted monstera / fiddle-leaf plant in a woven basket pot. |
| `lamp_floor` | `furniture/lamp_floor.png` | 128×192 | single view | 64, 160 | **tintable** (draw light grey) | Floor lamp with a thin pole and a scalloped fabric shade, warm glow, light neutral (tintable). |
| `dish_bread` | `food/dish_bread.png` | 64×64 | single view | 32, 52 |  | Cheesy Bread: golden toast slices with melted cheese. Icon also used on tables, trays and order bubbles. |
| `dish_pasta` | `food/dish_pasta.png` | 64×64 | single view | 32, 52 |  | Veggie Pasta: plate of pasta with tomato sauce and cheese. Icon also used on tables, trays and order bubbles. |
| `dish_cake` | `food/dish_cake.png` | 64×64 | single view | 32, 52 |  | Strawberry Shortcake: slice with cream and a strawberry on top. Icon also used on tables, trays and order bubbles. |
| `dish_tart` | `food/dish_tart.png` | 64×64 | single view | 32, 52 |  | Lemon Tart: round tart with glossy lemon curd. Icon also used on tables, trays and order bubbles. |
| `drink_milktea` | `food/drink_milktea.png` | 64×64 | single view | 32, 52 |  | Milk Tea: glass of beige milk tea with pearls and a fat straw. Icon also used on tables, trays and order bubbles. |
| `drink_smoothie` | `food/drink_smoothie.png` | 64×64 | single view | 32, 52 |  | Strawberry Smoothie: pink smoothie cup with whipped cream. Icon also used on tables, trays and order bubbles. |
| `snack_cookie` | `food/snack_cookie.png` | 48×48 | single view | 24, 24 |  | Staff snack icon: chocolate chip cookie. |
| `snack_sandwich` | `food/snack_sandwich.png` | 48×48 | single view | 24, 24 |  | Staff snack icon: triangle sandwich. |
| `snack_bento` | `food/snack_bento.png` | 48×48 | single view | 24, 24 |  | Staff snack icon: little bento box. |
| `ui_logo` | `ui/ui_logo.png` | 480×160 | single view | center |  | Game logo "Rest Around": chunky rounded lettering in cream with brown outline, a steaming teacup replacing the O, little sparkles. |
| `icon_patience` | `ui/icon_patience.png` | 40×40 | single view | 20, 20 |  | UI icon: heart with a clock hand. |
| `garden_soil` | `ui/garden_soil.png` | 112×72 | single view | 56, 40 |  | Garden plot: isometric mound of dark tilled soil in a little wooden frame. |
| `garden_sprout` | `ui/garden_sprout.png` | 48×48 | single view | 24, 40 |  | Tiny green two-leaf sprout (early growth stage). |

<!-- ASSET-TABLE:END -->

---

## 7. Optional UI font

If `assets/fonts/ui.woff2` exists it is loaded as the UI font (`manifest.font`). Otherwise the UI
uses a rounded system font stack.
