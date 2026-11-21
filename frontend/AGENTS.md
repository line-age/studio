# AGENTS.md: Lineage Studio frontend

The web app for reviewing traced pipelines: a map desk where a person checks sections,
attaches cited claims and decides on what the AI proposes. This directory is the React
app. State as of 2026-11-13: the theme exported from Figma and one screen, **Studio**,
working read-only on fixture data or, with `VITE_DATA_SOURCE=store`, on a local Lineage
store. More screens will follow; each gets its own directory under `src/screens/`.

What Studio does today: gives every section a status; lists pipelines (and the ones
only proposed) in one list and every section in another, with counts by status, search
and filters; shows a pipeline's own name, owner and operator, each with its period; widens that list into a
table; selects sections across pipelines by row boxes, clicks on the map or a Lasso;
shows the selection's claims grouped in the right panel, and one claim in full with
its sources (what each does for the claim, and a map's edition and date) and any
proposal, among them an end or a cut that store proposes for a section; hands a selection to the Agent
chat as references; shows all of the network, only its pipelines or only the sections
in none, by one switch above the list; keeps the view in the
URL; walks a first-time visitor through the screen with a Help tour, and explains each
area and the words in a Help dialog; lets a person ask the Agent about a section, a
claim, a source or a proposal with questions that only read, keeps a sent question in
the thread, and shows an answer's statements with what each rests on; makes, changes
and takes sections out of pipelines from the right-click menu, and decides what tools
proposed (pipelines, ends, candidate claims) in the Agent's inbox, as the person using
it (2026-11-15, plan 005). The repo `README.md` one level
up shows it with screenshots; keep those current when the screen changes visibly.

The workspace `AGENTS.md` two levels up holds the project-wide rules and the full Figma
notes. This file wins for anything inside this directory.

## Stack

- Vite, React 19, TypeScript (strict). A client-only single-page app. No server
  rendering, no server components.
- Tailwind v4, configured in CSS (`src/index.css`); there is no `tailwind.config`.
- shadcn/ui, style **base-nova** (Base UI primitives, not Radix). `components.json` is
  the record.
- Map: Mapbox GL JS through `react-map-gl/mapbox`, stock light style. Needs a public
  token in `.env.local` (see `.env.example`); without it the app runs and says so.
- State: one small zustand store per screen. Data validated with zod.
- Tests: Vitest and Testing Library.
- pnpm. Node 22.

## Commands

| Command                             | Does                                                               |
| ----------------------------------- | ------------------------------------------------------------------ |
| `pnpm dev`                          | Dev server                                                         |
| `pnpm build`                        | Type-check and production build                                    |
| `pnpm check`                        | Everything below, in order. Run before calling work done           |
| `pnpm tokens:check`                 | `tokens.css` matches the Figma export                              |
| `pnpm typecheck`                    | `tsc -b`                                                           |
| `pnpm lint`                         | ESLint                                                             |
| `pnpm format:check` / `pnpm format` | Prettier                                                           |
| `pnpm test`                         | Vitest, once                                                       |
| `pnpm fixtures:sample`              | Rebuild the invented sample `public/fixtures/sample.json`          |
| `pnpm tokens:build`                 | Regenerate `src/styles/tokens.css` from `tokens/figma-tokens.json` |

### When a running Studio shows the latest changes

Before telling someone to look, check which server they have open and whether it has
the change. Find it with `lsof -iTCP -sTCP:LISTEN -P | grep node` and `docker ps`.

| What changed                                                    | Dev server (`pnpm dev`)                                    |
| --------------------------------------------------------------- | ---------------------------------------------------------- |
| A file under `src/`, a style, a fixture in `public/`            | Nothing to do: it reloads the page itself                  |
| `.env.local` or `vite.config.ts`                                | It restarts itself; refresh the page                       |
| A variable given on the command line (`VITE_DATA_SOURCE=store`) | Stop it and start it again with the new value              |
| Dependencies (`pnpm install`), a change of branch with new ones | Stop it and start it again                                 |
| It was started from another checkout or worktree                | It serves that one, not yours: start one where the code is |

A value on the command line wins over the same name in `.env.local`, so a server
started with a variable keeps it until it is restarted.

The container (`compose.yaml`, port 8080) is a built image. It never picks anything up:
after any change, rebuild it (`docker compose ... up --build`, or `tools/gas-stack.sh up`
in the workspace). Its `VITE_` values are fixed at build time.

After a restart, confirm before saying it is ready: the page answers, and for a setting,
`curl -s localhost:<port>/src/data/load-network.ts | grep VITE_` shows the value.

## Layout

| Path                       | What                                                 |
| -------------------------- | ---------------------------------------------------- |
| `src/components/ui/`       | shadcn components, added by the CLI                  |
| `src/components/`          | Lineage parts any screen can use, one per file       |
| `src/components/icons/`    | Our icon set, from the Figma Icons page              |
| `src/screens/<screen>/`    | One screen: its layout, panels, map and store        |
| `src/data/`                | Schema, loader and derived values. The API seam      |
| `src/data/store/`          | Reads the Lineage store; adapts it to the schema     |
| `public/fixtures/`         | `sample.json` (invented). `local/` is git-ignored    |
| `docs/fixtures.md`         | The fixture format                                   |
| `src/styles/tokens.css`    | Generated theme. Never edit                          |
| `src/index.css`            | Tailwind entry, imports, base layer                  |
| `tokens/figma-tokens.json` | What was read from Figma                             |
| `scripts/`                 | Token generator and checker                          |
| `.agents/skills/`          | Skills; `SOURCES.md` there says where each came from |

## Which skill when

Skills are plain files in `.agents/skills/<name>/`, so any agent can use them. If your
tool does not load skills from that directory by itself, open `SKILL.md` in the matching
directory and follow it before starting the work.

| Doing                                                                    | Skill                    |
| ------------------------------------------------------------------------ | ------------------------ |
| Building anything from the design; need a node id, token or naming rule  | `lineage-figma`          |
| Adding, updating or composing a shadcn component; chat UI; forms         | `shadcn`                 |
| Designing a component's API; too many boolean props; compound components | `composition-patterns`   |
| Writing or reviewing React code for performance                          | `react-best-practices`   |
| Animating between states, panels or list changes                         | `react-view-transitions` |
| Reviewing UI for accessibility and interface quality                     | `web-design-guidelines`  |
| Keyboard, focus or selection behaviour of a part shadcn does not provide | `ui-sdk`                 |

The Figma plugin's own skills (`figma-design-to-code`, `figma-use`) are installed for the
user, not in this directory. Use them for the mechanics of reading and writing Figma.

## What in the vendored skills does not apply here

This is a Vite SPA. The Vercel skills are written for Next.js as well. Do not follow:

- `react-best-practices`: every `server-*` rule, anything about React Server Components,
  server actions, `next/dynamic`, `next/image`, route handlers, `React.cache`, `after()`.
  For `bundle-dynamic-imports` use `React.lazy`. The `async-*`, `bundle-*`, `client-*`,
  `rerender-*`, `rendering-*`, `js-*` and `advanced-*` rules apply.
- `react-view-transitions`: `references/nextjs.md` and anything about `next.config` or
  the App Router. Check first that the installed React exports `ViewTransition`; if it
  does not, say so and do not switch React to a canary build without asking.
- `shadcn`: where it mentions `"use client"` or RSC, ignore; `rsc` is false here. Where
  it says dark mode, see below.
- `ui-sdk` (installed 2026-11-13 as a trial; beta): standard controls stay shadcn on
  Base UI, because Figma is specified against it. Do not replace a shadcn component with
  a ui-sdk one, do not import `@ui-sdk/core/web.css`, and ignore its "a hand-written
  `role=` is a bug" rule for parts that already exist. Use it only for the behaviour of
  a Lineage part that shadcn does not cover (the pipeline list, the sections tree), and
  only when asked to move that part over. Nothing uses it yet.

## Rules

**Design**

- Figma is the reference. Read the `lineage-figma` skill before building from it.
- Tokens only. No raw colour, radius, shadow or font size in components. If a value is
  missing, it is missing in Figma: say so; do not add a one-off.
- Use `type-ui-*` for text, not a size class plus a weight class.
- One light theme. There is no dark mode. Do not write `dark:` classes. The ones inside
  shadcn components are inert and stay untouched.
- State colours always come with their word. Unknown is the orange word with a dotted
  underline, never a grey value, blank or dash.
- Nothing of Mapbox's: no icons, fonts or artwork.

**shadcn**

- Add components with `pnpm dlx shadcn@latest add <name>`; do not hand-write a copy.
- Change how a component looks through tokens first. Edit a file in `src/components/ui/`
  only for something tokens cannot express, and keep the edit small.
- After `shadcn add`, check `src/index.css`: the CLI may write colour variables back
  into it. Remove them; `tokens.css` owns the values. Then run `pnpm tokens:check`.

**Structure**

- A screen lives in `src/screens/<name>/`. Things only that screen uses stay there
  (panels, map, store). A part moves to `src/components/` when a second screen needs it.
- Components never read a fixture or call `fetch`. They get data from the screen's
  data provider (`studio-data.tsx`), which gets it from `src/data/load-network.ts`. When
  the API arrives, that loader is what changes.
- Counts and statuses are derived in `src/data/derive.ts`, never stored or hard-coded.
  They read a section's `values` (one per claim row: the value and how many proposals
  wait), which is what store's list gives and what the sample's claims are reduced to
  by `claimValues`. Never `claims` for a count or a filter.
- On store's data a section's claims, citations and proposed ends in full are its
  detail (`src/data/detail-store.ts`; plan `2026-11-21-001-feat-studio-store-light-loading`). Opening Studio reads the
  sections' rows, the links of the network and its lines: a handful of requests, none
  per section. A section's detail is read when something needs it
  (`useSectionDetail`: the opened section, its claim, the citation pop-up, the Agent's
  inbox when it opens), several sections per request. While it is read, the value
  shows and only the sources pulse (shadcn Skeleton); nothing reads Unknown because it
  is not read yet. A failure says so in that panel only, with Try again. After a write
  the network is read again and kept details stay shown until read again. The sample
  holds every section's detail already. `to-network.ts` words the list's values and
  the detail through the same functions; a test checks they agree on answers store itself
  recorded (`src/test/store-recorded.json`, invented data; re-record with store's
  `test_record_answers_for_studio` after a change to its reads).
- A claim a section has through a confirmed link (store's scope: a line traced as gone
  a person matched to it, the section it was split from) is its history, never a
  merge: each citation of it carries `inheritedFrom`, and the claim detail says where
  it comes from.
- Data comes from a fixture or from store, chosen by `VITE_DATA_SOURCE`, and only through
  `loadNetwork()`. One never stands in for the other when it fails. The app reaches store
  at its own `/store` path, which the dev server and nginx pass on with no token: while
  there are no users, store takes a request with none as the local person ("Local
  developer"), who reads and decides (plan 005, D3). No token, and no name starting with
  `VITE_` that holds one, ever goes in the code or the bundle.
- Writing (plan 005). `src/data/store/write.ts` is the frontend's only place for store's
  write shapes: pure bundle builders (`placeBundle` makes a pipeline, adds to one, moves
  and takes out: the membership left is rejected, the new one confirmed, in one bundle;
  `decideMembershipsBundle`), the reviews, and refusals in words (`WriteError`). Every
  new row has an external key from the action's key, made when the person presses it, so
  a retry makes nothing twice. `src/data/changes.ts` holds every change as one type
  (`Change`): `applyChange` makes it in memory on the sample (tests, demo),
  `sendChange` sends it to store; `change()` on the data provider picks one and, on
  store, reads the network again once store answers. Nothing shows as done before that.
  A section is in one pipeline for its whole life: leaving one says it was wrong. A
  proposed pipeline is decided whole; a confirm leaves a section already in another
  pipeline where it is, with its proposal (D2).
- `src/data/store/to-network.ts` is the only place that knows store's shapes. It shows
  accepted claims as cited values, candidate claims as proposals and everything else as
  Unknown. A `line` is a pipeline: a section is in it once its `part_of` link is
  confirmed, and a proposed `part_of` link is a proposed membership that changes
  nothing. A pipeline's name, owner and operator are the line's own accepted claims,
  one row per claim, each with its period; an owner store holds on a section is not
  shown. It keeps each claim's id and the period it holds for, and each citation's
  role and, for a map, the date the map is as of; a map reading's locator in store is
  the trace file, so it is kept apart as `file`. It never changes a section because of
  an end store only proposes. It drops who asserted or reviewed a claim, but for a
  section's tracer, which store's list names (the owner, 2026-11-19); the proposer
  of a link is kept only when it is a tool (store names the kind of an agent on claims
  only, so an agent seen asserting a claim as a person is never named). Keep it pure
  and test it with invented answers (`src/test/store-payloads.ts`).
- Evidence is worded in `src/data/evidence.ts`, nowhere else: the role ("Shown on",
  "Not on", "States"), a map's date ("1953 edition, as of 31 December 1953"), a period
  (`formatValid`: "by August 1929", "between 1929 and 1931") and a proposed end or cut.
  No date reads as a bare build year.
- A map only says a line was drawn. Store's status "operational", cited to a map that
  shows the line, is worded "Shown by <the map's date>"; Studio never says
  "Operational" on a map's word.
- A line traced as gone (a removal in store) is never a section: it is in no list and
  no count. A proposed `same_as` link to one is a proposed end, shown as a proposal on
  Last seen; a proposed `overlaps` link is a proposed cut, shown on Geometry
  (`section.proposedEnds`, Figma `211:8081` and `211:8327`). Each says what is proposed,
  by which tool and the score, and counts toward "Needs your decision". While that
  claim is open the map draws the line traced as gone, dashed. A proposed end is
  decided in the Agent's inbox; a proposed cut has no button anywhere (store would take a
  confirm with its default cut). Last seen stays Unknown until a person confirms the link in store; then it is
  cited to both maps (Figma `213:8036`).
- One list, one rail item ("Network"), with a three-way switch above it: All, Pipelines,
  Unplaced (`panels/scope-switch.tsx`, stock shadcn Tabs; Figma section 18, `403:14721`;
  the owner, 2026-11-21; plan `2026-11-21-001-feat-studio-scope-switch-and-filters`).
  One is always on and Studio opens on All. The switch (`scope` in the store, `sc` in
  the URL, `Scope` and `inScope` in `derive.ts`) sets three things in one move: the rows
  of the list, the lines on the map and the filters offered. A section is placed once a
  person confirmed it part of a pipeline (`isPlaced`); one only proposed for a pipeline
  is unplaced. Pipelines: "Pipelines", then "Proposed pipelines" (no section confirmed,
  only proposed; the row shows the best score bare, all scores on hover). Unplaced: one
  row per edition with the sections in no pipeline that it is the first to show. All:
  the pipelines, the proposed ones, then "Not in a pipeline" with those edition rows.
  With no pipelines in the data the Pipelines list says what a pipeline is and how one
  gets made; it is never blank and never a stand-in row. There is no Group by: sections
  in a pipeline are not listed by edition. Rows are groups only, sections are on the
  right. The title and the column head come from `SCOPE`; the header counts sections,
  never rows ("2 pipelines · 42 sections" on Pipelines), and holds no counts by status.
  `summarise(network, rule, scope)` builds the rows; `editionRows` builds edition rows
  of any set of sections. In `studio-data.tsx`, `scoped` is the sections the switch
  shows, once each, and the counts, the filters, the search and the map read it;
  `everySection` is the whole network whatever the switch says, and only the selection
  reads it. Switching never changes the selection: a section the switch hides stays
  selected and counted in the right panel, under its pipeline or its edition
  (`useSelectionGroups`), and is drawn again when the switch goes back. A row's `kind`
  is `pipeline`, `proposed` or `first-seen`: do not write "pipeline" into a string that
  covers them all. A group handed to the Agent goes as its section ids, never "all":
  its row is not in every list. Only a pipeline row sets `selectedPipelineId` and `p`.
  Something that leads to a pipeline (a link with `p`, "On the pipeline", a reference
  in an answer) calls `showPipelines`, which moves the switch off Unplaced.
- A group's row follows the filters and, while the list follows the map, the view
  (`narrowRows`, the owner, 2026-11-13): it counts and selects only the sections that
  pass, so "1929 edition" with the State filter is that edition in that state. A
  pipeline's row stays the whole pipeline; its sections that do not pass are dimmed on
  the right. The selection's groups follow the filters but not the view, so a pan
  never changes what is selected.
- The table has one Status column: the split by status as a bar, then the word for
  the whole (a status never shows as colour alone). On Unplaced it has no Code and no
  progress column: an edition has neither. On All, where pipelines and editions are
  listed together, an edition's row leaves those two cells empty.
- A pipeline's own claims are name, owner and operator (`ON_PIPELINE`), never a
  section's. The right panel shows them above its sections when one pipeline is
  selected (`pipelineClaims`, `datedValue`: "Alder Gas Co., by 1931"; an owner that
  changed is two rows). A section has a Pipeline row: the pipeline's name, "Not yet
  <code>'s" with the proposal, or Unknown; its detail says which, and who proposed it.
  In a pipeline it also has an Owner row reading "On the pipeline" that selects the
  pipeline as a whole (`selectPipeline`, `p` in the URL). A section in no pipeline has
  no Owner row. The Company filter and search read the pipeline's owners
  (`ownersBySection`).
- Status (Not started, In progress, Sufficient, Done) is computed in
  `src/data/status.ts` from the claims and the rule in Settings, never stored. The rule
  never holds Owner, Name or Operator: they are the pipeline's (the owner, 2026-11-13).
  A saved rule that names Owner loads without it. A proposal
  waiting is a mark ("Needs your decision"), not a status. An attribute looked for and
  not found stays Unknown (the owner, 2026-11-13).
- Settings (`settings.ts`) are kept in the browser: the required attributes and solid or
  dotted per status. The map and its key read the line style from `map/line-style.ts`.
- The view is in the URL (`url-state.ts`): the switch, status, filters, search, list
  follows map, map position, one section. Not layout, the map key's eyes or Settings.
  What an older link carried and the screen no longer has is read past, never an
  error: the grouping (`l`), the Pipeline filter (`pm`), the First seen range (`f`) and
  the edition in force (`e`). Such a link opens on All. Add a field there when adding
  a filter. No test or screenshot uses a real name in a URL; a person is named in a
  URL by store's id, never by name.
- Filters are the second level of the list panel (the owner, 2026-11-13): the button
  beside the search opens every filter on one screen in place of the list, at the
  list's own width (a table folds while they are open and comes back on Back), with
  Back, Clear all and a live "Show n sections". Status is one of the filters and always
  shows. Any other group shows only while it is on, or while it can narrow what the
  switch shows: one of its choices would leave some sections and not all of them
  (`canNarrow`, `passingWithout`, `rangeNarrows`; the owner, 2026-11-21). So on data
  with no diameters, owners or build dates those filters are left out, and come back
  by themselves once claims exist. "Needs your decision" and "Changed since review"
  follow the same rule inside Status. The filters about a section on its own are
  First shown by (a search with a dropdown of editions, several tickable, each with
  its count; `fe`), State (`st`), Length (from and to in km, measured along the route
  as traced, `lengthKm`; `len`) and Proposed end (the whole section, or part of it:
  `proposedEnds[].kind`; `pe`). They are offered on All and on Unplaced. On Pipelines
  they are not offered and not in force, their chips are not shown, and their values
  are kept and in force again when the switch goes back (`sectionFiltersPaused`).
  There is no Pipeline filter: the switch does that. Traced by is a fifth of them
  (a search with a dropdown of tracers; `tb`, store's id of the person, never the
  name): store's list names who asserted each section's route (`traced_by`, a person
  only), kept as `section.tracedBy`. A tracer's name is shown on the screen and goes
  nowhere else.
  Every filter reads `section.values` and what the list gives; none reads a section's
  detail. The list itself shows only the filters that are on, as chips; counts by status are in
  Filters only. The filter button shows how many are on. The map key and "List follows
  the map" are map controls, not filters. There is no Filters or Editions panel in the
  rail.
- The map key (`map/map-key.tsx`, Figma `239:10993`) replaces the layers popover and
  the legend: Solid and Dotted (the statuses drawn so, from Settings), Heavy and Thin
  (in a pipeline, in none; the two weights are `LINE_WEIGHT` in `map/line-style.ts`,
  and colour is never used for this), Dashed (proposed
  by a tool, with an eye), Faint (sections the filters leave out, with an eye, off
  until asked for), Blue (selected), and a link that opens Settings
  (`useSettingsOpen`). The two eyes are kept in this browser (`studio.map-key`). The
  map sorts sections by the filters one by one; a faint line cannot be clicked. What
  the switch leaves out is not faint: it is not drawn at all and cannot be clicked.
- A section's states (State filter) come from its line and the Census outlines in
  `us-atlas` (`src/data/us-states.ts`), worked out when first asked. Where a line lies
  is not a claim and needs no citation. Company counts a section's own Owner claim as
  well as its pipeline's owners.
- The year of an edition is when a map first shows a line ("First seen"). It is never a
  build date.
- An edition is one year's printing of the source map. No edition is in force: there
  is no select, and the list and the map show the whole network, a section a later map
  no longer shows among them (its Last seen says so). Done means sufficient data and
  in a pipeline.
- The map cannot read CSS variables: colours go through `map/map-colors.ts`, which reads
  the tokens. No raw colour in map code either.
- Not designed means not built: nothing new until Figma has it. Section 7 of the Studio
  page has the status counts, in-place filters, layers button, Settings and the table.
  The one menu is the right click (stock shadcn Context Menu, the owner's request).
  At its top, the changes (`pipeline-actions.ts`, Figma `213:8451`, `209:7993`): on one
  section "Change pipeline", which opens the dock at the bottom of the right panel
  (`panels/pipeline-dock.tsx`, `209:8268`: Move to a pipeline, Not in a pipeline or New
  pipeline, then Change); on several, "Make pipeline" (at once; the new pipeline has no
  name until a source gives one) and "Add to a pipeline" (the dock). The dock then says
  what the change came to, or why store refused it. On a section row, below the
  changes, "Edit" opens the Edit sections window on that row alone; where the row is
  ticked as part of a bigger selection, a muted "N sections selected" line and "Edit
  selected (N)" open it on the whole ticked selection instead, never silently on more
  than the menu says (`add-to-agent.tsx`'s `EditTarget`). A section row no longer offers
  the starter questions below: just "Ask", which asks the same as elsewhere but opens
  with nothing pre-filled. On a claim or a source the starter questions that only read
  still show (`starters.ts`): "What does store say about this?" on a claim or a source,
  "Why is this Unknown?" on an Unknown claim, "What is proposed here, and why?" where a
  proposal waits. No starter changes a claim. "Ask the Agent about this" under a proposal (Figma
  `223:11018`) asks the same and decides nothing. Below any starters, "Add to the Agent
  chat" (claims, sources, the map) or "Ask" (section rows). Choosing an item leaves the
  cursor in the chat (`finalFocus`). Tooltips are on the filter icon, the filter chips
  and the "List follows the map" button (stock shadcn Tooltip).
- Edit and Edit selected open the Edit sections window (`panels/edit-sections-dialog.tsx`;
  needs a Figma design). One section's own fields prefill as they read now; several
  sections show a field as Mixed (placeholder, not a value) where they disagree, and
  typing into it sets the same value on every section still in the edit. A section can
  be left out of a bulk edit (a crossed-out chip) and added back. A field changed from
  what it opened with gets a small dot and a Reset that puts the old value back, and the
  footer lists what will change ("Will update Diameter on Alder to Birch" / "Will update
  Diameter on 3 sections"). Saving shows an Undo toast. A date field
  (`panels/date-field.tsx`: day, month or year, with "Originally: …" under it while the
  typed value still reads as the text the claim opened with, and the Last-before-First
  error under Last seen) is disabled with a short note on real store, since store cannot
  yet take a date write from Studio — the simpler of the two options the owner allowed,
  over blocking Save; building the store write for dates is a later round. Status is
  left out of this window for now. Saving a person's edit on the fixture, or on store
  for a field store does take (everything but dates), writes it as an accepted claim
  at once: a person's edit needs no citation to be believed. An agent's claim is never
  changed this way; it stays a candidate until a review accepts or rejects it, same as
  before.
- On the map a click selects one section, replacing the selection; a second click on
  it leaves it selected. With Cmd held on a Mac, Ctrl elsewhere, a click adds a section
  or takes a selected one off (`map/click-selection.ts`; the owner, 2026-11-15). A click
  on empty map steps the selection back; with the key held it changes nothing. The key
  does nothing in the right panel or the Lasso. While exactly one
  section is selected and the Select tool is in hand, a quiet line at the top centre
  of the map names the key ("Hold Cmd to select several"): under the SelectionBar
  when that shows, never by the tools, no border or shadow (the owner, 2026-11-15);
  it takes no click.
- Every selection made on the map or in the list shows the `SelectionBar` ("Ask the
  Agent") at the top
  centre of the map (`AgentBar`, `agentBar` in the store), also when the map has no
  token.
- In the list, Ctrl or Cmd and a click on a row adds it to the selection or takes it off
  and leaves the map where it is, as the box and Space do. A plain click still selects
  just that row and fits the map.
- The composer's attach button, and "#" at the start of a word, open a picker of
  pipelines and sections; a pick attaches it.
- Ctrl and drag turns the map (the owner, 2026-11-13); "Reset north" in the zoom group
  turns it back. The map never tilts. On a Mac, Ctrl and click is a right click, so the
  map swallows it and the menu does not open. The turn is not in the URL.
- A move the app makes to show a selection is quiet (`requestFit` without `follow`): it
  does not change the "in view" list. Pass `follow` only when the person asked to go
  somewhere (search hit, the app name in the breadcrumb).
- A claim chosen in the right panel opens its detail at the bottom of that panel
  (`panels/claim-detail.tsx`, Figma `112:566` and `112:786`): the value, any proposal
  (`ProposalCard`) and each source (`Citation`) with the place and the quote. It is read
  only. Accept, Reject and "Find a source" are in the drawing and left out until they
  work. Clicking a source opens the citation pop-up (`citation-dialog/`, Figma `315:359`)
  instead of expanding it in place. On the left a source list names every source the
  claim cites, once each, with "N passages" where a source is cited more than once;
  picking a row switches the details on the right to that source's first citation. A
  citation's details show only what the data holds, in order: the source and its role;
  a map's edition and date; where; the quote, or "No quote, scanned map" for a scan that
  has none; the source's own identifier; confidence. A note says when the citation backs
  more than one claim. Previous and Next step between the section's cited claims; Show
  on map and Done close the pop-up; Open source shows only when the citation has a web
  address of its own or an archived copy, and links to whichever it has (own address
  first). On the left of the source list, a source viewer (`source-viewer.tsx`, Figma
  `336:13243`) shows what the data holds: today every citation shows the unavailable
  kind, since Studio cannot yet serve scan images. Under a proposal, "Ask the Agent
  about this" (Figma `223:11018`), not "Decide in the Agent" (section 10, parked with
  deciding).
- Notes are off the screen for now (owner, 2026-11-12): no pins, no layer row. The
  fixture still holds them. Do not bring them back without being asked.
- The selection is a set of sections (`selection` in the Studio store) and may span
  pipelines. Derive pipelines from it with `groupSelection`; do not store a selected
  pipeline. Use `aria-label` on icon-only buttons.
- The Agent's inbox (`panels/agent-inbox.tsx`, Figma `216:9658`), above the chat:
  "n proposals waiting", folded until opened, then every proposal on a ProposalCard
  (the Proposed badge, the tool that proposed it, now and proposed, why) with its
  decision: a proposed pipeline "Confirm all n" (or "Confirm m" when some sections are
  already in another pipeline, which the card says) and "Reject all"; a proposed end
  Confirm and Reject; a candidate claim, cite's findings among them, Accept and Reject;
  a proposed cut no button. Read from the network, no model; twenty at a time. The
  claim detail still decides nothing: its proposal points to the Agent.
- Asking (`src/data/question.ts`): a question carries the words, each attached thing by
  kind and store id (or its section and attribute when the data has no id), the edition
  in force and the network; `buildQuestion` makes it, and nothing else leaves the
  screen. On store's data the Agent service (`studio/agent`) answers it through this
  app's `/agent` path (`src/data/agent/`, `panels/agent-conversation.tsx`): one shared
  thread, kept by the service, shown again after a reload, with Stop, "Start fresh" (the
  action `fresh_start`: the messages go, what cite found stays, so Propose and steering
  still work) and "Clear chat" (asks first: it clears the chat for everyone). From 12 turns
  a quiet line suggests starting fresh; no colour, since the Agent reads no earlier turn.
  Only an answer the service checked is shown. Its contract is
  `agent/contract/`, whose examples the tests read. An answer is shown as Figma
  section 13 (`260:10851`) has it, each kind of thing in its own look
  (`panels/agent-steps.tsx`, `agent-statement.tsx`, `agent-sources.tsx`): what the
  Agent read is a chain of thought above it (open while it works, from the graph's
  `steps` state; folded after, "Read 4 things in store"); what a statement rests on is a
  neutral source pill that opens the claim, its state said in the sentence; a section
  the sentence names is a link in the text; a worked-out fact or a lead carries a grey
  prefix ("Inferred", with what it means on hover; "Lead, not in store") and is never
  shown as a claim; "Used n
  sources" ends it. What cite found is a finding card under its sentence
  (`panels/agent-finding.tsx`, stock parts, not in Figma yet): the AI badge "Found by
  cite, not in store", the page's own words, the passage marked on a crop of the page,
  the reference and "Open page on Internet Archive", why it is in doubt, the places it
  matched, and Propose, which sends the action `{kind: "propose", finding}` and is the
  only way a finding reaches store (as a candidate). While cite searches, the answer so
  far and cite's steps ("cite: ...") stay live; after a proposal Studio reads store
  again (`reload` in `studio-data.tsx`). About several attached sections it is grouped under each; the rest
  are listed to open. A fixed line (a question back, a refusal, a failure) stands alone. On the sample nothing answers: a
  sent question stays in the thread (`sentQuestions`) with the line "The Agent cannot
  answer yet". Tests always run on the sample (`vite.config.ts`). An answer in the data is
  `statements`, each with the claims, sources or proposals it rests on (`refs`); a
  statement with none says store does not say. A reference opens what it names. The
  answer contract (only what store holds, every statement referenced, no writes) is in
  the plan; the service is later work.
- Help (`src/screens/studio/help/`): a tour that starts by itself on a first visit
  (remembered in the browser as `studio.tour-seen`) and a Help dialog. The Help button
  is a menu (the owner, 2026-11-13): "Take the tour", "Ask the Agent" (opens the Agent
  with the cursor in the message box) and "Help topics" (the dialog). Both read their
  words from `help/steps.ts`; never write the same text twice. An area is found by its
  `data-tour` name; a step that needs a panel open says so with `needs`. A feature that lands gets a step there and a `data-tour` name on
  its area; a step covers only what works. `help.test.tsx` fails when a step's area
  is gone, so run it after moving things. Tests run with the tour seen
  (`src/test/setup.ts`); README screenshots are taken with `studio.tour-seen` set.
- Hide what does not work (the owner, 2026-11-13). The top bar holds the app name,
  the breadcrumb, Settings and Help; the menu, Undo, Redo, Export and "Review changes"
  are in Figma but hidden until the feature behind each exists. Do not wire them to
  invented behaviour. The "Scanned map" eye and the draw tools other than Select and
  Lasso are hidden the same way. The right-click menu does not open when it has
  nothing to offer.
- The counts in Filters are what the switch shows after the other filters; they never
  follow the map.
  Only the list follows it (`listFollowsMap`), and its header says "n of m in view".
  While the list is a table (`tableOpen`) it holds everything and the follow button
  shows as paused.
- Reading is not selecting. A click on a section in the right panel opens it (or
  closes the one being read) and the map draws it heavier (`sections-reading`); only
  the boxes, the list and the map change the selection.
- The left list has one row per pipeline or first-seen group and nothing opens under
  it: a row's sections are listed in the right panel only, so they are never shown
  twice. Search is the exception; it lists the sections it found under each hit.
- Progress is said one way, with its noun, from `derive.ts`: a pipeline "4/6 done", a
  section "2/3 cited" (required claims, by the rule in Settings), a group in no
  pipeline "2 sections". No Unknown count on a section row; Unknown is a word on a
  claim.

**Code**

- React 19: `ref` is a prop (no `forwardRef`), `use()` over `useContext`.
- Prefer composition to boolean props; see `composition-patterns`.
- Named exports. One component per file. Files in kebab-case.
- Words come from `controlplane/glossary.md` in the workspace. Section, segment, edge
  and pipeline are not interchangeable. Check before a term reaches the UI or a type.
  Types and the interface both use the glossary word (`Claim`, `Citation`, `Section`):
  the interface says "claim", never "fact" (the owner, 2026-11-13). "Pipeline" as a
  group of sections, "edition", "proposal" and "Unknown" are Studio's words and
  are not in the glossary yet.

**Data and privacy**

- Sample data is invented. No real section, company, source, map, sheet or person name,
  no hostnames, cluster names or environment settings. This code may become public.
- No credentials in the repo. No `.env` committed. The Mapbox token goes in `.env.local`.
- A fixture with real names goes in `public/fixtures/local/` (ignored) and is selected
  with `VITE_FIXTURE_URL`. Only `sample.json` is committed, and it is invented.
- Data read from store is real. It stays on the machine: never in a test, a fixture, a
  screenshot or a commit. Screenshots for the README are taken on the sample.

**Writing**

- No em-dashes or en-dashes as separators. Use a colon, a semicolon or a new sentence.
- Buttons say what happens, in sentence case: Accept, Reject, Find a source.
