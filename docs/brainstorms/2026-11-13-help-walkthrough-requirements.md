---
date: 2026-11-13
topic: help-walkthrough
---

# Help: a walk-through of Studio

## Problem Frame

A new reviewer from the research group knows pipelines and the source maps but has never
seen Studio. Nothing on the screen explains what a section, a claim or Unknown means here,
or where things are. The Help button in the top bar does nothing. Help should walk that
person through the main areas and what each one does.

## Requirements

**Tour**

- R1. A guided tour runs on the live screen: one area is highlighted, a small card
  explains it in two or three sentences, and the person moves with Next and Back.
- R2. The tour starts by itself on a person's first visit, and is remembered in the
  browser so it does not start again.
- R3. Every step has Skip. Skip and Escape end the tour at once and count as seen.
- R4. The card shows where the person is (for example "3 of 8").
- R5. The tour makes the area it describes visible first: it opens the side panels if
  they are hidden and opens the panel a step is about.
- R6. Steps, in order:
  1. What Studio is: every claim about a section is cited or Unknown.
  2. The Sections list: pipelines, the sections in no pipeline, counts by status.
  3. Search and filters.
  4. The edition select: the network as of a year.
  5. The map: line styles and the key, layers, "List follows the map".
  6. Selecting: click, row boxes, Lasso; the selection may span pipelines.
  7. The right panel: the selection's claims, cited values, Unknown, proposals.
  8. The Agent: "Ask the Agent" hands over the selection. It does not answer yet.
  9. Settings: required attributes and line style per status. Help brings this tour back.
- R7. The tour describes only what works. The Agent step says plainly that it does not
  answer yet. A step is added when a feature lands (accept and reject, citations).
- R8. Steps do not depend on the data loaded: they work on the sample and on store data
  that has no pipelines, and name no section, pipeline or source.

**Help dialog**

- R9. The Help button opens a dialog with one short page per area, the same areas and
  wording as the tour, readable in any order.
- R10. Each page has "Show me", which closes the dialog and starts the tour at that step.
- R11. The dialog has "Take the tour" to run it from the start.
- R12. The dialog has a short list of the words: section, pipeline, claim, citation,
  edition, proposal, Unknown, and the four statuses.

**Writing**

- R13. One source for the text: the tour card and the dialog page of an area show the
  same words.
- R14. Words follow the glossary and Studio's own: "claim", never "fact". Sentence case,
  no em-dashes.

## Success Criteria

- A reviewer who has never seen Studio can, after the tour, find a section, read its
  status, select several and say which of its claims are Unknown, without being told.
- Someone who skipped the tour can get it back from Help in one click.
- Adding a step for a new feature is a text entry and a target, not new layout work.

## Scope Boundaries

- No explanation of accept, reject, citations from the Agent or release until they work.
- No keyboard shortcut list (there are no shortcuts to list yet).
- No video, no external documentation site, no search inside Help.
- No per-account memory of the tour: the browser remembers it.
- No tooltips or hints added to the screen beyond the tour.

## Key Decisions

- Tour and dialog, both: the tour for the first visit, the dialog as the reference after.
- Starts automatically on first visit (the owner, 2026-11-13). Accepted cost: it also
  appears for someone who opened a shared link to one section; Skip is always one click.
- Written for a new reviewer, so step 1 and the word list explain the terms.
- Only what works, to avoid promising actions a reviewer cannot take.

## Dependencies / Assumptions

- Not designed means not built: Figma needs the tour card, the highlight, and the Help
  dialog before code. The dialog can follow the Settings dialog's layout.
- The tour is the most exposed part of the app to layout changes; each step's target has
  to be checked when the screen changes visibly.

## Outstanding Questions

### Deferred to Planning

- [Affects R1][Technical] Build the highlight and card from shadcn parts (Popover) or
  bring in a tour library, given tokens-only and Base UI.
- [Affects R2][Technical] Should the tour auto-start when the URL opens one section, or
  wait until that link's view has been shown? Default: start as on any first visit.
- [Affects R5][Technical] What a step does when its target cannot be shown (no Mapbox
  token, empty data, narrow window).
- [Affects R2] Tests and README screenshots must run with the tour marked as seen.

## Next Steps

→ Design the three parts in Figma, then `/ce:plan`.
