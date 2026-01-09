"use client"
import { useState, useEffect, useMemo } from "react"
import PageHeader from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { RawMaterial, FinalStock } from "@/lib/types"
import { PlusCircle, AlertTriangle, MoreHorizontal, FileDown, XCircle, Upload, Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { useRawMaterials } from "@/hooks/use-raw-materials"
import { useFinalStock } from "@/hooks/use-final-stock"
import { useActivityLog } from "@/hooks/use-activity-log"
import { usePermissions } from "@/hooks/use-permissions"
import { useBatches } from "@/hooks/use-batches"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog"
import { CreateMaterialForm } from "@/components/create-material-form"
import { useToast } from "@/hooks/use-toast"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { ItemDetailsDialog } from "@/components/item-details-dialog"
import { RestockDialog } from "@/components/restock-dialog"
import * as XLSX from "xlsx"
import { CSVImportDialog } from "@/components/csv-import-dialog"
import { LogAction } from "@/lib/types"
import { SortControls, sortArray, type SortDirection } from "@/components/sort-controls"

export default function MaterialsPage() {
  const { regularMaterials, createRawMaterial, updateRawMaterial, deleteRawMaterial } = useRawMaterials()
  const { finalStock, updateFinalStock } = useFinalStock()
  const { activityLog, createActivityLog } = useActivityLog()
  const { canEdit } = usePermissions()
  const { batches } = useBatches()
  const [isCreateFormOpen, setIsCreateFormOpen] = useState(false)
  const [selectedItem, setSelectedItem] = useState<RawMaterial | null>(null)
  const [restockItem, setRestockItem] = useState<RawMaterial | null>(null)
  const [isDetailsOpen, setIsDetailsOpen] = useState(false)
  const [isClient, setIsClient] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [sortDirection, setSortDirection] = useState<SortDirection>("none")
  const [deleteTarget, setDeleteTarget] = useState<RawMaterial | null>(null)
  const [dependentProducts, setDependentProducts] = useState<FinalStock[]>([])
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false)
  const { toast } = useToast()
  
  const canEditMaterials = canEdit("Raw Materials")

  useEffect(() => {
    setIsClient(true)
  }, [])

  const getStatus = (material: RawMaterial) => {
    if (material.quantity <= 0) {
      return (
        <Badge variant="destructive" className="flex items-center gap-1 w-fit">
          <XCircle className="h-3 w-3" /> Out of Stock
        </Badge>
      )
    }
    if (material.quantity < material.threshold) {
      return (
        <Badge variant="destructive" className="flex items-center gap-1 w-fit">
          <AlertTriangle className="h-3 w-3" /> Low Stock
        </Badge>
      )
    }
    return <Badge variant="secondary">In Stock</Badge>
  }

  const createActivityLogEntry = (logData: {
    recordId: string
    recordType: "RawMaterial"
    action: LogAction
    details: string
  }) => {
    return createActivityLog({
      ...logData,
      timestamp: new Date().toISOString(),
      user: "System" // You can replace this with actual user data from your auth system
    })
  }

  const handleMaterialCreated = async (newMaterial: RawMaterial) => {
    try {
      const materialId = await createRawMaterial({
        name: newMaterial.name,
        sku: newMaterial.sku,
        quantity: newMaterial.quantity,
        unit: newMaterial.unit,
        threshold: newMaterial.threshold,
      })
      
      await createActivityLogEntry({
        recordId: materialId,
        recordType: "RawMaterial",
        action: "Created",
        details: `Material "${newMaterial.name}" was created.`,
      })
      
      setIsCreateFormOpen(false)
      toast({
        title: "Material Created",
        description: `Material ${newMaterial.name} has been successfully created.`,
      })
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to create material. Please try again.",
        variant: "destructive",
      })
    }
  }

  const handleMaterialUpdated = async (updatedMaterial: RawMaterial) => {
    try {
      const oldMaterial = regularMaterials.find((m) => m.id === updatedMaterial.id)
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

      // Record in central Restocks collection for reporting (same as Final Stock)
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
      setRestockItem(null)
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to restock material. Please try again.",
        variant: "destructive",
      })
    }
  }

  const handleMaterialDeleted = async (materialId: string) => {
    const materialToDelete = regularMaterials.find((m) => m.id === materialId)
    if (!materialToDelete) return

    // Find all Final Stock items whose BOM contains this raw material
    const affectedProducts = finalStock.filter(
      (product) =>
        Array.isArray(product.bom_per_piece) &&
        product.bom_per_piece!.some((row) => row.raw_material_id === materialId),
    )

    if (affectedProducts.length === 0) {
      // No dependencies - proceed with direct deletion
      try {
        await deleteRawMaterial(materialId)
        await createActivityLogEntry({
          recordId: materialId,
          recordType: "RawMaterial",
          action: "Deleted",
          details: `Material "${materialToDelete.name}" was deleted.`,
        })
        toast({ title: "Material Deleted", description: `${materialToDelete.name} has been deleted.` })
      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to delete material. Please try again.",
          variant: "destructive",
        })
      }
      return
    }

    // Dependencies exist - open confirmation dialog with list of affected Final Stock items
    setDeleteTarget(materialToDelete)
    setDependentProducts(affectedProducts)
    setIsDeleteConfirmOpen(true)
  }

  const handleConfirmDeleteWithDependencies = async () => {
    if (!deleteTarget) {
      setIsDeleteConfirmOpen(false)
      return
    }

    try {
      // Remove this raw material from all BOMs where it is referenced
      const materialId = deleteTarget.id

      await Promise.all(
        dependentProducts.map(async (product) => {
          if (!Array.isArray(product.bom_per_piece)) return
          const cleanedBom = product.bom_per_piece!.filter((row) => row.raw_material_id !== materialId)
          await updateFinalStock(product.id, { bom_per_piece: cleanedBom })
        }),
      )

      await deleteRawMaterial(materialId)

      await createActivityLogEntry({
        recordId: materialId,
        recordType: "RawMaterial",
        action: "Deleted",
        details: `Material "${deleteTarget.name}" was deleted after removing it from the BOM of ${dependentProducts.length} final stock item(s).`,
      })

      toast({
        title: "Material Deleted",
        description: `${deleteTarget.name} has been deleted and removed from all affected BOMs.`,
      })
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete material and update BOMs. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsDeleteConfirmOpen(false)
      setDeleteTarget(null)
      setDependentProducts([])
    }
  }

  const handleViewDetails = (item: RawMaterial) => {
    setSelectedItem(item)
    setIsDetailsOpen(true)
  }

  const handleOpenRestock = (item: RawMaterial) => {
    setRestockItem(item)
  }

  const handleExport = () => {
    const worksheet = XLSX.utils.json_to_sheet(regularMaterials)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, "Raw Materials")
    XLSX.writeFile(workbook, "raw_materials.xlsx")
    toast({
      title: "Exporting Data",
      description: "Your raw materials data is being downloaded.",
    })
  }

  const validateMaterialRow = (row: any, index: number) => {
    const errors: string[] = []

    if (!row.name || row.name.trim() === "") {
      errors.push("Name is required")
    }

    if (!row.sku || row.sku.trim() === "") {
      errors.push("SKU is required")
    }

    if (!row.quantity || isNaN(Number(row.quantity)) || Number(row.quantity) < 0) {
      errors.push("Quantity must be a valid positive number")
    }

    if (!row.unit || row.unit.trim() === "") {
      errors.push("Unit is required")
    }

    if (!row.threshold || isNaN(Number(row.threshold)) || Number(row.threshold) < 0) {
      errors.push("Threshold must be a valid positive number")
    }

    return { isValid: errors.length === 0, errors }
  }

  const transformMaterialRow = (row: any): RawMaterial => {
    return {
      // Placeholder only; actual ID will be assigned by Firestore
      id: "material_000",
      name: row.name.trim(),
      sku: row.sku.trim(),
      quantity: Number(row.quantity),
      unit: row.unit.trim(),
      threshold: Number(row.threshold),
    }
  }

  const handleCSVImport = async (importedMaterials: RawMaterial[]) => {
    try {
      for (const material of importedMaterials) {
        const materialId = await createRawMaterial({
          name: material.name,
          sku: material.sku,
          quantity: material.quantity,
          unit: material.unit,
          threshold: material.threshold,
        })
        await createActivityLogEntry({
          recordId: materialId,
          recordType: "RawMaterial",
          action: "Created",
          details: `Material "${material.name}" was imported from CSV.`,
        })
      }
      toast({
        title: "Import Successful",
        description: `${importedMaterials.length} materials imported successfully.`,
      })
    } catch (error) {
      toast({
        title: "Import Failed",
        description: "Failed to import some materials. Please check the data and try again.",
        variant: "destructive",
      })
    }
  }

  const filteredAndSortedMaterials = useMemo(() => {
    const filtered = regularMaterials.filter((material) => {
      const query = searchQuery.toLowerCase()
      return (
        material.name.toLowerCase().includes(query) ||
        material.sku.toLowerCase().includes(query) ||
        material.id.toLowerCase().includes(query)
      )
    })

    return sortArray(filtered, sortDirection, (material) => material.name)
  }, [regularMaterials, searchQuery, sortDirection])

  if (!isClient) {
    return null
  }

  return (
    <>
      <PageHeader title="Raw Materials" description="Monitor incoming raw materials and current stock levels.">
        {canEditMaterials && (
          <CSVImportDialog
            title="Import Raw Materials from CSV"
            description="Upload a CSV file to import multiple raw materials at once."
            expectedColumns={["name", "sku", "quantity", "unit", "threshold"]}
            onImport={handleCSVImport}
            validateRow={validateMaterialRow}
            transformRow={transformMaterialRow}
          >
            <Button variant="outline">
              <Upload className="mr-2 h-4 w-4" />
              Import CSV
            </Button>
          </CSVImportDialog>
        )}
        <Button variant="outline" onClick={handleExport}>
          <FileDown className="mr-2 h-4 w-4" />
          Export to Excel
        </Button>
        {canEditMaterials && (
          <Dialog open={isCreateFormOpen} onOpenChange={setIsCreateFormOpen}>
            <DialogTrigger asChild>
              <Button>
                <PlusCircle className="mr-2 h-4 w-4" /> Add Material
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px]">
              <DialogHeader>
                <DialogTitle>Add New Raw Material</DialogTitle>
                <DialogDescription>Enter the details for the new raw material.</DialogDescription>
              </DialogHeader>
              <CreateMaterialForm onMaterialCreated={handleMaterialCreated} />
            </DialogContent>
          </Dialog>
        )}
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
      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>System ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Quantity</TableHead>
                <TableHead>Low Stock Threshold</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right w-[60px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAndSortedMaterials.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                    No materials found matching your search.
                  </TableCell>
                </TableRow>
              ) : (
                filteredAndSortedMaterials.map((material: RawMaterial) => (
                  <TableRow key={material.id}>
                    <TableCell className="font-mono text-xs">{material.id}</TableCell>
                    <TableCell className="font-medium">{material.name}</TableCell>
                    <TableCell className="font-mono text-xs">{material.sku}</TableCell>
                    <TableCell>
                      {material.quantity.toLocaleString()} {material.unit}
                    </TableCell>
                    <TableCell>
                      {material.threshold.toLocaleString()} {material.unit}
                    </TableCell>
                    <TableCell>{getStatus(material)}</TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem onClick={() => handleViewDetails(material)}>View Details</DropdownMenuItem>
                          {canEditMaterials && (
                            <DropdownMenuItem onClick={() => handleOpenRestock(material)}>Restock</DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {selectedItem && (
        <ItemDetailsDialog
          isOpen={isDetailsOpen}
          onOpenChange={setIsDetailsOpen}
          item={selectedItem}
          itemType="RawMaterial"
          activityLog={activityLog.filter((log) => log.recordId === selectedItem.id)}
          onItemUpdate={handleMaterialUpdated}
          onItemDelete={handleMaterialDeleted}
          disableDelete={false}
          batches={batches || []}
        />
      )}
      {/* Dependency-aware delete confirmation for Raw Materials */}
      <Dialog open={isDeleteConfirmOpen} onOpenChange={setIsDeleteConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Raw Material</DialogTitle>
            <DialogDescription>
              This raw material is currently used in the Bill of Materials of the following final stock items.
              Deleting it will remove this raw material from their BOM.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm">
              Affected final stock items:
            </p>
            <ul className="list-disc pl-6 space-y-1 max-h-48 overflow-y-auto text-sm">
              {dependentProducts.map((product) => (
                <li key={product.id}>
                  <span className="font-medium">{product.name}</span>
                  <span className="text-xs text-muted-foreground"> (ID: {product.id})</span>
                </li>
              ))}
            </ul>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsDeleteConfirmOpen(false)
                setDeleteTarget(null)
                setDependentProducts([])
              }}
            >
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={handleConfirmDeleteWithDependencies}>
              Confirm Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {restockItem && (
        <RestockDialog
          isOpen={!!restockItem}
          onOpenChange={(isOpen) => !isOpen && setRestockItem(null)}
          material={restockItem}
          onRestock={handleRestock}
        />
      )}
    </>
  )
}