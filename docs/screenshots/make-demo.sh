#!/usr/bin/env bash
# Records docs/screenshots/demo.gif: a walk through Studio on the invented sample.
#
# Needs agent-browser (npm i -g agent-browser) and ffmpeg. Start the dev server on the
# sample first, from frontend/:
#   VITE_DATA_SOURCE=fixture pnpm exec vite --port 5199 --strictPort
# then run this from the repo root: bash docs/screenshots/make-demo.sh
# Never record it on real data.
set -euo pipefail
cd "$(dirname "$0")"
URL=${STUDIO_URL:-http://localhost:5199/}
F=$(mktemp -d); n=0
export AGENT_BROWSER_SESSION=studio-demo
ab() { agent-browser "$@" >/dev/null; }
ref() { agent-browser snapshot -i | grep "$1" | grep -o 'ref=e[0-9]*' | head -1 | cut -d= -f2; }
# A caption pill over the map, drawn into the page so it uses the app's font.
cap() {
  agent-browser eval "(()=>{let d=document.getElementById('demo-cap');if(!d){d=document.createElement('div');d.id='demo-cap';document.body.appendChild(d)}
  d.style.cssText='position:fixed;left:50%;top:56px;transform:translateX(-50%);z-index:99999;background:#0f1d24;color:#fff;font:500 15px/20px Inter Variable,Inter,sans-serif;padding:9px 16px;border-radius:999px;box-shadow:0 6px 20px rgba(0,0,0,.25);white-space:nowrap;pointer-events:none';
  d.innerHTML='<span style=\"display:inline-block;background:#4f6bff;border-radius:999px;padding:0 8px;margin-right:10px;font-weight:600\">$1</span><b>$2</b><span style=\"opacity:.75\"> · $3</span>'})()" >/dev/null
  sleep 0.4; n=$((n+1)); agent-browser screenshot "$F/$(printf %02d $n).png" >/dev/null
  agent-browser eval "document.getElementById('demo-cap')?.remove()" >/dev/null
}
ab set viewport 1440 900
ab open "$URL"
ab eval "localStorage.clear()"; ab reload; sleep 4
ab click @$(ref 'button "Skip"'); sleep 1.5
cap "1 Preview" "The traced network" "every section solid: heavy in a pipeline, thin in none"
ab click @$(ref 'combobox "Search'); ab keyboard type "Harlow"; sleep 1.5
cap "2 Search" "Search the network" "by pipeline, section, code or value"
ab press Escape; ab press Escape; sleep 0.8
ab click @$(ref 'option "Select Calder'); sleep 2.5
cap "3 Select" "Pick a pipeline" "its sections open on the right"
ab click @$(ref 'treeitem "Select Calder Jct to Wexley'); sleep 1.5
cap "4 Read" "Every claim is cited or Unknown" "never a guess"
ab click @$(ref 'treeitem "Diameter'); sleep 1.5
cap "5 Cite" "Open the sources behind a claim" "the map edition, where on it, the words it says"
ab find role button click --name Done; sleep 0.8
# Right click a section's row: where it is, read from the page.
at=$(agent-browser eval "(()=>{const r=[...document.querySelectorAll('[role=treeitem]')].find(e=>e.textContent.includes('Wexley to Adair')).getBoundingClientRect();return Math.round(r.left+120)+' '+Math.round(r.top+r.height/2)})()" | tr -d '"')
ab mouse move $at; ab mouse down right; ab mouse up right; sleep 1
cap "6 Change" "Right-click to change or ask" "on a row, a section or a claim"
ab click @$(ref 'menuitem "Edit"'); sleep 1.5
cap "7 Edit" "Every change opens its own window" "it says what Save will do"
ab find role button click --name Cancel; sleep 0.8
ab click @$(ref 'button "Agent'); sleep 1.5
cap "8 Ask" "Ask the Agent" "it answers from what is saved and changes nothing until you approve"
agent-browser close >/dev/null || true

# Eight frames, 2.6 s each, with a short fade between them.
D=2.6; X=0.35; IN=(); FC=""; prev="[0:v]"; off=0
for i in $(seq 1 "$n"); do IN+=(-loop 1 -t $D -i "$F/$(printf %02d "$i").png"); done
for i in $(seq 1 $((n - 1))); do
  off=$(echo "$off + $D - $X" | bc)
  FC="${FC}${prev}[${i}:v]xfade=transition=fade:duration=${X}:offset=${off}[v${i}];"; prev="[v${i}]"
done
FC="${FC}${prev}fps=12,scale=1200:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle"
ffmpeg -hide_banner -loglevel error -y "${IN[@]}" -filter_complex "$FC" demo.gif
rm -rf "$F"
echo "wrote docs/screenshots/demo.gif"
