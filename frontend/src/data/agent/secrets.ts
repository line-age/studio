import patterns from "./secret-patterns.json"

/**
 * Keys and tokens a person may paste into the chat, replaced before a question leaves
 * the browser. The Agent applies the same file again when it takes a question in
 * (agent/contract/secret-patterns.json; a test keeps the two copies equal).
 */
const secrets = new RegExp(patterns.patterns.join("|"), "g")
const bearer = new RegExp(patterns.bearer, "g")

export function redact(text: string): string {
  return text
    .replace(bearer, (_, word: string) => word + patterns.mark)
    .replace(secrets, patterns.mark)
}
