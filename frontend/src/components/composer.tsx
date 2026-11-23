import { SquareIcon } from "lucide-react"
import { useId, useState, type ReactNode, type Ref } from "react"

import { Icon } from "@/components/icons/icon"
import { Button } from "@/components/ui/button"
import { Kbd } from "@/components/ui/kbd"
import { cn } from "@/lib/utils"

import { useTypedPlaceholder } from "./use-typed-placeholder"

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
  examples = [],
  className,
}: {
  /** What the box says while empty; a screen reader hears this, never an example. */
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
  /**
   * Examples the empty box writes as its placeholder, one at a time (Figma
   * board E). Tab takes the one showing; typing anything stops them for good.
   */
  examples?: readonly string[]
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
  // Once the person types, the examples stop for good in this box.
  const [touched, setTouched] = useState(false)
  const typed = useTypedPlaceholder(examples, message === "" && !touched)

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <form
        className="flex flex-col gap-6 rounded-2xl bg-muted p-3 transition-shadow duration-100 focus-within:shadow-focus-ring"
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
        <div className="relative flex">
          <textarea
            id={id}
            ref={inputRef}
            name="message"
            rows={1}
            autoComplete="off"
            value={message}
            onChange={(event) => {
              setTouched(true)
              setMessage(event.target.value)
            }}
            // Enter sends, Shift+Enter starts a new line. Not while an input
            // method is still composing a character.
            onKeyDown={(event) => {
              // Tab in the empty box takes the example showing, as the person's
              // own words to edit or send. With text in the box it moves focus.
              if (
                event.key === "Tab" &&
                !event.shiftKey &&
                typed &&
                message === ""
              ) {
                event.preventDefault()
                setTouched(true)
                setMessage(typed.full)
                return
              }
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
            placeholder={typed ? "" : placeholder}
            aria-placeholder={placeholder}
            aria-describedby={typed ? `${id}-tab` : undefined}
            className="field-sizing-content max-h-40 min-h-5 w-full resize-none bg-transparent type-ui-sm outline-none placeholder:text-muted-foreground"
          />
          {typed && (
            // The example being written. A screen reader hears the plain
            // placeholder once, never each letter.
            <span
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 truncate type-ui-sm text-muted-foreground"
            >
              {typed.shown}
            </span>
          )}
        </div>
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
      {typed && (
        <p
          id={`${id}-tab`}
          className="flex items-center gap-1.5 px-1 type-ui-xs text-muted-foreground"
        >
          <Kbd>Tab</Kbd> to use this example
        </p>
      )}
    </div>
  )
}
