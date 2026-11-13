# AGENTS.md: Lineage Studio frontend

The web app for reviewing traced pipelines: a map desk where a person checks sections,
attaches cited claims and decides on what the AI proposes. This directory is the React
app. State as of 2026-11-13: the theme exported from Figma and one screen, **Studio**,
working read-only on fixture data or, with `VITE_DATA_SOURCE=store`, on a local Lineage
store. More screens will follow; each gets its own directory under `src/screens/`.

What Studio does today: gives every section a status; lists pipelines and the sections
in no pipeline, with counts by status, search and filters; widens that list into a
table; selects sections across pipelines by row boxes, clicks on the map or a Lasso;
shows the selection's claims grouped in the right panel, and one claim in full with
its sources (what each does for the claim, and a map's edition and date) and any
proposal, among them an end or a cut that store proposes for a section; hands a selection to the Agent
chat as references; shows the network as of the edition chosen; keeps the view in the
URL; walks a first-time visitor through the screen with a Help tour, and explains each
area and the words in a Help dialog. Nothing can be edited and the Agent does not answer yet. The repo `README.md` one level
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
- Data comes from a fixture or from store, chosen by `VITE_DATA_SOURCE`, and only through
  `loadNetwork()`. One never stands in for the other when it fails. The app reaches store
  at its own `/store` path; the dev server and nginx add the token. No token, and no
  name starting with `VITE_` that holds one, ever goes in the code or the bundle.
- `src/data/store/to-network.ts` is the only place that knows store's shapes. It shows
  accepted claims as cited values, candidate claims as proposals and everything else as
  Unknown. It keeps each claim's id and the period it holds for, and each citation's
  role and, for a map, the date the map is as of; a map reading's locator in store is
  the trace file, so it is kept apart as `file`. It never changes a section because of
  an end store only proposes. It drops who asserted or reviewed a claim; the proposer
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
  claim is open the map draws the line traced as gone, dashed. There is no button to
  decide. Last seen stays Unknown until a person confirms the link in store; then it is
  cited to both maps (Figma `213:8036`).
- The list is always "Sections": pipelines, then the sections in no pipeline, one group
  per edition that first shows them (`summarise`). Store has no pipelines yet, so its
  data is only those groups. There is no `groupBy`. A row may be a pipeline or such a
  group (`summary.unassigned`): do not write "pipeline" into a string that covers both.
  A section with no name goes by its code (`sectionLabel`); never invent a name.
- Status (Not started, In progress, Sufficient, Done) is computed in
  `src/data/status.ts` from the claims and the rule in Settings, never stored. A proposal
  waiting is a mark ("Needs your decision"), not a status. An attribute looked for and
  not found stays Unknown (the owner, 2026-11-13).
- Settings (`settings.ts`) are kept in the browser: the required attributes and solid or
  dotted per status. The map and its key read the line style from `map/line-style.ts`.
- The view is in the URL (`url-state.ts`): edition, status, filters, search, list
  follows map, map position, one section. Not layout, layers or Settings. Add a field
  there when adding a filter. No test or screenshot uses a real name in a URL.
- Filters open in place of the list (button beside the search). Map layers and "List
  follows the map" are map controls, not filters. There is no Filters or Editions panel.
- The year of an edition is when a map first shows a line ("First seen"). It is never a
  build date.
- An edition is only the year the network is shown as of. The select at the top of the
  list changes it (`setEdition`). Done means sufficient data and in a pipeline.
- The map cannot read CSS variables: colours go through `map/map-colors.ts`, which reads
  the tokens. No raw colour in map code either.
- Not designed means not built: nothing new until Figma has it. Section 7 of the Studio
  page has the status counts, in-place filters, layers button, Settings and the table.
  The one menu is the right-click "Add to the Agent chat" (stock shadcn Context Menu,
  the owner's request). Tooltips are on the filter icon, the filter chips and the
  "List follows the map" button (stock shadcn Tooltip).
- On the map a click adds a section to the selection and a click on a selected one takes
  it off; a click on empty map steps the selection back. Every selection made on the map
  shows the `SelectionBar` ("Ask the Agent") at the top centre of the map.
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
  work. A citation shows only what the data holds: the source and its role; opened,
  a map's edition and date, where, the quote, and last the trace file. In Figma the
  link under a proposal reads "Decide in the Agent"; it is left out until the Agent
  can be asked.
- Notes are off the screen for now (owner, 2026-11-12): no pins, no layer row. The
  fixture still holds them. Do not bring them back without being asked.
- The selection is a set of sections (`selection` in the Studio store) and may span
  pipelines. Derive pipelines from it with `groupSelection`; do not store a selected
  pipeline. Use `aria-label` on icon-only buttons.
- Help (`src/screens/studio/help/`): a tour that starts by itself on a first visit
  (remembered in the browser as `studio.tour-seen`) and a Help dialog. Both read their
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
- The status counts are the whole edition after filters; they never follow the map.
  Only the list follows it (`listFollowsMap`), and its header says "n of m in view".
  While the list is a table (`tableOpen`) it holds everything and the follow button
  shows as paused.
- Reading is not selecting. A click on a section in the right panel opens it (or
  closes the one being read) and the map draws it heavier (`sections-reading`); only
  the boxes, the list and the map change the selection.
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
