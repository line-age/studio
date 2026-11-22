import { AccountButton } from "@/components/account-button"
import { Icon } from "@/components/icons/icon"
import { PersonAvatar } from "@/components/person-avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { signOut } from "@/data/session"
import { useSession } from "@/data/session-context"

const LOCAL_NAME = "Local developer"

/*
 * Who is using Studio, in the top bar, and the way out (Figma section 19,
 * `459:16690` and `459:17102`). Signed in: the person's name and GitHub
 * login, and Sign out. Locally: "Local developer", with nothing to sign out
 * of. On the sample, and with no session above, nothing is shown.
 */
export function AccountMenu({
  onSignOut = () => void signOut(),
}: {
  /** Tests pass their own. */
  onSignOut?: () => void
}) {
  const session = useSession()
  if (session?.kind !== "signed-in" && session?.kind !== "local") return null
  const person = session.kind === "signed-in"
  const name = person ? session.name : LOCAL_NAME
  const kind = person ? "person" : "local"
  return (
    <>
      <span
        aria-hidden="true"
        className="mr-1.5 ml-2 h-5 w-px bg-topbar-hover"
      />
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<AccountButton name={name} kind={kind} />}
          aria-label={`Account: ${name}`}
        />
        <DropdownMenuContent align="end" sideOffset={6} className="w-60">
          <div className="flex items-center gap-2.5 p-2">
            <PersonAvatar name={name} kind={kind} size="default" />
            <div className="min-w-0">
              <p className="truncate type-ui-sm-medium text-foreground">
                {name}
              </p>
              <p className="truncate type-ui-xs text-muted-foreground">
                {person ? `@${session.login}` : "No sign-in on this machine"}
              </p>
            </div>
          </div>
          {person ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onSignOut}>
                <Icon name="sign-out" />
                Sign out
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )
}
