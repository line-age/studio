import { ATTRIBUTE_LABEL, STATUS_WORD, type AgentAnswerRef } from "./answer"

/**
 * A reference's chip: what it opens and what it is. Studio's own name wins
 * for a section or a pipeline it lists; anything else (a trace merged into a
 * section, a line traced as gone) goes by the name the service read.
 */
export function refTitle(
  ref: AgentAnswerRef,
  name: (id: string) => string | null
): { title: string; meta: string } {
  const called = (id: string) =>
    name(id) ?? ref.label ?? `feature ${id.slice(0, 8)}`
  const status = ref.status ? STATUS_WORD[ref.status] : ""
  if (ref.type === "feature")
    return { title: called(ref.id), meta: "Read in store" }
  if (ref.type === "link") return { title: ref.label ?? "Link", meta: status }
  const attribute = ref.attribute
    ? (ATTRIBUTE_LABEL[ref.attribute] ?? ref.attribute)
    : "Claim"
  const by =
    ref.status === "candidate" && ref.asserter
      ? ` by a ${ref.asserter === "pipeline" ? "tool" : "person"}`
      : ""
  return {
    title: attribute,
    meta: [`${status}${by}`, ref.feature_id ? called(ref.feature_id) : null]
      .filter(Boolean)
      .join(" · "),
  }
}
