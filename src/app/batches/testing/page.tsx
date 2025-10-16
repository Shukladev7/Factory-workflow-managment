"use client"

import PageHeader from "@/components/page-header"
import { BatchStageProcessor } from "@/components/batch-stage-processor"

export default function TestingPage() {
  return (
    <>
      <PageHeader
        title="Testing Stage"
        description="Process batches in the testing stage. Log accepted and rejected units."
      />
      <BatchStageProcessor stage="Testing" previousStage="Assembling" />
    </>
  )
}
