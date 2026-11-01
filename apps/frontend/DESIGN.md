# Dort design system

Blue node editor (ComfyUI-like): a deep-blue canvas with a faint dot grid, **blue gradient cards**
floating above it, soft white for whatever is active or primary, and colour used **only as tiny
semantic dots**. No coloured headers, bars, chips or wires anywhere.

The whole UI is one blue: every surface and every text tone is the brand blue **`#0647B3`** (hue 217)
held at a different lightness, so the app reads as blue and white. Blue is the *ground*, never an
accent — a blue fill means nothing, exactly as the old graphite meant nothing.

Source of truth: `src/app/globals.css` (tokens + utilities) and `src/components/ui` (primitives).
If you need something that isn't covered there, add it there first. Don't invent one-off styles inside a feature.

## Tokens

Use the Tailwind names (`bg-raised`, `text-muted` …), or `var(--raised)` in feature CSS.

### Surfaces

Every value below is hue 217, the brand blue's own hue; only lightness and saturation change.

| Token | Value | Use |
|---|---|---|
| `brand` | `#0647b3` | The blue everything is derived from. A fill (glow, blue surface), never text |
| `brand-lit` | `#0a5fe0` | The same blue, lifted, for a hover or a lit edge |
| `canvas` | `#0647b3` | App background, under everything |
| `dot` | `#236ce7` | Dot-grid dots (22px grid) |
| `card-top` → `card-bot` | `#0e5ee1` → `#0d52c5` | Outer card gradient (`bg-card-grad`, SVG `url(#g-card)`) |
| `inner-top` → `inner-bot` | `#0f56cc` → `#0e4cb4` | Nested inner card gradient (`bg-inner-grad`, SVG `url(#g-inner)`) |
| `surface` | `#0d52c5` | Flat fallback where a gradient can't be used |
| `raised` | `#115bd4` | Idle tiles, chips, badges sitting on a card |
| `hover` | `#1868ec` | Hover of `raised` |
| `inset` | `#0a429e` | Select / control tiles, tracks |
| `field` | `#083e96` | Text inputs |
| `border` | `rgba(255,255,255,.12)` | The card hairline (outer and inner card) |
| `border-strong` | `rgba(255,255,255,.2)` | Hovered / selected card or field |

### Text

| Token | Value | Use |
|---|---|---|
| `fg` | `#ffffff` | Titles, primary text |
| `text` | `#e5efff` | Inner-card header (kind row), chip text |
| `body` | `#c6d6f1` | Body text in cards (13px, line-height 1.5) |
| `port` | `#b0c5e8` | Port labels (12.5px) |
| `muted` | `#a3bae0` | Control labels, secondary text |
| `dim` | `#8ba5d0` | Hints, placeholders, corner stats, disabled |
| `primary` / `primary-fg` | `#ffffff` / `#0647b3` | Active / primary tile: soft white fill, near-black text |

### Wires

| Token | Value | Use |
|---|---|---|
| `wire` | `#97b0d8` | Every wire, 1px smooth bezier |
| `wire-on` | `#ffffff` | Selected / active path |
| red at 70% | `#f87171` | Finding path (write after external call, revert wire) |

### Semantic dots — the only colour

| Token | Value | Means |
|---|---|---|
| `red` | `#f87171` | Finding, revert, bad, failure. **Only** for bad things |
| `green` | `#4ade80` | Pass, covered, ok, bool check holds |
| `yellow` | `#facc15` | Amount / uint, warning, untested, privileged |
| `blue` | `#60a5fa` | External, address |
| `mint` | `#86efac` | Background of the one accent action pill (Run) |
| `pink` + `blue` | | Very soft blurred glow (`glow-top`) behind the one selected / running card |

Everything else — function, slot, event, logic, access, call, write categories — is told apart by a
**monochrome icon + label**, never by colour. Status tones (`Tone` in `components/ui/tone.ts`):
`neutral`, `ok`, `bad`, `warn`, `info`, `solid`; they colour a dot, never a fill.

The old HUD names (`shell panel tray card ink line edge tick soft guide sel accent ok bad`) are gone. Don't reintroduce them.

## Radius

| Class | px | For |
|---|---|---|
| `rounded-chip` | 8 | Chips, badges, accent pill, tooltips |
| `rounded-tile` | 10 | Buttons, icon tiles, tabs, select / control tiles |
| `rounded-inner` | 12 | Nested inner card, text inputs |
| `rounded-card` | 18 | Cards, panels, toolbars, docks |

The inner card sits 8px inside the outer card. Never put a sharp corner inside a rounded one.

## Elevation

- Cards: `bg-card-grad`, `border border-border`, `shadow-soft` (`0 10px 30px rgba(1,12,32,.45)`).
  Floating toolbars, docks, popovers: `shadow-float`.
- The inner card: `bg-inner-grad` with its own faint `border`.
- Separate with gradient contrast and spacing, not 1px lines. Avoid `divide-*` grids of boxes.
- `glow-top` (soft pink/blue blur behind the top edge) only on the **one** selected or running card. Never on lists, docks or toolbars.

## Typography

- **Outfit** (`font-sans`) for all UI, sentence case, letter-spacing 0 or `-0.01em`.
- Sizes **12.5 / 13 / 14 / 15** (`text-ui-xs/sm/md/lg`), weights **400 / 500 only** (no semibold / bold).
  One exception: a page's own title may use `text-ui-display` (34px, 500, -0.02em), once per page (Explore).
  Titles 14px 500 `fg`; body 13px `body`; port labels 12.5px `port`; control labels 13px `muted`.
- **Geist Mono** (`font-mono`) only for code, addresses, hashes, slot numbers and percentages.
- No `uppercase`, no wide `tracking-[…]`, no mono labels.

## Canvas

- The whole app sits on `dot-grid` (22px dots). Pan/zoom canvases keep the `dot-grid` class and set
  `backgroundSize` / `backgroundPosition` inline from the view transform.
- Content floats on the canvas: give panels a margin from the edges and let the dots show between them.
- Floating chrome keeps 16px from the canvas edge and 16px from each other. Hints live in a status corner
  (bottom-left), never on top of cards; zoom stacks get their own gutter.

## Controls

- **Tile** (`tile(on)`): one rounded square or pill. Active is `bg-primary text-primary-fg`, idle `bg-raised text-muted`, hover `bg-hover`.
- **Tabs / TileGroup**: separate tiles with `gap-1.5`, no container, no underline, no folder tabs.
- **SegmentedControl**: a compact choice inside one `inset` tray; the active segment is a white tile.
- **Button**: `primary` (soft white), `accent` (pastel mint pill, near-black text, sparkle icon — the ONE main action, e.g. Run),
  `secondary` (blue, default), `ghost`. At most one `primary` or `accent` per area.
- **Control row**: label left (`muted`, 13px), control right as a dark inset tile (`inset`, radius 10, 36px tall, value `#eff1f3`, ▾ caret via `select-caret`).
  Steppers are three separate tiles (◀ 30 ▶).
- **Input**: `field` fill, radius 12, placeholder `dim`, white-ish focus border (no coloured rings).
- **Chip**: blue pill; the tone colours only its `dot`. **ToggleChip**: filter pill with a white dot when on.
- **Meter**: monochrome light-grey fill on a dark track; pass `tone="text-red"` only for bad values.
- **Tooltip**, **KV**, **IconButton** (always pass `label`).

### When white is allowed

Exactly two jobs: **active** (the selected tab, tool or view) and **primary** (the single main action).
Never for decoration, headings or large areas.

## Cards (`Panel` / `Card`)

```
 ● Title                     aside      ← title row: white dot + 14px 500 title (inside, or above with titleAbove)
╭──────────────────────────────────╮
│ ╭──────────────────────────────╮ │    ← outer: bg-card-grad, radius 18, border, shadow-soft
│ │  inner card                  │ │    ← inner: bg-inner-grad, 8px in, radius 12, faint border
│ ╰──────────────────────────────╯ │
╰──────────────────────────────────╯
```

`Panel` props: `label`, `aside`, `dot?: Tone` (semantic dot instead of the white one), `titleAbove`, `inset`, `glow`.

### Node card anatomy (Lab, graph, flow nodes)

- **Title outside, above the card**: white dot + title (14px 500 `fg`), 10px above the card. Badges
  (`▲1 H`, `82%`) right-aligned in the same row, 8px apart: blue pills with a semantic dot.
- **Inner header**: monochrome kind icon + label (14px `text`) — "Function", "Storage slot", "External contract", "Event"…
- **Port rows**: 32px tall, `label ●` with the label 12.5px `port`, 12px between label and dot. Inputs in the left
  column, outputs in the right, ≥24px apart; long names ellipsize with a tooltip.
- **Port dots** are 7px and are the only colour on a card: blue = address / external, yellow = amount,
  green = bool / pass, red = revert / finding. State, events and execution order are grey.
- **Wires**: 1px `wire` beziers; selected / active `wire-on`; finding path red at 70%. Never coloured by type.
- Selected node: `border-strong` + `shadow-float` + `glow-top`. Never a white fill on a node.
- Lab layout (`utils/lab-graph.ts`): ≥160px between columns (functions → slots → externals/events), 44px from a
  card's bottom to the next title, every slot in the slots column.

## Floating chrome

- **Toolbar**: blue gradient container (`rounded-card`, `p-1.5`, `gap-1.5`) holding tiles or IconButtons.
- **FloatingDock**: blue bottom-centre card holding inputs and a row of tiles.
- Small grey stats (counts, zoom %, hints) sit in canvas corners as `dim` 12.5px text with no box.
- App header: logo tile, `dort` wordmark and route tiles on the left; blue status chips with dots on the right.

## Do / don't

Do
- Use the primitives from `@/components/ui`. Extend them rather than re-styling locally.
- Graphite gradients for cards, nested radii (18 outer → 12 inner, 8px inset).
- Tell categories apart with monochrome icons + labels.
- Colour = tiny semantic dots only (red bad, green ok, yellow amount / warning, blue external).

Don't
- **No coloured headers, bars, chips, meters or wires.** Colour = tiny semantic dots only.
- No category colours (function / slot / event / logic all monochrome).
- No violet, no coloured focus rings, no coloured glows except the one `glow-top`.
- No chamfers / clip-path corners, no corner brackets, no uppercase mono letter-spaced labels.
- No underline nav and no folder tabs.
- No hard 1px boxes around everything, no grid-line backgrounds, no striped bars.
- No white fills except active / primary. No weights above 500.
- No new colours outside the token table.

## Trace call kinds (exception, 2026-10-10)

The trace view colour-codes frame kinds with Foundry's own `forge test -vvvv` palette (calls
green, cheatcodes blue, reverts red, events cyan, staticcalls yellow, delegatecalls pink), each an
outlined mono text badge (CALL, STATICCALL, DELEGATECALL, EVENT, CHEATCODE, REVERT) as in
Phalcon's invocation flow, no icons. The word names the kind, so no colour key is needed. Auditors
read these colours in their terminal every day; matching them beats a monochrome legend. Lab node kinds stay
monochrome. See docs/ux/trace-view.md.
