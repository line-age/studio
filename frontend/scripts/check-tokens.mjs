// Fails if src/styles/tokens.css does not match tokens/figma-tokens.json:
// a Figma variable missing, declared twice, or with a different value.
import { readFileSync } from "node:fs"
import {
  TOKENS_CSS,
  cssValue,
  readTokens,
  shadowName,
  shadowValue,
} from "./tokens-lib.mjs"

const tokens = readTokens()
const css = readFileSync(TOKENS_CSS, "utf8").replace(/\/\*[\s\S]*?\*\//g, "")

const declared = new Map()
for (const [, name, value] of css.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
  if (!declared.has(name)) declared.set(name, [])
  declared.get(name).push(value.trim())
}

const expected = [
  ...tokens.variables.map((v) => [
    v.css,
    cssValue(v),
    `${v.collection}/${v.name}`,
  ]),
  ...tokens.effects.map((e) => [shadowName(e), shadowValue(e), e.name]),
]

const problems = []
for (const [name, value, figmaName] of expected) {
  const found = declared.get(name)
  if (!found) problems.push(`missing   ${name} (${figmaName})`)
  else if (found.length > 1) problems.push(`duplicate ${name} (${figmaName})`)
  else if (found[0].toLowerCase() !== String(value).toLowerCase())
    problems.push(`differs   ${name}: css ${found[0]}, Figma ${value}`)
}

const names = tokens.variables.map((v) => v.css)
const repeated = names.filter((n, i) => names.indexOf(n) !== i)
for (const n of repeated) problems.push(`two Figma variables share ${n}`)

if (problems.length) {
  console.error(`tokens:check failed, ${problems.length} problem(s):`)
  for (const p of problems) console.error(`  ${p}`)
  process.exit(1)
}
console.log(`tokens:check ok, ${expected.length} values match Figma`)
