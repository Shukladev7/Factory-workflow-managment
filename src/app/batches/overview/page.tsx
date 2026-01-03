"use client"

import { useState, useEffect, useMemo } from "react"
import { format } from "date-fns"
import PageHeader from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { PlusCircle, MoreHorizontal, FileDown, Eye, Search } from "lucide-react"
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
import { Input } from "@/components/ui/input"
import { SortControls, sortArray, type SortDirection } from "@/components/sort-controls"

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
  const [wastageBatch, setWastageBatch] = useState<Batch | null>(null)
  const [isWastageOpen, setIsWastageOpen] = useState(false)
  const [isClient, setIsClient] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [sortDirection, setSortDirection] = useState<SortDirection>("none")
  const { toast } = useToast()
  
  const canEditBatches = canEdit("Batches")

  useEffect(() => {
    setIsClient(true)
    const unsubscribe = subscribeToAllBatches(setBatches)
    return () => unsubscribe()
  }, [])

  const handleBatchCreated = (newBatch: Batch) => {
    setIsCreateFormOpen(false)
    const displayId = newBatch.batchId || newBatch.batchCode || newBatch.id
    toast({
      title: "Batch Created",
      description: `Batch ${displayId} has been successfully created.`,
    })

    const firstProcess = newBatch.selectedProcesses[0]
    toast({
      title: `${firstProcess} Dept. Notification`,
      description: `New batch ${displayId} for ${newBatch.productName} is ready for ${firstProcess.toLowerCase()}.`,
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
      "Batch ID": batch.batchId || batch.batchCode || batch.id,
      "Product Name": batch.productName,
      Status: getStatusLabel(batch),
      "Selected Processes": batch.selectedProcesses?.join(", ") || "All",
      "Created At": format(new Date(batch.createdAt), "yyyy-MM-dd HH:mm:ss"),
      Materials: batch.materials.map((m) => `${m.name} (${m.quantity} ${m.unit})`).join(", "),
      "Molding Accepted": batch.processingStages.Molding.accepted,
      "Machining Accepted": batch.processingStages.Machining.accepted,
      "Assembling Accepted": batch.processingStages.Assembling.accepted,
      "Testing Accepted": batch.processingStages.Testing.accepted,
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

  const filteredAndSortedBatches = useMemo(() => {
    const query = searchQuery.toLowerCase()
    const filtered = batches.filter((batch) =>
      (batch.batchId || batch.batchCode || batch.id).toLowerCase().includes(query) ||
      batch.productName.toLowerCase().includes(query) ||
      getStatusLabel(batch).toLowerCase().includes(query) ||
      (batch.selectedProcesses || []).some(process => 
        process.toLowerCase().includes(query)
      )
    )
    
    // Sort alphabetically by product name (fallback to batch id if missing)
    return sortArray(filtered, sortDirection, (batch) => batch.productName || batch.id)
  }, [batches, searchQuery, sortDirection])

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
            <DialogContent className="sm:max-w-[1000px] w-[95vw] max-h-[90vh] overflow-y-auto">
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
      
      <div className="mb-4 flex gap-4 items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by Batch ID, Product, Status, or Process..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <SortControls
          sortDirection={sortDirection}
          onSortChange={setSortDirection}
          label="Sort Batches"
        />
      </div>
      
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
                <TableHead>Wastage</TableHead>
                <TableHead className="text-right w-[60px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAndSortedBatches.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                    No batches found matching your search.
                  </TableCell>
                </TableRow>
              ) : (
                filteredAndSortedBatches.map((batch) => {
                const currentStatus = getStatus(batch)
                return (
                  <TableRow key={batch.id}>
                    <TableCell className="font-mono text-xs">{batch.batchId || batch.batchCode || batch.id}</TableCell>
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
                    <TableCell>
                      <Button variant="outline" size="sm" onClick={() => { setWastageBatch(batch); setIsWastageOpen(true) }}>
                        <Eye className="h-4 w-4 mr-1" /> View
                      </Button>
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
                })
              )}
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

      {/* Wastage Modal */}
      {wastageBatch && (
        <Dialog open={isWastageOpen} onOpenChange={setIsWastageOpen}>
          <DialogContent className="sm:max-w-[700px] max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Wastage — Batch {wastageBatch.id}</DialogTitle>
              <DialogDescription>Process-wise consumption and quality metrics</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              {(wastageBatch.selectedProcesses || []).map((stage) => {
                const stageData = wastageBatch.processingStages[stage]
                const mats = wastageBatch.materials.filter(m => m.stage === stage)
                const mc: Record<string, number> | undefined = (stageData as any)?.materialConsumptions
                const accepted = Number(stageData?.accepted || 0)
                const rejected = Number(stageData?.rejected || 0)
                const stageLabel = stage === "Assembling" ? "Assembly" : stage
                
                return (
                  <div key={stage} className="p-4 border rounded-lg space-y-3">
                    <h4 className="font-semibold">{stageLabel}</h4>
                    
                    {/* Raw Material Consumption & Wastage Table */}
                    {mats.length > 0 && (
                      <div>
                        <h5 className="text-sm font-medium mb-2">Raw Material Consumption & Wastage</h5>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Material</TableHead>
                              <TableHead className="text-right">Raw Material Input</TableHead>
                              <TableHead className="text-right">Actual Consumption</TableHead>
                              <TableHead className="text-right">Wastage</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {mats.map((mat) => {
                              const planned = Number(mat.quantity || 0)
                              let actual = 0
                              
                              if (mc && mc[mat.id]) {
                                actual = Number(mc[mat.id]) || 0
                              } else {
                                // Fallback: distribute actualConsumption proportionally
                                const totalPlanned = mats.reduce((sum, m) => sum + Number(m.quantity || 0), 0)
                                if (totalPlanned > 0) {
                                  const ratio = planned / totalPlanned
                                  actual = (Number(stageData?.actualConsumption) || 0) * ratio
                                }
                              }
                              // Compute Raw Material Input per material: accepted × (BOM qty per piece)
                              // Approximate bomPerPiece using planned quantity divided by batch quantityToBuild
                              const qtyToBuild = Number(wastageBatch.quantityToBuild || 0)
                              const bomPerPiece = qtyToBuild > 0 ? planned / qtyToBuild : 0
                              const rawInput = accepted * bomPerPiece
                              
                              const wastage = Math.max(0, actual - rawInput)
                              
                              return (
                                <TableRow key={mat.id}>
                                  <TableCell className="font-medium">{mat.name}</TableCell>
                                  <TableCell className="text-right">{rawInput.toLocaleString()} {mat.unit}</TableCell>
                                  <TableCell className="text-right">{actual.toLocaleString()} {mat.unit}</TableCell>
                                  <TableCell className="text-right">
                                    <span className={wastage > 0 ? "text-destructive font-medium" : ""}>
                                      {wastage.toLocaleString()} {mat.unit}
                                    </span>
                                  </TableCell>
                                </TableRow>
                              )
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                    
                    {/* Quality Metrics */}
                    <div>
                      <h5 className="text-sm font-medium mb-2">Quality Metrics</h5>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div className="flex justify-between"><span>Accepted Units</span><span className="font-medium">{accepted.toLocaleString()}</span></div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}
