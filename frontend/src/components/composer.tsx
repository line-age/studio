import { useId, useState } from "react"

import { Icon } from "@/components/icons/icon"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/**
 * The chat input of the Agent panel (Figma calls this component "Composer").
 * A soft filled box: the message on top, attach at bottom left, send at
 * bottom right.
 */
export function Composer({
  placeholder,
  onSend,
  onAttach,
  className,
}: {
  placeholder: string
  onSend?: (message: string) => void
  onAttach?: () => void
  className?: string
}) {
  const id = useId()
  const [message, setMessage] = useState("")
  const empty = message.trim().length === 0

  return (
    <form
      className={cn(
        "flex flex-col gap-6 rounded-2xl bg-muted p-3 transition-shadow duration-100 focus-within:shadow-focus-ring",
        className
      )}
      onSubmit={(event) => {
        event.preventDefault()
        if (!empty) onSend?.(message)
      }}
    >
      <label htmlFor={id} className="sr-only">
        Message to the Agent
      </label>
      <textarea
        id={id}
        name="message"
        rows={1}
        autoComplete="off"
        value={message}
        onChange={(event) => setMessage(event.target.value)}
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
        <Button
          type="submit"
          size="icon"
          aria-label="Send"
          disabled={empty}
          className="rounded-full"
        >
          <Icon name="arrow-up" />
        </Button>
      </div>
    </form>
  )
}
