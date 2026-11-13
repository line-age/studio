# Evals

The Agent is built one behaviour at a time, eval first: a spec, then cases that are seen
to fail, then the code. Nothing is kept unless the cases say so.

## The loop, for every behaviour

1. Its spec is agreed (the table of behaviours in the plan).
2. Its cases go in `cases/Bnn.jsonl`, with cases that keep earlier behaviours passing.
3. A baseline run is saved to `history/`: the new cases fail, the old ones pass.
4. The behaviour is built.
5. Its cases are run; the trace of every failure is read before anything changes.
6. The full set is run and compared with the last run, case by case.
7. The change is kept only if nothing that passed now fails and the gates hold.

A behaviour is done when its cases pass on a majority of repeats, the gates hold on the
full set, the held-out cases did not get worse, and a person has reviewed its cases.

## Running

| Command | Does | Costs |
| --- | --- | --- |
| `uv run pytest -q` | The checks themselves, on scripted answers. Runs in CI | Nothing |
| `uv run python -m evals.experiment --behaviour B01 --repeat 3 --local` | The real model on B01's cases (and what it must keep). Uploads nothing | Model calls |
| the same without `--local` | A LangSmith experiment on the dataset `studio-agent-cases` | Model calls |
| `... --full --held-out --repeat 3 --against <name>` | Before a change is kept: everything, compared with a saved run | Model calls |
| `uv run python -m evals.sync` | Puts `cases/` into the LangSmith dataset | Nothing |

`--save NAME` keeps a run in `history/`; `--baseline` reports without failing on the
gates. Every run is also written to `runs/` (ignored by git).

## A case

One line of `cases/Bnn.jsonl`:

| Field | What |
| --- | --- |
| `id` | `B01-003`. Never reused |
| `world` | The invented store it runs on (below) |
| `question` | `words`, and `about`: the attached things by the world's codes (`s03`, `l01`, or a claim as `s03.owner.candidate`) |
| `must` | `first_kind`, `kinds`, `refs` (claims it must rest on), `unknown` (feature and attribute that must stay "Store does not say"), `text`, `tools`, `fixed_line` |
| `must_not` | `kinds`, `refs`, `text`, `tools` (`*` for none at all) |
| `split` | `dev`, or `held_out`: not looked at while tuning prompts |
| `keeps` | The earlier behaviour it protects, if that is why it is here |
| `labeled_by` | `agent-draft` until a person has read it, then `person` |
| `note` | Why the case exists, in a sentence |

## The checks

`checks.py` gives one feedback key per check, true or false with the reason:
`valid`, `no_ungrounded`, `required`, `forbidden`, `unknown_kept`, `tools_ok`,
`fixed_line`, and `case_passed` for all of them together.

`no_ungrounded` comes from `score.py`, which re-checks every statement against the world
on its own, without the Agent's ledger, renderer or grounding check: every reference
resolves with the status it claims, every number, quotation and name is in what the
statement cites, no id is written in the text, an "unknown" names the feature and
attribute and store really holds nothing there, and a fixed line is word for word.

`mutations.py` seeds bad answers from good ones (an id never read, a changed year, a
number or name typed in, an altered quote, an id in the text, a fact with no reference, a
proposal passed off as accepted, "Store does not say" where store does say, an unknown
that checked nothing, a reworded fixed line). A test proves `score.py` catches every one.
B3 runs the same list against the Agent's own grounding check.

## The gates (`gate.toml`)

- No ungrounded statement in any repeat of any case, reviewed or not.
- On reviewed cases: nothing forbidden in any repeat, and a pass on a majority of repeats.
- No case that passed in the run compared with fails now.

## Worlds

A world is one invented state of store: sections, their claims with citations, pipelines
and links, written the way store answers. `make_world.py` makes them from a seed.

| World | What |
| --- | --- |
| `small` | 13 sections, one for each state a claim or link can be in: nothing known, accepted, only a proposal, only a rejected value, two that disagree, in a pipeline that holds the owner, a proposed and a confirmed end, a quote that carries an instruction, dates in conflict, no date, a second trace merged in |
| `wide` | 400 sections, mostly bare like a fresh import, for counts and sets |

`worlds/small.json` is in git so it can be read and reviewed. `wide` is made on demand.

A world holds claims and links only. Its map rows, dates, ends and conflict flags are
worked out from them the way store's own views do it, so a world cannot say something
store would not. The trace file names in it carry an invented tracer's name on purpose:
the store client must keep it away from the model.

Rules:

- Everything in a world is made up: names, companies, sources, quotes, coordinates.
  Nothing is copied from a real store, map or person.
- A world file is never edited by hand. Change `make_world.py`, run
  `uv run python -m evals.make_world`, and commit both. A test fails otherwise.
- A case can only name a world the generator makes. A failure seen on real data becomes
  a case only after it is rewritten on an invented world.

`fake_store.py` serves a world through the real `StoreClient`, so the code under test
is the code that runs against store. It refuses what store refuses.
