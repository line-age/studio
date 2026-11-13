# Reviewing and editing: the scenarios

What a person sits down to do in Studio, step by step. Reviewing works today and each
scenario is walked by a test in `src/screens/studio/review-scenarios.test.tsx`, on the
invented test network. Editing is not built: each editing scenario says where it stops.

All names here are invented.

## Reviewing (works, tested)

| #   | The person wants to                  | Steps                                                            | Sees                                                                                                 |
| --- | ------------------------------------ | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| R1  | Find what is not started             | Click the "Not started" count. Click a pipeline                  | Only rows with a not-started section. On the right all its sections, the ones already begun dimmed   |
| R2  | Look one section up                  | Type part of its name, Enter                                     | The section selected, its claims open: value and how many sources, or Unknown. The link points at it |
| R3  | List every section with no owner     | Filters, tick Owner under "Unknown in", "Show n sections"        | A chip "Unknown owner"; counts and list narrowed; the section's Owner reads Unknown                  |
| R4  | Find what waits for a decision       | Click "Needs your decision". Open the pipeline, then the section | The claim carries "1 proposal". The proposed value is not shown as cited                             |
| R5  | Work through sections in no pipeline | Open a first-seen group. Click a section                         | Its status and "0/3"; its claims on the right                                                        |
| R6  | See an earlier edition               | Choose it in "As of the ... edition"                             | List, counts and map as that edition shows them; the link carries the edition                        |
| R7  | Hand a set to the Agent              | Tick two pipelines. Right click one, "Add to the Agent chat"     | Agent panel open, both attached, cursor in the message box                                           |
| R8  | Change what counts as done           | Settings, untick an attribute                                    | Every count changes at once                                                                          |

On the map (checked by hand, not by a test): click a line to select, more clicks add,
Lasso selects an area, "Ask the Agent" appears above the map.

## Editing (not built)

| #   | The person wants to                                               | Where it stops today                                                                                          |
| --- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| E1  | Read the source behind a value: which map, where on it, the quote | The claim shows only a number of sources. The data holds source, locator and quote; nothing shows them        |
| E2  | Accept or reject a proposal                                       | The claim says "1 proposal". The proposed value and its source cannot be opened; there is no Accept or Reject |
| E3  | Fill an Unknown value with a cited one                            | No control. Unknown is only read                                                                              |
| E4  | Correct a cited value                                             | No control                                                                                                    |
| E5  | Put sections into a pipeline, or make a pipeline                  | No control. On store data nothing can reach Done, because Done needs a pipeline                               |
| E6  | Ask the Agent to find a source                                    | The message can be typed; sending does nothing; the Agent never answers                                       |
| E7  | Undo, or review changes before they are kept                      | "Undo", "Redo" and "Review changes" are in the top bar and do nothing                                         |

Order they would have to be built in: E1 (read-only, needs no store change), then E2
(store already has accept and reject for a person's token), then E3 and E4, then E5.
E6 and E7 depend on those.

## Found while writing these

- Right click on a ticked row in the list handed only that row to the Agent, while the
  right panel and the map handed the whole selection. Fixed: a row of the selection now
  offers all of it (R7).
