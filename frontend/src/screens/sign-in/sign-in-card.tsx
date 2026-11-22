import type { ReactNode } from "react"

import { Icon } from "@/components/icons/icon"
import { cn } from "@/lib/utils"

/*
 * The card every sign-in state is drawn in (Figma section 19, `425:15687`):
 * the app mark, a heading with an optional line under it, then what the state
 * says and its buttons. On the sign-in page it sits on the white half; over
 * the open screen it is a bordered card (`SignInAgain`).
 */
export function SignInCard({
  heading,
  description,
  headingId,
  descriptionId,
  children,
  className,
}: {
  /** What the state is, in a few words. */
  heading: string
  /** One line under the heading. */
  description?: string
  /** Name and describe the card for a dialog that wraps it. */
  headingId?: string
  descriptionId?: string
  /** What the state says and its buttons. */
  children: ReactNode
  /** The border and shadow when the card floats over the screen. */
  className?: string
}) {
  return (
    <div className={cn("flex w-95 flex-col gap-4 rounded-xl p-6", className)}>
      <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <Icon name="section" className="size-[21.333px]" />
      </span>
      <div className="flex flex-col gap-2">
        <h1 id={headingId} className="type-ui-sm-semibold text-foreground">
          {heading}
        </h1>
        {description && (
          <p id={descriptionId} className="type-ui-sm text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {children}
    </div>
  )
}
