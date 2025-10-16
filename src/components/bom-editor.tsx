"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Trash2, PlusCircle } from "lucide-react"
import { useRawMaterials } from "@/hooks/use-raw-materials"
import type { BOMRow, ProcessingStageName } from "@/lib/types"
import { Badge } from "@/components/ui/badge"

interface BOMEditorProps {
  bomRows: BOMRow[]
  onBOMChange: (rows: BOMRow[]) => void
  readOnly?: boolean
  quantityMultiplier?: number
}

const processingStages: ProcessingStageName[] = ["Molding", "Machining", "Assembling", "Testing"]

export function BOMEditor({ bomRows, onBOMChange, readOnly = false, quantityMultiplier = 1 }: BOMEditorProps) {
  const { rawMaterials } = useRawMaterials()

  const addRow = () => {
    const newRow: BOMRow = {
      raw_material_id: "",
      stage: "Molding",
      qty_per_piece: 0,
      unit: "pcs",
      notes: "",
    }
    onBOMChange([...bomRows, newRow])
  }

  const updateRow = (index: number, field: keyof BOMRow, value: any) => {
    const updatedRows = [...bomRows]
    updatedRows[index] = { ...updatedRows[index], [field]: value }
    
    // Auto-update unit when material is selected
    if (field === "raw_material_id") {
      const material = rawMaterials.find(m => m.id === value)
      if (material) {
        updatedRows[index].unit = material.unit
      }
    }
    
    onBOMChange(updatedRows)
  }

  const deleteRow = (index: number) => {
    const updatedRows = bomRows.filter((_, i) => i !== index)
    onBOMChange(updatedRows)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-base font-semibold">Bill of Materials (BOM)</Label>
          <p className="text-sm text-muted-foreground">
            Define materials required {quantityMultiplier > 1 ? `for ${quantityMultiplier} pieces` : "per 1 piece"}
          </p>
        </div>
        {!readOnly && (
          <Button type="button" variant="outline" size="sm" onClick={addRow}>
            <PlusCircle className="mr-2 h-4 w-4" />
            Add Material
          </Button>
        )}
      </div>

      {bomRows.length === 0 ? (
        <div className="text-center py-8 border-2 border-dashed rounded-lg">
          <p className="text-muted-foreground">No materials added yet</p>
          {!readOnly && (
            <Button type="button" variant="outline" size="sm" className="mt-2" onClick={addRow}>
              <PlusCircle className="mr-2 h-4 w-4" />
              Add First Material
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {bomRows.map((row, index) => {
            const material = rawMaterials.find(m => m.id === row.raw_material_id)
            const totalQty = row.qty_per_piece * quantityMultiplier

            return (
              <div key={index} className="p-4 border rounded-lg bg-card space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                  {/* Raw Material */}
                  <div className="md:col-span-2">
                    <Label>Raw Material *</Label>
                    <Select
                      value={row.raw_material_id}
                      onValueChange={(value) => updateRow(index, "raw_material_id", value)}
                      disabled={readOnly}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select material" />
                      </SelectTrigger>
                      <SelectContent>
                        {rawMaterials.map((material) => (
                          <SelectItem key={material.id} value={material.id}>
                            {material.name} ({material.quantity} {material.unit})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Stage */}
                  <div>
                    <Label>Stage *</Label>
                    <Select
                      value={row.stage}
                      onValueChange={(value) => updateRow(index, "stage", value)}
                      disabled={readOnly}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {processingStages.map((stage) => (
                          <SelectItem key={stage} value={stage}>
                            {stage}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Quantity per piece */}
                  <div>
                    <Label>Qty/Piece *</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={row.qty_per_piece}
                      onChange={(e) => updateRow(index, "qty_per_piece", parseFloat(e.target.value) || 0)}
                      disabled={readOnly}
                      placeholder="0"
                    />
                  </div>

                  {/* Delete button */}
                  <div className="flex items-end">
                    {!readOnly ? (
                      <Button
                        type="button"
                        variant="destructive"
                        size="icon"
                        onClick={() => deleteRow(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    ) : (
                      <div className="h-10" />
                    )}
                  </div>
                </div>

                {/* Show total calculation if multiplier > 1 */}
                {quantityMultiplier > 1 && (
                  <div className="flex items-center gap-2 text-sm">
                    <Badge variant="secondary">
                      Total Required: {totalQty.toFixed(2)} {row.unit}
                    </Badge>
                    <span className="text-muted-foreground">
                      ({row.qty_per_piece} × {quantityMultiplier})
                    </span>
                  </div>
                )}

                {/* Notes */}
                {!readOnly && (
                  <div>
                    <Label>Notes (Optional)</Label>
                    <Input
                      value={row.notes || ""}
                      onChange={(e) => updateRow(index, "notes", e.target.value)}
                      placeholder="Additional notes..."
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
