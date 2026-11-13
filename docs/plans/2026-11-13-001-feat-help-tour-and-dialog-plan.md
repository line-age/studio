---
title: "feat: Help tour and Help dialog"
type: feat
status: completed
date: 2026-11-13
origin: docs/brainstorms/2026-11-13-help-walkthrough-requirements.md
---

# feat: Help tour and Help dialog

Help button (`frontend/src/screens/studio/top-bar.tsx:104`) does nothing. Add a 9-step
tour that auto-starts on first visit, and a Help dialog with the same pages plus a word
list (see origin: R1 to R14). Paths below are under `frontend/`.

## Decisions

- **No tour library.** Hand-built: own ring, scrim and card placement (`help/place.ts`). A library brings its own CSS and colours; rule is tokens only.
- **Targets by attribute.** Each area gets `data-tour="<step id>"`. Steps look it up;
  no refs threaded through the tree.
- **One text source** (R13): `help/steps.ts` feeds tour card and dialog page.
- **Seen flag** in `localStorage`, beside Settings (`settings.ts` pattern). Not in URL.
- **Help state** in its own small store (`help/help-store.ts`): `step: number | null`,
  `dialogOpen`. Does not touch `studio-store.ts` shape.
- **Scrim blocks the page.** Click outside does nothing; only Next, Back, Skip, Escape.
- **Deferred question R2 (deep link):** start as on any first visit, after data loaded.
- **Deferred question R5 (target missing):** step is passed over; the counter keeps
  its place among all nine.

## Phase 0: Figma (blocks code)

- [x] Library: `TourCard` (title, body, "3 of 9", Back, Next, Skip; last step: Done).
- [x] Library: highlight ring + scrim. New colour token `overlay` (alpha in the value).
      Also settles the open Settings scrim item.
- [x] Studio page, new section "9. Help": tour on step 2, tour on map step, Help dialog
      (area page), Help dialog (Words page). Dialog reuses the Settings dialog layout.
- [x] Export tokens: `pnpm tokens:build`, `pnpm tokens:check`.
- [x] Record node ids in `.agents/skills/lineage-figma/SKILL.md`.

## Phase 1: Steps and state

- [x] `src/screens/studio/help/steps.ts`: ordered list `{ id, title, body, prepare? }`.
      Ids: `intro`, `sections`, `search`, `edition`, `map`, `select`, `claims`, `agent`,
      `settings`. `intro` has no target (centred card).
- [x] `prepare(studio)` per step (R5): show side panels; open Sections or Agent panel;
      `claims` needs a selection (see Open questions).
- [x] `help/help-store.ts`: `start(at?)`, `next`, `back`, `end` (marks seen),
      `openDialog`, `closeDialog`.
- [x] `help/seen.ts`: read/write flag, safe when storage throws.
- [x] `help/words.ts`: section, pipeline, claim, citation, edition, proposal, Unknown,
      four statuses (R12). Wording checked against `controlplane/glossary.md`.

## Phase 2: Tour

- [x] `help/tour.tsx`: renders scrim, ring around target rect, `TourCard` anchored to
      it. Recomputes on resize and panel resize. Scrolls target into view in lists.
- [x] `help/tour-card.tsx`: per Figma. `role="dialog"`, labelled by title; focus moves
      to card, trapped; Escape = Skip; arrow keys = Back / Next; focus returns to Help
      button on end.
- [x] Add `data-tour` to: sections panel, search + filter row, edition select, map
      area, tool palette (Select, Lasso), right panel, Agent rail item / panel, Settings
      and Help buttons.
- [x] `studio-screen.tsx`: mount `<Tour />`; auto-start once data is loaded and flag
      unset (R2). Restore prior panel state and selection on end.
- [x] No Mapbox token or empty data: map step targets the map area container, which
      still exists; steps with no target are skipped.

## Phase 3: Help dialog

- [x] `help/help-dialog.tsx`: shadcn `Dialog`, list of areas left, page right, last
      entry "Words". "Show me" closes and calls `start(index)` (R10). "Take the tour"
      calls `start(0)` (R11).
- [x] `top-bar.tsx`: `onHelp` prop wired to `openDialog`.

## Phase 4: Tests and docs

- [x] `src/test/setup.ts`: mark tour seen by default, so existing 72 tests are unaffected.
- [x] `help/steps.test.tsx`: render Studio on the sample; for every step, after
      `prepare`, its `data-tour` target exists. This is the guard against layout drift.
- [x] Tour tests: starts once on first visit; Skip and Escape mark seen; Back / Next;
      counter; missing target skipped.
- [x] Dialog tests: Help opens it; "Show me" starts at that step; "Take the tour".
- [x] Text test: no step or word text contains "fact" or a dash separator (R14).
- [x] README screenshots: taken with flag set. Add a line to "What the screen has".
- [x] `frontend/AGENTS.md`: Help rules (one text source, add a step with the feature,
      `data-tour` targets, tests run with tour seen).
- [x] `pnpm check`.

## Acceptance

- [x] First visit: tour starts; second visit: it does not.
- [x] All 9 steps highlight the right area on the sample and on store data with no
      pipelines (R8); no step names a section, pipeline or source.
- [x] Agent step says it does not answer yet (R7).
- [x] Help dialog shows the same words as the tour; "Show me" works from each page.
- [x] Keyboard only: whole tour and dialog usable; focus returns to Help.
- [x] Out of scope stays out: no shortcuts list, no accept / reject text, no hints
      elsewhere (see origin: Scope Boundaries).

## Risks

- Layout changes break steps: covered by `steps.test.tsx`, not by eye.
- Auto-start over a shared link is accepted (owner, 2026-11-13).
- Research: none external; local patterns (Dialog, Popover, Settings storage) cover it.

## As built (2026-11-13)

- Question 1: the claims step selects the first section and lets go of it after.
- Question 2: Settings dialog scrim left as it is.
- Question 3: not committed; waiting on the owner.
- The Agent step points at the rail item; it does not open the Agent panel.
- `words.ts` and `seen.ts` were folded into `steps.ts` and `help-store.ts`.
- Help state is put back when the tour ends: panels hidden again if they were.
- Not done: README screenshot of the tour.

## Open questions

1. `claims` step needs a selection. Select the first listed section for the step and
   restore after (default), or point at an empty right panel area and only explain?
2. New `overlay` token: also switch the Settings dialog scrim to it?
3. Plan and requirements docs live in the public `studio` repo: commit them, or keep
   them out (`docs/brainstorms`, `docs/plans` ignored)?

## Sources

- **Origin:** [docs/brainstorms/2026-11-13-help-walkthrough-requirements.md](../brainstorms/2026-11-13-help-walkthrough-requirements.md).
  Carried forward: tour + dialog both; auto-start on first visit; only what works;
  written for a new reviewer.
- `frontend/src/screens/studio/settings-dialog.tsx`, `settings.ts` (dialog and storage
  patterns), `panel-toggle.tsx` (focus hand-off), `frontend/AGENTS.md` (rules).
