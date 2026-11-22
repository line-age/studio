import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { signInUrl, type SignedOut, type SignInFailure } from "@/data/session"

import { DevelopedBy } from "./developed-by"
import { EditionsPanel } from "./editions-panel"
import { GitHubMark } from "./github-mark"
import { SignInCard } from "./sign-in-card"
import { SignInMessage } from "./sign-in-message"

/**
 * The sign-in page (Figma section 19, `425:15687`): the form on the left, the
 * editions on the right. What a person sees before Studio shows any of
 * store's data. Four states: signed out (`432:16219`), signing in once the
 * button is pressed (`425:15706`), not in a team (`425:15722`) and a sign-in
 * that failed (`425:15741`). GitHub asks for the password; Studio never sees it.
 */

/** What a failed sign-in says, by what did not answer. */
const FAILED = {
  github: "Could not sign in: GitHub did not answer. Nothing was changed.",
  unreachable:
    "Could not sign in: Studio's sign-in did not answer. Nothing was changed.",
} satisfies Record<SignInFailure, string>

export function SignInScreen({
  session,
  go = (url) => window.location.assign(url),
}: {
  /** Signed out (perhaps after a failure), or signed in to GitHub but in no team. */
  session: SignedOut
  /** Leaves for GitHub. Tests pass their own. */
  go?: (url: string) => void
}) {
  const [signing, setSigning] = useState(false)
  // Back from GitHub without signing in, the browser may show this page as it
  // was left, still signing in. It starts over instead.
  useEffect(() => {
    const shown = (event: PageTransitionEvent) => {
      if (event.persisted) setSigning(false)
    }
    window.addEventListener("pageshow", shown)
    return () => window.removeEventListener("pageshow", shown)
  }, [])
  const signIn = (chooseAccount = false) => {
    setSigning(true)
    go(signInUrl({ chooseAccount }))
  }
  return (
    <main className="flex h-svh bg-background">
      <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden">
        {signing ? (
          <Signing />
        ) : session.kind === "not-in-team" ? (
          <NotInTeam login={session.login} onSignIn={signIn} />
        ) : session.failure ? (
          <SignInCard heading="Sign in to Lineage Studio">
            <SignInMessage tone="failed">
              {FAILED[session.failure]}
            </SignInMessage>
            <Button size="lg" className="w-full" onClick={() => signIn()}>
              <GitHubMark />
              Try again
            </Button>
          </SignInCard>
        ) : (
          <SignInCard
            heading="Sign in to Lineage Studio"
            description="Studio uses your GitHub account. You need to be in one of the project's GitHub teams."
          >
            <Button size="lg" className="w-full" onClick={() => signIn()}>
              <GitHubMark />
              Sign in with GitHub
            </Button>
            <p className="type-ui-xs text-muted-foreground">
              GitHub asks for your password, not Studio. Studio reads your name
              and your teams, nothing else.
            </p>
          </SignInCard>
        )}
        {/* On a narrow screen the editions panel, and its credit, are hidden. */}
        <div className="absolute inset-x-0 bottom-10.5 mx-auto w-95 px-6 md:hidden">
          <DevelopedBy surface="light" />
        </div>
      </div>
      <EditionsPanel />
    </main>
  )
}

function Signing() {
  return (
    <SignInCard
      heading="Signing in"
      description="Checking your GitHub account and teams."
    >
      <div
        role="progressbar"
        aria-label="Signing in"
        aria-valuetext="Signing in"
        className="h-0.75 overflow-hidden"
      >
        <div className="h-full w-3/5 rounded-r-xs bg-primary" />
      </div>
      <Button size="lg" className="w-full" disabled>
        <GitHubMark />
        Sign in with GitHub
      </Button>
    </SignInCard>
  )
}

function NotInTeam({
  login,
  onSignIn,
}: {
  login: string
  onSignIn: (chooseAccount?: boolean) => void
}) {
  return (
    <SignInCard heading="You don't have access yet">
      <SignInMessage tone="muted">
        Signed in to GitHub as {login}. That account is not in a team that can
        use Lineage Studio.
      </SignInMessage>
      <p className="type-ui-sm text-muted-foreground">
        Ask a project owner to add you to a team, then try again.
      </p>
      <div className="flex flex-col gap-2">
        <Button size="lg" className="w-full" onClick={() => onSignIn()}>
          Try again
        </Button>
        <Button
          size="lg"
          variant="outline"
          className="w-full"
          onClick={() => onSignIn(true)}
        >
          Use another GitHub account
        </Button>
      </div>
    </SignInCard>
  )
}
