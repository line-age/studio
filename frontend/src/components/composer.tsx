import { SquareIcon } from "lucide-react"
import { useId, useState, type ReactNode, type Ref } from "react"

import { Icon } from "@/components/icons/icon"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/**
 * The chat input of the Agent panel (Figma calls this component "Composer").
 * A soft filled box: the message on top, attach at bottom left, send at
 * bottom right. While the Agent works, send is Stop (a filled square, as in
 * shadcn's AI Elements prompt input).
 */
export function Composer({
  placeholder,
  onSend,
  onStop,
  onAttach,
  attachments,
  picker,
  inputRef,
  draft,
  className,
}: {
  placeholder: string
  /** Returns false when the message was not taken; the words stay in the box. */
  onSend?: (message: string) => boolean | void
  /** Given while the Agent works: the send button stops it instead. */
  onStop?: () => void
  /** The attach button, and "#" typed at the start of a word. */
  onAttach?: () => void
  /** What attach opens, shown above the message while it is open. */
  picker?: ReactNode
  /** Attachment chips for the message being written, shown above it. */
  attachments?: ReactNode
  /** The message box, for moving the cursor into it. */
  inputRef?: Ref<HTMLTextAreaElement>
  /**
   * Words to put in the message box, such as a starter question. A new
   * `nonce` puts them in again; the person can change them before sending.
   */
  draft?: { text: string; nonce: number }
  className?: string
}) {
  const id = useId()
  const [message, setMessage] = useState(draft?.text ?? "")
  const [drafted, setDrafted] = useState(draft?.nonce)
  // A new draft replaces what is in the box (React's "adjust state on a prop
  // change" pattern: set during render, no effect).
  if (draft && draft.nonce !== drafted) {
    setDrafted(draft.nonce)
    setMessage(draft.text)
  }
  const empty = message.trim().length === 0

  return (
    <form
      className={cn(
        "flex flex-col gap-6 rounded-2xl bg-muted p-3 transition-shadow duration-100 focus-within:shadow-focus-ring",
        className
      )}
      onSubmit={(event) => {
        event.preventDefault()
        if (empty || !onSend) return
        if (onSend(message) === false) return
        setMessage("")
      }}
    >
      {attachments && (
        <div className="-mb-4 flex max-h-48 flex-wrap gap-1.5 overflow-y-auto">
          {attachments}
        </div>
      )}
      {picker}
      <label htmlFor={id} className="sr-only">
        Message to the Agent
      </label>
      <textarea
        id={id}
        ref={inputRef}
        name="message"
        rows={1}
        autoComplete="off"
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        // Enter sends, Shift+Enter starts a new line. Not while an input
        // method is still composing a character.
        onKeyDown={(event) => {
          // "#" at the start of a word picks a section to attach, as the
          // placeholder says. Elsewhere it is just a character.
          if (event.key === "#" && onAttach) {
            const box = event.currentTarget
            const before = box.value.slice(0, box.selectionStart)
            if (before === "" || /\s$/.test(before)) {
              event.preventDefault()
              onAttach()
              return
            }
          }
          if (
            event.key !== "Enter" ||
            event.shiftKey ||
            event.nativeEvent.isComposing
          )
            return
          event.preventDefault()
          event.currentTarget.form?.requestSubmit()
        }}
        placeholder={placeholder}
        className="field-sizing-content max-h-40 min-h-5 resize-none bg-transparent type-ui-sm outline-none placeholder:text-muted-foreground"
      />
      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Attach a section"
          className="rounded-full"
          onClick={onAttach}
        >
          <Icon name="plus" />
        </Button>
        {onStop ? (
          <Button
            type="button"
            size="icon"
            aria-label="Stop"
            className="rounded-full"
            onClick={onStop}
          >
            <SquareIcon className="size-3 fill-current" />
          </Button>
        ) : (
          <Button
            type="submit"
            size="icon"
            aria-label="Send"
            disabled={empty}
            className="rounded-full"
          >
            <Icon name="arrow-up" />
          </Button>
        )}
      </div>
    </form>
  )
}
