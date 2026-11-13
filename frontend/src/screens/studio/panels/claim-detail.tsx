import { useState } from "react"

import { Citation } from "@/components/citation"
import { GroupLabel } from "@/components/group-label"
import { Hint } from "@/components/hint"
import { Icon } from "@/components/icons/icon"
import { ListGroupHeader } from "@/components/list-group-header"
import { PanelHeader } from "@/components/panel-header"
import { ProposalCard } from "@/components/proposal-card"
import { StatusLabel } from "@/components/status-label"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { sectionLabel } from "@/data/derive"
import type { Citation as CitationData, Claim, Section } from "@/data/schema"

import { useStudioData } from "../studio-data"
import { useStudio } from "../studio-store"

/** A citation as one line: the passage, then the source and the place in it. */
function evidenceOf({ source, locator, quote }: CitationData): string {
  const where = locator === undefined ? source : `${source}, ${locator}`
  return quote === undefined ? `${where}.` : `${quote} ${where}.`
}

function Detail({ section, claim }: { section: Section; claim: Claim }) {
  const close = useStudio((s) => s.closeAttribute)
  // A claim with one source shows it open.
  const [open, setOpen] = useState<ReadonlySet<number>>(
    () => new Set(claim.citations.length === 1 ? [0] : [])
  )
  const toggle = (index: number) =>
    setOpen((was) => {
      const next = new Set(was)
      if (!next.delete(index)) next.add(index)
      return next
    })
  return (
    <section
      aria-label={`${claim.attribute} of ${sectionLabel(section)}`}
      className="flex max-h-3/5 shrink-0 flex-col border-t bg-background"
    >
      <PanelHeader
        title={claim.attribute}
        meta={[section.name, section.code].filter(Boolean).join(" · ")}
      >
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Close the claim"
          onClick={close}
        >
          <Icon name="close" className="size-3.5" />
        </Button>
      </PanelHeader>
      <div className="flex min-h-0 flex-col overflow-y-auto overscroll-contain">
        <div className="flex items-center gap-2 px-3 pb-3">
          {claim.value === null ? (
            <StatusLabel status="unknown" size="sm" />
          ) : (
            <>
              <span className="type-ui-sm-medium break-words">
                {claim.value}
              </span>
              <Badge variant="cited">Cited</Badge>
            </>
          )}
        </div>
        {claim.proposals.length > 0 && (
          <div className="flex flex-col gap-2 px-3 pb-3">
            <GroupLabel>
              {claim.proposals.length === 1 ? "Proposal" : "Proposals"}
            </GroupLabel>
            {claim.proposals.map((proposal, index) => (
              <ProposalCard
                key={index}
                now={claim.value}
                proposed={proposal.value}
                evidence={evidenceOf(proposal.citation)}
              />
            ))}
          </div>
        )}
        <ListGroupHeader count={claim.citations.length}>
          Sources
        </ListGroupHeader>
        {claim.citations.length === 0 ? (
          <Hint className="px-3 py-3">No source cites this claim yet.</Hint>
        ) : (
          <ul aria-label="Sources" className="flex flex-col">
            {claim.citations.map((citation, index) => (
              <Citation
                key={index}
                {...citation}
                open={open.has(index)}
                onToggle={() => toggle(index)}
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

/**
 * The claim chosen in the tree above, in full: its value, what is proposed
 * for it, and each source with the place and the passage. Read only. It docks
 * at the bottom of the properties panel.
 */
export function ClaimDetail() {
  const { sectionById } = useStudioData()
  const sectionId = useStudio((s) => s.selectedSectionId)
  const attribute = useStudio((s) => s.selectedAttribute)
  const section = sectionId === null ? undefined : sectionById.get(sectionId)
  const claim = section?.claims.find((c) => c.attribute === attribute)
  if (!section || !claim) return null
  return (
    <Detail
      key={`${section.id}:${claim.attribute}`}
      section={section}
      claim={claim}
    />
  )
}
