import type { FormEvent, ReactNode } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

/*
 * Every change in Studio opens one of these (Figma section 20, `469:17256`,
 * the rules card `472:17520`): a header with the verb and the thing, then
 * which or how many; a body; a footer that says what Save will do, Cancel,
 * and the action named with its count. Saving reads "Saving" and nothing can
 * be pressed. Not saved: the modal stays open, an alert above the footer says
 * why and that nothing was changed, and the action reads "Try again".
 */

/** 480 wide for fields, 560 for a list of sections. */
export type EditModalSize = "fields" | "list"

/** The modal: a form, so Enter in a field is the action. */
export function EditModal({
  open,
  onOpenChange,
  size = "fields",
  onSubmit,
  children,
}: {
  /** Whether it shows. */
  open: boolean
  /** Close (the cross, Esc, Cancel) asks for false. */
  onOpenChange: (open: boolean) => void
  /** Width: fields, or a list of sections. */
  size?: EditModalSize
  /** The action. The event is already stopped. */
  onSubmit: () => void
  /** Header, body and footer. */
  children: ReactNode
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "gap-0 p-0",
          size === "fields" ? "sm:max-w-[480px]" : "sm:max-w-[560px]"
        )}
      >
        {open && (
          <form
            onSubmit={(event: FormEvent) => {
              event.preventDefault()
              onSubmit()
            }}
          >
            {children}
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** The verb and the thing, then which or how many (`469:17257`). */
export function EditModalHeader({
  title,
  meta,
}: {
  /** "Edit pipeline", "Move 2 sections". */
  title: string
  /** "P-0012 · 6 sections". Read as the dialog's description. */
  meta?: ReactNode
}) {
  return (
    <DialogHeader className="gap-1 border-b p-4">
      <DialogTitle>{title}</DialogTitle>
      {meta && (
        <DialogDescription className="type-ui-sm">{meta}</DialogDescription>
      )}
    </DialogHeader>
  )
}

/** The fields or the list, between header and footer. */
export function EditModalBody({
  className,
  children,
}: {
  className?: string
  children: ReactNode
}) {
  return (
    <div className={cn("flex flex-col gap-4 p-4", className)}>{children}</div>
  )
}

/**
 * One field: the label on the left at 96, the control on the right, and a
 * rule's words under it when it breaks one.
 */
export function EditModalField({
  id,
  label,
  error,
  hint,
  children,
}: {
  /** The control's id, for the label. */
  id: string
  label: ReactNode
  /** A rule the value breaks, in words. */
  error?: string
  /** A quiet line under the control. */
  hint?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-3">
        <label
          htmlFor={id}
          className="flex w-24 shrink-0 items-center gap-1.5 type-ui-xs text-muted-foreground"
        >
          {label}
        </label>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
      {error && (
        <p
          id={`${id}-error`}
          className="pl-[7.5rem] type-ui-xs text-destructive"
        >
          {error}
        </p>
      )}
      {!error && hint && (
        <p className="pl-[7.5rem] type-ui-xs text-muted-foreground">{hint}</p>
      )}
    </div>
  )
}

/** Why a save failed: what failed, then why (`471:17432`). */
export interface EditModalFailure {
  title: string
  reason: string
}

/**
 * What Save will do, Cancel and the action (`469:17263`). The action waits
 * until something changed and nothing breaks a rule (`ready`).
 */
export function EditModalFooter({
  summary,
  action,
  ready,
  saving = false,
  failure,
}: {
  /** "Will add 2 sections and remove 1"; empty reads "No changes yet". */
  summary?: string
  /** The action with its count: "Move 2 sections", "Save changes". */
  action: string
  /** Something changed and every field passes the rules. */
  ready: boolean
  /** Reads "Saving"; nothing can be pressed. */
  saving?: boolean
  /** The last save failed: said above the footer; the action reads Try again. */
  failure?: EditModalFailure | null
}) {
  return (
    <>
      {failure && (
        <div
          role="alert"
          className="mx-4 mb-4 flex flex-col gap-0.5 rounded-md bg-destructive-subtle px-3 py-2 type-ui-sm"
        >
          <span className="font-medium text-destructive">{failure.title}</span>
          <span>{failure.reason}</span>
        </div>
      )}
      <DialogFooter className="m-0 items-center rounded-none border-t bg-transparent p-4">
        <span
          className="min-h-5 min-w-0 flex-1 self-center truncate type-ui-sm text-muted-foreground"
          title={summary || undefined}
        >
          {summary || "No changes yet"}
        </span>
        <DialogClose
          render={<Button type="button" variant="outline" />}
          disabled={saving}
        >
          Cancel
        </DialogClose>
        <Button type="submit" disabled={saving || !ready}>
          {failure ? "Try again" : action}
        </Button>
      </DialogFooter>
    </>
  )
}
