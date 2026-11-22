import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, fn, screen, waitFor } from "storybook/test"

import { Input } from "@/components/ui/input"

import {
  EditModal,
  EditModalBody,
  EditModalField,
  EditModalFooter,
  EditModalHeader,
  type EditModalFailure,
} from "./edit-modal"

/**
 * The modal every change opens (Figma section 20, rules `472:17520`): the
 * verb and the thing, fields one per row, what Save will do, Cancel and the
 * action with its count.
 */
const meta = {
  title: "Parts/EditModal",
  component: EditModal,
  args: { open: true, onOpenChange: fn(), onSubmit: fn(), children: null },
} satisfies Meta<typeof EditModal>

export default meta
type Story = StoryObj<typeof meta>

function Form({
  summary,
  saving,
  failure,
  error,
}: {
  summary?: string
  saving?: boolean
  failure?: EditModalFailure
  error?: string
}) {
  return (
    <>
      <EditModalHeader title="Edit pipeline" meta="P-0012 · 6 sections" />
      <EditModalBody>
        <EditModalField id="story-name" label="Name" error={error}>
          <Input
            id="story-name"
            defaultValue="Calder Valley"
            aria-invalid={!!error}
          />
        </EditModalField>
        <EditModalField id="story-owner" label="Owner">
          <Input id="story-owner" defaultValue="Alder Gas Co." />
        </EditModalField>
      </EditModalBody>
      <EditModalFooter
        summary={summary}
        action="Save"
        ready={!!summary && !error}
        saving={saving}
        failure={failure}
      />
    </>
  )
}

/** Opened, nothing changed: the action waits and the footer says so. */
export const NoChanges: Story = {
  args: { children: <Form /> },
  play: async () => {
    await expect(await screen.findByText("No changes yet")).toBeVisible()
    await expect(screen.getByRole("button", { name: "Save" })).toBeDisabled()
  },
}

/** Something changed: the footer says what Save will do; Save submits. */
export const Changed: Story = {
  args: { children: <Form summary="Will update Name and Owner" /> },
  play: async ({ args, userEvent }) => {
    await userEvent.click(await screen.findByRole("button", { name: "Save" }))
    await expect(args.onSubmit).toHaveBeenCalledOnce()
  },
}

/** A field breaks a rule: its words under it, and Save waits. */
export const Invalid: Story = {
  args: {
    children: <Form summary="Will update Name" error="Give a value." />,
  },
  play: async () => {
    // The dialog fades in: wait for it, not for the first frame.
    await waitFor(() => expect(screen.getByText("Give a value.")).toBeVisible())
    await expect(screen.getByRole("button", { name: "Save" })).toBeDisabled()
  },
}

/** Saving: it reads Saving and nothing can be pressed. */
export const Saving: Story = {
  args: { children: <Form summary="Will update Name" saving /> },
  play: async () => {
    await expect(
      await screen.findByRole("button", { name: "Saving" })
    ).toBeDisabled()
    await expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled()
  },
}

/** Not saved (`471:17432`): the reason above the footer, and Try again. */
export const NotSaved: Story = {
  args: {
    children: (
      <Form
        summary="Will update Name"
        failure={{
          title: "Couldn't save. Nothing was changed.",
          reason: "The connection dropped. Try again.",
        }}
      />
    ),
  },
  play: async () => {
    await expect(await screen.findByRole("alert")).toHaveTextContent(
      "The connection dropped."
    )
    await expect(
      screen.getByRole("button", { name: "Try again" })
    ).toBeEnabled()
  },
}
