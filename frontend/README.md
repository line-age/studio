# Lineage Studio frontend

The React app for Lineage Studio, the Lineage review desk. So far: the theme exported from
Figma and one screen, Studio, read-only on fixture data. There is no API yet.

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

## Check

```sh
pnpm check   # tokens, types, lint, format, tests
pnpm build
```

## Docker

`Dockerfile` builds the app and serves `dist/` with nginx on port 8080 (`nginx.conf`).
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
