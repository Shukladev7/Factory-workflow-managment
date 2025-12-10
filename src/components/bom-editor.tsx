"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Trash2, PlusCircle } from "lucide-react"
import { useRawMaterials } from "@/hooks/use-raw-materials"
import type { BOMRow, ProcessingStageName } from "@/lib/types"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"

interface BOMEditorProps {
  bomRows: BOMRow[]
  onBOMChange: (rows: BOMRow[]) => void
  readOnly?: boolean
  quantityMultiplier?: number
  productName?: string // Product name to identify moulded/machined units
  selectedStages?: ProcessingStageName[] // Selected manufacturing stages for validation
  unitThresholds?: { moulded?: number; machined?: number; assembled?: number }
  onUnitThresholdsChange?: (t: { moulded?: number; machined?: number; assembled?: number }) => void
}

const processingStages: ProcessingStageName[] = ["Molding", "Machining", "Assembling", "Testing"]

export function BOMEditor({ bomRows, onBOMChange, readOnly = false, quantityMultiplier = 1, productName = "", selectedStages = [], unitThresholds, onUnitThresholdsChange }: BOMEditorProps) {
  const { rawMaterials, regularMaterials, mouldedMaterials, finishedMaterials, assembledMaterials, createRawMaterial } = useRawMaterials()
  const [mouldedUnitRequired, setMouldedUnitRequired] = useState(false)
  const [machinedUnitRequired, setMachinedUnitRequired] = useState(false)
  const [assembledUnitRequired, setAssembledUnitRequired] = useState(false)
  const isProcessingRef = useRef(false)

  // Special identifiers for moulded and machined units
  const MOULDED_UNIT_ID = `__MOULDED_UNIT__`
  const MACHINED_UNIT_ID = `__MACHINED_UNIT__`
  const ASSEMBLED_UNIT_ID = `__ASSEMBLED_UNIT__`

  // Find actual material IDs if they exist in inventory
  const mouldedUnitItem = mouldedMaterials.find(m => m.name === `Moulded ${productName}`)
  const machinedUnitItem = finishedMaterials.find(m => m.name === `Machined ${productName}`)
  const assembledUnitItem = assembledMaterials.find(m => m.name === `Assembled ${productName}`)

  // Derive checkbox states from bomRows without causing re-renders
  const hasMouldedUnit = bomRows.some(
    row => {
      // Check for placeholder ID or actual material ID
      if (row.raw_material_id === MOULDED_UNIT_ID) return true
      if (mouldedUnitItem && row.raw_material_id === mouldedUnitItem.id && row.stage === "Machining") return true
      return false
    }
  )

  // Handle assembled unit checkbox change
  const handleAssembledUnitChange = async (checked: boolean) => {
    if (isProcessingRef.current) return
    setAssembledUnitRequired(checked)

    const existingAssembledRow = bomRows.find(
      row => {
        if (row.raw_material_id === ASSEMBLED_UNIT_ID && row.stage === "Testing") return true
        if (assembledUnitItem && row.raw_material_id === assembledUnitItem.id && row.stage === "Testing") return true
        return false
      }
    )

    if (checked && !existingAssembledRow) {
      isProcessingRef.current = true
      let materialId = assembledUnitItem?.id
      let materialUnit = assembledUnitItem?.unit || "pcs"

      if (!materialId && productName) {
        try {
          materialId = await createRawMaterial({
            name: `Assembled ${productName}`,
            sku: `A-${productName}`,
            quantity: 0,
            unit: materialUnit,
            threshold: unitThresholds?.assembled ?? 0,
            isMoulded: false,
            isFinished: false,
            isAssembled: true,
            createdAt: new Date().toISOString(),
          })
        } catch (error) {
          console.error("[BOMEditor] Failed to create assembled material:", error)
        }
      }

      const newRow: BOMRow = {
        raw_material_id: materialId || ASSEMBLED_UNIT_ID,
        stage: "Testing",
        qty_per_piece: 1,
        unit: materialUnit,
        notes: "Auto-added: Assembled unit",
      }
      onBOMChange([...bomRows, newRow])
      isProcessingRef.current = false
    } else if (!checked && existingAssembledRow) {
      isProcessingRef.current = true
      const updatedRows = bomRows.filter(
        row => {
          if (row.raw_material_id === ASSEMBLED_UNIT_ID && row.stage === "Testing") return false
          if (assembledUnitItem && row.raw_material_id === assembledUnitItem.id && row.stage === "Testing") return false
          return true
        }
      )
      onBOMChange(updatedRows)
      isProcessingRef.current = false
    }
  }

  const hasMachinedUnit = bomRows.some(
    row => {
      // Check for both placeholder and actual material ID
      if (row.raw_material_id === MACHINED_UNIT_ID) return true
      if (machinedUnitItem && row.raw_material_id === machinedUnitItem.id && row.stage === "Assembling") return true
      return false
    }
  )

  const hasAssembledUnit = bomRows.some(
    row => {
      if (row.raw_material_id === ASSEMBLED_UNIT_ID) return true
      if (assembledUnitItem && row.raw_material_id === assembledUnitItem.id && row.stage === "Testing") return true
      return false
    }
  )

  // Keep checkbox state in sync with BOM rows
  useEffect(() => {
    if (hasMouldedUnit !== mouldedUnitRequired) {
      setMouldedUnitRequired(hasMouldedUnit)
    }
    if (hasMachinedUnit !== machinedUnitRequired) {
      setMachinedUnitRequired(hasMachinedUnit)
    }
    if (hasAssembledUnit !== assembledUnitRequired) {
      setAssembledUnitRequired(hasAssembledUnit)
    }
  }, [hasMouldedUnit, hasMachinedUnit, hasAssembledUnit, mouldedUnitRequired, machinedUnitRequired, assembledUnitRequired])

  // Handle moulded unit checkbox change
  const handleMouldedUnitChange = async (checked: boolean) => {
    if (isProcessingRef.current) return
    
    setMouldedUnitRequired(checked)
    
    const existingMouldedRow = bomRows.find(
      row => {
        // Check for both placeholder and actual material ID
        if (row.raw_material_id === MOULDED_UNIT_ID && row.stage === "Machining") return true
        if (mouldedUnitItem && row.raw_material_id === mouldedUnitItem.id && row.stage === "Machining") return true
        return false
      }
    )

    if (checked && !existingMouldedRow) {
      // Ensure a corresponding moulded material exists in Store
      isProcessingRef.current = true
      let materialId = mouldedUnitItem?.id
      let materialUnit = mouldedUnitItem?.unit || "pcs"

      if (!materialId && productName) {
        try {
          materialId = await createRawMaterial({
            name: `Moulded ${productName}`,
            sku: `M-${productName}`,
            quantity: 0,
            unit: materialUnit,
            threshold: unitThresholds?.moulded ?? 0,
            isMoulded: true,
            isFinished: false,
            createdAt: new Date().toISOString(),
          })
        } catch (error) {
          console.error("[BOMEditor] Failed to create moulded material:", error)
        }
      }

      const newRow: BOMRow = {
        raw_material_id: materialId || MOULDED_UNIT_ID,
        stage: "Machining",
        qty_per_piece: 1,
        unit: materialUnit,
        notes: "Auto-added: Moulded unit",
      }
      onBOMChange([...bomRows, newRow])
      isProcessingRef.current = false
    } else if (!checked && existingMouldedRow) {
      // Remove moulded unit row (both placeholder and actual)
      isProcessingRef.current = true
      const updatedRows = bomRows.filter(
        row => {
          if (row.raw_material_id === MOULDED_UNIT_ID && row.stage === "Machining") return false
          if (mouldedUnitItem && row.raw_material_id === mouldedUnitItem.id && row.stage === "Machining") return false
          return true
        }
      )
      onBOMChange(updatedRows)
      isProcessingRef.current = false
    }
  }

  // Handle machined unit checkbox change
  const handleMachinedUnitChange = async (checked: boolean) => {
    if (isProcessingRef.current) return
    
    setMachinedUnitRequired(checked)
    
    const existingMachinedRow = bomRows.find(
      row => {
        // Check for both placeholder and actual material ID
        if (row.raw_material_id === MACHINED_UNIT_ID && row.stage === "Assembling") return true
        if (machinedUnitItem && row.raw_material_id === machinedUnitItem.id && row.stage === "Assembling") return true
        return false
      }
    )

    if (checked && !existingMachinedRow) {
      // Ensure a corresponding finished (machined) material exists in Store
      isProcessingRef.current = true
      let materialId = machinedUnitItem?.id
      let materialUnit = machinedUnitItem?.unit || "pcs"

      if (!materialId && productName) {
        try {
          materialId = await createRawMaterial({
            name: `Machined ${productName}`,
            sku: `F-${productName}`,
            quantity: 0,
            unit: materialUnit,
            threshold: unitThresholds?.machined ?? 0,
            isMoulded: false,
            isFinished: true,
            createdAt: new Date().toISOString(),
          })
        } catch (error) {
          console.error("[BOMEditor] Failed to create finished material:", error)
        }
      }

      const newRow: BOMRow = {
        raw_material_id: materialId || MACHINED_UNIT_ID,
        stage: "Assembling",
        qty_per_piece: 1,
        unit: materialUnit,
        notes: "Auto-added: Machined unit",
      }
      onBOMChange([...bomRows, newRow])
      isProcessingRef.current = false
    } else if (!checked && existingMachinedRow) {
      // Remove machined unit row (both placeholder and actual)
      isProcessingRef.current = true
      const updatedRows = bomRows.filter(
        row => {
          if (row.raw_material_id === MACHINED_UNIT_ID && row.stage === "Assembling") return false
          if (machinedUnitItem && row.raw_material_id === machinedUnitItem.id && row.stage === "Assembling") return false
          return true
        }
      )
      onBOMChange(updatedRows)
      isProcessingRef.current = false
    }
  }

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
    const row = bomRows[index]
    // Prevent deletion of auto-managed rows (moulded/machined units)
    if (isAutoManagedRow(row)) {
      return // Don't allow manual deletion, must use checkbox
    }
    
    const updatedRows = bomRows.filter((_, i) => i !== index)
    onBOMChange(updatedRows)
  }

  // Check if a row is auto-managed (moulded, machined, or assembled unit)
  const isAutoManagedRow = (row: BOMRow): boolean => {
    // Check for placeholder IDs
    if (row.raw_material_id === MOULDED_UNIT_ID || row.raw_material_id === MACHINED_UNIT_ID || row.raw_material_id === ASSEMBLED_UNIT_ID) {
      return true
    }
    // Check for actual material IDs
    if (mouldedUnitItem && row.raw_material_id === mouldedUnitItem.id && row.stage === "Machining") {
      return true
    }
    if (machinedUnitItem && row.raw_material_id === machinedUnitItem.id && row.stage === "Assembling") {
      return true
    }
    if (assembledUnitItem && row.raw_material_id === assembledUnitItem.id && row.stage === "Testing") {
      return true
    }
    return false
  }

  // Filter out moulded and machined items from the dropdown
  const availableMaterials = regularMaterials

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-base font-semibold">Bill of Materials (BOM)</Label>
          <p className="text-sm text-muted-foreground">
            Define materials required {quantityMultiplier > 1 ? `for ${quantityMultiplier} pieces` : "per 1 piece"}
          </p>
          {selectedStages.length === 0 && (
            <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800">
              Please select manufacturing stages first to add BOM entries.
            </div>
          )}
        </div>
        {!readOnly && (
          <Button 
            type="button" 
            variant="outline" 
            size="sm" 
            onClick={addRow}
            disabled={selectedStages.length === 0}
          >
            <PlusCircle className="mr-2 h-4 w-4" />
            Add Raw Material
          </Button>
        )}
      </div>

      {/* Product-level checkboxes for moulded, machined, and assembled units */}
      {!readOnly && productName && (
        <div className="border rounded-lg p-4 bg-muted/50 space-y-3">
          <Label className="text-sm font-semibold">Product-Level Options</Label>
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="moulded-unit"
                checked={mouldedUnitRequired}
                onCheckedChange={(checked) => handleMouldedUnitChange(checked === true)}
              />
              <label
                htmlFor="moulded-unit"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                Moulded unit required
                <span className="text-muted-foreground"> (adds: Moulded {productName} → Machining stage, qty = 1)</span>
              </label>
              <div className="ml-4 flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Min stock</span>
                <Input
                  type="number"
                  className="h-8 w-24"
                  value={unitThresholds?.moulded ?? 0}
                  onChange={(e) => onUnitThresholdsChange?.({
                    moulded: Math.max(0, Number(e.target.value) || 0),
                    machined: unitThresholds?.machined,
                    assembled: unitThresholds?.assembled,
                  })}
                  disabled={readOnly}
                />
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="machined-unit"
                checked={machinedUnitRequired}
                onCheckedChange={(checked) => handleMachinedUnitChange(checked === true)}
              />
              <label
                htmlFor="machined-unit"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                Machined unit required
                <span className="text-muted-foreground"> (adds: Machined {productName} → Assembling stage, qty = 1)</span>
              </label>
              <div className="ml-4 flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Min stock</span>
                <Input
                  type="number"
                  className="h-8 w-24"
                  value={unitThresholds?.machined ?? 0}
                  onChange={(e) => onUnitThresholdsChange?.({
                    moulded: unitThresholds?.moulded,
                    machined: Math.max(0, Number(e.target.value) || 0),
                    assembled: unitThresholds?.assembled,
                  })}
                  disabled={readOnly}
                />
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="assembled-unit"
                checked={assembledUnitRequired}
                onCheckedChange={(checked) => handleAssembledUnitChange(checked === true)}
              />
              <label
                htmlFor="assembled-unit"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                Assembled unit required
                <span className="text-muted-foreground"> (adds: Assembled {productName} → Testing stage, qty = 1)</span>
              </label>
              <div className="ml-4 flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Min stock</span>
                <Input
                  type="number"
                  className="h-8 w-24"
                  value={unitThresholds?.assembled ?? 0}
                  onChange={(e) => onUnitThresholdsChange?.({
                    moulded: unitThresholds?.moulded,
                    machined: unitThresholds?.machined,
                    assembled: Math.max(0, Number(e.target.value) || 0),
                  })}
                  disabled={readOnly}
                />
              </div>
            </div>
          </div>
        </div>
      )}

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
                      disabled={readOnly || isAutoManagedRow(row)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select material" />
                      </SelectTrigger>
                      <SelectContent>
                        {isAutoManagedRow(row) ? (
                          // Show name for auto-managed rows
                          <SelectItem key={row.raw_material_id} value={row.raw_material_id}>
                            {row.raw_material_id === MOULDED_UNIT_ID || (mouldedUnitItem && row.raw_material_id === mouldedUnitItem.id)
                              ? `Moulded ${productName}`
                              : row.raw_material_id === MACHINED_UNIT_ID || (machinedUnitItem && row.raw_material_id === machinedUnitItem.id)
                                ? `Finished ${productName}`
                                : `Assembled ${productName}`}
                          </SelectItem>
                        ) : (
                          // Show only regular raw materials for manual rows
                          availableMaterials.map((mat) => (
                            <SelectItem key={mat.id} value={mat.id}>
                              {mat.name} ({mat.quantity} {mat.unit})
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    {isAutoManagedRow(row) && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Managed by checkbox above
                      </p>
                    )}
                  </div>

                  {/* Stage */}
                  <div>
                    <Label>Stage *</Label>
                    <Select
                      value={row.stage}
                      onValueChange={(value) => updateRow(index, "stage", value)}
                      disabled={readOnly || isAutoManagedRow(row)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {processingStages
                          .filter(stage => selectedStages.length === 0 || selectedStages.includes(stage))
                          .map((stage) => (
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
                      disabled={readOnly || isAutoManagedRow(row)}
                      placeholder="0"
                    />
                  </div>

                  {/* Delete button */}
                  <div className="flex items-end">
                    {!readOnly && !isAutoManagedRow(row) ? (
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
