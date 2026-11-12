// Shared by build-tokens.mjs and check-tokens.mjs.
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

export const TOKENS_JSON = fileURLToPath(
  new URL("../tokens/figma-tokens.json", import.meta.url)
)
export const TOKENS_CSS = fileURLToPath(
  new URL("../src/styles/tokens.css", import.meta.url)
)

export function readTokens() {
  return JSON.parse(readFileSync(TOKENS_JSON, "utf8"))
}

/** The CSS value a Figma variable must have. Numbers are pixels. */
export function cssValue(variable) {
  return variable.type === "COLOR" ? variable.value : `${variable.value}px`
}

/** Variables whose CSS name is also a Tailwind theme key, so they live in @theme. */
export function isThemeKey(variable) {
  return variable.css.startsWith("--radius-")
}

export const WEIGHTS = { Regular: 400, Medium: 500, "Semi Bold": 600 }

export const FAMILIES = {
  Inter: "var(--font-sans)",
  "JetBrains Mono": "var(--font-mono)",
}

export function shadowValue(effect) {
  return effect.layers
    .map((l) => `${l.x}px ${l.y}px ${l.blur}px ${l.spread}px ${l.color}`)
    .join(", ")
}

/** "shadow/panel" -> "--shadow-panel", "focus/ring" -> "--shadow-focus-ring" */
export function shadowName(effect) {
  const slug = effect.name.replace(/^shadow\//, "").replaceAll("/", "-")
  return `--shadow-${slug}`
}
