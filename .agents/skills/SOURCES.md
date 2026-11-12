# Where these skills come from

Five skills here are unedited copies of public skills, pinned to a commit. One is ours.
Do not edit a vendored skill; project-specific rules go in `../../AGENTS.md` or in
`lineage-figma/`.

| Skill directory | Source repo | Path in repo | Commit | Files | Licence |
| --- | --- | --- | --- | --- | --- |
| `composition-patterns` | `vercel-labs/agent-skills` | `skills/composition-patterns` | `1a2c79d4e6c4a2283dc2c614b6538cbe1ed5ca62` | 14 | MIT (stated in SKILL.md and repo README; the repo has no LICENSE file) |
| `react-best-practices` | `vercel-labs/agent-skills` | `skills/react-best-practices` | same | 76 | same |
| `react-view-transitions` | `vercel-labs/agent-skills` | `skills/react-view-transitions` | same | 9 | same |
| `web-design-guidelines` | `vercel-labs/agent-skills` | `skills/web-design-guidelines` | same | 1 | same |
| `shadcn` | `shadcn-ui/ui` | `skills/shadcn` | `dd41d19e2f80ff6891951f7ced74c2c9a650b065` | 21 | MIT (LICENSE.md in repo) |
| `lineage-figma` | written for this project | | | 1 | |

Copied on 2026-11-12.

Notes:

- `web-design-guidelines` is a single file. It fetches its rules at use time from
  `https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md`.
  The rules themselves are not stored here.
- `shadcn/scripts/showcase-coverage.mjs` is a local read-only script (reads component
  files, prints coverage). It was read before copying; it makes no network calls.
- The skill names in the SKILL.md files differ from the directory names:
  `vercel-composition-patterns`, `vercel-react-best-practices`,
  `vercel-react-view-transitions`, `web-design-guidelines`, `shadcn`.

To refresh one: download the repo at a newer commit, replace the whole directory, update
the commit and file count above. Check the file count against upstream.
