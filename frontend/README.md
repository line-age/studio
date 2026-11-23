# Lineage Studio frontend

The React app for Lineage Studio, the Lineage review desk. So far: the theme exported from
Figma, a sign-in page and one screen, Studio: on fixture data by default (changes are
kept in memory only), or on a local Lineage store, which it reads and writes. What the
screen does is in the repo [`README.md`](../README.md) and, in the app, under Help.

## Run

```sh
pnpm install
cp .env.example .env.local   # then put your Mapbox public token in it
pnpm dev
```

Needs Node 22 and pnpm 10.

The map is Mapbox GL JS and needs a Mapbox public access token
(`VITE_MAPBOX_TOKEN` in `.env.local`, which git ignores). Use of the map is under
Mapbox's terms and is billed to the account the token belongs to. Without a token the
app still runs; the lists and panels work and the map area says what is missing.

## Data

The app reads `public/fixtures/sample.json`, a small invented network. To use your own
file without changing code, see `docs/fixtures.md`.

## Real data from store

Set `VITE_STORE_BBOX=minx,miny,maxx,maxy` as well to load only the sections that cross one area (for a demo, or a network too large to open whole).

Set `VITE_DATA_SOURCE=store` in `.env.local` and the app reads and writes a local
Lineage store through its own `/store` path. Store refuses a request with no token, and
nothing in the browser holds one. With `VITE_AUTH=local` the dev server (and the local
image's nginx, `nginx.local.conf.template`) adds a fixed token that a store started with
the fake GitHub (`../dev/fake-github`) takes as "Local developer". With `GATE_URL` set,
sign-in, `/store` and `/agent` all go through a sign-in gate in place of that: a person
signs in with GitHub and must be in the team. `.env.example` lists the settings. `src/data/store/client.ts` fetches,
`src/data/store/to-network.ts` turns the answers into the fixture schema, and nothing
else in the app knows the difference. The repo `README.md` has the commands.

## Check

```sh
pnpm check          # tokens, types, lint, format, unit tests and every story
pnpm build
pnpm test:e2e       # the user flows, on the built app and the sample
pnpm test:visual    # every story against its approved screenshot (needs Docker)
pnpm storybook      # the components and their states, port 6006
```

## Docker

`Dockerfile` builds the app and serves `dist/` with nginx on port 8080
(`nginx.conf.template`, filled in from the environment when the container starts).
Run it from the repo root with `compose.yaml`; the repo `README.md` has the command.
`VITE_MAPBOX_TOKEN` and `VITE_FIXTURE_URL` are build arguments, because Vite writes them
into the bundle. `public/fixtures/local/` is never copied into the image; `compose.yaml`
has a commented-out mount for it.

## Design tokens

`src/styles/tokens.css` is generated from `tokens/figma-tokens.json`, which is a reading
of the Figma variables. To refresh: re-read the variables from Figma into the JSON (the
`lineage-figma` skill says how), then

```sh
pnpm tokens:build
pnpm tokens:check
```

## For agents

Rules are in `AGENTS.md`. Skills are in `.agents/skills/`; `SOURCES.md` there lists where
each came from.
