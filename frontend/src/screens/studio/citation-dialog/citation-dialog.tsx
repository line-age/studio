import { GroupLabel } from "@/components/group-label"
import { Hint } from "@/components/hint"
import { ProposalCard } from "@/components/proposal-card"
import { ProposalLink } from "@/components/proposal-link"
import { SourceCard } from "@/components/source-card"
import { StatusLabel } from "@/components/status-label"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { useDetailLookup, useSectionDetail } from "@/data/detail-store"
import { pipelineLabel, sectionLabel } from "@/data/derive"
import { shortId } from "@/data/short-id"
import {
  BY_HAND_SOURCE,
  citedCount,
  citationLine,
  editionWords,
  featureIdentity,
  formatMadeAt,
  formatValid,
  inheritedWords,
  noQuoteWords,
  PIPELINE_ROW,
  proposedEndsFor,
  proposedEndWords,
  proposedMembershipWords,
  roleWords,
  sourceKindWords,
} from "@/data/evidence"
import {
  membershipRefs,
  proposalRefs,
  STARTERS,
  type AgentRef,
} from "@/data/question"
import type { Citation, Claim, Section } from "@/data/schema"
import { ON_PIPELINE } from "@/data/status"

import { AddToAgentMenu, useAskAgent } from "../add-to-agent"
import { useStudioData } from "../studio-data"
import { useStudio } from "../studio-store"
import { CitationFooter } from "./footer"

/*
 * Where a value comes from: one claim of a section at a time (Figma section 21,
 * `488:19869`). The title is the claim; under it what is proposed for it and
 * its sources, one card each; then the section's other claims, one line each,
 * a click swapping the pop-up to that one. Opened from a claim row in the right
 * panel and from a source in an Agent's answer. Read only.
 */

/** Under a proposal: asks the Agent what is proposed and why. Decides nothing. */
function AskAboutProposals({ refs }: { refs: AgentRef[] }) {
  const askAgent = useAskAgent()
  const closeCitation = useStudio((s) => s.closeCitation)
  if (refs.length === 0) return null
  return (
    <ProposalLink
      badge="Proposed"
      onClick={() => {
        // The question goes to the Agent's panel: the pop-up steps aside.
        closeCitation()
        askAgent([], { refs, words: STARTERS.proposed })
      }}
    >
      Ask the Agent about this
    </ProposalLink>
  )
}

/** What a source does for the claim, a map's edition, and where in it. */
function whereWords(citation: Citation): string | undefined {
  const parts = [
    roleWords(citation.role),
    citation.inheritedFrom && `from ${shortId(citation.inheritedFrom)}`,
    editionWords(citation),
    citation.locator,
  ].filter((part) => part !== undefined && part !== "")
  return parts.length > 0 ? parts.join(" · ") : undefined
}

function Sources({ section, claim }: { section: Section; claim: Claim }) {
  const ends = proposedEndsFor(section, claim.attribute)
  if (claim.citations.length === 0) {
    return (
      <Hint className="type-ui-xs">
        {ends.some((end) => end.kind === "end")
          ? "No source cites this claim yet. Confirming cites both editions."
          : "No source cites this claim yet."}
      </Hint>
    )
  }
  // A map shows a line was there by its date; it never says when it was built.
  const mapsOnly = claim.citations.every((c) => c.sourceKind === "map_sheet")
  return (
    <>
      <ul aria-label="Sources" className="flex flex-col gap-2">
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
          >
            {citation.source === BY_HAND_SOURCE ? (
              <li className="flex flex-col gap-1 rounded-lg bg-state-unknown-subtle p-3">
                <span className="type-ui-sm-medium">Entered by hand</span>
                <span className="type-ui-xs text-muted-foreground">
                  Someone typed this value in Studio. No source is cited for it
                  yet.
                </span>
              </li>
            ) : (
              <SourceCard
                kind={sourceKindWords(citation.sourceKind)}
                title={citation.source}
                where={whereWords(citation)}
                quote={citation.quote}
                note={noQuoteWords(citation)}
                href={citation.url ?? citation.archiveUrl}
              />
            )}
          </AddToAgentMenu>
        ))}
      </ul>
      {mapsOnly && (
        <Hint className="type-ui-xs">
          A map shows the line was there by its date. It does not say when it
          was built.
        </Hint>
      )}
    </>
  )
}

function ClaimBody({ section, claim }: { section: Section; claim: Claim }) {
  const details = useDetailLookup()
  const ends = proposedEndsFor(section, claim.attribute)
  const waiting = claim.proposals.length + ends.length
  const inherited = claim.citations.flatMap((c) => c.inheritedFrom ?? [])
  return (
    <section
      aria-label={`${claim.attribute} of ${sectionLabel(section)}`}
      className="flex flex-col gap-3"
    >
      {claim.value !== null &&
        claim.valid !== undefined &&
        // Not twice: "Shown by August 1929" already says its period.
        !claim.value.endsWith(formatValid(claim.valid)) && (
          <p className="type-ui-xs text-muted-foreground">
            Holds {formatValid(claim.valid)}.
          </p>
        )}
      {claim.value !== null && claim.madeAt !== undefined && (
        <p className="type-ui-xs text-muted-foreground">
          Claim made {formatMadeAt(claim.madeAt)}.
        </p>
      )}
      {waiting > 0 && (
        <div className="flex flex-col gap-2">
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
          <AskAboutProposals
            refs={proposalRefs(section, claim.attribute, details)}
          />
        </div>
      )}
      {inherited.length > 0 && (
        <Hint className="type-ui-xs">{inheritedWords(inherited)}</Hint>
      )}
      <Sources section={section} claim={claim} />
    </section>
  )
}

/** Which pipeline a section is in: confirmed, proposed, or Unknown. */
function PipelineBody({ section }: { section: Section }) {
  const { network } = useStudioData()
  const byId = new Map(network.pipelines.map((p) => [p.id, p]))
  const pipeline = section.pipelineId ? byId.get(section.pipelineId) : undefined
  const proposed = pipeline ? [] : section.proposedMemberships
  return (
    <section
      aria-label={`Pipeline of ${sectionLabel(section)}`}
      className="flex flex-col gap-3"
    >
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
      <Hint className="type-ui-xs">
        {pipeline
          ? "A person confirmed that this section is part of the pipeline. Which pipeline a section belongs to is a judgement; no source is cited for it."
          : proposed.length > 0
            ? "Which pipeline a section belongs to is a judgement a person confirms. No source is cited for it."
            : "No link places this section in a pipeline, and none is proposed. It shows in the Sections list only."}
      </Hint>
    </section>
  )
}

/** The claim's detail is not read yet, or could not be. */
function NotRead({ section }: { section: Section }) {
  const { status, retry } = useSectionDetail(section)
  if (status === "loading") {
    return (
      <div className="flex flex-col gap-1.5" aria-label="Reading sources">
        <Skeleton className="h-3 w-2/3" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    )
  }
  return (
    <div role="alert" className="flex items-center gap-2">
      <span className="flex-1 type-ui-xs text-muted-foreground">
        {status === "failed"
          ? "Could not read the sources of this claim."
          : "No sources read for this claim."}
      </span>
      <Button variant="outline" size="xs" onClick={retry}>
        {status === "failed" ? "Try again" : "Read again"}
      </Button>
    </div>
  )
}

/** "1 source", "2 sources", "no source". */
function sourcesWords(n: number): string {
  return n === 0 ? "no source" : n === 1 ? "1 source" : `${n} sources`
}

/** The section's other claims, one line each; a click swaps the pop-up. */
function OtherClaims({
  section,
  claims,
  current,
}: {
  section: Section
  claims: readonly Claim[]
  current: string
}) {
  const openCitation = useStudio((s) => s.openCitation)
  const others = section.values.filter(
    (v) => v.attribute !== current && !ON_PIPELINE.includes(v.attribute)
  )
  if (others.length === 0) return null
  return (
    <nav aria-label="Other claims of this section" className="flex flex-col">
      <GroupLabel>Other claims of this section</GroupLabel>
      <ul className="flex flex-col">
        {others.map((value) => {
          const claim = claims.find((c) => c.attribute === value.attribute)
          const n = citedCount(claim?.citations)
          const label = (
            <span className="min-w-0 type-ui-sm break-words">
              {value.attribute}:{" "}
              {value.value ?? <StatusLabel status="unknown" size="sm" />}
            </span>
          )
          // Unknown with nothing proposed has nothing to show (as in the panel).
          if (value.value === null && value.proposals === 0) {
            return (
              <li
                key={value.attribute}
                className="flex items-center border-t border-border-subtle py-2"
              >
                {label}
              </li>
            )
          }
          return (
            <li key={value.attribute} className="border-t border-border-subtle">
              <button
                type="button"
                onClick={() => openCitation(section.id, value.attribute)}
                className="flex w-full items-center justify-between gap-3 py-2 text-left outline-none focus-visible:shadow-focus-ring"
              >
                {label}
                <span className="shrink-0 type-ui-xs text-link">
                  {value.proposals > 0 && n === 0
                    ? value.proposals === 1
                      ? "1 proposal"
                      : `${value.proposals} proposals`
                    : sourcesWords(n)}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

/**
 * The pop-up for one claim of a section. Mounts at studio screen level; the
 * store's `openedCitation` says which section and claim.
 */
export function CitationDialog() {
  const opened = useStudio((s) => s.openedCitation)
  const closeCitation = useStudio((s) => s.closeCitation)
  const { sectionById, network } = useStudioData()
  const section = opened ? sectionById.get(opened.sectionId) : undefined
  const { detail } = useSectionDetail(section)
  const isOpen = opened !== null && section !== undefined
  const attribute = opened?.attribute ?? ""
  const pipelineRow = attribute === PIPELINE_ROW
  const claim = detail?.claims.find((c) => c.attribute === attribute)
  const value = section?.values.find((v) => v.attribute === attribute)
  const shown = claim?.value ?? value?.value ?? null
  const count = citedCount(claim?.citations)

  const pipeline =
    pipelineRow && section?.pipelineId
      ? network.pipelines.find((p) => p.id === section.pipelineId)
      : undefined

  return (
    <Dialog open={isOpen} onOpenChange={(next) => !next && closeCitation()}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 p-0 sm:max-w-lg">
        {section && (
          <>
            <DialogHeader className="min-w-0 gap-0.5 border-b px-4 py-3 pr-10">
              <DialogTitle className="type-ui-sm-semibold break-words">
                {pipelineRow ? (
                  pipeline ? (
                    `${PIPELINE_ROW}: ${pipelineLabel(pipeline)}`
                  ) : (
                    <>
                      {PIPELINE_ROW}: <StatusLabel status="unknown" size="sm" />
                    </>
                  )
                ) : shown !== null ? (
                  `${attribute}: ${shown}`
                ) : (
                  <>
                    {attribute}: <StatusLabel status="unknown" size="sm" />
                  </>
                )}
              </DialogTitle>
              <DialogDescription className="type-ui-xs text-muted-foreground">
                {featureIdentity(section)}
                {!pipelineRow && claim && ` · ${sourcesWords(count)}`}
              </DialogDescription>
            </DialogHeader>
            <div className="flex min-h-0 flex-col gap-4 overflow-y-auto px-4 py-3">
              {pipelineRow ? (
                <PipelineBody section={section} />
              ) : detail && claim ? (
                <ClaimBody
                  section={{ ...section, proposedEnds: detail.proposedEnds }}
                  claim={claim}
                />
              ) : (
                <NotRead section={section} />
              )}
              {detail && (
                <OtherClaims
                  section={section}
                  claims={detail.claims}
                  current={attribute}
                />
              )}
            </div>
            <CitationFooter section={section} />
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
