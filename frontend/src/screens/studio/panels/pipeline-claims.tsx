import { AttributeRow } from "@/components/attribute-row"
import { datedValue, pipelineClaims, pipelineLabel } from "@/data/derive"
import { citedCount } from "@/data/evidence"
import type { Pipeline } from "@/data/schema"

import { AddToAgentMenu } from "../add-to-agent"
import { useStudio } from "../studio-store"

/**
 * What is claimed about a pipeline as a whole, apart from its sections: one
 * row each for name, owner and operator. Never a section's own.
 */
export function PipelineClaims({
  pipeline,
  className,
}: {
  pipeline: Pipeline
  /** Indent of each row. */
  className?: string
}) {
  const edit = useStudio((s) => s.edit)
  return pipelineClaims(pipeline).map((claim, index, all) => {
    // Which claim of its attribute: an owner that changed is two.
    const nth = all
      .slice(0, index)
      .filter((c) => c.attribute === claim.attribute).length
    return (
      <AddToAgentMenu
        key={`${claim.attribute}:${index}`}
        refs={[
          {
            kind: "claim",
            owner: "pipeline",
            ownerId: pipeline.id,
            attribute: claim.attribute,
            index: nth,
          },
        ]}
        edit={{
          name: pipelineLabel(pipeline),
          count: 1,
          onEditOne: () =>
            edit({ kind: "edit-pipeline", pipelineId: pipeline.id }),
          onEditAll: () =>
            edit({ kind: "edit-pipeline", pipelineId: pipeline.id }),
        }}
      >
        <AttributeRow
          className={className}
          label={claim.attribute}
          value={datedValue(claim)}
          sources={citedCount(claim.citations)}
          proposals={claim.proposals.length}
        />
      </AddToAgentMenu>
    )
  })
}
