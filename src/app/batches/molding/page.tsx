"use client"

import PageHeader from "@/components/page-header"
import { BatchStageProcessor } from "@/components/batch-stage-processor"

export default function MoldingPage() {
  return (
    <>
      <PageHeader
        title="Molding Stage"
        description="Process batches in the molding stage. Log accepted and rejected units."
      />
      <BatchStageProcessor stage="Molding" previousStage={null} />
    </>
  )
}
