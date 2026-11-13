# Lineage Studio frontend

The React app for Lineage Studio, the Lineage review desk. So far: the theme exported from
Figma and one screen, Studio, read-only: on fixture data by default, or on a local
Lineage store.

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

Set `VITE_DATA_SOURCE=store` and `STORE_TOKEN` in `.env.local` and the app reads a local
Lineage store through its own `/store` path; `vite.config.ts` and `nginx.conf.template`
pass that on to `STORE_URL` with the token. `src/data/store/client.ts` fetches,
`src/data/store/to-network.ts` turns the answers into the fixture schema, and nothing
else in the app knows the difference. The repo `README.md` has the commands.

## Check

```sh
pnpm check   # tokens, types, lint, format, tests
pnpm build
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
