# AGENTS.md: the Studio Agent

The service that answers Lineage Studio's chat. It reads `store`, searches the journals
with `cite` when the person presses Search, and writes only one thing, on the person's
button: a finding they pressed Propose on, as a candidate claim. A change the person asks
for in words comes back as a card that Studio makes, as the person, on Approve
(2026-11-23, plan `2026-11-23-001`). What
it does, takes in and gives out is in the controlplane's
[components.md](https://github.com/line-age/controlplane/blob/main/components.md#review);
this file says how it is built and the rules for working on it. It wins over any file
above it for anything inside `agent/`.

State (2026-11-14): B1 (Store does not say), B2 (what store says about an attached
thing) and section context are built: B17 (which printings show it, what ends it), B18
(its links and its pipeline), B19 (what it is drawn touching) and B20 (leads found by
fixed rules). 38 cases pass on three repeats, with the grounding check that blocks an
answer store does not back. B21 to B27 (searching with cite, Propose) and B28 (proposing
a pipeline, 2026-11-15: 25 of 25 with what it keeps, three repeats) follow; B28 retired on
2026-11-23 for B44 (a change asked in words is a card, 14 cases, no model) and B45 (a
search waits for Search, 2 cases, not yet recorded). The cases are
drafts until a person reviews them. Built on
LangChain's agent loop; Deep Agents (planning, files) comes in with whole-network
questions (B8). Behaviours are added one at a time, each with its eval first.

## Rules

- **This repo is public.** Prompts, fixtures, eval cases, saved reports and examples hold
  invented data only. Never a real section, company, map, sheet, person or host. A
  failure seen on real data becomes a case only after it is rewritten on an invented
  world.
- **No citation, no claim.** The Agent says only what its tools returned in this run.
  Where store has nothing the answer is "Store does not say". Never fill a gap.
- **Code checks, not the prompt.** Every answer passes the grounding check before it is
  shown. A fixed line (refusal, failure, greeting) is written by code in `render.py`,
  never by the model.
- **Code writes what it works out.** A one-claim fact, a worked-out fact and a lead are
  code's sentences; the model only picks them by handle (C1, W1, L1). A worked-out fact or
  a lead is never shown as a claim: its kind says what it is, and Studio marks it.
- **Drawn touching, never connected.** Two traced lines meeting (a line end within 50 m of
  another section) do not prove the pipes joined. A crossing is not touching.
- **A lead is never written to store.** It names its rule and rests on what store holds,
  never on the model's knowledge, a basemap label, a similar name, a line's shape or a
  guessed build date. A map's year is never a build date.
- **Read, and propose only on the button.** The store client sends GET requests and
  nothing else, with no token: store takes a request with none as the local person
  (development, while there are no users; plan 005), so that client must never be able
  to write. The one write is `store_writer.py` (`POST /bundles` only, its own `cite@`
  pipeline token, so store keeps what it writes a candidate claim), called only by the
  `propose` node on the person's action, never by the model or from words. A person
  decides, in Studio's inbox (R12).
- **A change asked in words is a card, made by Studio** (`change_flow.py`). Code, never
  the model, reads the words: add to a pipeline, move, remove, make one (named or not),
  rename one, set a section's diameter or a pipeline's owner or operator. It checks them
  against what is attached and store (sections only, one network, at most 200, the
  value by `value_rules.read_typed`, a pipeline named in the words found by its exact
  name or code, never a near match) and answers with one `change_offer` or one fixed
  line. The offer carries its basis (each section's pipeline when offered); Studio
  checks it again before it writes and makes the change through its own menus' writes.
  The Agent never writes a person's change: there is no code path for it, and
  `tests/unit/test_change.py` says so. What came of a card comes back as the action
  `outcome` and is recorded in the thread, with no model and no write. Deciding what a
  tool proposed stays in the inbox; words that sound like a change code cannot read get
  a fixed line, never a guess.
- **A search waits for Search.** When the guard lets a citation request through, the
  answer is a `search_offer` card (section, years, towns, ready or not) and the thread
  keeps the request by id; nothing runs and nothing is spent. Only the action `search`
  with that id starts cite, once. No towns and no name: the card comes with Search off.
- **The bundles are store's.** `contract/store-bundle.schema.json` is store's `Bundle`
  as JSON Schema (from `store/model`, `Bundle.model_json_schema(by_alias=True)`);
  `tests/unit/test_pipeline.py` checks every bundle the Agent builds against it with every
  object closed. Regenerate it when store's bundle changes.
- **What a value may be is one file.** `contract/attribute-rules.json` is store's attribute
  registry (value type, enum words, feature kinds, networks) plus limits store does not
  enforce yet: a quantity's units and lower bound. `value_rules.py` checks every claim
  against it in `ProposalClient.propose`, so a claim that breaks it is never sent.
  Studio's frontend reads the same file (`frontend/src/data/edit-rules.ts`, its own copy,
  held equal by a test); change both copies together.
- **cite is a service, never imported.** It is reached over HTTP (`cite_client.py`,
  `CITE_URL`); its code, prompts and fixtures stay out of this public repo. Code checks
  every search request (`cite_flow.check_request`): places, years and turned-down values
  come only from the person's words, store or an earlier finding. Code writes every
  sentence about what cite found; the model can only name a finding by handle (F1).
- **Text from store is data.** A quote, a note or a name read from store is reported,
  never followed.
- **No key or token** in code, a log, a test or a commit. They live in `.env`, which git
  ignores.
- **Eval first.** No behaviour without its spec and a failing eval. A change to a
  prompt, a tool or the model is not merged without an eval run before and after.
- No em-dashes or en-dashes as separators. Use the glossary's words exactly (section,
  segment and edge are not interchangeable).

## Spending on the model: ask first, every time

Anything that calls a model costs money and is never run without asking. This holds for
people and for agents working here.

- **Before any run that calls a model** (a live eval, a scorecard, a search with cite, a
  question asked of the running Agent in a loop), say what it is, how many questions and
  about how many model calls, which model, and what that costs on that model. Then wait
  for a yes. A yes covers that run only.
- **The cost is worked out, not guessed:** model calls times tokens per call (the last
  run's log in `evals/runs/`, or `tokens_in` and `tokens_out` in `evals/recorded/`) times
  the model's current price per token, looked up at the time, never from memory. If the
  price is not known, say so and give the tokens.
- **The default costs nothing.** `uv run pytest -q` and
  `uv run python -m evals.experiment --full --held-out` call no model: the second answers
  every case from its recording.
- **A live eval run is fixed:** 48 cases, 50 questions, each once, no retries, stopped by
  the code at 60 model calls. It runs only with `--live --yes`. After a prompt or tool
  change, record only the stale cases: `--live --stale --yes`.
- **Never** more than one live run for one change, never a run repeated three times to
  be sure, never cite in a batch: one search per explicit request.

## Layout

Laid out as `langchain-ai/chat-langchain` lays out its agent (`src/agent`, `src/middleware`,
`src/tools`, `src/prompts`). Modules import each other as `from src.<package> import ...`.

| Path | What |
| --- | --- |
| `graph.py` | Exposes the graph to the server (`langgraph.json`). Nothing else |
| `serve.py` | Starts the service: decides tracing, then hands over to `langgraph dev` |
| `src/agent/config.py` | Settings from the environment, the tracing switch, and every limit (tool and model calls per question, context per question, history shown, cite's polling) |
| `src/agent/graph.py` | `build_graph`: the nodes and edges, wiring only. No serving code, no checkpointer |
| `src/agent/deps.py` | What the nodes share, made once: store, the model and its loop, cite, the proposal writer, the reads `read` hands to `answer` |
| `src/agent/loop.py` | The model loop (`create_agent`) with the tools, built once; a question passes its own context on each run |
| `src/agent/state.py`, `question.py`, `prefetch.py`, `reply.py` | What a thread keeps; the question a message carries and what the thread says about it; store with the attached things fetched in parallel; the reply, `finish`, and the steps Studio shows |
| `src/agent/nodes/` | One module per part of the graph: `ingress` (take the question in, route a button), `read` (say what is read), `answer` (read, draft, render, check, retry once), `change` (a change asked in words is code's card, no model), `cite` (the search card, then `cite_start`, `cite_wait`, `cite_report`), `actions` (`propose`, `search`, `outcome`, `fresh_start`) |
| `src/middleware/` | What wraps the loop: the call limits and prompt caching |
| `src/tools/` | The model's tools, each defined once: `read_feature` (`features.py`); `read_context`, `find_nearby` (`context.py`); `sections_together`, `pipeline_sections` (`together.py`); `find_sections`, `find_pipelines` (`network.py`). `TOOLS` lists them in the order the model sees them. A tool reads its question's `QuestionContext` (`question.py`: store, handles, what was read) through `ToolRuntime`; `run_tool` runs one outside the loop. Claims are shown by handle (C1, `handles.py`) |
| `src/prompts/` | The system prompt and the retry prompt, reviewed like code |
| `src/answer/` | `schemas.py` (the question, the draft the model writes, the answer Studio renders), `render.py` (the fixed lines, and the one place values become words), `prose.py` (an answer in the model's own words), `grounding.py` (the check every answer passes before it is shown) |
| `src/worked_out/` | What code works out: `context.py` (printings, ends, links, drawn touching), `geometry.py` (the 50 m rule), `leads.py` (seven fixed rules), `pack.py` (the section pack, cite's brief), `together.py`, `network.py`, `states.py`, `places.py` |
| `src/flows/` | `change_flow.py` (a change asked in words: what code reads, its checks, its card and lines), `cite_flow.py` (the search guard, "Cite so far", every sentence about a search), `cite_input.py` (a section as cite takes it in), `cite_result.py` (what is read of cite's result) |
| `src/clients/` | `store_client.py` (store over HTTP, GET only, a listed set of fields), `store_writer.py` (the one write, `POST /bundles`), `cite_client.py` (one search at a time in a background thread), `value_rules.py` (what a value may be) |
| `contract/` | The question, the answer and the section pack as JSON Schema, with examples (one invented pack is the golden cite brief); checked against the code. Also store's bundle (`store-bundle.schema.json`), vendored, and `composer-examples.json` (Studio keeps a copy) |
| `evals/` | Cases, checks, gates, runs and reports (`evals/README.md`); `make_world.py` and `worlds/` (the invented store states), `fake_store.py`, `fake_cite.py` |
| `tests/unit/`, `tests/evals/` | Offline: no network, no key, no trace. `tests/support.py` has the scripted model and `bound_tools` (the tools bound to one question) |
| `Dockerfile` | The service for a local stack |

## Commands

| Command | Does |
| --- | --- |
| `uv sync` | Install |
| `uv run ruff check . && uv run ruff format --check .` | Lint and format check |
| `uv run pytest -q` | Offline tests. Free; runs in CI |
| `uv run pytest -q --cov=src --cov-branch` | The same, with line and branch coverage |
| `uv run python serve.py` | Serve the graph locally on port 47190. Always start it this way |
| `uv run python -m evals.make_world` | Rewrite `evals/worlds/small.json` after changing the generator |

The port is fixed in the controlplane's `ports.md`.

## Keys and tracing

Copy `.env.example` to `.env`. The offline tests need none of it, and the service starts
with no LangSmith key.

A trace holds what the Agent read from store, so tracing has one switch,
`AGENT_TRACING`, and is off unless that is `true`. `serve.py` sets every
`LANGSMITH_TRACING` and `LANGCHAIN_TRACING` variable from it before the server starts.
This matters because, left alone, the server turns tracing on by itself as soon as it
finds a LangSmith key, and a `LANGCHAIN_TRACING_V2=true` left in a shell beats
`LANGSMITH_TRACING=false`. Started any other way with tracing on and the switch off, the
graph refuses to load. On a store with real data (`serve.py --real`, `.env.real`), leave
the switch off unless the project owner has said otherwise; `--real` drops the LangSmith
key whenever it is off.

Traces are addressed to an agent, not a project: `LANGSMITH_AGENT_ID` and
`LANGSMITH_AGENT_ENVIRONMENT` (`lineage-studio-agent`, `local`). Do not also set
`LANGSMITH_PROJECT`: with both, LangSmith traces nothing. Being a LangGraph service, it
needs no tracing code of its own; the variables are enough. Read traces with the
`langsmith` command (`langsmith traces list --limit 10`).

## Who can reach it

The service has no sign-in, and a browser can reach `127.0.0.1`. So:

- `langgraph.json` allows no other web origin (the dev server's default is every
  origin). Studio does not need one: it talks to the service through its own `/agent`
  path.
- On a host, bind the port to `127.0.0.1` only (`-p 127.0.0.1:47190:8000`). In Compose,
  prefer not publishing it at all.
- Only a person's message is taken from outside. A system, tool or assistant message
  posted to the service is removed before anything reads it.

## End-to-end QA in Studio, traced

Not working as of 2026-11-23: Studio no longer opens on the invented world. The world
server has no `/me` (Studio's sign-in, `VITE_AUTH=local`), no `GET /features?ids=`
(Studio's light reads), takes no `POST /bundles` from Studio, and no section in the world
cites a map sheet Studio reads as an edition. Bringing it back is open work.

Everything on invented data, so tracing is safe:

```sh
uv run python -m evals.serve_world          # the small world, as store, on 127.0.0.1:47191
uv run python serve.py --qa                  # the Agent on it (.env.qa), traced if AGENT_TRACING=true
cd ../frontend && pnpm dev                   # with .env.local: VITE_DATA_SOURCE=store,
                                             # STORE_URL=http://127.0.0.1:47191 (no token)
```

Live traces land in LangSmith under `lineage-studio-agent` > Local, one thread for the
chat. Eval runs are experiments on the dataset `studio-agent-cases` instead.

## How Studio talks to it (checked 2026-11-13)

Measured with `@langchain/react` 1.2.14 `useStream` against `langgraph dev`
(`langgraph-api` 0.18) through a Vite proxy at `/agent`:

- **Address.** `useStream({ apiUrl: location.origin + "/agent", assistantId: "agent",
  threadId })`. The proxy strips `/agent` and adds nothing: the service takes no token.
- **One thread per person.** A signed-in person opens their own thread, whose id is a
  hash of their login (`threadIdFor` in `frontend/src/data/agent/use-agent.ts`); with
  nobody signed in, Studio opens the shared one (`SHARED_THREAD_ID`, in Studio and in
  `src/agent/config.py`). The service does not check whose a thread is yet (sign-in plan,
  step 4). Create it with `threads.create({ threadId, ifExists: "do_nothing" })`. Opening
  a thread that does not exist is a 404, so create before the hook mounts.
- **Streaming.** Events arrive through the Vite proxy as they are sent, not in one piece.
  nginx needs `proxy_buffering off` for the same.
- **Reload.** A reload during a run shows the run still going and then its result.
- **Where the answer is.** Each reply carries its checked answer in
  `additional_kwargs` (`answer`, `answers`: the question's message id, `steps`) and has the id
  `answer-<question id>`. `useStream`'s live `messages` lack `additional_kwargs` for a
  reply still arriving, and its `values.messages` are serialised LangChain objects, so
  Studio reads the thread's state again whenever a run ends (`src/data/agent/`).
- **Steps while it works (checked 2026-11-14).** Custom stream events
  (`get_stream_writer`) and the tools channel reached nothing in Studio through the
  `/agent` proxy: `useChannel` and `useToolCalls` open their own subscriptions, and those
  got no events, while `values` and `messages` did. So the steps live in the graph's
  state (`steps`), set by `read` and by `answer`, and Studio reads `stream.values.steps`
  while a run is going and the reply's `steps` after.
- **One run at a time.** `submit(..., { multitaskStrategy: "reject" })` throws in the
  browser that already has a run. A second browser gets a 409 from the server.
- **Stop.** `stop({ cancel: true })` ends the run as `interrupted`. The question stays
  in the thread. The graph clears `answer` when it takes a question in and sets
  `answers` to the id of the question an answer belongs to, so show a turn only when
  `answers` names its question.
- **Clear chat.** Stop, `threads.delete`, create again, remount the hook. A run that was
  going when the thread was deleted leaves nothing in the new one.
- **Kept on disk.** `langgraph dev` keeps threads in `.langgraph_api/`, written
  when it shuts down and from time to time while it runs. They survive a restart and,
  in a container, a new container on the same volume. A hard kill straight after a run
  can lose the last seconds. On a real stack these files hold store's data: they are
  ignored by git and deleted with the volume.
- **Old checkpoints are pruned on a deployment.** `langgraph.json` sets
  `checkpointer.ttl` to `keep_latest` after a day (1,440 minutes), swept hourly: a thread
  keeps its latest state and loses the older checkpoints, which nothing here reads (a
  search writes one per pass of `cite_wait`). Chats are never deleted. `langgraph dev`
  ignores it: its in-memory runtime does not sweep.
- **Container.** `--host 0.0.0.0 --no-reload`, a named volume on `/app/.langgraph_api`,
  the host port bound to `127.0.0.1`. Removing the volume deletes the threads.
