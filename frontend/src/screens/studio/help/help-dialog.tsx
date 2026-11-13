import { useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

import { useHelp } from "./help-store"
import { HELP_STEPS, HELP_WORDS } from "./steps"

const WORDS = "words"

/**
 * Help: one short page per area of the screen, in the tour's own words, and
 * the words a reviewer meets. "Show me" runs the tour from that area.
 */
export function HelpDialog() {
  const open = useHelp((s) => s.dialogOpen)
  const setOpen = useHelp((s) => s.setDialogOpen)
  const start = useHelp((s) => s.start)
  const [topic, setTopic] = useState(HELP_STEPS[0].id)
  const index = HELP_STEPS.findIndex((step) => step.id === topic)
  const step = index === -1 ? null : HELP_STEPS[index]

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[calc(100svh-4rem)] grid-rows-[auto_minmax(0,1fr)] gap-0 p-0 sm:max-w-160">
        <DialogHeader className="border-b px-4 py-3">
          <DialogTitle>Help</DialogTitle>
          <DialogDescription className="sr-only">
            What each area of the screen is for, and the words it uses.
          </DialogDescription>
        </DialogHeader>
        <div className="flex h-136 min-h-0">
          <nav
            aria-label="Help topics"
            className="flex w-48 shrink-0 flex-col gap-0.5 overflow-y-auto border-r p-2"
          >
            {[
              ...HELP_STEPS.map((s) => ({ id: s.id, label: s.title })),
              { id: WORDS, label: "Words" },
            ].map((item) => (
              <Button
                key={item.id}
                variant={item.id === topic ? "secondary" : "ghost"}
                size="sm"
                aria-current={item.id === topic ? "page" : undefined}
                className="justify-start"
                onClick={() => setTopic(item.id)}
              >
                {item.label}
              </Button>
            ))}
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => start()}
            >
              Take the tour
            </Button>
          </nav>
          <div className="flex min-w-0 flex-1 flex-col items-start gap-3 overflow-y-auto p-4">
            {step ? (
              <>
                <h3 className="type-ui-sm-semibold">{step.title}</h3>
                <p className="type-ui-sm text-muted-foreground">{step.body}</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => start(index)}
                >
                  Show me
                </Button>
              </>
            ) : (
              <>
                <h3 className="type-ui-sm-semibold">Words</h3>
                <dl className="grid grid-cols-[5.5rem_1fr] gap-x-3 gap-y-3">
                  {HELP_WORDS.map((word) => (
                    <div key={word.term} className="contents">
                      <dt className="type-ui-sm-medium">{word.term}</dt>
                      <dd className="type-ui-sm text-muted-foreground">
                        {word.meaning}
                      </dd>
                    </div>
                  ))}
                </dl>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
