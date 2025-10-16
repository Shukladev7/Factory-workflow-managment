"use client"

import PageHeader from "@/components/page-header"
import { BatchStageProcessor } from "@/components/batch-stage-processor"

export default function AssemblingPage() {
  return (
    <>
      <PageHeader
        title="Assembling Stage"
        description="Process batches in the assembling stage. Log accepted and rejected units."
      />
      <BatchStageProcessor stage="Assembling" previousStage="Machining" />
    </>
  )
}
