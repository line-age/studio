#!/bin/sh
# The visual test on Linux, in the Playwright image CI runs it in, so the
# screenshots match CI's. `scripts/visual.sh` compares; `scripts/visual.sh
# --update` approves what the stories look like now (review the PNGs in
# visual/ before committing them). Needs Docker.
set -eu
cd "$(dirname "$0")/.."
exec docker run --rm --ipc=host \
  -v "$PWD":/work -w /work \
  -v studio-visual-node-modules:/work/node_modules \
  -e npm_config_store_dir=/root/.pnpm-store \
  mcr.microsoft.com/playwright:v1.65.1-noble \
  sh -c "npm i -g --silent pnpm@10.33.0 && CI=1 pnpm install --frozen-lockfile >/dev/null && pnpm exec vitest run --project visual $*"
