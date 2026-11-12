# Composer frontend

The React app for Composer, the Lineage review desk. Foundation only so far: the theme
exported from Figma and one shell page that shows it.

## Run

```sh
pnpm install
pnpm dev
```

Needs Node 22 and pnpm 10.

## Check

```sh
pnpm check   # tokens, types, lint, format
pnpm build
```

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
