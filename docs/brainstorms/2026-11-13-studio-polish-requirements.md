---
date: 2026-11-13
topic: studio-polish
---

# Studio: polish before going further

## Problem Frame

Studio got most of its features in two days. A walk through the app in a browser on
2026-11-13 (the sample, and a local store holding 5 sections) found that it works but
cannot yet be trusted or followed to the end: numbers change for reasons the screen does
not give, a selection is lost by reading, prominent buttons do nothing, and the main loop
(look at a claim, see its source) stops at the claim row.

This pass fixes that before anything new is added. It has two parts:

- **Part 1, fixes to what exists** (R1 to R15). No new surface.
- **Part 2, two additions** (R16 to R24): opening a claim, and the Agent beside the list.
  Each needs a Figma design first.

The owner chose every behaviour below on 2026-11-13.

## Requirements

### Part 1: fixes

**Counts and the list**

- R1. The status counts (All, the four statuses, Needs your decision) always cover every
  section of the edition after filters. The map view, the window size and the table never
  change a count.
- R2. Only the list follows the map. When it does, its header says how much is shown:
  "8 of 36 in view".
- R3. While the list is shown as a table it does not follow the map: every row of the
  edition after filters is there. Going back to the list restores following if it was
  on. The "List follows the map" button shows that it is paused.

**Selection**

- R4. In the right panel, a click on a section's row opens or closes its claims and marks
  that section on the map as the one being read. It does not change the selection.
- R5. The selection changes only through the tick boxes, the list and the map.
- R6. The right panel header always describes what is selected, not the pipeline a
  section belongs to.

**Progress**

- R7. Every progress number says what it counts, in the same words in the list, the table
  and the right panel.
- R8. A pipeline or group: sections done of sections ("4 of 6 done"; "4 of 6 sections
  done" where there is room).
- R9. A section: required attributes cited of required attributes ("2 of 5 cited"),
  counting the same attributes as its status does (the rule in Settings). The right panel
  no longer counts all six.
- R10. A row never shows a fraction and a status that disagree (today: "0/4" with
  "In progress").
- R11. Unknown stays the orange word on a claim. It is not a second progress count on a
  section row.

**Controls that do nothing**

- R12. Menu, Undo, Redo, Export and "Review changes" are hidden until the feature behind
  each exists. The top bar holds the app name, the breadcrumb, Settings and Help. This
  replaces the choice of 2026-11-12 to show them as designed.
- R13. A right click with nothing selected opens no menu.

**Small things**

- R14. A name is cut short only when there is no room, and a cut name can be read in
  full (tooltip).
- R15. Also: the zoom and coordinates at the foot of the list say what they are; the six
  status counts do not take three rows at the default width; a pipeline selected from the
  list is fully inside the map after the move.

### Part 2: additions

**Opening a claim (read only)**

- R16. A click on a claim opens its detail: the value, and each source with its citation
  (where in the source, and the quoted words where there are any).
- R17. A claim with a proposal shows the proposed value and the evidence given for it,
  marked as a proposal.
- R18. An Unknown claim with no proposal says Unknown and that nothing has been found.
  Nothing is invented to fill it.
- R19. No Accept, Reject or Correct is shown. They come when a person can sign in.
- R20. The Agent's "1 proposal in the property panel" link opens that claim's detail.
- R21. Works the same on the sample and on store data.

**The Agent on the right**

- R22. The Agent sits in the right panel, about 440 wide, and shares it with the
  selection's claims: one or the other is shown. The Sections list stays on the left the
  whole time.
- R23. Sending a message puts it and its attachments in the thread, followed by one plain
  line: "The Agent cannot answer yet."
- R24. The canned conversation is shown only on the sample. On store data the thread
  starts empty.

## Success Criteria

- Opening the table, resizing the window or moving the map never changes a status count.
- A person can open three sections of a selected pipeline one after another and still
  have the whole pipeline selected.
- Every number on the screen can be read aloud with its noun, and no row contradicts
  itself.
- Nothing in the top bar can be pressed without something happening.
- From a section, a person can reach the words of the source behind a cited claim, and
  the evidence behind a proposal, without leaving the screen.
- A person can tick sections in the list while the Agent thread is open.
- Each requirement of Part 1 has a test that walks it; the flows page
  (`2026-11-13-studio-features-and-flows-requirements.md` in the workspace) is updated
  where a flow changes (C3, E1, F9, G1 to G5, H1 to H3, I3, I4).

## Scope Boundaries

- No Accept, Reject or Correct, no sign-in, no writes to store.
- No Agent answers and no proposals created.
- No Help: it is being built on its own branch.
- No change to the status rule, the filters, search, the Lasso or turning the map.
- No new visual language: tokens and existing parts only.
- Nothing about scale. The local store held 5 sections during the walk, so 2,324 was not
  seen.

## Key Decisions

- **Counts are the whole edition; only the list follows the map.** A count that changes
  when a panel is resized cannot be trusted. "In view" is a property of the list, and
  the list says so.
- **Reading is not selecting.** Opening a section to read its claims must not cost the
  selection that was just made.
- **One fraction, with its noun, on the Settings rule.** The panel and the status were
  counting different sets of attributes.
- **Hide what does not work.** Same rule already used for the table button and the draw
  tools. The Agent is the exception: it stays, and says plainly that it cannot answer,
  because pointing at things for the Agent is the main gesture of the product.
- **Claim detail is read only.** The store can record a person's decision, but Studio has
  no way to say who the person is. Showing the source is useful by itself.
- **The Agent moves right.** List on the left to pick, map in the middle, the thing being
  read or discussed on the right.

## Dependencies / Assumptions

- "Not designed means not built" holds for Part 2: the claim detail (drafts at Figma
  frames `112:566` and `112:786`, not yet reviewed) and the Agent's new place need the
  owner's review in Figma before code. Part 1 does not wait for Figma, but Figma should
  be brought in line afterwards (top bar, progress wording, list header).
- The Help tour on `feat/help-tour` points at parts of the screen. Hiding top bar
  controls and moving the Agent change its targets; whichever lands second adjusts.
- Assumed, not checked: the sample and store's answers carry the citation locator and
  quoted words needed for R16.

## Outstanding Questions

### Resolve Before Planning

None.

### Deferred to Planning

- [Affects R16][Technical] Does the fixture format and store's claim answer carry the
  locator and quote for every citation? If not, what does the detail show.
- [Affects R16, R22][Design] Where the claim detail sits (the draft docks it at the foot
  of the right panel) once the Agent shares that panel.
- [Affects R22][Design] How the right panel switches between claims and the Agent (tabs,
  or the rail), and what the rail holds when the Agent is no longer a left panel.
- [Affects R22][Design] What "Ask the Agent" does when the claims are showing: switch to
  the Agent and keep the selection visible somehow.
- [Affects R3][Design] How the "List follows the map" button looks when paused.
- [Affects R8, R9][Design] The short form of each fraction in a 300 wide list.
- [Affects R15][Technical] Why a selected pipeline ran past the left edge of the map
  (seen once in the walk; confirm before fixing).
- [Technical] In the walk, typing into search on a freshly loaded page did not register
  while the page looked dimmed. Not explained; reproduce or rule out.
- [Technical] Not walked in the browser: Lasso, turning the map, keyboard in the list.

## Status (2026-11-13)

Part 1 (R1 to R15) is built on branch `feat/studio-polish`, six commits, each with
tests; `pnpm check` passes (165+ tests). Where the build differs from the text above:

- **R8.** In a row the short form is "4/6 done"; "4 of 6 sections done" is used where
  there is room (the right panel header). A group of sections in no pipeline shows a bare
  count under the "Not in a pipeline" heading, with "312 sections" on hover: edition
  names leave no room for the noun (measured on the 17 real editions). In the table it
  is left out; the Sections column says it.
- **R9.** "2/3 cited" in the list and the right panel, in the same type.
- **R15.** "Needs your decision" reads "To decide" on its chip, with the full name read
  out and on hover (the owner's choice): six counts need 590 px, two rows give 550.
- **R4.** The section being read is drawn heavier on the map (a new map layer, from the
  existing selected colour). Not in Figma.
- **R6.** With several pipelines selected the header has no fraction; each group says
  "2 of 6 selected".
- **R15.** The cut-off pipeline was a fit made for the map before the right panel
  opened; the map now fits again when its box changes within 800 ms of a move.

Part 2 status changed while Part 1 was built: claim detail (R16 to R21) landed on `main`
separately (`3bd8a9f`). R22 to R24 (the Agent on the right) are not started.

Figma still shows the old top bar, "Needs your decision", "n of n" and the cited and
Unknown badges; bring it in line.

## Next Steps

→ Review and merge `feat/studio-polish`. Then the Agent on the right (R22 to R24):
design in Figma, then `/ce:plan`.
