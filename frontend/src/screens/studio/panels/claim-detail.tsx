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
import { pipelineLabel, sectionLabel } from "@/data/derive"
import {
  citationLine,
  editionWords,
  formatValid,
  PIPELINE_ROW,
  proposedEndsFor,
  proposedMembershipWords,
  proposedEndWords,
  roleWords,
} from "@/data/evidence"
import type { Claim, Section } from "@/data/schema"

import { ProposalLink } from "@/components/proposal-link"
import {
  membershipRefs,
  proposalRefs,
  STARTERS,
  type AgentRef,
} from "@/data/question"

import { AddToAgentMenu, useAskAgent } from "../add-to-agent"
import { useStudioData } from "../studio-data"
import { useStudio } from "../studio-store"

/**
 * Under a proposal: asks the Agent what is proposed and why. It decides
 * nothing (Figma `223:11018`).
 */
function AskAboutProposals({ refs }: { refs: AgentRef[] }) {
  const askAgent = useAskAgent()
  if (refs.length === 0) return null
  return (
    <ProposalLink
      badge="Proposed"
      onClick={() => askAgent([], { refs, words: STARTERS.proposed })}
    >
      Ask the Agent about this
    </ProposalLink>
  )
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
  const ends = proposedEndsFor(section, claim.attribute)
  const waiting = claim.proposals.length + ends.length
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
        <div className="flex flex-col gap-1 px-3 pb-3">
          <div className="flex items-center gap-2">
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
          {/* Not twice: "Shown by August 1929" already says its period. */}
          {claim.value !== null &&
            claim.valid !== undefined &&
            !claim.value.endsWith(formatValid(claim.valid)) && (
              <p className="type-ui-xs text-muted-foreground">
                Holds {formatValid(claim.valid)}.
              </p>
            )}
        </div>
        {waiting > 0 && (
          <div className="flex flex-col gap-2 px-3 pb-3">
            <GroupLabel>{waiting === 1 ? "Proposal" : "Proposals"}</GroupLabel>
            {claim.proposals.map((proposal, index) => (
              <ProposalCard
                key={index}
                now={claim.value}
                proposed={proposal.value}
                evidence={citationLine(proposal.citation)}
              />
            ))}
            {/* An end or a cut is told, never decided here. */}
            {ends.map((end) => (
              <Hint key={end.id}>{proposedEndWords(end)}</Hint>
            ))}
            <AskAboutProposals refs={proposalRefs(section, claim.attribute)} />
          </div>
        )}
        <ListGroupHeader count={claim.citations.length}>
          Sources
        </ListGroupHeader>
        {claim.citations.length === 0 ? (
          <Hint className="px-3 py-3">
            {ends.some((end) => end.kind === "end")
              ? "No source cites this claim yet. Confirming cites both editions."
              : "No source cites this claim yet."}
          </Hint>
        ) : (
          <ul aria-label="Sources" className="flex flex-col">
            {claim.citations.map((citation, index) => (
              <AddToAgentMenu
                key={index}
                refs={[
                  {
                    kind: "citation",
                    sectionId: section.id,
                    attribute: claim.attribute,
                    index,
                  },
                ]}
                starters={[{ words: STARTERS.say }]}
              >
                <Citation
                  source={citation.source}
                  role={roleWords(citation.role)}
                  edition={editionWords(citation)}
                  locator={citation.locator}
                  quote={citation.quote}
                  file={citation.file}
                  open={open.has(index)}
                  onToggle={() => toggle(index)}
                />
              </AddToAgentMenu>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

/**
 * Which pipeline a section is in, in full: the pipeline once a person has
 * confirmed it, what is proposed while nobody has, or Unknown. Read only.
 */
function PipelineDetail({ section }: { section: Section }) {
  const close = useStudio((s) => s.closeAttribute)
  const { network } = useStudioData()
  const byId = new Map(network.pipelines.map((p) => [p.id, p]))
  const pipeline = section.pipelineId ? byId.get(section.pipelineId) : undefined
  const proposed = pipeline ? [] : section.proposedMemberships
  return (
    <section
      aria-label={`Pipeline of ${sectionLabel(section)}`}
      className="flex max-h-3/5 shrink-0 flex-col border-t bg-background"
    >
      <PanelHeader
        title={PIPELINE_ROW}
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
      <div className="flex min-h-0 flex-col gap-3 overflow-y-auto overscroll-contain px-3 pb-3">
        <div className="flex items-center gap-2">
          {pipeline ? (
            <>
              <span className="type-ui-sm-medium break-words">
                {pipelineLabel(pipeline)}
              </span>
              <span className="type-ui-mono-xs text-muted-foreground">
                {pipeline.code}
              </span>
            </>
          ) : (
            <StatusLabel status="unknown" size="sm" />
          )}
        </div>
        {proposed.length > 0 && (
          <div className="flex flex-col gap-2">
            <GroupLabel>
              {proposed.length === 1 ? "Proposal" : "Proposals"}
            </GroupLabel>
            {proposed.map((membership) => {
              const target = byId.get(membership.pipelineId)
              return target ? (
                <Hint key={membership.id}>
                  {proposedMembershipWords(membership, target)}
                </Hint>
              ) : null
            })}
            <AskAboutProposals refs={membershipRefs(section)} />
          </div>
        )}
        <Hint>
          {pipeline
            ? "A person confirmed that this section is part of the pipeline. Which pipeline a section belongs to is a judgement; no source is cited for it."
            : proposed.length > 0
              ? "Which pipeline a section belongs to is a judgement a person confirms. No source is cited for it."
              : "No link places this section in a pipeline, and none is proposed. It shows in the Sections list only."}
        </Hint>
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
  if (section && attribute === PIPELINE_ROW) {
    return <PipelineDetail key={`${section.id}:pipeline`} section={section} />
  }
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
