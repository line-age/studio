import { STATUSES, STATUS_LABEL, type SectionStatus } from "@/data/status"

import type { LineStyle } from "../settings"

/*
 * How a section's line is drawn follows its status: solid or dotted, as set
 * in Settings. The map and its key both read it from here, so they agree.
 */

/** The statuses drawn in this style, in their usual order. */
export function statusesDrawn(
  lineStyle: Record<SectionStatus, LineStyle>,
  style: LineStyle
): SectionStatus[] {
  return STATUSES.filter((status) => lineStyle[status] === style)
}

const STYLE_LABEL: Record<LineStyle, string> = {
  solid: "Solid",
  dotted: "Dotted",
}

/** "Solid": the style as the map key names it. */
export function styleName(style: LineStyle): string {
  return STYLE_LABEL[style]
}

/** "Sufficient or done": the statuses drawn in a style, whatever is chosen. */
export function legendText(
  lineStyle: Record<SectionStatus, LineStyle>,
  style: LineStyle
): string {
  const names = statusesDrawn(lineStyle, style).map((s) => STATUS_LABEL[s])
  if (names.length === 0) return "No status"
  const words = names.join(" or ").toLocaleLowerCase()
  return words.charAt(0).toLocaleUpperCase() + words.slice(1)
}
