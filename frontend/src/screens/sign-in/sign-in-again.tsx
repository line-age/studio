import { useId } from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"

import { Button } from "@/components/ui/button"
import { DialogOverlay, DialogPortal } from "@/components/ui/dialog"
import { signInUrl } from "@/data/session"

import { GitHubMark } from "./github-mark"
import { SignInCard } from "./sign-in-card"

/**
 * Over the open screen when the sign-in ended (a 401, or a read refused with 403)
 * (Figma `425:15755`). The screen stays as it is behind it, and the view is in
 * the URL, so signing in again comes back to the same place. It cannot be
 * dismissed: nothing on store's data works until the person signs in again.
 */
export function SignInAgain({
  open,
  go = (url) => window.location.assign(url),
}: {
  /** Whether the sign-in has ended while signed in. */
  open: boolean
  /** Leaves for the gate's sign-in. Tests pass their own. */
  go?: (url: string) => void
}) {
  const heading = useId()
  const text = useId()
  return (
    <DialogPrimitive.Root open={open} disablePointerDismissal>
      <DialogPortal>
        <DialogOverlay className="bg-overlay supports-backdrop-filter:backdrop-blur-none" />
        <DialogPrimitive.Popup
          aria-labelledby={heading}
          aria-describedby={text}
          className="fixed top-1/2 left-1/2 z-50 -translate-x-1/2 -translate-y-1/2 outline-none"
        >
          <SignInCard
            heading="Sign in again"
            headingId={heading}
            description="Your sign-in ended. The map and what you selected stay as they are behind this window."
            descriptionId={text}
            className="border border-border bg-card shadow-panel"
          >
            <Button
              size="lg"
              className="w-full"
              onClick={() => go(signInUrl())}
            >
              <GitHubMark />
              Sign in with GitHub
            </Button>
          </SignInCard>
        </DialogPrimitive.Popup>
      </DialogPortal>
    </DialogPrimitive.Root>
  )
}
