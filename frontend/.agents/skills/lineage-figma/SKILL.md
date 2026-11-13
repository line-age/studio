---
name: lineage-figma
description: Project facts for turning the Lineage Figma file into code in this app. Use whenever building or changing a component or screen from Figma, refreshing design tokens, checking the UI against the design, or when a Figma node id, page, component name or token name for this project is needed. Holds the file key, page and component ids, the Figma to code naming rules, and the deliberate departures from shadcn.
---

# Lineage Figma: project facts

The Figma file is the reference. Code follows it. If code and Figma disagree, Figma wins
unless the difference is listed under "Deliberate departures" or the user says otherwise.
Do not change the Figma file to make code easier without asking.

This skill holds what the general Figma skills cannot know. For how to read a design into
code use the Figma plugin skill `figma-design-to-code` (required before
`get_design_context`). For how to write to the file use `figma-use`. For shadcn
components use the `shadcn` skill in this directory.

## The file

- File key: `hbofXZlZNRK4L1MbG7wQsf`. The person signs in to Figma themselves; never ask
  for or store a token.
- Node ids below were recorded on 2026-11-12. An id can go stale. If a lookup fails, find
  the component by name on the library page; do not guess an id.

| Page | Id | Holds |
| --- | --- | --- |
| Studio | `24:2` | The screen (frame `24:3`, 1728 x 1000) and state panels: Filters `37:135`, Agent `24:319`, search results `45:99` |
| Components 2 (shadcn) | `58:2` | The library. Doc frame `75:113`, inventory table `77:113` |
| Foundations | `13:2` | Colour, type, shadows, scale. Can lag behind the variables; the variables are the source |
| Icons | `14:2` | Our own icon set |
| Page 1 | `0:1` | The owner's original frame. Never touch |

Other pages (Controls, Domain, Studio reference, Measurements, Slides) are superseded.
Do not build from them.

## Tokens

- Source: Figma variable collections `Color` and `Scale`, text styles `ui/*`, and the
  effect styles. Not exported: `Primitives` (resolved through), the old `Size` collection,
  the old `text/*` styles.
- In code: `tokens/figma-tokens.json` (what was read) and `src/styles/tokens.css`
  (generated). Never edit `tokens.css` by hand.
- Naming rule: a CSS variable is named exactly as the Figma variable's web code syntax.
  `state/ai-subtle` is `--state-ai-subtle`; `spacing/0-5` is `--spacing-0_5`.
- Tailwind names derived from them:
  - colour: `bg-primary`, `text-state-unknown-foreground`, `border-border-subtle`
  - radius: `rounded-sm` 4, `-md` 6, `-lg` 8, `-xl` 12, `-2xl` 16
  - control and layout sizes: `h-control-xs` 24, `h-control-sm` 28, `h-control` 32,
    `h-control-lg` 36, `size-icon` 16, `h-topbar` 42, `w-rail` 64, `w-panel-left` 300,
    `w-panel-right` 361, `h-panel-header` 44
  - text styles: `ui/sm-medium` is `type-ui-sm-medium`. Use the `type-ui-*` utility, not
    a size class plus a weight class. They are `type-*` and not `text-*` on purpose:
    `cn()` would merge `text-*` with a text colour and drop one
  - shadows: `shadow-panel`, `shadow-popover`, `shadow-map-control`, `shadow-focus-ring`
- Tints are their own tokens with alpha in the value (`destructive-subtle`,
  `topbar-hover`). Do not build a tint with an opacity modifier when a token exists.

### Refreshing tokens

1. Read the variables with a read-only `use_figma` script: every variable in `Color` and
   `Scale` (name, type, value resolved through aliases, alias target, WEB code syntax),
   every `ui/*` text style, every effect style.
2. Write the result to `tokens/figma-tokens.json` in the existing shape; set `readAt`.
3. `pnpm tokens:build`, then `pnpm tokens:check`.
4. A variable with no WEB code syntax is a Figma problem. Report it; do not invent a name.

## Components: Figma name to code

Standard controls follow shadcn **base-nova** (Base UI). Add them with the shadcn CLI,
then theme through tokens. The Figma name tells you the shadcn component.

| Figma component | Node | In code |
| --- | --- | --- |
| Button | `58:102` | shadcn `button` |
| IconButton | `58:152` | shadcn `button`, `size="icon*"` |
| TopbarButton | `58:164` | `button` variant on the dark top bar; ours |
| Kbd | `58:3` | shadcn `kbd` |
| Input | `58:187` | shadcn `input` |
| Select | `58:197` | shadcn `select` |
| Checkbox | `58:206` | shadcn `checkbox` |
| Switch | `58:212` | shadcn `switch` |
| SwitchRow | `80:492` | `switch` plus label; ours |
| Radio, RadioItem | `80:327`, `80:349` | shadcn `radio-group` |
| Badge | `58:228` | shadcn `badge` plus our variants `unknown`, `cited`, `ai`, `note` |
| Breadcrumb | `80:311` | shadcn `breadcrumb` |
| MapControl | `81:492` | shadcn `button-group` |
| ToolButton, ToolPalette | `81:514`, `81:518` | shadcn `toggle-group` |
| LoadBar | `93:453` | shadcn `progress` |
| Composer, Bubble, Marker, Attachment | `81:463`, `81:336`, `81:332`, `81:359` | shadcn chat (see `shadcn/rules/chat.md`) |

Lineage parts, with no shadcn equivalent. Build them from the controls above and tokens:

| Figma component | Node | Figma component | Node |
| --- | --- | --- | --- |
| StatusLabel | `61:51` | RailItem | `61:83` |
| PanelHeader | `61:111` | ListHeader | `61:113` |
| PipelineRow | `61:185` | TreeItem | `61:223` |
| AttributeRow | `61:267` | StatusBar | `80:353` |
| ListGroupHeader | `80:359` | SearchResult | `80:397` |
| Hint | `80:401` | GroupLabel | `80:406` |
| LineKey | `80:422` | LayerRow | `80:476` |
| LegendItem | `80:496` | PanelFooter | `80:503` |
| Pin | `81:369` | Note | `81:373` |
| ProposalLink | `81:408` | MapLabel | `81:545` |
| MapHandle | `81:553` | ProposalCard | `81:621` |
| Citation | `81:625` | SelectionBar | `172:553` |
| TourCard | `201:601` | TourHighlight | `201:602` |

Naming in code: the React component keeps the Figma name (`PipelineRow`); the file is
kebab-case (`pipeline-row.tsx`). Figma variant properties become props of the same name
in camelCase. A Figma `State` variant (hover, pressed, focus) is CSS state, not a prop;
`selected` and `disabled` are props.

Each Figma component's description holds its usage note. Read it before building.

## Deliberate departures from shadcn

These are intended. Do not "fix" them back to shadcn defaults.

- The active rail item and active tool use a light blue tint (`primary-subtle`); shadcn
  uses grey.
- Pipeline rows are a flush list with dividers, not rounded blocks.
- Row meta text is 12px.
- The rail shows labels under its icons.
- Hover and pressed colours are tokens (`primary-hover`, `primary-pressed`,
  `secondary-hover`, ...), where shadcn uses opacity. The stock `button` still uses
  shadcn's opacity; align it when the controls are themed.

## Rules the design serves

- A claim is cited or Unknown. Unknown has one mark: the orange word with a dotted
  underline (StatusLabel), a dotted line on the map. Never a greyed value, blank or dash.
- State colours (AI purple, cited green, Unknown orange, rejected red, note yellow)
  always appear with their word, never colour alone.
- The AI only proposes; a person accepts or rejects. There is no delete tool.
- Sample data is invented. No real section, company, source, map, sheet or person name.
- Nothing of Mapbox's: no icons, fonts or artwork. Icons are our own set (Icons page).

## What is built in code

As of 2026-11-12 the Studio screen (`24:3`) and its three state panels are built in
`src/screens/studio/`, read-only, on fixture data. Lineage parts are in
`src/components/`, icons in `src/components/icons/icon.tsx` (path data copied from the
Icons page). Not built, because nothing on the screen uses them: MapHandle, ProposalCard,
Citation.

Help is drawn in section "9. Help" (`202:6267`) of the Studio page: the tour on the
Sections list (`202:6268`) and on the map (`202:6377`), and the Help dialog on one area
(`202:6474`) and on Words (`202:6608`). The tour is a `TourHighlight` ring round the
area, the `overlay` colour over the rest, and a `TourCard` beside it (variants first,
middle, last). In code: `src/screens/studio/help/`. The Words frame shows seven words;
the app adds the four statuses.

Selecting several things is drawn in section "8. Selecting several things" of the Studio
page (2026-11-13): several sections of one pipeline `173:5367`, several pipelines
`173:5859`, a Lasso loop across two pipelines `173:6456`.

Where code knowingly differs from the Figma frame:

- The map is a live Mapbox light basemap, not the yellow fill. Lines use the `map/*`
  tokens. The selected halo is `map/selected` at 25% opacity, 9 wide, as in the frame.
- When a pipeline is selected and no section is, all its sections get the halo. Figma
  only shows the single-section case.
- "Edited 4 minutes ago" in the top bar is left out: the data holds no edit time.
- The Area switch says "The list follows the map"; the frame says "table", and the table
  is not designed.
- The selection is a set of sections and may span pipelines. Left list: a click selects
  one pipeline, its box adds or removes it (partly selected shows a dash), Shift-click
  adds a run, the header box selects all shown or none. Right panel: with several
  pipelines the sections are grouped under a ListGroupHeader per pipeline and the header
  reads "3 pipelines"; a footer states the size.
- The map palette shows Select and Lasso only. Lasso draws a freehand loop; every
  section it touches is selected (Shift adds). A small bar at the top centre of the map
  (`SelectionBar`, shown after every selection made on the map) states the size and has "Ask the Agent", which opens the Agent panel
  with the selection attached and the cursor in the message box. A click on a line adds that
  section to the selection, a click on a selected line takes it off, and a click on
  empty map steps the selection back.
- Agent attachments are one chip per pipeline ("Whole pipeline", "3 of 6 sections"); a
  single section shows under its own name.
- Search narrows the same pipeline list (same rows) and lists the sections it found
  under each pipeline; a section row opens that section. It searches inside the filters
  in force, with a bar to widen to the whole edition. The word "unknown" finds sections
  with Unknown claims ("unknown owner"). The grouped SearchResult layout of frame `45:99`
  is not used.
- The rail follows shadcn SidebarMenuButton in its icon size: a flat 32 square behind the
  icon, `sidebar-accent` on hover and when open, label below in medium; no blue tint.
  Filters shows a dot when filters are applied; Agent shows a purple dot when
  proposals are waiting. The numbered note badge is gone.
- The list and the Agent each keep their own width. Both side panels can be dragged wider
  (`ResizeHandle`); the width is kept in the browser.
- Right click on a pipeline row, a section row or the map offers "Add to the Agent
  chat": the item appears as an Attachment in the chat input. The menu is stock shadcn
  Context Menu.
- The edition label at the bottom left of the map is removed (the Filters panel and the
  list badges say the edition).
- The right panel is shown only while something is selected (no "Nothing selected"
  state on screen). A click on empty map steps the selection back, then clears it. Both
  side panels slide over 200 ms.
- The filters have criteria Figma lacks: "Company" (shadcn Combobox, multiple: type to
  find, chosen ones are chips; values from the Owner attribute), "Build date" (from and to, each a `YearPicker`: shadcn Popover with a grid of twelve years) "Added to Lineage" (From and
  To fields, drawn like Build date, that open one shadcn Calendar in range mode, over the section's `addedAt`) and "Unknown in", a
  checkbox per attribute with counts (shadcn Checkbox). A pipeline passes
  when one of its sections satisfies all of them. It narrows the list and the map, shows as a badge in the
  list, and is cleared by "Clear all".
- The breadcrumb is the app name, then the selected pipeline, then the selected section;
  earlier crumbs step back. The network name is not shown (owner, 2026-11-12); Figma
  shows app and network.
- One button hides both side panels, the way Figma's own "minimize UI" does (owner,
  2026-11-13). Every left panel's header ends with the `panel-left` icon (Icons page,
  `137:2017`): it hides the left panel and the properties panel together.
  The rail stays. While they are hidden the same icon floats at the top left of the map
  (a `MapControl`) and brings both back; so does any rail item, the search button and
  "Ask the Agent". The open panel's own rail item hides both as well. A new selection
  does not bring them back. The properties panel has no button of its own, and the top
  bar has none. Figma shows the hidden state as frame `137:2050` on the Studio page,
  linked both ways in the prototype. `panel-right` is in the code's icon set but unused
  and not on the Icons page. The Mapbox logo moved to the
  bottom left of the map so the floating button does not cover it.
- The table button, the "Scanned map" layer row and the draw tools after Lasso are
  hidden until they do something. The filter badges under the search box each carry a
  remove button (`FilterChip`) and the row shows only filters that are set; the edition
  year and "All pipelines" badges are gone.
- Notes are off the map for now (owner, 2026-11-12): no note pins, no "Note pins" layer
  row, no note count in the Agent header. The fixture still holds notes and the Agent
  conversation still shows the ones it mentions.
- The filter icon and each filter chip above the pipeline list carry a tooltip (stock
  shadcn Tooltip) that says what the filter does.
- Zooming the map to a clicked pipeline does not narrow the "in view" list; the list
  follows only when the person moves the map, opens a search hit or goes home.
- Build date pickers run up to the current year.
- These were asked for by the owner on 2026-11-12 ahead of Figma. Figma needs updating.
- Section status and navigation are designed: Studio page, section 7 (`153:4044`). List
  with status counts `153:3446`, the same with no pipelines `153:3712`, filters on
  `156:4511`, filters open in place `156:4607`, compact rows `168:5347`, Settings dialog
  `154:3780`; screens `154:3907`, `154:4044`, `156:4723` (filter button and layers
  menu) and `168:5659` (the list widened into a table). The Editions and Filters panels
  are gone from the app; the Edition select is at the top of the list.
- Built without a drawing, to be added to Figma: the table button in the list header,
  the "List follows the map" button on the map, the `layers`, `in-view` and
  `arrow-left` icons, the Sufficient badge (outline), the bar that splits a row by
  status, and section rows under a first-seen group.
- No minimum page width: the map takes the space the panels leave, so the right panel is
  always at the window edge. The frame is drawn at 1728 wide only.
- The Mapbox logo sits top left and its attribution bottom right, as its terms require.

## Not designed yet

The claim detail area is designed as a first draft and not built: Studio page frames
`112:566` (Unknown claim, proposal waiting) and `112:786` (cited claim). It docks at the
bottom of the right panel when a claim row is selected.

Do not invent these in code; ask or design in Figma first: the full-width table, linking
sections into a pipeline, Tooltip, Popover, Dropdown Menu, Tabs, Table.
