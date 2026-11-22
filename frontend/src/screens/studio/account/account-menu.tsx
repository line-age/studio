import { AccountButton } from "./account-button"
import { Icon } from "@/components/icons/icon"
import { PersonAvatar } from "./person-avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { signOut } from "@/data/session"
import { toast } from "sonner"
import { useSession } from "@/data/session-context"

const LOCAL_NAME = "Local developer"

/** Signs out, or says it could not: the person is still signed in then. */
async function signOutOrSay() {
  if (!(await signOut()))
    toast("Could not sign out: Studio's sign-in did not answer. Try again.")
}

/**
 * Who is using Studio, in the top bar, and the way out (Figma section 19,
 * `459:16690` and `459:17102`). Signed in: the person's name and GitHub
 * login, and Sign out. Locally: "Local developer", with nothing to sign out
 * of, so a popover rather than a menu. On the sample, and with no session
 * above, nothing is shown.
 */
export function AccountMenu({
  onSignOut = () => void signOutOrSay(),
}: {
  /** What Sign out does: ends the session at the gate. Tests pass a spy. */
  onSignOut?: () => void
}) {
  const session = useSession()
  if (session?.kind !== "signed-in" && session?.kind !== "local") return null
  const signedIn = session.kind === "signed-in"
  const name = signedIn ? session.name : LOCAL_NAME
  const kind = signedIn ? "person" : "local"
  const trigger = <AccountButton name={name} kind={kind} />
  const who = (
    <div className="flex items-center gap-2.5 p-2">
      <PersonAvatar name={name} kind={kind} size="default" />
      <div className="min-w-0">
        <p className="truncate type-ui-sm-medium text-foreground">{name}</p>
        <p className="truncate type-ui-xs text-muted-foreground">
          {signedIn ? `@${session.login}` : "No sign-in on this machine"}
        </p>
      </div>
    </div>
  )
  return (
    <>
      <span
        aria-hidden="true"
        className="mr-1.5 ml-2 h-5 w-px bg-topbar-hover"
      />
      {signedIn ? (
        <DropdownMenu>
          <DropdownMenuTrigger render={trigger} />
          <DropdownMenuContent align="end" sideOffset={6} className="w-60">
            {who}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onSignOut}>
              <Icon name="sign-out" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <Popover>
          <PopoverTrigger render={trigger} />
          <PopoverContent
            aria-label="Account"
            align="end"
            sideOffset={6}
            className="w-60 gap-0 p-1"
          >
            {who}
          </PopoverContent>
        </Popover>
      )}
    </>
  )
}
