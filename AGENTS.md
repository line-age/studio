# AGENTS.md: Composer frontend

The web app for reviewing traced pipelines: a map desk where a person checks sections,
attaches cited facts and decides on what the AI proposes. This directory is the React
app. State as of 2026-11-12: foundation only. The theme is exported from Figma and one
shell page shows it. No product screens exist yet.

The workspace `AGENTS.md` two levels up holds the project-wide rules and the full Figma
notes. This file wins for anything inside this directory.

## Stack

- Vite, React 19, TypeScript (strict). A client-only single-page app. No server
  rendering, no server components.
- Tailwind v4, configured in CSS (`src/index.css`); there is no `tailwind.config`.
- shadcn/ui, style **base-nova** (Base UI primitives, not Radix). `components.json` is
  the record.
- pnpm. Node 22.

## Commands

| Command                             | Does                                                               |
| ----------------------------------- | ------------------------------------------------------------------ |
| `pnpm dev`                          | Dev server                                                         |
| `pnpm build`                        | Type-check and production build                                    |
| `pnpm check`                        | Everything below, in order. Run before calling work done           |
| `pnpm tokens:check`                 | `tokens.css` matches the Figma export                              |
| `pnpm typecheck`                    | `tsc -b`                                                           |
| `pnpm lint`                         | ESLint                                                             |
| `pnpm format:check` / `pnpm format` | Prettier                                                           |
| `pnpm tokens:build`                 | Regenerate `src/styles/tokens.css` from `tokens/figma-tokens.json` |

## Layout

| Path                       | What                                                 |
| -------------------------- | ---------------------------------------------------- |
| `src/components/ui/`       | shadcn components, added by the CLI                  |
| `src/components/`          | Our components (Lineage parts), one per file         |
| `src/styles/tokens.css`    | Generated theme. Never edit                          |
| `src/index.css`            | Tailwind entry, imports, base layer                  |
| `tokens/figma-tokens.json` | What was read from Figma                             |
| `scripts/`                 | Token generator and checker                          |
| `.agents/skills/`          | Skills; `SOURCES.md` there says where each came from |

## Which skill when

Skills are plain files in `.agents/skills/<name>/`, so any agent can use them. If your
tool does not load skills from that directory by itself, open `SKILL.md` in the matching
directory and follow it before starting the work.

| Doing                                                                    | Skill                    |
| ------------------------------------------------------------------------ | ------------------------ |
| Building anything from the design; need a node id, token or naming rule  | `lineage-figma`          |
| Adding, updating or composing a shadcn component; chat UI; forms         | `shadcn`                 |
| Designing a component's API; too many boolean props; compound components | `composition-patterns`   |
| Writing or reviewing React code for performance                          | `react-best-practices`   |
| Animating between states, panels or list changes                         | `react-view-transitions` |
| Reviewing UI for accessibility and interface quality                     | `web-design-guidelines`  |

The Figma plugin's own skills (`figma-design-to-code`, `figma-use`) are installed for the
user, not in this directory. Use them for the mechanics of reading and writing Figma.

## What in the vendored skills does not apply here

This is a Vite SPA. The Vercel skills are written for Next.js as well. Do not follow:

- `react-best-practices`: every `server-*` rule, anything about React Server Components,
  server actions, `next/dynamic`, `next/image`, route handlers, `React.cache`, `after()`.
  For `bundle-dynamic-imports` use `React.lazy`. The `async-*`, `bundle-*`, `client-*`,
  `rerender-*`, `rendering-*`, `js-*` and `advanced-*` rules apply.
- `react-view-transitions`: `references/nextjs.md` and anything about `next.config` or
  the App Router. Check first that the installed React exports `ViewTransition`; if it
  does not, say so and do not switch React to a canary build without asking.
- `shadcn`: where it mentions `"use client"` or RSC, ignore; `rsc` is false here. Where
  it says dark mode, see below.

## Rules

**Design**

- Figma is the reference. Read the `lineage-figma` skill before building from it.
- Tokens only. No raw colour, radius, shadow or font size in components. If a value is
  missing, it is missing in Figma: say so; do not add a one-off.
- Use `type-ui-*` for text, not a size class plus a weight class.
- One light theme. There is no dark mode. Do not write `dark:` classes. The ones inside
  shadcn components are inert and stay untouched.
- State colours always come with their word. Unknown is the orange word with a dotted
  underline, never a grey value, blank or dash.
- Nothing of Mapbox's: no icons, fonts or artwork.

**shadcn**

- Add components with `pnpm dlx shadcn@latest add <name>`; do not hand-write a copy.
- Change how a component looks through tokens first. Edit a file in `src/components/ui/`
  only for something tokens cannot express, and keep the edit small.
- After `shadcn add`, check `src/index.css`: the CLI may write colour variables back
  into it. Remove them; `tokens.css` owns the values. Then run `pnpm tokens:check`.

**Code**

- React 19: `ref` is a prop (no `forwardRef`), `use()` over `useContext`.
- Prefer composition to boolean props; see `composition-patterns`.
- Named exports. One component per file. Files in kebab-case.
- Words come from `controlplane/glossary.md` in the workspace. Section, segment, edge
  and pipeline are not interchangeable. Check before a term reaches the UI or a type.

**Data and privacy**

- Sample data is invented. No real section, company, source, map, sheet or person name,
  no hostnames, cluster names or environment settings. This code may become public.
- No credentials in the repo. No `.env` committed.

**Writing**

- No em-dashes or en-dashes as separators. Use a colon, a semicolon or a new sentence.
- Buttons say what happens, in sentence case: Accept, Reject, Find a source.
