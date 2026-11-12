import type { ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

import tokens from "../tokens/figma-tokens.json"

/*
 * Foundation shell. It shows the theme exported from Figma so it can be
 * compared with the Foundations page by eye. It is not a product screen and
 * goes away when the first real screen is built.
 */

type Variable = (typeof tokens.variables)[number]

const colors = tokens.variables.filter((v) => v.type === "COLOR")
const numbers = tokens.variables.filter((v) => v.type !== "COLOR")

const colorGroups = [
  { title: "Base", match: (v: Variable) => !v.name.includes("/") },
  { title: "State", match: (v: Variable) => v.name.startsWith("state/") },
  { title: "Map", match: (v: Variable) => v.name.startsWith("map/") },
].map((g) => ({ title: g.title, items: colors.filter(g.match) }))

const scaleGroups = ["radius", "spacing", "size", "layout", "border"].map(
  (prefix) => ({
    title: prefix,
    items: numbers.filter((v) => v.name.startsWith(`${prefix}/`)),
  })
)

const textStyleClass: Record<string, string> = {
  "ui/sm": "type-ui-sm",
  "ui/sm-medium": "type-ui-sm-medium",
  "ui/sm-semibold": "type-ui-sm-semibold",
  "ui/xs": "type-ui-xs",
  "ui/xs-medium": "type-ui-xs-medium",
  "ui/2xs": "type-ui-2xs",
  "ui/2xs-medium": "type-ui-2xs-medium",
  "ui/mono-sm": "type-ui-mono-sm",
  "ui/mono-xs": "type-ui-mono-xs",
  "ui/mono-xs-medium": "type-ui-mono-xs-medium",
  "ui/mono-2xs": "type-ui-mono-2xs",
}

const shadowClass: Record<string, string> = {
  "shadow/panel": "shadow-panel",
  "shadow/popover": "shadow-popover",
  "shadow/map-control": "shadow-map-control",
  "focus/ring": "shadow-focus-ring",
}

const buttonVariants = [
  "default",
  "secondary",
  "outline",
  "ghost",
  "destructive",
  "link",
] as const
const buttonSizes = ["xs", "sm", "default", "lg"] as const

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-t py-6">
      <h2 className="type-ui-sm-semibold">{title}</h2>
      {children}
    </section>
  )
}

function GroupLabel({ children }: { children: ReactNode }) {
  return (
    <h3 className="type-ui-2xs-medium text-muted-foreground uppercase">
      {children}
    </h3>
  )
}

function Swatch({ variable }: { variable: Variable }) {
  return (
    <li className="flex items-center gap-2">
      <span
        className="size-8 shrink-0 rounded-md border border-border-subtle"
        style={{ background: `var(${variable.css})` }}
      />
      <span className="flex min-w-0 flex-col">
        <span className="truncate type-ui-xs-medium">{variable.name}</span>
        <span className="type-ui-mono-2xs text-muted-foreground">
          {String(variable.value)}
        </span>
      </span>
    </li>
  )
}

function ScaleRow({ variable }: { variable: Variable }) {
  const px = Number(variable.value)
  const isRadius = variable.name.startsWith("radius/")
  return (
    <li className="flex items-center gap-3">
      <span className="w-40 shrink-0 type-ui-xs-medium">{variable.name}</span>
      <span className="w-12 shrink-0 type-ui-mono-xs text-muted-foreground">
        {px}
      </span>
      {isRadius ? (
        <span
          className="size-8 border border-foreground bg-muted"
          style={{ borderRadius: `var(${variable.css})` }}
        />
      ) : (
        <span
          className="h-2 max-w-full rounded-sm bg-primary"
          style={{ width: `var(${variable.css})` }}
        />
      )}
    </li>
  )
}

export function App() {
  return (
    <main className="mx-auto flex min-h-svh max-w-5xl flex-col px-6 py-8">
      <header className="flex flex-col gap-1 pb-6">
        <h1 className="type-ui-sm-semibold">Composer: foundation</h1>
        <p className="type-ui-xs text-muted-foreground">
          The theme as exported from Figma on {tokens.source.readAt}.{" "}
          {tokens.variables.length} variables, {tokens.textStyles.length} text
          styles, {tokens.effects.length} shadows. No screens yet.
        </p>
      </header>

      <Section title="Colour">
        {colorGroups.map((group) => (
          <div key={group.title} className="flex flex-col gap-2">
            <GroupLabel>{group.title}</GroupLabel>
            <ul className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3 lg:grid-cols-4">
              {group.items.map((v) => (
                <Swatch key={v.css} variable={v} />
              ))}
            </ul>
          </div>
        ))}
      </Section>

      <Section title="Type">
        <ul className="flex flex-col gap-2">
          {tokens.textStyles.map((s) => (
            <li key={s.name} className="flex items-baseline gap-4">
              <span className="w-40 shrink-0 type-ui-mono-xs text-muted-foreground">
                {s.name}
              </span>
              <span className={textStyleClass[s.name]}>
                Section 4 of 7, 12 in, first seen 1937
              </span>
              <span className="type-ui-mono-2xs text-muted-foreground">
                {s.family} {s.style} {s.size}/{s.lineHeight}
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Button">
        <div className="flex flex-col gap-3">
          {buttonVariants.map((variant) => (
            <div key={variant} className="flex items-center gap-3">
              <span className="w-24 shrink-0 type-ui-mono-xs text-muted-foreground">
                {variant}
              </span>
              {buttonSizes.map((size) => (
                <Button key={size} variant={variant} size={size}>
                  Review changes
                </Button>
              ))}
              <Button variant={variant} disabled>
                Disabled
              </Button>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Scale">
        <div className="grid gap-6 md:grid-cols-2">
          {scaleGroups.map((group) => (
            <div key={group.title} className="flex flex-col gap-2">
              <GroupLabel>{group.title}</GroupLabel>
              <ul className="flex flex-col gap-1.5">
                {group.items.map((v) => (
                  <ScaleRow key={v.css} variable={v} />
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-2">
          <GroupLabel>Control heights as utilities</GroupLabel>
          <div className="flex items-end gap-3">
            {["h-control-xs", "h-control-sm", "h-control", "h-control-lg"].map(
              (h) => (
                <span
                  key={h}
                  className={cn(
                    "flex items-center rounded-md border px-2 type-ui-mono-xs",
                    h
                  )}
                >
                  {h}
                </span>
              )
            )}
          </div>
        </div>
      </Section>

      <Section title="Shadow">
        <ul className="flex flex-wrap gap-6 rounded-lg bg-map-basemap p-6">
          {tokens.effects.map((e) => (
            <li
              key={e.name}
              className={cn(
                "flex h-16 w-40 items-center justify-center rounded-lg bg-background type-ui-mono-xs",
                shadowClass[e.name]
              )}
            >
              {e.name}
            </li>
          ))}
        </ul>
      </Section>
    </main>
  )
}

export default App
