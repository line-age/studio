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

/** "Solid: Sufficient, Done". Names the statuses, whatever is chosen. */
export function legendText(
  lineStyle: Record<SectionStatus, LineStyle>,
  style: LineStyle
): string {
  const names = statusesDrawn(lineStyle, style).map((s) => STATUS_LABEL[s])
  return `${STYLE_LABEL[style]}: ${names.length > 0 ? names.join(", ") : "no status"}`
}
