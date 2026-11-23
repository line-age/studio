/** The empty chat (Figma section 28, board C 1): what to ask, and what a change does. */
export function EmptyChat() {
  return (
    <div className="flex flex-col gap-3">
      <p className="type-ui-sm-medium">
        Ask about what is on screen, or ask for a change.
      </p>
      <p className="type-ui-sm text-muted-foreground">
        I answer from what is saved and its sources. A change comes back as a
        card, and nothing is changed until you approve it.
      </p>
    </div>
  )
}
