---
title: One list with Group by, in place of Pipelines and Sections
type: feat
status: completed
date: 2026-11-13
---

# One list with Group by

## Why

Two rail items (Pipelines, Sections) are one set of sections grouped two ways. Since
rows stopped expanding, "Sections" lists editions, not sections; sections are on the
right. On store data Pipelines is empty. Owner (2026-11-13): one list, grouping chosen.

## Decisions (owner)

- One rail item for the list, plus Agent.
- "Group by" select above the search: Edition, Pipeline, Status (State dropped on review).
- List title, column head and listbox name follow the grouping (Editions, States...).
- Rows are groups only; a row's sections show in the right panel.
- Grey line "All sections, by first seen" removed.
- Row status badge stays, except when grouping by Status.
- "Edition" is the right word (one year's printing of the source map; store holds it as
  `store.source` rows of kind `map_sheet`). Goes into the glossary.
- Figma first, then code.

## Steps

### 1. Figma (first)
- Studio page, new section "12. One list, grouped", beside what exists. Frames:
  - list grouped by Edition (with Map edition, Group by, search, status line, chips);
  - grouped by State; by Pipeline (pipelines, proposed, "In no pipeline"); by Status;
  - Group by select open;
  - one full screen (rail with one list item + Agent, list, map, right panel of a group).
- Library instances where they exist; rows = PipelineRow, header = ListHeader.
- Owner reviews before step 3.

### 2. Data (drafted, uncommitted, typechecks, untested)
- `src/data/derive.ts`: `ListKind` = sections | states | pipelines | statuses; `GROUPING`
  words; `PipelineSummary.label` and kind `group`; `summarise` groups by main state and
  by status; Pipeline grouping ends with "In no pipeline" (in none, proposed for none).
- `src/data/us-states.ts`: length of a line per state; `mainStateOf`; lookup `.main()`.
  A section sits under one state: where most of its line runs. Lazy, as now.
- `src/screens/studio/studio-data.tsx`: pass `.main` to `summarise`.
- `src/screens/studio/url-state.ts`: `l=` takes the four values; old links still open.
- Tests: groups partition the edition (sum = total) for State and Status; order; the
  "In no pipeline" row; main state of a line crossing a border.

### 3. List panel
- New `panels/group-by-select.tsx` (pattern of `edition-select.tsx`), under Map edition.
- `panels/pipelines-panel.tsx`: title, column head, listbox name from `GROUPING`; row
  name from `summary.label`; drop the grey header line; no status badge when by Status;
  empty-state words per grouping; count in header stays sections ("x of y in view").
- Table mode: same columns for every grouping (code blank on groups).
- Changing grouping keeps selection, filters, search, map; clears nothing.

### 4. Rail and screen
- `studio-screen.tsx`: one list item; click opens/closes the panel only.
- Help tour: step text and `data-tour` names; `help.test.tsx` must pass.

### 5. Things that hang off row ids
- Agent attachments use the row id + "all" (`add-to-agent.tsx`, `agent-panel.tsx:232`):
  a group id means nothing after the grouping changes. Attach a group as its section
  ids, never "all". Pipelines keep "all".
- `selectedPipelineId` and URL `p=`: only when the row is a pipeline.
- Right panel header and breadcrumb read `summary.name` for any group.

### 6. Docs
- `frontend/AGENTS.md`, `README.md` + screenshots (sample, `studio.tour-seen` set).
- `controlplane/glossary.md`: edition. Workspace `AGENTS.md`: "two lists" paragraph.
  Separate commits per repo.

### 7. Check
- `pnpm check`. Dev server on store: each grouping; each grouping sums to the whole network; first
  switch to State under 300 ms; Filters + grouping together; link round trip.

## Acceptance

- [x] Rail: one list item ("Network") + Agent. No Pipelines/Sections pair.
- [x] Group by switches Edition / Pipeline; title, column and listbox name follow.
- [x] Every grouping holds every section of the network once (Pipeline: proposed
      sections under their proposed pipeline, the rest under "No pipeline").
- [x] Grouping is in the URL; old `l=pipelines` and `l=sections` links open right; an
      old `e=ed-<year>` opens as First seen up to that year.
- [x] Selection, filters and search survive a change of grouping.
- [x] Ask the Agent from a group row still names the right sections after regrouping.
- [x] No edition select, no status line; map key in place of layers + legend; Faint.
- [x] Figma section 12 drawn before the panel code; tests (238) and README current.
- [x] Checked by hand in the browser on store data and on the sample (2026-11-13).

## Built differently from the steps above

- The map now sorts sections by the filters one by one (it used to keep a whole row
  when any of its sections passed); Faint needs that.
- With no edition in force a section a later map no longer shows is listed and drawn
  like any other; its Last seen claim says when it ends.
- The question sent to the Agent no longer carries an edition.
- A pipeline row in the narrow list reads "4/7" (title: "4 of 7 sections done").

## Risks

- State group count != State filter count (main state vs every state touched). Said in
  a tooltip on the State column head.
- "In no pipeline" on store = one row of every section; the right panel then lists them all.
- Many tests name the "Sections"/"Pipelines" lists and rail items; all need moving.

## Decided after the first draft (owner, 2026-11-13)

- **No edition select.** Group by Edition and the First seen filter cover it. The list
  and the map show the whole network. Code: drop `EditionSelect`, `editionId` and URL
  `e=` (an old link with `e=` opens as First seen up to that year); sections are no
  longer cut by an edition's year.
- **Map key in place of layers + legend.** One popover from the layers button: Solid
  (sufficient or done), Dotted (not started or in progress), Dashed (proposed by a tool,
  eye), Faint (hidden by the filters, eye, off by default), Blue (selected). "Other
  editions" and the "Sections" eye go. A link "Change how lines are drawn" opens
  Settings there. Settings keeps deciding how a status is drawn; the two eyes stay on
  the map only, remembered per browser.
- **Faint is new behaviour:** sections the filters leave out drawn as ghost lines when
  its eye is on.
- **List header polish:** Group by is one full-width select with its label inside
  ("Group by  Edition"); status is a share bar with a small legend under it (dot, count,
  word), to read, not to click.
- **Figma: drawn**, Studio page section 12 (`237:10367`): list grouped by Edition
  `237:10398`, State `237:10671`, Pipeline `237:10955`, Status `237:11202`, Group by
  open `237:11450`, map key `239:10993`, full screen `239:11040`. Not reviewed line by
  line by the owner yet. Not drawn: Filters level with the new groups, the Help menu.

## Decided on review of the Figma frames (owner, 2026-11-13)

- Rail item is "Network" for now.
- **No grouping by State.** State is a filter only. Groupings: Edition, Pipeline,
  Status. Drop `states` from `ListKind`, `mainStateOf`/`.main()` and the main-state
  tests from the draft; the State filter and `statesOf` stay.
- **No status bar and no counts in the list header.** Group by Status and Filters
  already give them. Header = title + count, Group by, search + filter, chips when on.
  Remove today's status line from code (`pipelines-panel.tsx`) and its test.
- **Search placeholder: "Search name or code"** for every grouping. It searches
  pipelines, sections, codes and claim values, as it always did.

- **Groupings: Edition and Pipeline only** (final, owner 2026-11-13). No Status, State
  or Company grouping; those are filters. `ListKind` stays `pipelines | sections`
  ("sections" = by edition): revert the draft's `states`/`statuses`, `GROUPING` keeps
  two entries, keep `label`, kind `group` and the "No pipeline" row. Status counts live
  in Filters only. Company as a grouping: revisit once owners are cited.
- Figma section 12 now holds: Edition `237:10398`, Pipeline `237:10955`, Group by open
  `237:11450`, map key `239:10993`, full screen `239:11040`.

## Polish (list panel, from the Pipeline frame `237:10955`)

- Group headers when grouping by Pipeline: "Pipelines n", "Proposed pipelines n",
  "Not in a pipeline 1"; header counts are rows. Last row is "No pipeline" with its
  section count.
- Proposed row: name in full ("Unknown name"), score as a bare "0.92" with "Score 0.92"
  in the title; never cut the name to fit the score.
- Row count ("4/6", "1,204") right-aligned in one column across rows, mono.
- Group by select: label inside the trigger ("Group by" muted, value in foreground),
  full width, same height and edges as the search box; its menu the same width.
- 8 px between header, Group by and search; nothing tight against the title row.
- Agent rail item: the app's purple dot, not the yellow count badge still in Figma.
- Check at 300 px: no name cut while there is room; every cut name has its title.

## Unresolved questions

1. A section confirmed as ended is now drawn like a live one. Mark it (a filter, a
   line style), or leave to First seen / Last seen?
2. Every section on store shows the same name: own fix, next.
3. Colour lines by the current grouping: later, or never?
