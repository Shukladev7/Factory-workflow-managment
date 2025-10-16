"use client"

import { useState, useEffect } from "react"
import { format } from "date-fns"
import PageHeader from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { PlusCircle, MoreHorizontal, FileDown } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import type { Batch, BatchStatus } from "@/lib/types"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { CreateBatchForm } from "@/components/create-batch-form"
import { useToast } from "@/hooks/use-toast"
import { useActivityLog } from "@/hooks/use-activity-log"
import { usePermissions } from "@/hooks/use-permissions"
import { subscribeToAllBatches, deleteBatch } from "@/lib/firebase"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { BatchDetailsDialog } from "@/components/batch-details-dialog"
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
} from "@/components/ui/alert-dialog"
import * as XLSX from "xlsx"

const statusColors: Record<BatchStatus, string> = {
  Completed: "bg-green-500",
  "In Progress": "bg-blue-500",
  "On Hold": "bg-yellow-500",
  Planned: "bg-gray-500",
}

export default function BatchesOverviewPage() {
  const [batches, setBatches] = useState<Batch[]>([])
  const { activityLog, createActivityLog } = useActivityLog()
  const { canEdit } = usePermissions()
  const [isCreateFormOpen, setIsCreateFormOpen] = useState(false)
  const [selectedBatch, setSelectedBatch] = useState<Batch | null>(null)
  const [isDetailsOpen, setIsDetailsOpen] = useState(false)
  const [isClient, setIsClient] = useState(false)
  const { toast } = useToast()
  
  const canEditBatches = canEdit("Batches")

  useEffect(() => {
    setIsClient(true)
    const unsubscribe = subscribeToAllBatches(setBatches)
    return () => unsubscribe()
  }, [])

  const handleBatchCreated = (newBatch: Batch) => {
    setIsCreateFormOpen(false)
    toast({
      title: "Batch Created",
      description: `Batch ${newBatch.id} has been successfully created.`,
    })

    const firstProcess = newBatch.selectedProcesses[0]
    toast({
      title: `${firstProcess} Dept. Notification`,
      description: `New batch ${newBatch.id} for ${newBatch.productName} is ready for ${firstProcess.toLowerCase()}.`,
    })
  }

  const handleBatchUpdated = (updatedBatch: Batch) => {
    const oldBatch = batches.find((b) => b.id === updatedBatch.id)
    if (!oldBatch) return

    if (oldBatch.status !== updatedBatch.status) {
      createActivityLog({
        recordId: updatedBatch.id,
        recordType: "Batch",
        action: "Updated",
        details: `Status changed from "${oldBatch.status}" to "${updatedBatch.status}".`,
        timestamp: new Date().toISOString(),
        user: "System",
      })
    }
    toast({ title: "Batch Updated", description: `Batch ${updatedBatch.id} has been updated.` })
  }

  const handleBatchDeleted = async (batchId: string) => {
    const batchToDelete = batches.find((b) => b.id === batchId)
    if (!batchToDelete) return

    try {
      await deleteBatch(batchId)
      await createActivityLog({
        recordId: batchId,
        recordType: "Batch",
        action: "Deleted",
        details: `Batch "${batchToDelete.id}" was deleted.`,
        timestamp: new Date().toISOString(),
        user: "System",
      })
      toast({ title: "Batch Deleted", description: `Batch ${batchToDelete.id} has been deleted.` })
      setIsDetailsOpen(false)
      setSelectedBatch(null)
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to delete batch. Please try again.",
      })
    }
  }

  const getStatus = (batch: Batch): BatchStatus => {
    const selectedProcesses = batch.selectedProcesses || []
    const lastProcess = selectedProcesses[selectedProcesses.length - 1]

    if (lastProcess && batch.processingStages[lastProcess]?.completed) return "Completed"

    const hasAnyStarted = selectedProcesses.some(
      (process) => batch.processingStages[process]?.completed || batch.processingStages[process]?.startedAt,
    )

    if (batch.status === "In Progress" || hasAnyStarted) return "In Progress"
    return batch.status
  }

  const getStatusLabel = (batch: Batch) => {
    const selectedProcesses = batch.selectedProcesses || []
    const lastProcess = selectedProcesses[selectedProcesses.length - 1]

    if (lastProcess && batch.processingStages[lastProcess]?.completed) return "Completed"

    for (let i = selectedProcesses.length - 1; i >= 0; i--) {
      const process = selectedProcesses[i]
      if (batch.processingStages[process]?.completed) {
        const nextProcess = selectedProcesses[i + 1]
        return nextProcess ? `${nextProcess} Pending` : "Completed"
      }
    }

    return batch.status
  }

  const handleViewDetails = (batch: Batch) => {
    setSelectedBatch(batch)
    setIsDetailsOpen(true)
  }

  const handleExport = () => {
    const dataToExport = batches.map((batch) => ({
      "Batch ID": batch.id,
      "Product Name": batch.productName,
      Status: getStatusLabel(batch),
      "Selected Processes": batch.selectedProcesses?.join(", ") || "All",
      "Created At": format(new Date(batch.createdAt), "yyyy-MM-dd HH:mm:ss"),
      Materials: batch.materials.map((m) => `${m.name} (${m.quantity} ${m.unit})`).join(", "),
      "Molding Accepted": batch.processingStages.Molding.accepted,
      "Molding Rejected": batch.processingStages.Molding.rejected,
      "Machining Accepted": batch.processingStages.Machining.accepted,
      "Machining Rejected": batch.processingStages.Machining.rejected,
      "Assembling Accepted": batch.processingStages.Assembling.accepted,
      "Assembling Rejected": batch.processingStages.Assembling.rejected,
      "Testing Accepted": batch.processingStages.Testing.accepted,
      "Testing Rejected": batch.processingStages.Testing.rejected,
    }))
    const worksheet = XLSX.utils.json_to_sheet(dataToExport)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, "Batches")
    XLSX.writeFile(workbook, "batches_overview.xlsx")
    toast({
      title: "Exporting Data",
      description: "Your batches data is being downloaded.",
    })
  }

  if (!isClient) {
    return null
  }

  return (
    <>
      <PageHeader title="Batches Overview" description="Track and manage all your production batches.">
        <Button variant="outline" onClick={handleExport}>
          <FileDown className="mr-2 h-4 w-4" />
          Export to Excel
        </Button>
        {/* <SeedPage/> */}
        {canEditBatches && (
          <Dialog open={isCreateFormOpen} onOpenChange={setIsCreateFormOpen}>
            <DialogTrigger asChild>
              <Button>
                <PlusCircle className="mr-2 h-4 w-4" /> Create New Batch
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create New Batch</DialogTitle>
                <DialogDescription>
                  Start a new production batch by selecting a product, required processes, and raw materials.
                </DialogDescription>
              </DialogHeader>
              <CreateBatchForm onBatchCreated={handleBatchCreated} />
            </DialogContent>
          </Dialog>
        )}
      </PageHeader>
      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Batch ID</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Selected Processes</TableHead>
                <TableHead>Date Created</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right w-[60px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {batches.map((batch) => {
                const currentStatus = getStatus(batch)
                return (
                  <TableRow key={batch.id}>
                    <TableCell className="font-mono text-xs">{batch.id}</TableCell>
                    <TableCell className="font-medium">{batch.productName}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {(batch.selectedProcesses || []).map((process) => (
                          <Badge key={process} variant="secondary" className="text-xs">
                            {process}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>{format(new Date(batch.createdAt), "MM/dd/yyyy")}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="flex items-center gap-2 w-fit">
                        <span className={`h-2 w-2 rounded-full ${statusColors[currentStatus]}`} />
                        {getStatusLabel(batch)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem onClick={() => handleViewDetails(batch)}>View Details</DropdownMenuItem>
                          {canEditBatches && (
                            <>
                              <DropdownMenuSeparator />
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <DropdownMenuItem onSelect={(e) => e.preventDefault()}>Delete</DropdownMenuItem>
                                </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This action cannot be undone. This will permanently delete batch {batch.id}.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleBatchDeleted(batch.id)}>
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                              </AlertDialog>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {selectedBatch && (
        <BatchDetailsDialog
          isOpen={isDetailsOpen}
          onOpenChange={setIsDetailsOpen}
          batch={selectedBatch}
          activityLog={activityLog.filter((log) => log.recordId === selectedBatch.id)}
          onBatchUpdate={handleBatchUpdated}
          onBatchDelete={handleBatchDeleted}
        />
      )}
    </>
  )
}
