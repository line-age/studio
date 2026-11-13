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

## Reading a claim in full (works, tested)

Click a claim under a section. Its detail docks at the bottom of the right panel; the
cross puts it away.

| #   | The person wants to            | Sees                                                                                             |
| --- | ------------------------------ | ------------------------------------------------------------------------------------------------ |
| R9  | Read the source behind a value | The value marked Cited, then each source. One source is shown open: where in it, and the quote   |
| R10 | See what a proposal says       | A card: the value now, the value proposed, and the evidence given. No source cites the claim yet |

## Editing (not built)

Each of these needs store to take a change from a person. Studio reads store with a
pipeline's token, which may not accept, reject or assert for a person, so none of them
can be built in Studio alone.

| #   | The person wants to                              | Where it stops today                                                            |
| --- | ------------------------------------------------ | ------------------------------------------------------------------------------- |
| E2  | Accept or reject a proposal                      | The proposal can be read (R10). There is no Accept or Reject                    |
| E3  | Fill an Unknown value with a cited one           | No control. Unknown is only read                                                |
| E4  | Correct a cited value                            | No control                                                                      |
| E5  | Put sections into a pipeline, or make a pipeline | No control. On store data nothing can reach Done, because Done needs a pipeline |
| E6  | Ask the Agent to find a source                   | The message can be typed; sending does nothing; the Agent never answers         |
| E7  | Undo, or review changes before they are kept     | "Undo", "Redo" and "Review changes" are in the top bar and do nothing           |

What each waits for: E2 to E5, a way for the person using Studio to sign in to store as
themselves; E5 also a design. E6, an Agent service. E7, E2 to E5.

## Found while writing these

- Right click on a ticked row in the list handed only that row to the Agent, while the
  right panel and the map handed the whole selection. Fixed: a row of the selection now
  offers all of it (R7).
- A claim showed only how many sources it had. Fixed: R9 and R10.
