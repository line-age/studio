---
date: 2026-11-13
topic: filters-two-levels
status: active
---

# Filters: two sidebar levels, and the filters the data can carry

## Why

Filters drifted. Agreed 2026-11-13 (owner, Figma `156-4723`): two levels in the left
panel. L1 = list with search, filter button, chips of what is on. L2 = Filters, in place
of the list, back arrow, every filter on one screen, live "Show n sections". Today:
- status chips sit on L1 as a row of badges, most of them filters that are not on (zeros);
- L2 hides Company and Build date when store has nothing for them;
- L2 opens at table width when the list is a table (looks broken);
- no clear for the search text; "Clear all" only inside L2;
- edition select reads like a filter but is a lens;
- an unfinished, uncommitted move of status into L2 sits in the working tree.

## Decisions (owner)

- Keep two levels as built: L2 replaces the list, all filters on one screen. No third
  level, no second column, no modal.
- This plan replaces the other session's uncommitted status-in-Filters work.
- L1 shows only filters that are on. No badge for a filter that is off.

## Plan

### 0. Clean start
- Owner stops the other session.
- Keep my uncommitted fixes: edition per year (`to-network.ts` + test), search ×,
  chip "Clear all", Company/Build date always shown.
- Drop the rest: restore `status-counts.tsx`, `studio-store.ts`, four test files; delete
  `src/test/status-filter.ts`. Hunk-by-hunk in `filters-panel.tsx` and
  `pipelines-panel.tsx`.
- `pnpm check` green, commit on `feat/no-list-expand` (or new `feat/filters-two-levels`).

### 1. L1, the list
- Header row: title + count ("n sections" / "x of y in view"), table, hide.
- Edition select stays on top, but reads as a lens: label "Map edition" above it,
  value "1980"; tooltip "Shows the network as this edition's map draws it. Not a filter."
- Search: × to clear while text; Esc still clears.
- Filter button: plain when nothing on; selected + count badge ("2") when on.
- Status counts row removed from L1. Status becomes a filter in L2.
- Chips row: one chip per filter that is on (status included), × each, "Clear all" when
  2+. Nothing shown when no filter is on.
- Total for the whole edition stays visible in the header, so "how much is done" is
  readable without opening L2? -> see questions.

### 2. L2, Filters
- Always list width (300), also when L1 was a table: table folds while L2 open, comes
  back on Back.
- Order: Status, Needs your decision, Pipeline, First seen, Company, Build date, Added to
  Lineage, Unknown in.
- Every group always shown. No data -> one hint line, e.g. "No pipeline has a cited owner
  yet." Never hidden, never a dash.
- Status: radio list All / Not started / In progress / Sufficient / Done with counts;
  zero rows dimmed but kept.
- Each group has Clear when on; footer Clear all (resets status too) + live "Show n
  sections".
- Counts beside options = whole edition after the other filters (as today).

### 3. New filters (data already in the schema)
- **Pipeline**: In a pipeline / Proposed for one / In none (`pipelineId`,
  `proposedMemberships`). Checkboxes, counts.
- **First seen**: edition range From/To (min of `editionIds`). Same YearPicker pattern
  as Build date, values = editions only.
- **Needs your decision**: moves from L1 into L2 as its own checkbox (already in
  criteria).
- **Changed since review**: checkbox (`changedSinceReview`). Only if store sets it
  (check); else hint.
- Each new one: field in `SectionCriteria`, test in `derive.test.ts`, chip label + hint,
  URL key (K1: filters are in the URL).

### 4. Wiring
- `studio-store.ts`: new fields, setters, `clearFilters` resets status + new ones,
  `filtersApplied` counts status + new ones.
- `derive.ts`: `matches` handles new criteria; `filterCounts` returns counts per new
  option.
- URL sync: new keys; old links without them still open.
- Help tour step for list tools: reword (no counts row; status in Filters).
- `frontend/AGENTS.md`: replace "status on the list" rules with the L1/L2 rules above.

### 5. Tests
- L1: no chips when nothing on; chip per filter on; Clear all; × clears search.
- L2: opens at list width from table and restores table on Back; every group present on
  empty data with its hint; new filters narrow list + map + count; Show n live.
- Store data check on the dev server: counts add up per group.

### 6. Figma
- Update `156-4723` and section 7 list frames: no status row on L1, status in Filters,
  new groups, empty-group hint. Mark built.

## Order
0 -> 2 (width fix, always-shown groups) -> 1 (L1 without counts, chips) -> 3 (new
filters, one commit each) -> 4/5 alongside -> 6.

## Answers (owner, 2026-11-13)
1. Status: one quiet read-only line on L1 ("n not started · n in progress · n done"); filtering by status in L2.
2. New filters: Pipeline, First seen, Needs your decision, Changed since review, plus State (which US states a section runs through) and Diameter (cited values) "or other crucial info".
3. Company: pipeline's owners and the section's own Owner claim.
4. Edition select: relabel in place.
5. Branch `feat/filters-two-levels` off `feat/no-list-expand`. The other session's status-in-Filters work matched steps 1/2 and was kept as the base (`cea25c1`).

## Progress
- [x] 0. Clean start (`6040ca7`, `cea25c1`)
- [x] 1. L1: quiet status line, edition label, filter button count (`3801998`, `893669a`)
- [x] 2. L2: list width from table, order, hints (`3801998`, `4add783`)
- [x] 3. New filters: Pipeline, First seen, Changed since review, Company incl. own Owner, Diameter, State (`4add783`, `3a9bc0c`)
- [x] 4. Store, URL, Help, AGENTS.md, README (`4add783`, `09a22e4`)
- [x] 5. Tests and store check (235 tests; store: Filters open in 132 ms)
- [ ] 6. Figma (not done)
- [x] Also: Help is a menu (`fc72d2b`)
