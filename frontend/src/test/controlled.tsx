import type { Decorator } from "@storybook/react-vite"
import { useState, type ComponentType } from "react"

/**
 * For a story of a controlled component: keeps what the person changes, so
 * a box ticked stays ticked. `callback` is the prop that reports a change
 * (its spy in `args` is still called); `patch` turns that call into the
 * props that change. The story still renders the component with its own
 * props, so its docs show real usage. A change from the Controls panel
 * starts over from the new args.
 */
export function controlled<Args extends object>(
  callback: keyof Args & string,
  patch: (current: Args, ...values: never[]) => Partial<Args>
): Decorator<Args> {
  return function Controlled(Story, { args }) {
    return (
      <Keep
        key={argsKey(args)}
        Story={Story as ComponentType<{ args: Args }>}
        args={args}
        callback={callback}
        patch={patch}
      />
    )
  }
}

function Keep<Args extends object>({
  Story,
  args,
  callback,
  patch,
}: {
  Story: ComponentType<{ args: Args }>
  args: Args
  callback: keyof Args & string
  patch: (current: Args, ...values: never[]) => Partial<Args>
}) {
  const [changed, setChanged] = useState<Partial<Args>>({})
  const current = { ...args, ...changed }
  const spy = args[callback] as (...values: unknown[]) => void
  const report = (...values: unknown[]) => {
    spy(...values)
    setChanged((before) => ({
      ...before,
      ...patch(current, ...(values as never[])),
    }))
  }
  return <Story args={{ ...current, [callback]: report }} />
}

/** The args a person can set, as one string: functions left out. */
function argsKey(args: object) {
  return JSON.stringify(args, (_key, value: unknown) =>
    typeof value === "function" ? undefined : value
  )
}
