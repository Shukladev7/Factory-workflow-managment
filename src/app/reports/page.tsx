"use client"

import { useEffect, useState } from "react"
import PageHeader from "@/components/page-header"
import type { Batch } from "@/lib/types"
import ReportsTable from "@/components/reports-table"
import { subscribeToAllBatches } from "@/lib/firebase"
import { durationBetween } from "@/lib/utils"
import { usePermissions } from "@/hooks/use-permissions"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { ShieldX } from "lucide-react"

function getFinalOutputForBatch(batch: Batch): number {
  // Final output preference: Testing > Machining > Assembling > Molding > 0
  const stages = batch.processingStages
  if (stages.Testing?.completed) return stages.Testing.accepted
  if (stages.Machining?.completed) return stages.Machining.accepted
  if (stages.Assembling?.completed) return stages.Assembling.accepted
  if (stages.Molding?.completed) return stages.Molding.accepted
  return 0
}

export default function ReportsPage() {
  const [batches, setBatches] = useState<Batch[]>([])
  const { canEdit, loading: permissionsLoading } = usePermissions()
  
  const canAccessReports = canEdit("Reports")

  useEffect(() => {
    const unsubscribe = subscribeToAllBatches(setBatches)
    return () => unsubscribe()
  }, [])

  const rows = batches.map((b) => {
    const s = b.processingStages
    const moldingDone = Boolean(s?.Molding?.finishedAt)
    const finishingDone = Boolean(s?.Machining?.finishedAt)
    const assemblingDone = Boolean(s?.Assembling?.finishedAt)
    const testingDone = Boolean(s?.Testing?.finishedAt)

    return {
      dateISO: b.createdAt,
      date: new Date(b.createdAt),
      batchId: b.id,
      productName: b.productName,
      status: b.status,
      finalOutput: getFinalOutputForBatch(b),
      durations: {
        Molding: moldingDone ? durationBetween(s?.Molding?.startedAt, s?.Molding?.finishedAt) : undefined,
        Machining: finishingDone ? durationBetween(s?.Machining?.startedAt, s?.Machining?.finishedAt) : undefined,
        Assembling: assemblingDone ? durationBetween(s?.Assembling?.startedAt, s?.Assembling?.finishedAt) : undefined,
        Testing: testingDone ? durationBetween(s?.Testing?.startedAt, s?.Testing?.finishedAt) : undefined,
      },
    }
  })

  if (permissionsLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-gray-700" />
      </div>
    )
  }
  
  if (!canAccessReports) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Reports"
          description="Daily production by batch. Filters by date range and batch ID. Final output uses the latest completed stage. Stage durations are shown per batch."
        />
        <Alert variant="destructive" className="max-w-2xl">
          <ShieldX className="h-4 w-4" />
          <AlertDescription>
            You don&apos;t have permission to access Reports. Only users with Reports edit permissions can view this page.
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        description="Daily production by batch. Filters by date range and batch ID. Final output uses the latest completed stage. Stage durations are shown per batch."
      />
      <ReportsTable rows={rows} />
    </div>
  )
}
