<div align="center">

# Lineage Studio

**A map desk for reviewing traced pipelines.**
See every section, which of its facts are cited and which are still Unknown,
and hand what you select to the Agent.

React 19 · TypeScript · Vite · Tailwind v4 · shadcn/ui · Mapbox GL JS

<img src="docs/screenshots/studio.jpg" alt="Lineage Studio: the pipeline list, the map with one pipeline selected, and its sections and facts on the right" width="100%">

</div>

> [!NOTE]
> Early work. One screen, **Studio**, runs read-only on an invented sample network.
> There is no API yet, nothing can be edited, and the Agent does not answer.

## What it does

### Cited or Unknown, never a guess

Every fact about a section (owner, diameter, build date, first and last seen, geometry)
either carries a source or is marked **Unknown** in words. On the map a solid line means
every fact is cited; a dotted line means something is still Unknown.

### Select by list, by click or by lasso

Tick pipelines in the list, click lines on the map, or draw a loop around an area. A
selection can span several pipelines; the right panel lists it grouped by pipeline, with
each section opening to its facts.

<img src="docs/screenshots/multi-select.jpg" alt="Twenty-nine sections in seven pipelines selected with the lasso, listed by pipeline on the right" width="100%">

### Ask the Agent about what you selected

Any selection made on the map offers **Ask the Agent**. It opens the chat with the
selection attached as references, one per pipeline, and the cursor in the message box.

<img src="docs/screenshots/agent.jpg" alt="The Agent panel with four pipelines attached to the message being written" width="100%">

### Search and filters

Search by pipeline, section, code or value; type `unknown owner` to find sections whose
owner is Unknown. Narrow the list and the map by company, build date, the day a section
was added, or by which facts are Unknown.

<img src="docs/screenshots/filters.jpg" alt="The Filters panel: layers, Show choices, company, build date, added date and Unknown in" width="100%">

## Quick start

```sh
cd frontend
pnpm install
cp .env.example .env.local   # put your Mapbox public token in it
pnpm dev
```

Needs Node 22 and pnpm 10.

The map needs a Mapbox public access token (`VITE_MAPBOX_TOKEN` in `.env.local`, which
git ignores). Map use is under Mapbox's terms and is billed to the account the token
belongs to. Without a token the app still runs: the lists and panels work and the map
area says what is missing.

## Run in Docker

```sh
docker compose --env-file frontend/.env.local up --build
```

Then open <http://localhost:8080>. This builds the app and serves it with nginx; no Node
or pnpm needed. The Mapbox token is read from the env file while the image builds and
ends up in the bundle, as it does in any build. Leave `--env-file` off and the app still
runs without the map. Set `STUDIO_PORT` to use another port.

## Data

The app reads `frontend/public/fixtures/sample.json`, a small invented network. Nothing
in it is a real pipeline, company or source. To load your own file without changing
code, see [`frontend/docs/fixtures.md`](frontend/docs/fixtures.md).

## Keys

| Key | Does |
| --- | --- |
| `/` | Jump to the search box |
| `V` / `L` | Select tool / Lasso tool |
| `Shift` while drawing a lasso | Add to the selection |
| `Space` on a row | Tick or untick it |
| `Enter` on a row | Select just that one |
| `Esc` | Cancel a loop, close the Ask bar, clear a search |

## Develop

```sh
pnpm check   # tokens, types, lint, format, tests
pnpm build
```

| Path | What |
| --- | --- |
| `frontend/src/screens/studio/` | The Studio screen: panels, map, store |
| `frontend/src/components/` | Lineage parts any screen can use |
| `frontend/src/components/ui/` | shadcn components, added by the CLI |
| `frontend/src/data/` | Schema, loader and derived values |
| `frontend/src/styles/tokens.css` | Theme generated from the Figma variables |

The design lives in Figma and the code follows it. Rules for working in this repo,
for people and for coding agents, are in [`frontend/AGENTS.md`](frontend/AGENTS.md);
more detail on running and tokens is in [`frontend/README.md`](frontend/README.md).

## Not there yet

- An API: everything comes from a fixture file.
- Editing, and accepting or rejecting what the Agent proposes.
- An Agent that answers.
- Notes on the map, a table view, the fact detail area.

## Licence

No licence has been chosen yet.
