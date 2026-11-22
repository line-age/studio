import { useState } from "react"
import { toast } from "sonner"

import type { EditModalFailure } from "@/components/edit-modal"
import type { Change } from "@/data/changes"
import { NOT_SAVED, WriteError } from "@/data/store/write"

import { useStudioData } from "../studio-data"

/** Why a save failed, as a modal's alert says it (Figma `471:17432`). */
export function failureOf(error: unknown): EditModalFailure {
  if (error instanceof WriteError) {
    return {
      title: NOT_SAVED,
      reason: error.detail ? `${error.reason} ${error.detail}` : error.reason,
    }
  }
  const message = error instanceof Error ? error.message : String(error)
  return {
    title: NOT_SAVED,
    reason: message.replace(/\s*Nothing was changed\.\s*/, " ").trim(),
  }
}

/**
 * The toast for a saved change, with Undo. Undo says when it worked too, so
 * a person knows the change is gone ("Undone: …"), or why it did not.
 */
export function toastSaved(saved: string, undo?: () => Promise<void>) {
  toast.success(
    saved,
    undo
      ? {
          action: {
            label: "Undo",
            onClick: () => {
              undo().then(
                () => toast.success(`Undone: ${saved}`),
                (error: unknown) => {
                  const failure = failureOf(error)
                  toast.error(failure.title, { description: failure.reason })
                }
              )
            },
          },
        }
      : undefined
  )
}

/**
 * Saving a modal's change: "Saving" while it goes, then a toast and close;
 * not saved, the modal stays open with the reason, and Try again sends the
 * same change with the same key, so a lost answer makes nothing twice.
 */
export function useSave(onSaved: () => void) {
  const { undoable } = useStudioData()
  const [saving, setSaving] = useState(false)
  const [failure, setFailure] = useState<EditModalFailure | null>(null)
  const save = async (made: Change, key: string, saved: string) => {
    setSaving(true)
    setFailure(null)
    try {
      const undo = await undoable(made, key)
      toastSaved(saved, undo)
      onSaved()
    } catch (error) {
      setFailure(failureOf(error))
    } finally {
      setSaving(false)
    }
  }
  return { save, saving, failure, clearFailure: () => setFailure(null) }
}
