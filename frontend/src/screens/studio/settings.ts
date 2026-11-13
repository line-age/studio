import { z } from "zod"
import { create } from "zustand"

import {
  ALWAYS_PRESENT,
  DEFAULT_REQUIRED,
  STATUSES,
  type SectionStatus,
} from "@/data/status"

/*
 * Settings of the Studio screen: the status rule and how the map draws each
 * status. Kept in this browser only, until store can hold them for a project;
 * two people may see different counts.
 */

export type LineStyle = "solid" | "dotted"

export const SETTINGS_KEY = "studio.settings"

export const DEFAULT_LINE_STYLE: Record<SectionStatus, LineStyle> = {
  "not-started": "dotted",
  "in-progress": "dotted",
  sufficient: "solid",
  done: "solid",
}

const lineStyle = z.enum(["solid", "dotted"])

const settingsSchema = z.object({
  requiredAttributes: z.array(z.string().min(1)),
  lineStyle: z.object(
    Object.fromEntries(STATUSES.map((s) => [s, lineStyle])) as Record<
      SectionStatus,
      typeof lineStyle
    >
  ),
})

export type Settings = z.infer<typeof settingsSchema>

export const DEFAULT_SETTINGS: Settings = {
  requiredAttributes: [...DEFAULT_REQUIRED],
  lineStyle: DEFAULT_LINE_STYLE,
}

/** What the browser holds, or the defaults when it holds nothing usable. */
export function readSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (raw === null) return DEFAULT_SETTINGS
    const parsed = settingsSchema.safeParse(JSON.parse(raw))
    if (!parsed.success) return DEFAULT_SETTINGS
    return {
      ...parsed.data,
      requiredAttributes: [...new Set(parsed.data.requiredAttributes)].filter(
        (attribute) => !ALWAYS_PRESENT.includes(attribute)
      ),
    }
  } catch {
    return DEFAULT_SETTINGS
  }
}

function writeSettings(settings: Settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    // Storage blocked or full: the setting holds for this visit only.
  }
}

interface SettingsState extends Settings {
  /** Tick or untick one attribute of the status rule. */
  toggleRequired: (attribute: string) => void
  setLineStyle: (status: SectionStatus, style: LineStyle) => void
  reset: () => void
}

export const useSettings = create<SettingsState>((set, get) => {
  const save = (next: Partial<Settings>) => {
    set(next)
    const { requiredAttributes, lineStyle } = get()
    writeSettings({ requiredAttributes, lineStyle })
  }
  return {
    ...readSettings(),
    toggleRequired: (attribute) => {
      if (ALWAYS_PRESENT.includes(attribute)) return
      const had = get().requiredAttributes
      save({
        requiredAttributes: had.includes(attribute)
          ? had.filter((a) => a !== attribute)
          : [...had, attribute],
      })
    },
    setLineStyle: (status, style) =>
      save({ lineStyle: { ...get().lineStyle, [status]: style } }),
    reset: () => save(DEFAULT_SETTINGS),
  }
})
