import { Fragment } from "react"

import { Icon } from "@/components/icons/icon"
import { TopbarButton } from "@/components/topbar-button"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/*
 * The dark bar across the top. Its actions have nothing behind them yet; they
 * are shown as designed and do nothing when pressed.
 */
export interface Crumb {
  label: string
  /** Goes back to this level. The last crumb is where the person is. */
  onClick?: () => void
}

export function TopBar({
  networkName,
  trail = [],
  onRoot,
  leftOpen,
  onToggleLeft,
  rightOpen,
  rightAvailable,
  onToggleRight,
}: {
  networkName?: string
  /** The selected pipeline, then the selected section. */
  trail?: Crumb[]
  /** Clears the selection: what the app name does when there is a trail. */
  onRoot?: () => void
  leftOpen: boolean
  onToggleLeft: () => void
  rightOpen: boolean
  /** False while nothing is selected: there are no properties to show. */
  rightAvailable: boolean
  onToggleRight: () => void
}) {
  return (
    <header className="flex h-topbar shrink-0 items-center justify-between bg-topbar px-3 text-topbar-foreground">
      <a
        href="#map"
        className="sr-only rounded-lg bg-background px-2.5 py-1.5 type-ui-sm-medium text-foreground focus-visible:not-sr-only focus-visible:absolute focus-visible:top-1 focus-visible:left-1 focus-visible:z-50"
      >
        Skip to the map
      </a>
      <h1 className="sr-only">
        Lineage Studio{networkName ? `: ${networkName}` : ""}
      </h1>
      <div className="flex min-w-0 items-center gap-3">
        <TopbarButton kind="icon" aria-label="Menu">
          <Icon name="menu" />
        </TopbarButton>
        <TopbarButton
          kind="icon"
          aria-label={leftOpen ? "Hide the left panel" : "Show the left panel"}
          aria-pressed={leftOpen}
          onClick={onToggleLeft}
          className={cn("-ml-2.5", !leftOpen && "opacity-70")}
        >
          <Icon name="panel-left" />
        </TopbarButton>
        <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Icon name="section" />
        </span>
        <Breadcrumb className="min-w-0 px-2">
          <BreadcrumbList className="flex-nowrap type-ui-sm text-topbar-foreground">
            {/* With something selected, the app name steps back to nothing. */}
            <BreadcrumbItem>
              {trail.length > 0 && onRoot ? (
                <button
                  type="button"
                  onClick={onRoot}
                  className="rounded-sm opacity-70 transition-opacity duration-100 hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid"
                >
                  Lineage Studio
                </button>
              ) : (
                <BreadcrumbPage className="text-topbar-foreground">
                  Lineage Studio
                </BreadcrumbPage>
              )}
            </BreadcrumbItem>
            {trail.map((crumb, i) => {
              const last = i === trail.length - 1
              return (
                <Fragment key={i}>
                  <BreadcrumbSeparator>
                    <Icon name="chevron-right" className="size-3.5" />
                  </BreadcrumbSeparator>
                  <BreadcrumbItem className="min-w-0">
                    {last || !crumb.onClick ? (
                      <BreadcrumbPage className="truncate text-topbar-foreground">
                        {crumb.label}
                      </BreadcrumbPage>
                    ) : (
                      <button
                        type="button"
                        onClick={crumb.onClick}
                        className="truncate rounded-sm opacity-70 transition-opacity duration-100 hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid"
                      >
                        {crumb.label}
                      </button>
                    )}
                  </BreadcrumbItem>
                </Fragment>
              )
            })}
          </BreadcrumbList>
        </Breadcrumb>
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        <TopbarButton>Help</TopbarButton>
        <TopbarButton kind="icon" aria-label="Undo">
          <Icon name="undo" />
        </TopbarButton>
        <TopbarButton kind="icon" aria-label="Redo">
          <Icon name="redo" />
        </TopbarButton>
        <TopbarButton>Settings</TopbarButton>
        <TopbarButton>Export</TopbarButton>
        <Button className="mx-2.5">Review changes</Button>
        <TopbarButton
          kind="icon"
          aria-label={
            rightOpen
              ? "Hide the properties panel"
              : "Show the properties panel"
          }
          aria-pressed={rightOpen}
          disabled={!rightAvailable}
          onClick={onToggleRight}
          className={cn(
            "disabled:pointer-events-none disabled:opacity-40",
            rightAvailable && !rightOpen && "opacity-70"
          )}
        >
          <Icon name="panel-right" />
        </TopbarButton>
      </div>
    </header>
  )
}
