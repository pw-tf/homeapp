# Handoff: Editorial New-Tab / Home Page

## Overview
A personal browser **new-tab / home page**. It shows a live clock, a time-aware
greeting, a search box (with a switchable engine), an optional weather readout,
and a grid of editable shortcut links. Everything is user-customizable and
persists locally: links (name / URL / icon), background, search engine, name,
and toggles. The visual direction is **"Editorial"** — warm off-white paper, a
large elegant serif clock, hairline rules, and a type-forward masthead — that
gracefully flips to a light-on-dark treatment over dark/image backgrounds.

This replaces an older glassmorphism new-tab page. Key goals of the refresh:
1. **Icons that never break.** The old page used an icon font with no brand
   logos, so most links rendered blank. The new system always shows something.
2. **Real customization.** Custom backgrounds (image URL / solid / adaptive),
   and full link editing incl. icon choice.
3. **A fresh, modern, type-led look** instead of dated frosted glass.

## About the Design Files
The bundled files (`Home.html`, `home.css`, `home.js`) are a **working
design reference built in plain HTML/CSS/vanilla JS** — a high-fidelity
prototype that also happens to run. They demonstrate the intended look and the
full interaction model. They are **not required to be shipped verbatim**: the
task is to **recreate this design in the target environment** using its
established patterns and libraries (e.g. a React/Vue component tree, a browser
new-tab extension, etc.). If there is no existing environment, vanilla JS like
this is a perfectly good choice for a new-tab page (no build step = instant
load); otherwise port it to the project's stack. The CSS token system and the
component breakdown below are the source of truth.

## Fidelity
**High-fidelity.** Final colors, typography, spacing, and interactions are all
specified here and present in the files. Recreate the UI to match.

---

## Screens / Views
There is **one screen** (the home page) plus **two modal dialogs** (Add/Edit
Link, Settings). The page is a single full-viewport column.

### 1. Home (root)
- **Purpose:** Landing surface for every new tab — tell the time, search, jump
  to a saved site.
- **Layout:** Vertical flex column, `min-height: 100vh`, horizontal padding
  `clamp(20px, 4vw, 56px)`. The masthead spans the full width; below it a
  two-column grid (`.layout`: `minmax(0,1fr) clamp(350px, 27vw, 420px)`, gap
  `clamp(28px, 3.5vw, 56px)`) holds the page on the left and the notes panel
  on the right (radar card on top, notes filling the rest). At ≤960px the grid
  collapses to one column and the radar + notes drop below the links, notes at
  `min(460px, 70vh)` tall.
  - **Masthead** (top, fixed height): space-between row. Left = date label.
    Right = weather readout + settings (gear) icon button. A 1px hairline rule
    sits directly beneath.
  - **Hero** (`flex: 1`, vertically centered): greeting label → giant clock →
    search field → (optional) recent-links row.
  - **Footer** (bottom): a 1px hairline rule, then the wrapping links grid with
    an "Add link" dashed button at the end.
  - **Notes** (right column, always visible): see below.
- **Components:**
  - **Date label** — mono, uppercase, 12px/600, `letter-spacing: 0.14em`,
    color `--ink-soft`. Text e.g. `WEDNESDAY · 3 JUNE 2026` (weekday, day,
    month, year; first comma replaced with ` ·`).
  - **Weather** — small row: a simple inline SVG glyph (sun/cloud/rain/snow) +
    `21° Partly cloudy`. Hidden entirely if disabled or unavailable.
  - **Settings button** — 34×34, radius 9px, transparent; gear SVG in
    `--ink-soft`; hover bg `--card-hover`.
  - **Greeting** — same mono label style, color `--ink-faint`. Text
    `Good {morning|afternoon|evening|night}[, {name}]`.
  - **Clock** — `Instrument Serif`, weight 400, `font-size: clamp(84px, 13.5vw,
    184px)`, `line-height: 0.9`, `letter-spacing: -0.02em`,
    `font-feature-settings: "tnum" 1`. The colon is wrapped in a span with
    `opacity: 0.9; margin: 0 -0.02em`. 24-hour `HH:MM`.
  - **Search field** — max-width 640px, full width; `--field-bg` fill, 1px
    `--field-border`, radius 14px, padding `6px 8px 6px 18px`. Contains: a
    magnifier SVG (`--ink`, opacity .5), a transparent `<input>` (16px,
    placeholder `Search the web`), and the **engine switcher** at the right.
    Focus-within: border → `--ink-soft` + 4px soft ring
    (`color-mix(in srgb, var(--ink-soft) 14%, transparent)`).
  - **Engine switcher** — text button: mono 11px/600 uppercase
    `letter-spacing: 0.12em` showing the engine name + a chevron. Click opens a
    paper dropdown (`#fbf9f4`, radius 12px, shadow `0 14px 40px rgba(0,0,0,.18)`)
    listing Google / DuckDuckGo / Bing, each with a status dot (active dot =
    `--accent`).
  - **Recent row** — `Recent` mono label + up to 5 plain text links
    (`--ink-soft`, underline-on-hover). Hidden when empty or disabled.
  - **Link card** — flex row, `--card-bg` fill, 1px `--card-border`, radius
    12px, padding `9px 16px 9px 9px`, gap 11px. Holds an icon **tile** + name
    (14px/500, nowrap). Hover: bg `--card-hover`, `translateY(-2px)`, shadow
    `0 6px 18px rgba(0,0,0,.10)`. On hover it also reveals two 22×22 action
    buttons (pencil = edit, × = remove) at the right. `draggable` for reorder
    (see Interactions). In dark mode the card gets `backdrop-filter: blur(14px)`.
  - **Icon tile** — 30×30, radius 8px, white (`--tile-bg`) with 1px
    `rgba(0,0,0,.07)` border + `--tile-shadow`. Contents resolve in priority
    order (see Icon System). Favicon/custom image renders at 60%×60% contained;
    emoji at 16px; letter at 13px/600 in `--tile-ink`.
  - **Add link button** — dashed `--card-border` border, radius 12px, padding
    `9px 18px`, `--ink-soft`; "+" SVG + `Add link`. Hover firms the border.

- **Notes panel** — card in `--card-bg` / `--card-border`, radius 16px, glass
  blur in dark mode; top/bottom margins (`24px` / `30px`) line up with the hero
  and footer. `contain: size` makes it take the row's height rather than grow
  with its text, so long notes scroll inside the editor. On focus the border
  firms to `color-mix(--ink 24%)`.
  - **Head** — `NOTES` mono label left; right, a mono meta readout showing the
    word count, which flips to `SAVED` in `--accent` for ~1.4s after each save.
  - **Toolbar** — 28×28 icon buttons (`--ink-soft`, hover/active
    `color-mix(--ink 7%/11%)`), grouped with hairline separators: Title,
    Subheading | Bold, Italic, Underline, Strikethrough | Bulleted, Numbered
    list | Undo, Redo (pushed right). Buttons reflect the caret's formatting
    (`.active`, `aria-pressed`) and use `mousedown.preventDefault()` so the
    selection is never lost.
  - **Editor** — `contenteditable`, 14.5px/1.6 Hanken Grotesk, `--accent`
    caret. Title = `<h2>` in Instrument Serif 28px; Subheading = `<h3>` in the
    mono uppercase label style. Placeholder "Jot something down…" via
    `.is-empty::before`.

- **Rain radar** — glass card above the notes in the right column (same
  `--card-bg` / `--card-border` / blur as the notes, radius 16px, no header or
  footer). Shows the BoM **Darwin (IDR634, 64 km)** loop: the sea is keyed
  out of the map so the card's glass shows where it was, with the land, rain
  and town names on top, stacked as `<img>`s straight from BoM (no server).
  The card is square, `min(100%, 45vh)` wide and centred, so it never crowds
  the notes and the overlays always sit on the map.
  - **Overlays** — small chips: paper (`rgba(251,249,244,.88)`, dark ink) on
    light pages, glass (`rgba(16,18,20,.5)`, 1px white-14% border, light ink,
    accent `#f0a07a`) in the dark theme; radius 8px, 10px blur:
    - top right: frame time (local, mono 12px; accent on the newest frame),
      with a 28×28 play/pause button to its left
    - bottom left: one tick per frame (click to jump + pause; accent when the
      newest is shown)
    - bottom right: `BOM ↗` link to the official loop page
    - top left: the "No new scans since HH:MM" notice, when stale
  - **BoM's baked-in text** (copyright line on top, station/time line at the
    bottom of every frame) is cropped by scaling the map layers 1.09× inside
    the card; the BoM credit stays on the hover link.
  - **Colours follow the wallpaper** — SVG filters (`#radar-duotone`,
    `#radar-ink` in `Home.html`) recolour BoM's cross-origin images at paint
    time. The sea is keyed out first (alpha = 8·(R − B) + 1.14, a soft ramp so
    edges anti-alias: pale blue →
    transparent so the card's glass shows, neutral/warm land → opaque). The land
    is a duotone:
    luminance 0 → *line* tone, ≥ 0.75 → *surface* tone (so BoM's pale land
    lands exactly on it). BoM's hard land edge is softened by a 0.35px
    blur, and a thin anti-aliased coastline rings it: a 0.8px blur of the
    land with its alpha ×2.2, filled with the *line* tone at 85% and laid
    underneath. Town names get a flat
    *ink* tone. The rain keeps BoM's own colours.
    - Palette: an image wallpaper is sampled once (48×48, CORS) and its pixels
      sorted by luminance; the 10–30%, 40–60% and 80–95% bands give *shadow*,
      *mid* and *high* at their real colour and brightness. Cached per URL in
      `nt_palette`. Solid / paper / adaptive build the palette around their
      colour. Hosts that block sampling get a neutral slate palette.
    - Dark theme: land = high + 12% white; lines / coastline = high + 38% white;
      ink = high + 75% white.
    - Light theme: land = mid→shadow 14%; lines = mid→shadow 60%;
      ink = shadow + 35% black.
  - The time and ticks always show; pause and the BoM link fade in on hover
    or keyboard focus (always shown on touch screens). Clicking the map also
    toggles play.
  - **How frames are found** — BoM names each scan
    `/radar/IDR634.T.{YYYYMMDDHHMM UTC}.png` and its frame list isn't readable
    cross-origin and scan times can be offset (e.g. :04 :14 :24), so the page
    probes every minute of the last 90 min, newest first, 4 requests at a time,
    and stops once it has the newest 7 frames. Every 5 min it probes only the
    minutes newer than its newest frame. Probes carry a per-poll query string
    so a cached "not published yet" miss can't hide a scan.
  - **Time safety** — filenames are UTC, so daylight saving and timezone
    changes don't affect it; only the displayed times follow the PC's clock.
    Each refresh probes up to 10 min past max(PC clock, newest frame), so a
    slow or rewound PC clock still finds new scans. A once-a-minute "is a
    refresh due?" check (a clock that moved backwards counts as due), plus the
    `online` event, catches up within a minute of waking from sleep. Frames
    more than 90 min older than the newest scan are dropped, and if the newest
    scan is over 30 min old a "No new scans since HH:MM" pill shows at the
    bottom of the map. Polling and
    animation pause while the tab is hidden and catch up when it's shown.
    Frames play at 333ms each with a 1.8s hold on the newest.
  - All of it is set in the `RADAR` constant in `home.js` (radar id, host,
    frame count, timings). Shows "Radar unavailable" if nothing loads.
  - The map is square but capped at `45vh` tall (layers letterbox) so the notes
    keep at least 220px on short screens.

### 2. Add / Edit Link (modal)
- **Purpose:** Create or modify a shortcut.
- **Layout:** Centered overlay (`rgba(20,18,14,.42)` + 3px blur). Sheet:
  `#fbf9f4`, max-width 460px, radius 20px, padding `26px 26px 24px`, shadow
  `0 30px 80px rgba(0,0,0,.3)`, scrollable if tall.
- **Components:** Serif `h2` (32px) title ("Add link" / "Edit link") + sub; a
  **live preview** block (44×44 tile + "Preview / How this link will look");
  **Name** text input; **URL** url input; **Icon** segmented control
  (Auto / Emoji / Image / Letter) with a context panel below it; actions row
  (Delete on the left when editing; Cancel ghost + primary Add/Save on right).
  - Auto → hint only (uses favicon from URL).
  - Emoji → text input + an 8-col grid of 24 common emojis.
  - Image → URL input + hint ("direct link to an image").
  - Letter → 1–2 char input (defaults to name's first letter).
  - The preview tile re-renders live as fields change.

### 3. Settings (modal)
Same sheet styling. Sections, top to bottom:
- **Your name** (text) → feeds the greeting.
- **Search engine** (segmented: Google / DuckDuckGo / Bing).
- divider
- **Background** (segmented: Paper / Solid / Image / Adaptive) with a context
  panel: Solid → 8 swatches; Image → URL input; Adaptive → hint; Paper → hint.
- **Text & contrast** (segmented: Auto / Dark text / Light text) — overrides the
  auto light/dark theme decision.
- divider
- **Weather widget** toggle + **Temperature unit** segmented (°C / °F).
- **Show recent links** toggle.
- actions: "Reset everything" (danger, left) + "Done" (primary, right).

---

## Interactions & Behavior
- **Clock** updates every 1s (`setInterval`). Greeting + date recompute with it.
  In **Adaptive** background mode the theme + gradient also re-evaluate on tick
  so the page shifts through the day.
- **Search submit:** if the query looks like a bare domain (`foo.com`, no
  spaces) navigate straight there (https:// prepended if missing); otherwise
  `ENGINE.url + encodeURIComponent(query)`.
- **Engine switcher:** click toggles the dropdown; outside-click closes it;
  picking one persists and refocuses the input.
- **Add/Edit/Delete links:** via the modal; Delete also purges the id from
  recents. Empty name falls back to the URL's hostname, else "Untitled".
- **Drag to reorder:** link cards are `draggable`. HTML5 DnD — `dragstart`
  records the source index + adds `.dragging` (opacity .4); `dragover`
  highlights the target with `.drag-over` (accent border); `drop` splices the
  array and re-renders + persists.
- **Recents:** clicking a link unshifts its id into a deduped list capped at 6;
  rendered as up to 5 text links. Toggleable.
- **Modals:** open with an overlay fade (0.18s) + sheet rise (0.22s
  `cubic-bezier(.2,.8,.3,1)`); close on Esc, overlay click, Cancel/Done.
- **Auto-focus** the search input ~60ms after load.
- **Notes:** formatting runs through `document.execCommand` (deprecated but
  fully supported in Chrome, and it gives a native undo/redo stack shared with
  typing). Headings toggle back to a paragraph when clicked again. Shortcuts:
  Ctrl/⌘+B/I/U, Ctrl/⌘+Alt+1/2 for Title/Subheading, Ctrl/⌘+Shift+8/7 for
  bulleted/numbered lists, Tab / Shift+Tab to nest list items, Ctrl/⌘+Z and
  Ctrl/⌘+Shift+Z (or Ctrl+Y) for undo/redo. Paste is inserted as plain text.
  Saves 400ms after the last change and on blur/tab hide; other open tabs pick
  up changes via the `storage` event (unless mid-edit). The search box's
  load-time refocus skips if the notes already have focus.
- **Reduced motion:** all animations/transitions collapse to ~0 under
  `prefers-reduced-motion: reduce`.

## Theme / contrast logic (important)
The whole page reads off CSS custom properties under
`html[data-theme="light"|"dark"]`. `resolveTheme()` decides which:
- `appearance === 'light'|'dark'` → forced.
- else (Auto): **image** → dark; **adaptive** → per time slot; **solid** →
  `luminance(color) > 0.55 ? light : dark`; **paper** → light.
Dark mode adds glass blur to cards/search and a legibility **scrim**
(`body::before`, `linear-gradient(rgba(8,10,16,.45), rgba(8,10,16,.62))`) over
image backgrounds. Modals are always the light paper sheet for guaranteed
legibility regardless of theme.

## Icon System (the core fix)
`makeTile(link)` builds the tile and **never shows a broken image**: it renders
the fallback first, preloads the favicon/custom image with `new Image()`, and
only swaps it in `onload` when `naturalWidth > 1`. Resolution order:
1. `icon.kind === 'emoji'` → emoji glyph.
2. `icon.kind === 'letter'` → letter (or name's first letter).
3. `icon.kind === 'image'` → custom image URL, letter fallback.
4. `icon.kind === 'auto'` (default) → favicon
   `https://www.google.com/s2/favicons?domain={host}&sz=64`, letter fallback.

## State Management
All client-side, persisted to `localStorage`:
- `nt_config` → `{ name, engine, appearance, bg:{mode,color,imageUrl},
  weather:{enabled,unit}, showRecent }`
- `nt_links` → `[{ id, name, url, icon:{kind,value} }]`
- `nt_recent` → `[id, …]` (max 6)
- `nt_weather` → `{ t, unit, data:{temp,code} }` (30-min cache)
- `nt_palette` → `{ v: 2, url, palette: { shadow, mid, high } }`, sampled from the image wallpaper for the radar
- `nt_notes` → the notes editor's HTML (`""` when empty). "Reset everything"
  does not clear it.

Weather: `navigator.geolocation.getCurrentPosition` →
`api.open-meteo.com/v1/forecast?...current=temperature_2m,weather_code` (no API
key). WMO `weather_code` is grouped to a glyph + label. Fails silently (widget
hides) if geolocation is denied/unavailable.

## Design Tokens
**Fonts:** `Instrument Serif` (clock + modal titles), `Hanken Grotesk` (UI/body),
`Space Grotesk` (mono labels / engine / date). Google Fonts.

**Light / paper (default):**
- `--bg #f4f1ea` · `--ink #1c1a17` · `--ink-soft #7a766c` · `--ink-faint #9a958a`
- `--rule rgba(0,0,0,.12)` · `--card-bg #ffffff` · `--card-border rgba(0,0,0,.10)`
  · `--card-hover #fbfaf6` · `--card-blur 0px`
- `--field-bg #ffffff` · `--field-border rgba(0,0,0,.12)`
- `--tile-bg #ffffff` · `--tile-ink #33373f` · `--tile-shadow 0 1px 3px rgba(0,0,0,.16)`
- `--accent #b4552d` (warm rust, used sparingly)

**Dark / over-image / night (`[data-theme="dark"]`):**
- `--ink #f4f1ec` · `--ink-soft rgba(244,241,236,.72)` · `--ink-faint rgba(244,241,236,.50)`
- `--rule rgba(255,255,255,.18)` · `--card-bg rgba(255,255,255,.10)` ·
  `--card-border rgba(255,255,255,.20)` · `--card-hover rgba(255,255,255,.17)` ·
  `--card-blur 14px`
- `--field-bg rgba(255,255,255,.10)` · `--field-border rgba(255,255,255,.22)`
- `--accent #f0a07a`
- scrim: `linear-gradient(180deg, rgba(8,10,16,.45), rgba(8,10,16,.62))`

**Solid swatches:** `#f4f1ea #e7e0d3 #d8cfc0 #c9c3b6 #2b2a27 #1c1a17 #13233a #1a2b22`

**Adaptive gradients (by local hour):**
- 05–08 `linear-gradient(165deg,#c7d2ec,#e9d6c4)` (light text)
- 08–17 `linear-gradient(165deg,#dde7f2,#eef1f3)` (light/dark text)
- 17–20 `linear-gradient(165deg,#382c4d,#8a4f5a 58%,#d98a5b)` (light text)
- else  `linear-gradient(165deg,#0b1130,#241a3a)` (light text)

**Radii:** tiles 8px · cards 12px · search/fields 10–14px · sheets 20px · pills 999px.
**Modal shadows:** sheet `0 30px 80px rgba(0,0,0,.3)`; dropdown `0 14px 40px rgba(0,0,0,.18)`.
**Spacing:** masthead `22px 0 18px`; hero padding `24px 0`; search `margin-top 30px`;
links `gap 12px`; footer `padding-bottom 30px`.

## Assets
- **Fonts:** Google Fonts (Instrument Serif, Hanken Grotesk, Space Grotesk).
- **Icons:** all inline SVG defined in `home.js` (pencil, ×, +, gear, magnifier,
  chevron, sun/cloud/rain/snow). No icon font.
- **Favicons:** fetched at runtime from Google's S2 favicon service.
- **No bundled image assets.** Background images are user-supplied URLs.

## Files
- `Home.html` — markup shell + font links + script/style includes.
- `home.css` — full token system + all component styles.
- `home.js` — state/persistence, rendering, drag-reorder, modals, weather,
  inline SVG glyphs. Single IIFE, no dependencies.

## Notes for implementers
- The S2 favicon endpoint loads fine in a normal browser; it may be blocked in
  sandboxed iframes (the letter fallback covers this). For an extension you may
  prefer the browser's own favicon API.
- If porting to a component framework, mirror the token CSS as a theme and the
  `resolveTheme()` decision as a small util; keep the "render fallback first,
  swap image on load" pattern for `makeTile`.
