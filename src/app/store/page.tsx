"use client"

import { useState, useEffect } from "react"
import { format } from "date-fns"
import PageHeader from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Package, MoreHorizontal, FileDown } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import type { RawMaterial } from "@/lib/types"
import { useRawMaterials } from "@/hooks/use-raw-materials"
import { useToast } from "@/hooks/use-toast"
import { useActivityLog } from "@/hooks/use-activity-log"
import { usePermissions } from "@/hooks/use-permissions"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import * as XLSX from "xlsx"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { RestockDialog } from "@/components/restock-dialog"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { EditMaterialForm } from "@/components/edit-material-form"

export default function StorePage() {
  // removed regularMaterials (raw materials) from destructure
  const { mouldedMaterials, finishedMaterials, updateRawMaterial, deleteRawMaterial } = useRawMaterials()
  const { createActivityLog } = useActivityLog()
  const { canEdit } = usePermissions()
  const [isClient, setIsClient] = useState(false)
  const [selectedItem, setSelectedItem] = useState<RawMaterial | null>(null)
  const [isRestockOpen, setIsRestockOpen] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const { toast } = useToast()
  
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
      setIsEditOpen(false)
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
      setIsRestockOpen(false)
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to restock material. Please try again.",
        variant: "destructive",
      })
    }
  }

  const handleDelete = async (material: RawMaterial) => {
    try {
      await deleteRawMaterial(material.id)
      await createActivityLogEntry({
        recordId: material.id,
        recordType: "RawMaterial",
        action: "Deleted",
        details: `Material "${material.name}" was deleted from Store.`,
      })
      toast({
        title: "Material Deleted",
        description: `${material.name} has been deleted from Store.`,
      })
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete material. Please try again.",
        variant: "destructive",
      })
    }
  }

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

  if (!isClient) {
    return null
  }

  const renderMaterialsTable = (materials: RawMaterial[], title: string) => (
    <Card>
      <CardContent className="pt-6">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>System ID</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>Quantity</TableHead>
              <TableHead>Created At</TableHead>
              <TableHead className="text-right w-[60px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {materials.length === 0 ? (
              <TableRow>
                {/* adjusted colspan after removing Source Batch column */}
                <TableCell colSpan={6} className="h-24 text-center">
                  <div className="flex flex-col items-center justify-center space-y-2">
                    <Package className="h-8 w-8 text-muted-foreground" />
                    <p className="text-muted-foreground">
                      {title === "Moulded Materials" 
                        ? "No moulded materials in store yet. Complete a moulding batch to see items here."
                        : title === "Finished Materials"
                        ? "No finished materials in store yet. Complete a finishing-only batch to see items here."
                        : "No materials available."}
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              materials.map((material) => (
                <TableRow key={material.id}>
                  <TableCell className="font-mono text-xs">{material.id}</TableCell>
                  <TableCell className="font-medium">{material.name}</TableCell>
                  <TableCell className="font-mono text-xs">{material.sku}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {material.quantity.toLocaleString()} {material.unit}
                    </Badge>
                  </TableCell>
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
                              onClick={() => handleDelete(material)}
                              className="text-destructive"
                            >Delete</DropdownMenuItem>
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
              ))
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
        description="View and manage moulded and finished materials inventory."
      >
        <Button variant="outline" onClick={() => handleExport(mouldedMaterials, "moulded_materials.xlsx")}>
          <FileDown className="mr-2 h-4 w-4" />
          Export Moulded
        </Button>
        <Button variant="outline" onClick={() => handleExport(finishedMaterials, "finished_materials.xlsx")}>
          <FileDown className="mr-2 h-4 w-4" />
          Export Finished
        </Button>
        {/* Raw materials export/button removed */}
      </PageHeader>

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
          {/* Raw Materials tab removed */}
        </TabsList>

        <TabsContent value="moulded">
          {renderMaterialsTable(mouldedMaterials, "Moulded Materials")}
        </TabsContent>

        <TabsContent value="finished">
          {renderMaterialsTable(finishedMaterials, "Machined Materials")}
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
    </>
  )
}
