import type { ComponentProps } from "react"

import { Icon } from "@/components/icons/icon"
import { PersonAvatar, type AccountKind } from "./person-avatar"
import { cn } from "@/lib/utils"

/**
 * Who is signed in, at the right end of the dark top bar: the avatar, the
 * name, a chevron (Figma AccountButton, `463:17264`). It opens the account
 * menu; the open state is the trigger's own `data-popup-open`.
 */
export function AccountButton({
  name,
  kind,
  className,
  ...props
}: {
  /** The person's name, as GitHub has it, or "Local developer". */
  name: string
  /** A person signed in with GitHub, or Local developer on one machine. */
  kind: AccountKind
} & ComponentProps<"button">) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-control shrink-0 items-center gap-2 rounded-lg pr-2 pl-1 type-ui-sm-medium text-topbar-foreground transition-colors duration-100 outline-none hover:bg-topbar-hover focus-visible:ring-3 focus-visible:ring-ring active:bg-topbar-pressed data-popup-open:bg-topbar-pressed",
        className
      )}
      {...props}
    >
      <PersonAvatar name={name} kind={kind} />
      <span className="max-w-48 truncate">
        <span className="sr-only">Account:</span> {name}
      </span>
      <Icon name="chevron-down" className="opacity-70" />
    </button>
  )
}
