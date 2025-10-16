"use client"
import { useState, useEffect } from "react"
import PageHeader from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { RawMaterial } from "@/lib/types"
import { PlusCircle, AlertTriangle, MoreHorizontal, FileDown, XCircle, Upload } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { useRawMaterials } from "@/hooks/use-raw-materials"
import { useActivityLog } from "@/hooks/use-activity-log"
import { usePermissions } from "@/hooks/use-permissions"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { CreateMaterialForm } from "@/components/create-material-form"
import { useToast } from "@/hooks/use-toast"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { ItemDetailsDialog } from "@/components/item-details-dialog"
import { RestockDialog } from "@/components/restock-dialog"
import * as XLSX from "xlsx"
import { CSVImportDialog } from "@/components/csv-import-dialog"
import { LogAction } from "@/lib/types"

export default function MaterialsPage() {
  const { rawMaterials, createRawMaterial, updateRawMaterial, deleteRawMaterial } = useRawMaterials()
  const { activityLog, createActivityLog } = useActivityLog()
  const { canEdit } = usePermissions()
  const [isCreateFormOpen, setIsCreateFormOpen] = useState(false)
  const [selectedItem, setSelectedItem] = useState<RawMaterial | null>(null)
  const [restockItem, setRestockItem] = useState<RawMaterial | null>(null)
  const [isDetailsOpen, setIsDetailsOpen] = useState(false)
  const [isClient, setIsClient] = useState(false)
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
      const oldMaterial = rawMaterials.find((m) => m.id === updatedMaterial.id)
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

      // Check if quantity is 0 or below, delete the material instead of updating
      if (updatedMaterial.quantity <= 0) {
        await deleteRawMaterial(updatedMaterial.id)
        await createActivityLogEntry({ 
          recordId: updatedMaterial.id, 
          recordType: "RawMaterial", 
          action: "Deleted", 
          details: `Material "${updatedMaterial.name}" deleted due to quantity reaching 0.`
        })
        toast({ title: "Material Deleted", description: `${updatedMaterial.name} has been deleted (quantity reached 0).` })
      } else {
        await updateRawMaterial(updatedMaterial.id, updatedMaterial)
        await createActivityLogEntry({ 
          recordId: updatedMaterial.id, 
          recordType: "RawMaterial", 
          action: "Updated", 
          details 
        })
        toast({ title: "Material Updated", description: `${updatedMaterial.name} has been updated.` })
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update material. Please try again.",
        variant: "destructive",
      })
    }
  }

  const handleRestock = async (material: RawMaterial, quantity: number) => {
    try {
      const oldQuantity = Number(material.quantity) || 0
      const newQuantity = oldQuantity + Number(quantity)
      const updatedMaterial = { ...material, quantity: newQuantity }

      await updateRawMaterial(material.id, updatedMaterial)
      await createActivityLogEntry({
        recordId: material.id,
        recordType: "RawMaterial",
        action: "Stock Adjustment (Manual)",
        details: `Restocked ${quantity} ${material.unit}. Old quantity: ${oldQuantity}, New quantity: ${newQuantity}.`,
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
    try {
      const materialToDelete = rawMaterials.find((m) => m.id === materialId)
      if (!materialToDelete) return
      
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
  }

  const handleViewDetails = (item: RawMaterial) => {
    setSelectedItem(item)
    setIsDetailsOpen(true)
  }

  const handleOpenRestock = (item: RawMaterial) => {
    setRestockItem(item)
  }

  const handleExport = () => {
    const worksheet = XLSX.utils.json_to_sheet(rawMaterials)
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
      id: `mat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
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
              {rawMaterials.map((material) => (
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
              ))}
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
        />
      )}
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