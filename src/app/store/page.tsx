"use client"

import { useState, useEffect, useMemo } from "react"
import { format } from "date-fns"
import PageHeader from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Package, MoreHorizontal, FileDown, Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import type { RawMaterial, ProcessingStageName, FinalStock } from "@/lib/types"
import { useRawMaterials } from "@/hooks/use-raw-materials"
import { useToast } from "@/hooks/use-toast"
import { useActivityLog } from "@/hooks/use-activity-log"
import { usePermissions } from "@/hooks/use-permissions"
import { useBatches } from "@/hooks/use-batches"
import { ItemDetailsDialog } from "@/components/item-details-dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import * as XLSX from "xlsx"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { RestockDialog } from "@/components/restock-dialog"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { EditMaterialForm } from "@/components/edit-material-form"
import { SortControls, sortArray, type SortDirection } from "@/components/sort-controls"
import { useFinalStock } from "@/hooks/use-final-stock"
import { CreateBatchForm } from "@/components/create-batch-form"

export default function StorePage() {
  // removed regularMaterials (raw materials) from destructure
  const { mouldedMaterials, finishedMaterials, assembledMaterials, updateRawMaterial } = useRawMaterials()
  const { createActivityLog, activityLog } = useActivityLog()
  const { canEdit } = usePermissions()
  const { batches } = useBatches()
  const [isClient, setIsClient] = useState(false)
  const [selectedItem, setSelectedItem] = useState<RawMaterial | null>(null)
  const [isRestockOpen, setIsRestockOpen] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isDetailsOpen, setIsDetailsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [sortDirection, setSortDirection] = useState<SortDirection>("none")
  const { toast } = useToast()
  const { finalStock } = useFinalStock()
  const [isCreateBatchOpen, setIsCreateBatchOpen] = useState(false)
  const [initialBatchProductId, setInitialBatchProductId] = useState<string | null>(null)
  const [initialBatchStage, setInitialBatchStage] = useState<ProcessingStageName | null>(null)
  
  const canEditStore = canEdit("Store")

  useEffect(() => {
    setIsClient(true)
  }, [])

  const createActivityLogEntry = async (log: { recordId: string; recordType: "RawMaterial"; action: "Updated" | "Deleted" | "Stock Adjustment (Manual)"; details: string }) => {
    await createActivityLog({
      ...log,
      timestamp: new Date().toISOString(),
      user: "System",
    })
  }

  const handleMaterialUpdated = async (updatedMaterial: RawMaterial) => {
    try {
      // only consider moulded + finished materials (raw materials removed)
      const allMaterials = [...mouldedMaterials, ...finishedMaterials]
      const oldMaterial = allMaterials.find((m) => m.id === updatedMaterial.id)
      if (!oldMaterial) return

      let details = `Material "${updatedMaterial.name}" was updated.`
      const changes = Object.keys(updatedMaterial)
        .filter((key) => key !== "id")
        .map((key) => {
          const typedKey = key as keyof Omit<RawMaterial, "id">
          if (oldMaterial[typedKey] !== updatedMaterial[typedKey]) {
            return `${key} changed from "${oldMaterial[typedKey]}" to "${updatedMaterial[typedKey]}"`
          }
          return null
        })
        .filter(Boolean)

      if (changes.length > 0) {
        details += ` ${changes.join(", ")}.`
      }

      // Update material (allow quantity 0 for moulded/finished units)
      await updateRawMaterial(updatedMaterial.id, updatedMaterial)
      await createActivityLogEntry({ 
        recordId: updatedMaterial.id, 
        recordType: "RawMaterial", 
        action: "Updated", 
        details 
      })
      toast({ title: "Material Updated", description: `${updatedMaterial.name} has been updated.` })
      setIsEditOpen(false)
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update material. Please try again.",
        variant: "destructive",
      })
    }
  }

  const handleRestock = async (
    material: RawMaterial,
    data: { quantity: number; companyName: string; restockDate: string },
  ) => {
    try {
      const quantity = Number(data.quantity) || 0
      const oldQuantity = Number(material.quantity) || 0
      const newQuantity = oldQuantity + quantity
      const updatedMaterial = { ...material, quantity: newQuantity }

      await updateRawMaterial(material.id, updatedMaterial)

      // Record in central Restocks collection for reporting
      const { addRestockRecord } = await import("@/lib/firebase/firestore-operations")
      await addRestockRecord({
        productId: material.id,
        productName: material.name,
        quantityAdded: quantity,
        companyName: data.companyName,
        restockDate: new Date(data.restockDate + "T00:00:00").toISOString(),
        previousStock: oldQuantity,
        updatedStock: newQuantity,
        createdAt: new Date().toISOString(),
      })

      await createActivityLogEntry({
        recordId: material.id,
        recordType: "RawMaterial",
        action: "Stock Adjustment (Manual)",
        details: `Restocked ${quantity} ${material.unit} from ${data.companyName}. Old quantity: ${oldQuantity}, New quantity: ${newQuantity}.`,
      })
      toast({
        title: "Material Restocked",
        description: `${material.name} has been restocked by ${quantity} ${material.unit}.`,
      })
      setIsRestockOpen(false)
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to restock material. Please try again.",
        variant: "destructive",
      })
    }
  }

  // Deletion of Store items is intentionally disabled to maintain permanent records.
  // Any attempts to delete from this page should be blocked at the UI level.

  const handleExport = (materials: RawMaterial[], filename: string) => {
    const dataToExport = materials.map((material) => ({
      "System ID": material.id,
      Name: material.name,
      SKU: material.sku,
      Quantity: material.quantity,
      Unit: material.unit,
      Threshold: material.threshold,
      "Created At": material.createdAt ? format(new Date(material.createdAt), "yyyy-MM-dd HH:mm:ss") : "N/A",
    }))
    const worksheet = XLSX.utils.json_to_sheet(dataToExport)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, "Materials")
    XLSX.writeFile(workbook, filename)
    toast({
      title: "Exporting Data",
      description: "Your materials data is being downloaded.",
    })
  }

  const filterAndSortMaterials = useMemo(() => {
    return (materials: RawMaterial[]) => {
      const query = searchQuery.toLowerCase()
      const filtered = materials.filter((material) => 
        material.name.toLowerCase().includes(query) ||
        material.sku.toLowerCase().includes(query) ||
        material.id.toLowerCase().includes(query)
      )
      return sortArray(filtered, sortDirection, (material) => material.name)
    }
  }, [searchQuery, sortDirection])

  const getProductForMaterial = (material: RawMaterial, type: "moulded" | "machined" | "assembled"): FinalStock | null => {
    if (!finalStock || finalStock.length === 0) return null

    // 1) Primary: explicit link via mouldedMaterialId / machinedMaterialId
    let product: FinalStock | undefined

    if (type === "moulded") {
      product = finalStock.find((p) => p.mouldedMaterialId === material.id)
    } else if (type === "machined") {
      product = finalStock.find((p) => p.machinedMaterialId === material.id)
    } else {
      product = finalStock.find((p) => p.assembledMaterialId === material.id)
    }

    if (product) return product

    // 2) Fallback: product BOM directly references this raw material
    const viaBom = finalStock.find((p) =>
      Array.isArray(p.bom_per_piece) &&
      p.bom_per_piece.some((row) => row.raw_material_id === material.id)
    )

    if (viaBom) return viaBom

    // 3) Fallback: name-based convention (e.g. "Moulded X" / "Machined X" / "Assembled X")
    const name = material.name || ""
    let baseName = name
    if (type === "moulded") {
      baseName = name.replace(/^Moulded\s+/i, "").trim()
    } else if (type === "machined") {
      baseName = name.replace(/^Machined\s+/i, "").trim()
    } else {
      baseName = name.replace(/^Assembled\s+/i, "").trim()
    }

    if (baseName) {
      const viaName = finalStock.find((p) => p.name === baseName)
      if (viaName) return viaName
    }

    return null
  }

  const getNextStageAfter = (product: FinalStock, baseStage: ProcessingStageName): ProcessingStageName | null => {
    const stages = Array.isArray(product.manufacturingStages) ? product.manufacturingStages : []
    if (stages.length === 0) return null

    const idx = stages.indexOf(baseStage)
    if (idx >= 0 && idx < stages.length - 1) {
      return stages[idx + 1]
    }

    if (idx >= 0) {
      return stages[idx]
    }

    return stages[0]
  }

  const handleCreateBatchFromMaterial = (material: RawMaterial, type: "moulded" | "machined" | "assembled") => {
    const product = getProductForMaterial(material, type)

    if (!product) {
      toast({
        variant: "destructive",
        title: "Linked Product Not Found",
        description: "This store item is not linked to any product. Please check the product setup.",
      })
      return
    }

    const baseStage: ProcessingStageName = type === "moulded" ? "Molding" : type === "machined" ? "Machining" : "Assembling"
    const nextStage = getNextStageAfter(product, baseStage)

    setInitialBatchProductId(product.id)
    setInitialBatchStage(nextStage)
    setIsCreateBatchOpen(true)
  }

  if (!isClient) {
    return null
  }

  const renderMaterialsTable = (materials: RawMaterial[], title: string, type: "moulded" | "machined" | "assembled") => (
    <Card>
      <CardContent className="pt-6">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>System ID</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>Quantity</TableHead>
              <TableHead>Min Threshold</TableHead>
              <TableHead>Created At</TableHead>
              <TableHead className="text-right w-[60px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {materials.length === 0 ? (
              <TableRow>
                {/* adjusted colspan after removing Source Batch column */}
                <TableCell colSpan={7} className="h-24 text-center">
                  <div className="flex flex-col items-center justify-center space-y-2">
                    <Package className="h-8 w-8 text-muted-foreground" />
                    <p className="text-muted-foreground">
                      {title === "Moulded Materials" 
                        ? "No moulded materials in store yet. Complete a moulding batch to see items here."
                        : title === "Machined Materials"
                        ? "No machined materials in store yet. Complete a machining-only batch to see items here."
                        : title === "Assembled Materials"
                        ? "No assembled materials in store yet. Complete an assembling batch to see items here."
                        : "No materials available."}
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              materials.map((material) => {
                const linkedProduct = getProductForMaterial(material, type)
                const productThreshold = type === "moulded"
                  ? linkedProduct?.mouldedThreshold
                  : type === "machined"
                  ? linkedProduct?.machinedThreshold
                  : linkedProduct?.assembledThreshold
                const displayThreshold = (material.threshold && material.threshold > 0)
                  ? material.threshold
                  : (productThreshold ?? 0)
                return (
                  <TableRow key={material.id}>
                    <TableCell className="font-mono text-xs">{material.id}</TableCell>
                    <TableCell className="font-medium">{material.name}</TableCell>
                    <TableCell className="font-mono text-xs">{material.sku}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {material.quantity.toLocaleString()} {material.unit}
                      </Badge>
                    </TableCell>
                    <TableCell>{displayThreshold}</TableCell>
                    <TableCell>
                      {material.createdAt ? format(new Date(material.createdAt), "MM/dd/yyyy HH:mm") : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem onClick={() => {
                            setSelectedItem(material)
                            setIsDetailsOpen(true)
                          }}>View Details</DropdownMenuItem>
                          {canEditStore && (
                            <>
                              <DropdownMenuItem onClick={() => {
                                setSelectedItem(material)
                                setIsEditOpen(true)
                              }}>Edit</DropdownMenuItem>
                              <DropdownMenuItem onClick={() => {
                                setSelectedItem(material)
                                setIsRestockOpen(true)
                              }}>Restock</DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleCreateBatchFromMaterial(material, type)}
                              >
                                Create Batch
                              </DropdownMenuItem>
                              {/* Delete disabled for Store items to keep permanent records */}
                            </>
                          )}
                          {!canEditStore && (
                            <DropdownMenuItem disabled>
                              View Only - No Edit Permission
                            </DropdownMenuItem>
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
  )

  return (
    <>
      <PageHeader
        title="Store"
        description="View and manage moulded, assembled, and finished materials inventory."
      >
        <Button variant="outline" onClick={() => handleExport(mouldedMaterials, "moulded_materials.xlsx")}>
          <FileDown className="mr-2 h-4 w-4" />
          Export Moulded
        </Button>
        <Button variant="outline" onClick={() => handleExport(finishedMaterials, "finished_materials.xlsx")}>
          <FileDown className="mr-2 h-4 w-4" />
          Export Finished
        </Button>
        <Button variant="outline" onClick={() => handleExport(assembledMaterials, "assembled_materials.xlsx")}>
          <FileDown className="mr-2 h-4 w-4" />
          Export Assembled
        </Button>
        {/* Raw materials export/button removed */}
      </PageHeader>

      <div className="mb-4 flex gap-4 items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name, SKU, or System ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <SortControls
          sortDirection={sortDirection}
          onSortChange={setSortDirection}
          label="Sort Materials"
        />
      </div>

      <Tabs defaultValue="moulded" className="space-y-4">
        <TabsList>
          <TabsTrigger value="moulded">
            Moulded Materials
            <Badge variant="secondary" className="ml-2">
              {mouldedMaterials.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="finished">
            Machined Materials
            <Badge variant="secondary" className="ml-2">
              {finishedMaterials.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="assembled">
            Assembled Materials
            <Badge variant="secondary" className="ml-2">
              {assembledMaterials.length}
            </Badge>
          </TabsTrigger>
          {/* Raw Materials tab removed */}
        </TabsList>

        <TabsContent value="moulded">
          {renderMaterialsTable(filterAndSortMaterials(mouldedMaterials), "Moulded Materials", "moulded")}
        </TabsContent>

        <TabsContent value="finished">
          {renderMaterialsTable(filterAndSortMaterials(finishedMaterials), "Machined Materials", "machined")}
        </TabsContent>

        <TabsContent value="assembled">
          {renderMaterialsTable(filterAndSortMaterials(assembledMaterials), "Assembled Materials", "assembled")}
        </TabsContent>

        {/* Raw tab removed entirely */}
      </Tabs>

      {/* Edit Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent>
          {selectedItem && (
            <EditMaterialForm
              material={selectedItem}
              onMaterialUpdated={handleMaterialUpdated}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Restock Dialog */}
      {selectedItem && (
        <RestockDialog
          material={selectedItem}
          isOpen={isRestockOpen}
          onOpenChange={setIsRestockOpen}
          onRestock={handleRestock}
        />
      )}

      {/* Item Details Dialog with Inventory Tracking */}
      {selectedItem && (
        <ItemDetailsDialog
          isOpen={isDetailsOpen}
          onOpenChange={setIsDetailsOpen}
          item={selectedItem}
          itemType="RawMaterial"
          activityLog={activityLog.filter((log) => log.recordId === selectedItem.id)}
          onItemUpdate={handleMaterialUpdated}
          disableDelete={true}
          batches={batches || []}
        />
      )}

      {/* Create Batch Dialog (from Store item) */}
      <Dialog open={isCreateBatchOpen} onOpenChange={setIsCreateBatchOpen}>
        <DialogContent className="sm:max-w-[1000px] w-[95vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create New Batch</DialogTitle>
            <DialogDescription>
              Start a new production batch from this store item.
            </DialogDescription>
          </DialogHeader>
          {initialBatchProductId && (
            <CreateBatchForm
              onBatchCreated={(newBatch) => {
                setIsCreateBatchOpen(false)
                toast({
                  title: "Batch Created",
                  description: `Batch ${newBatch.batchId || newBatch.batchCode || newBatch.id} has been created from store item.`,
                })
              }}
              initialProductId={initialBatchProductId}
              initialStage={initialBatchStage || undefined}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
