"use client"

import PageHeader from "@/components/page-header"
import { BatchStageProcessor } from "@/components/batch-stage-processor"

export default function MachiningPage() {
  return (
    <>
      <PageHeader
        title="Machining Stage"
        description="Process batches in the machining stage. Log accepted and rejected units."
      />
      <BatchStageProcessor stage="Machining" previousStage="Molding" />
    </>
  )
}
