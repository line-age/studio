# Evals

The Agent is built one behaviour at a time, eval first: a spec, then cases that are seen
to fail, then the code. This folder will hold the cases, the checks, the gates and the
reports. So far it holds what they all run on.

## Worlds

A world is one invented state of store: sections, their claims with citations, pipelines
and links, written the way store answers. `make_world.py` makes them from a seed.

| World | What |
| --- | --- |
| `small` | 13 sections, one for each state a claim or link can be in: nothing known, accepted, only a proposal, only a rejected value, two that disagree, in a pipeline that holds the owner, a proposed and a confirmed end, a quote that carries an instruction, dates in conflict, no date, a second trace merged in |
| `wide` | 400 sections, mostly bare like a fresh import, for counts and sets |

`worlds/small.json` is in git so it can be read and reviewed. `wide` is made on demand.

Rules:

- Everything in a world is made up: names, companies, sources, quotes, coordinates.
  Nothing is copied from a real store, map or person.
- A world file is never edited by hand. Change `make_world.py`, run
  `uv run python -m evals.make_world`, and commit both. A test fails otherwise.
- A case can only name a world the generator makes.

A world holds claims and links only. Its map rows, dates, ends and conflict flags are
worked out from them the way store's own views do it, so a world cannot say something
store would not. The trace file names in it carry an invented tracer's name on purpose:
the store client must keep it away from the model.

`fake_store.py` serves a world through the real `StoreClient`, so the code under test
is the code that runs against store. It refuses what store refuses.
