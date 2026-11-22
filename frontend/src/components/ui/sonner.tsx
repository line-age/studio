import { Toaster as Sonner, type ToasterProps } from "sonner"

import { Icon } from "@/components/icons/icon"

/*
 * shadcn's Sonner, in Studio's look: a compact card (popover colours, our
 * border, radius lg, the popover shadow, 14/20 text), our own icons, the
 * state colour always beside its words (a saved change is cited green, a
 * failure destructive red), and an action (Undo) as a small outline button.
 * Bottom right, above the right panel's footer and clear of the map's
 * attribution. One light theme (frontend/AGENTS.md).
 */
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      position="bottom-right"
      offset={{ bottom: 44, right: 12 }}
      gap={8}
      visibleToasts={3}
      className="toaster group"
      icons={{
        success: (
          <Icon name="check" className="size-4 text-state-cited-foreground" />
        ),
        error: <Icon name="warning" className="size-4 text-destructive" />,
        warning: (
          <Icon
            name="warning"
            className="size-4 text-state-unknown-foreground"
          />
        ),
        info: <Icon name="help" className="size-4 text-muted-foreground" />,
      }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "cn-toast flex w-[var(--width)] max-w-[calc(100vw-24px)] items-start gap-2.5 rounded-lg border bg-popover px-3 py-2.5 text-popover-foreground shadow-popover",
          icon: "mt-0.5 flex size-4 shrink-0 items-center justify-center",
          content: "flex min-w-0 flex-1 flex-col gap-0.5",
          title: "type-ui-sm",
          description: "type-ui-xs text-muted-foreground",
          actionButton:
            "-my-0.5 ml-1 inline-flex h-7 shrink-0 items-center rounded-md border bg-background px-2.5 type-ui-sm-medium hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-none",
          cancelButton:
            "-my-0.5 inline-flex h-7 shrink-0 items-center rounded-md px-2 type-ui-sm text-muted-foreground hover:bg-muted",
        },
      }}
      style={{ "--width": "320px" } as React.CSSProperties}
      {...props}
    />
  )
}

export { Toaster }
