"use client"

import { useEffect, useMemo, useState } from "react"
import PageHeader from "@/components/page-header"
import type { Batch } from "@/lib/types"
import ReportsTable from "@/components/reports-table"
import { subscribeToAllBatches } from "@/lib/firebase"
import { durationBetween } from "@/lib/utils"
import { usePermissions } from "@/hooks/use-permissions"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { ShieldX } from "lucide-react"
import { useFinalStock } from "@/hooks/use-final-stock"

function getFinalOutputForBatch(batch: Batch): number {
  // Final output preference for Production report (exclude Testing):
  // Machining > Assembling > Molding > 0
  const stages = batch.processingStages
  if (stages.Machining?.completed) return stages.Machining.accepted
  if (stages.Assembling?.completed) return stages.Assembling.accepted
  if (stages.Molding?.completed) return stages.Molding.accepted
  return 0
}

// Calculate raw material wastage for a batch
function calculateRawMaterialWastage(batch: Batch): Record<string, number> {
  const wastage: Record<string, number> = {}
  
  for (const material of batch.materials) {
    const stage = material.stage
    const stageData = batch.processingStages[stage]
    
    if (!stageData) {
      wastage[material.name] = 0
      continue
    }
    
    // Get actual consumption - check if there's per-material consumption data
    const materialConsumptions = (stageData as any)?.materialConsumptions as Record<string, number> | undefined
    let actualConsumption = 0
    
    if (materialConsumptions && materialConsumptions[material.id]) {
      // Use per-material consumption if available
      actualConsumption = Number(materialConsumptions[material.id]) || 0
    } else {
      // If multiple materials in same stage, distribute actualConsumption proportionally
      const materialsInStage = batch.materials.filter(m => m.stage === stage)
      const totalPlannedForStage = materialsInStage.reduce((sum, m) => sum + Number(m.quantity || 0), 0)
      
      if (totalPlannedForStage > 0) {
        const materialRatio = Number(material.quantity || 0) / totalPlannedForStage
        actualConsumption = (Number(stageData.actualConsumption) || 0) * materialRatio
      } else {
        // Fallback: if no planned quantity, use stage's actualConsumption directly
        actualConsumption = Number(stageData.actualConsumption) || 0
      }
    }
    
    // Raw Material Input = Accepted × (BOM qty per piece)
    const accepted = Number(stageData?.accepted || 0)
    const qtyToBuild = Number(batch.quantityToBuild || 0)
    const bomPerPiece = qtyToBuild > 0 ? Number(material.quantity || 0) / qtyToBuild : 0
    const rawMaterialInput = accepted * bomPerPiece

    // Wastage = Actual Consumption - Raw Material Input (floor at 0)
    wastage[material.name] = Math.max(0, actualConsumption - rawMaterialInput)
  }
  
  return wastage
}

export default function ProductionReportsPage() {
  const [batches, setBatches] = useState<Batch[]>([])
  const { canEdit, loading: permissionsLoading } = usePermissions()
  const { finalStock } = useFinalStock()
  
  const canAccessReports = canEdit("Reports")

  useEffect(() => {
    const unsubscribe = subscribeToAllBatches(setBatches)
    return () => unsubscribe()
  }, [])

  const rows = useMemo(() => {
    const nonTestingBatches = (batches || []).filter(
      (b) => !(Array.isArray(b.selectedProcesses) && b.selectedProcesses.includes("Testing"))
    )
    return nonTestingBatches.map((b) => {
      const s = b.processingStages
      const moldingDone = Boolean(s?.Molding?.finishedAt)
      const finishingDone = Boolean(s?.Machining?.finishedAt)
      const assemblingDone = Boolean(s?.Assembling?.finishedAt)
      const testingDone = Boolean(s?.Testing?.finishedAt)

      const rejectedUnits =
        (Number(s?.Molding?.rejected) || 0) +
        (Number(s?.Machining?.rejected) || 0) +
        (Number(s?.Assembling?.rejected) || 0)

      const producedUnits = getFinalOutputForBatch(b)
      const rawMaterialWastage = calculateRawMaterialWastage(b)

      const product = finalStock.find(
        (p) => p.id === b.productId || p.productId === b.productId,
      )

      return {
        dateISO: b.createdAt,
        date: new Date(b.createdAt),
        batchId: b.batchId || b.batchCode || b.id,
        productName: b.productName,
        status: b.status,
        producedUnits,
        rejectedUnits,
        rawMaterialWastage,
        productSystemId: product?.id || "",
        productPid: product?.productId || "",
        productSku: product?.sku || "",
        // durations: {
        //   Molding: moldingDone ? durationBetween(s?.Molding?.startedAt, s?.Molding?.finishedAt) : undefined,
        //   Machining: finishingDone ? durationBetween(s?.Machining?.startedAt, s?.Machining?.finishedAt) : undefined,
        //   Assembling: assemblingDone ? durationBetween(s?.Assembling?.startedAt, s?.Assembling?.finishedAt) : undefined,
        //   Testing: testingDone ? durationBetween(s?.Testing?.startedAt, s?.Testing?.finishedAt) : undefined,
        // },
        batch: b, // Pass full batch for reference
      }
    })
  }, [batches, finalStock])

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
          title="Production Reports"
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
        title="Production Reports"
        description="Daily production by batch. Filters by date range and batch ID. Final output uses the latest completed stage. Stage durations are shown per batch."
      />
      <ReportsTable rows={rows} />
    </div>
  )
}
