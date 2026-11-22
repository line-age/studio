import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

/** A boxed message on the sign-in card: muted for what is so, red tint for what failed. */
export function SignInMessage({
  tone,
  children,
}: {
  /** `muted` says what is so; `failed` is announced as an alert. */
  tone: "muted" | "failed"
  /** The message, one or two sentences. */
  children: ReactNode
}) {
  return (
    <p
      role={tone === "failed" ? "alert" : undefined}
      className={cn(
        "rounded-md p-3 type-ui-sm text-foreground",
        tone === "failed" ? "bg-destructive-subtle" : "bg-muted"
      )}
    >
      {children}
    </p>
  )
}
