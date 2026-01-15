"use client"

import { useState, useMemo } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { Batch, ActivityLog, ProcessingStageName } from "@/lib/types"
import { Button } from "./ui/button"
import { ActivityLogList } from "./activity-log-list"
import { format } from "date-fns"
import { Badge } from "./ui/badge"
import { Progress } from "./ui/progress"
import { EditBatchForm } from "./edit-batch-form"
import { TruncatedId } from "./ui/data-table"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "./ui/alert-dialog"
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis, Tooltip, Legend } from "recharts"
import { ChartContainer, ChartTooltipContent } from "./ui/chart"

interface BatchDetailsDialogProps {
  isOpen: boolean
  onOpenChange: (isOpen: boolean) => void
  batch: Batch
  activityLog: ActivityLog[]
  onBatchUpdate: (batch: Batch) => void
  onBatchDelete: (id: string) => void
}

export function BatchDetailsDialog({
  isOpen,
  onOpenChange,
  batch,
  activityLog,
  onBatchUpdate,
  onBatchDelete,
}: BatchDetailsDialogProps) {
  const [isEditing, setIsEditing] = useState(false)

  const isBatchCompleted = useMemo(() => batch.processingStages.Assembling.completed, [batch])

  const consumptionData = useMemo(() => {
    if (!isBatchCompleted) return []

    // Aggregate actual consumption per stage
    const actualConsumptionByStage: Record<string, number> = {}
    Object.entries(batch.processingStages).forEach(([stage, data]) => {
      actualConsumptionByStage[stage] = data.actualConsumption
    })

    // Map materials to their planned vs actual consumption
    return batch.materials.map((material) => {
      const stage = material.stage
      const actual = actualConsumptionByStage[stage] || 0

      // If multiple materials in a stage, this logic might need refinement.
      // Assuming for now one material type per stage for a clear chart.
      // Or that actualConsumption is logged per material, which it is not currently.
      // For this implementation, we will assume the total stage consumption applies to the material in that stage.
      return {
        name: material.name,
        planned: material.quantity,
        actual: actual,
      }
    })
  }, [batch, isBatchCompleted])

  const wastageData = useMemo(() => {
    if (!isBatchCompleted) return []
    return Object.entries(batch.processingStages).map(([stage, data]) => ({
      name: stage,
      accepted: data.accepted,
    }))
  }, [batch, isBatchCompleted])

  const handleUpdate = (updatedBatch: Batch) => {
    onBatchUpdate(updatedBatch)
    setIsEditing(false)
  }

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setIsEditing(false)
    }
    onOpenChange(open)
  }

  const handleDelete = () => {
    onBatchDelete(batch.id)
  }

  const displayBatchId = batch.batchId || batch.batchCode || batch.id

  const getStageLabels = (stageName: ProcessingStageName) => {
    switch (stageName) {
      case "Molding":
        return {
          input: "Raw Mat. Input",
          accepted: "Accepted Units",
          consumption: "Actual Raw Mat. Consumption",
        }
      case "Machining":
        return {
          input: "Moulded Input",
          accepted: "Accepted Units",
          consumption: "Actual Raw Mat. Consumption",
        }
      case "Assembling":
        return {
          input: "Finished Input",
          accepted: "Accepted Units",
          consumption: "Actual Raw Mat. Consumption",
        }
    }
  }

  const renderStageProgress = (stageName: keyof Batch["processingStages"]) => {
    const stage = batch.processingStages[stageName]
    const labels = getStageLabels(stageName)

    const getInputQty = () => {
      const materialForStage = batch.materials
        .filter((mat) => mat.stage === stageName)
        .reduce((sum, mat) => sum + mat.quantity, 0)

      switch (stageName) {
        case "Molding":
          return materialForStage
        case "Machining":
          return batch.processingStages.Molding.accepted
        case "Assembling":
          return batch.processingStages.Machining.accepted
        default:
          return 0
      }
    }

    const getConsumptionQty = () => {
      const materialForStage = batch.materials.filter((mat) => mat.stage === stageName)

      if (materialForStage.length === 0) return `0 units`

      return `${stage.actualConsumption.toLocaleString()} ${materialForStage[0]?.unit || "units"}`
    }

    const inputQty = getInputQty()
    const totalProcessed = stage.accepted
    // Progress should reflect completion towards the next stage, if applicable.
    const progress = stage.completed ? 100 : inputQty > 0 ? (totalProcessed / inputQty) * 100 : 0

    return (
      <div className="space-y-2 p-3 border rounded-md">
        <h4 className="font-medium">{stageName}</h4>
        {stage.completed ? <Badge variant="secondary">Completed</Badge> : <Badge variant="outline">Pending</Badge>}
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <span>{labels.input}:</span>
          <span className="text-right">{inputQty.toLocaleString()} units</span>
          <span>{labels.consumption}:</span>
          <span className="text-right">{getConsumptionQty()}</span>
          <span>{labels.accepted}:</span>
          <span className="text-right">{stage.accepted.toLocaleString()} units</span>
        </div>
        <Progress value={progress} />
      </div>
    )
  }

  const renderBatchDetails = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <strong>Batch ID:</strong> <TruncatedId id={displayBatchId} maxLength={16} />
        </div>
        <div>
          <strong>Created:</strong> {format(new Date(batch.createdAt), "MM/dd/yyyy")}
        </div>
        <div>
          <strong>Product:</strong> {batch.productName}
        </div>
        <div>
          <strong>Status:</strong> <Badge variant="outline">{batch.status}</Badge>
        </div>
      </div>

      <div>
        <h4 className="font-medium mb-2">Materials</h4>
        <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
          {batch.materials.map((mat) => (
            <li key={mat.id}>
              {mat.quantity} {mat.unit} of {mat.name} for{" "}
              <Badge variant="outline" className="font-normal">
                {mat.stage}
              </Badge>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h4 className="font-medium mb-2">Processing Progress</h4>
        <div className="grid sm:grid-cols-3 gap-4">
          {renderStageProgress("Molding")}
          {renderStageProgress("Machining")}
          {renderStageProgress("Assembling")}
        </div>
      </div>

      {isBatchCompleted && (
        <div className="space-y-4 pt-4">
          <h3 className="font-semibold text-lg">Batch Analysis</h3>
          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Material Consumption</CardTitle>
              </CardHeader>
              <CardContent>
                <ChartContainer
                  config={{
                    planned: { label: "Planned", color: "hsl(var(--chart-2))" },
                    actual: { label: "Actual", color: "hsl(var(--chart-1))" },
                  }}
                  className="h-[250px] w-full"
                >
                  <BarChart data={consumptionData} margin={{ top: 20, right: 20, left: -10, bottom: 5 }}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="name" tickLine={false} tickMargin={10} axisLine={false} />
                    <YAxis />
                    <Tooltip content={<ChartTooltipContent />} />
                    <Legend />
                    <Bar dataKey="planned" fill="var(--color-planned)" radius={4} />
                    <Bar dataKey="actual" fill="var(--color-actual)" radius={4} />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Wastage Tracking</CardTitle>
              </CardHeader>
              <CardContent>
                <ChartContainer
                  config={{
                    accepted: { label: "Accepted", color: "hsl(var(--chart-2))" },
                  }}
                  className="h-[250px] w-full"
                >
                  <BarChart data={wastageData} margin={{ top: 20, right: 20, left: -10, bottom: 5 }}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="name" tickLine={false} tickMargin={10} axisLine={false} />
                    <YAxis />
                    <Tooltip content={<ChartTooltipContent />} />
                    <Legend />
                    <Bar dataKey="accepted" fill="var(--color-accepted)" radius={4} />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  )

  const renderEditForm = () => {
    return <EditBatchForm batch={batch} onBatchUpdated={handleUpdate} />
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isEditing ? "Edit Batch" : "Batch Details:"}
            <TruncatedId id={displayBatchId} maxLength={12} />
          </DialogTitle>
          <DialogDescription>
            {isEditing ? "Update the details for this batch." : "Viewing details and activity for this production batch."}
          </DialogDescription>
        </DialogHeader>

        {isEditing ? (
          <div className="py-4">{renderEditForm()}</div>
        ) : (
          <Tabs defaultValue="details" className="pt-4">
            <TabsList>
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="log">Activity Log</TabsTrigger>
            </TabsList>
            <TabsContent value="details" className="mt-4">
              {renderBatchDetails()}
              <DialogFooter className="pt-6">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive">Delete</Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                      <AlertDialogDescription>
                        <div className="flex items-center gap-2">
                          This action cannot be undone. This will permanently delete batch
                          <TruncatedId id={displayBatchId} maxLength={10} />
                        </div>
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                <Button onClick={() => setIsEditing(true)}>Edit</Button>
              </DialogFooter>
            </TabsContent>
            <TabsContent value="log">
              <ActivityLogList log={activityLog} />
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  )
}
