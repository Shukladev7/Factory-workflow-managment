"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Trash2, PlusCircle } from "lucide-react"
import { useRawMaterials } from "@/hooks/use-raw-materials"
import { useFinalStock } from "@/hooks/use-final-stock"
import type { BOMRow, ProcessingStageName, FinalStock } from "@/lib/types"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

  const getFinalStockAvailable = (p: FinalStock): number => {
    const batchesQty = (p.batches || []).reduce((sum, b) => sum + Number(b.quantity || 0), 0)
    if ((p.batches && p.batches.length > 0)) {
      return batchesQty
    }
    return Number(p.quantity || 0)
  }

interface BOMEditorProps {
  bomRows: BOMRow[]
  onBOMChange: (rows: BOMRow[]) => void
  readOnly?: boolean
  quantityMultiplier?: number
  productName?: string // Product name to identify moulded/machined units
  selectedStages?: ProcessingStageName[] // Selected manufacturing stages for validation
  unitThresholds?: { moulded?: number; machined?: number; assembled?: number }
  onUnitThresholdsChange?: (t: { moulded?: number; machined?: number; assembled?: number }) => void
  // Optional: render editor scoped to a single stage (filter rows and default new rows to this stage)
  scopeStage?: ProcessingStageName
  // Optional: hide the header section (title/description) for embedded usage
  hideHeader?: boolean
  // Optional: hide the Stage column when scopeStage is provided
  hideStageColumn?: boolean
  // Optional: custom label for Add button
  addButtonLabel?: string
  // Optional: when true, render only the Product-Level Options (no list UI)
  showOnlyProductOptions?: boolean
}

const processingStages: ProcessingStageName[] = ["Molding", "Machining", "Assembling", "Testing"]

export function BOMEditor({ bomRows, onBOMChange, readOnly = false, quantityMultiplier = 1, productName = "", selectedStages = [], unitThresholds, onUnitThresholdsChange, scopeStage, hideHeader = false, hideStageColumn = true, addButtonLabel, showOnlyProductOptions = false }: BOMEditorProps) {
  const { rawMaterials, regularMaterials, mouldedMaterials, finishedMaterials, assembledMaterials } = useRawMaterials()
  const { finalStock } = useFinalStock()
  const [mouldedUnitRequired, setMouldedUnitRequired] = useState(false)
  const [machinedUnitRequired, setMachinedUnitRequired] = useState(false)
  const [assembledUnitRequired, setAssembledUnitRequired] = useState(false)
  const isProcessingRef = useRef(false)
  const [materialSelectorRowIndex, setMaterialSelectorRowIndex] = useState<number | null>(null)
  const [materialSearchQuery, setMaterialSearchQuery] = useState("")

  // Special identifiers for moulded and machined units
  const MOULDED_UNIT_ID = `__MOULDED_UNIT__`
  const MACHINED_UNIT_ID = `__MACHINED_UNIT__`
  const ASSEMBLED_UNIT_ID = `__ASSEMBLED_UNIT__`

  // Find actual material IDs if they exist in inventory
  const mouldedUnitItem = mouldedMaterials.find(m => m.name === `Moulded ${productName}`)
  const machinedUnitItem = finishedMaterials.find(m => m.name === `Machined ${productName}`)
  const assembledUnitItem = assembledMaterials.find(m => m.name === `Assembled ${productName}`)

  // Stage-wise inventory quantities (used to lock disabling when stock exists)
  const mouldedQuantity = mouldedUnitItem?.quantity ?? 0
  const machinedQuantity = machinedUnitItem?.quantity ?? 0
  const assembledQuantity = assembledUnitItem?.quantity ?? 0

  const mouldedStageLocked = mouldedQuantity > 0
  const machinedStageLocked = machinedQuantity > 0
  const assembledStageLocked = assembledQuantity > 0

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
    // Prevent disabling when inventory exists (extra safety in addition to disabled checkbox)
    if (!checked && assembledStageLocked) return
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
    // Prevent disabling when inventory exists (extra safety in addition to disabled checkbox)
    if (!checked && mouldedStageLocked) return
    
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
      isProcessingRef.current = true
      let materialId = mouldedUnitItem?.id
      let materialUnit = mouldedUnitItem?.unit || "pcs"

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
    // Prevent disabling when inventory exists (extra safety in addition to disabled checkbox)
    if (!checked && machinedStageLocked) return
    
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
      isProcessingRef.current = true
      let materialId = machinedUnitItem?.id
      let materialUnit = machinedUnitItem?.unit || "pcs"

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
      stage: scopeStage || "Molding",
      qty_per_piece: 0,
      unit: "pcs",
      notes: "",
      source: "raw",
    }
    onBOMChange([...bomRows, newRow])
  }

  const addFinalRow = () => {
    const newRow: BOMRow = {
      raw_material_id: "",
      stage: scopeStage || "Molding",
      qty_per_piece: 0,
      unit: "pcs",
      notes: "",
      source: "final",
    }
    onBOMChange([...bomRows, newRow])
  }

  const updateRow = (index: number, field: keyof BOMRow, value: any) => {
    const updatedRows = [...bomRows]
    const globalIndex = getGlobalIndex(index)
    updatedRows[globalIndex] = { ...updatedRows[globalIndex], [field]: value }

    // Auto-update unit when material is selected
    if (field === "raw_material_id") {
      const current = updatedRows[globalIndex]
      // Detect if selected ID belongs to Final Stock
      const selectedFinal = finalStock.find(p => p.id === value)
      if (selectedFinal) {
        updatedRows[globalIndex].source = "final"
        // Final stock uses piece units
        updatedRows[globalIndex].unit = "pcs"
      } else {
        const material = rawMaterials.find(m => m.id === value)
        if (material) {
          updatedRows[globalIndex].source = "raw"
          updatedRows[globalIndex].unit = material.unit
        } else {
          // Unknown id: keep previous source and unit unchanged
        }
      }
    }

    onBOMChange(updatedRows)
  }

  const deleteRow = (index: number) => {
    const globalIndex = getGlobalIndex(index)
    const row = bomRows[globalIndex]
    // Prevent deletion of auto-managed rows (moulded/machined units)
    if (isAutoManagedRow(row)) {
      return // Don't allow manual deletion, must use checkbox
    }
    
    const updatedRows = bomRows.filter((_, i) => i !== globalIndex)
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
  const availableFinalStock = finalStock

  // Compute rows to render based on scopeStage
  const rowsToRender = scopeStage ? bomRows.filter(r => r.stage === scopeStage) : bomRows

  const getGlobalIndex = (localIndex: number): number => {
    if (!scopeStage) return localIndex
    const item = rowsToRender[localIndex]
    return bomRows.indexOf(item)
  }

  const canAddRow = scopeStage
    ? selectedStages.includes(scopeStage)
    : selectedStages.length > 0

  return (
    <div className="space-y-4">
      {!hideHeader && (
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-base font-semibold">Bill of Materials (BOM)</Label>
            <p className="text-sm text-muted-foreground">
              Define materials required {quantityMultiplier > 1 ? `for ${quantityMultiplier} pieces` : "per 1 piece"}
            </p>
            {selectedStages.length === 0 && !scopeStage && (
              <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800">
                Please select manufacturing stages first to add BOM entries.
              </div>
            )}
          </div>
          {!readOnly && (
            <div className="flex items-center gap-2">
              <Button 
                type="button" 
                variant="outline" 
                size="sm" 
                onClick={addRow}
                disabled={!canAddRow}
              >
                <PlusCircle className="mr-2 h-4 w-4" />
                {addButtonLabel || "Add Raw Material"}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addFinalRow}
                disabled={!canAddRow}
              >
                <PlusCircle className="mr-2 h-4 w-4" />
                Add Final Stock
              </Button>
            </div>
          )}
        </div>
      )}

      {hideHeader && !showOnlyProductOptions && !readOnly && rowsToRender.length > 0 && (
        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addRow}
            disabled={!canAddRow}
          >
            <PlusCircle className="mr-2 h-4 w-4" />
            {addButtonLabel || "Add Raw Material"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addFinalRow}
            disabled={!canAddRow}
          >
            <PlusCircle className="mr-2 h-4 w-4" />
            Add Final Stock
          </Button>
        </div>
      )}

      {/* Product-level checkboxes for moulded, machined, and assembled units */}
      {!readOnly && productName && !scopeStage && (
        <div className="border rounded-lg p-4 bg-muted/50 space-y-3">
          <Label className="text-sm font-semibold">Product-Level Options</Label>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <Checkbox
                id="moulded-unit"
                checked={mouldedUnitRequired}
                disabled={readOnly || mouldedStageLocked}
                onCheckedChange={(checked) => {
                  if (mouldedStageLocked) return
                  handleMouldedUnitChange(checked === true)
                }}
              />
              <label
                htmlFor="moulded-unit"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed"
              >
                Moulded unit required
                <span className="text-muted-foreground"> (adds: Moulded {productName} → Machining stage, qty = 1)</span>
              </label>
              {mouldedStageLocked && (
                <span className="ml-2 text-xs text-red-600">
                  Cannot disable this stage while stock quantity is greater than 0.
                </span>
              )}
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
            <div className="flex justify-between items-center">
              <Checkbox
                id="machined-unit"
                checked={machinedUnitRequired}
                disabled={readOnly || machinedStageLocked}
                onCheckedChange={(checked) => {
                  if (machinedStageLocked) return
                  handleMachinedUnitChange(checked === true)
                }}
              />
              <label
                htmlFor="machined-unit"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed"
              >
                Machined unit required
                <span className="text-muted-foreground"> (adds: Machined {productName} → Assembling stage, qty = 1)</span>
              </label>
              {machinedStageLocked && (
                <span className="ml-2 text-xs text-red-600">
                  Cannot disable this stage while stock quantity is greater than 0.
                </span>
              )}
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
            <div className="flex justify-between items-center">
              <Checkbox
                id="assembled-unit"
                checked={assembledUnitRequired}
                disabled={readOnly || assembledStageLocked}
                onCheckedChange={(checked) => {
                  if (assembledStageLocked) return
                  handleAssembledUnitChange(checked === true)
                }}
              />
              <label
                htmlFor="assembled-unit"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed"
              >
                Assembled unit required
                <span className="text-muted-foreground"> (adds: Assembled {productName} → Testing stage, qty = 1)</span>
              </label>
              {assembledStageLocked && (
                <span className="ml-2 text-xs text-red-600">
                  Cannot disable this stage while stock quantity is greater than 0.
                </span>
              )}
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

      {!showOnlyProductOptions && (rowsToRender.length === 0 ? (
        <div className="text-center py-8 border-2 border-dashed rounded-lg">
          <p className="text-muted-foreground">No materials added yet</p>
          {!readOnly && (
            <div className="mt-2 flex items-center justify-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={addRow} disabled={!canAddRow}>
                <PlusCircle className="mr-2 h-4 w-4" />
                {addButtonLabel || "Add First Material"}
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={addFinalRow} disabled={!canAddRow}>
                <PlusCircle className="mr-2 h-4 w-4" />
                Add Final Stock
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {rowsToRender.map((row, index) => {
            const material = rawMaterials.find(m => m.id === row.raw_material_id)
            // Infer source as final if the id exists in final stock (covers older BOM rows without 'source')
            const inferredIsFinal = row.source === "final" || availableFinalStock.some(p => p.id === row.raw_material_id)
            const totalQty = row.qty_per_piece * quantityMultiplier

            return (
              <div key={index} className="p-4 border rounded-lg bg-card ">
                <div className={`grid grid-cols-1 ${scopeStage ? "md:grid-cols-4" : "md:grid-cols-5"} gap-3`}>
                  {/* Material selector (raw or final) */}
                  <div className="md:col-span-2">
                    <Label>Material *</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full justify-between"
                      onClick={() => {
                        if (readOnly || isAutoManagedRow(row)) return
                        setMaterialSelectorRowIndex(index)
                      }}
                      disabled={readOnly || isAutoManagedRow(row)}
                    >
                      {(() => {
                        if (!row.raw_material_id) return inferredIsFinal ? "Select Final Stock" : "Select Raw Material"
                        if (inferredIsFinal) {
                          const selectedFinal = availableFinalStock.find(p => p.id === row.raw_material_id)
                          return selectedFinal
                            ? `${selectedFinal.productId || selectedFinal.id} — ${selectedFinal.name} (${selectedFinal.sku})`
                            : row.raw_material_id
                        } else {
                          const selectedRaw = rawMaterials.find(m => m.id === row.raw_material_id)
                          return selectedRaw
                            ? `${selectedRaw.id} — ${selectedRaw.name} (${selectedRaw.sku})`
                            : row.raw_material_id
                        }
                      })()}
                    </Button>
                    <p className="text-xs text-muted-foreground mt-1">
                      {inferredIsFinal ? "Using Final Stock item" : "Using Raw Material"}
                    </p>
                    {!scopeStage && isAutoManagedRow(row) && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Managed by checkbox above
                      </p>
                    )}
                  </div>

                  {/* Stage */}
                  {!scopeStage && (
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
                  )}

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
      ))}

      {/* Material selector dialog with searchable table */}
      {!readOnly && materialSelectorRowIndex !== null && (
        <Dialog
          open={materialSelectorRowIndex !== null}
          onOpenChange={(open) => {
            if (!open) {
              setMaterialSelectorRowIndex(null)
              setMaterialSearchQuery("")
            }
          }}
         
        >
          <DialogContent className="sm:max-w-[900px] overflow-hidden">
            <DialogHeader>
              <DialogTitle>
                {(() => {
                  const localIndex = materialSelectorRowIndex!
                  const row = rowsToRender[localIndex]
                  if (!row) return "Select Material"

                  const isFinal = row.source === "final" || availableFinalStock.some(p => p.id === row.raw_material_id)
                  return isFinal ? "Select Final Stock" : "Select Raw Material"
                })()}
              </DialogTitle>
              <DialogDescription>
                Search by Product ID / System ID, Name, or SKU.
              </DialogDescription>
            </DialogHeader>
            {(() => {
              const localIndex = materialSelectorRowIndex!
              const row = rowsToRender[localIndex]
              if (!row) return null

              const isFinal = row.source === "final" || availableFinalStock.some(p => p.id === row.raw_material_id)
              const candidates = isFinal ? availableFinalStock : availableMaterials

              const query = materialSearchQuery.trim().toLowerCase()
              const filtered = query
                ? candidates.filter((item: any) => {
                    const idPart = isFinal
                      ? ((item as FinalStock).productId || item.id)
                      : item.id
                    const namePart = (item.name || "").toLowerCase()
                    const skuPart = (item.sku || "").toLowerCase()
                    return (
                      idPart.toLowerCase().includes(query) ||
                      namePart.includes(query) ||
                      skuPart.includes(query)
                    )
                  })
                : candidates

              const getDisplayId = (item: any) =>
                isFinal
                  ? ((item as FinalStock).productId || item.id)
                  : item.id

              const handleSelect = (id: string) => {
                updateRow(localIndex, "raw_material_id", id)
                setMaterialSelectorRowIndex(null)
                setMaterialSearchQuery("")
              }

              return (
                <>
                  <div className="mb-3">
                    <Input
                      placeholder="Search by Product ID / System ID, Name, or SKU..."
                      value={materialSearchQuery}
                      onChange={(e) => setMaterialSearchQuery(e.target.value)}
                    />
                  </div>
                  <div className="border rounded-md">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[180px]">Product ID / System ID</TableHead>
                          <TableHead>Name</TableHead>
                          <TableHead>SKU</TableHead>
                          <TableHead className="w-[100px] text-right">Select</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filtered.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={4} className="text-center text-muted-foreground">
                              No materials match your search.
                            </TableCell>
                          </TableRow>
                        ) : (
                          filtered.map((item: any) => (
                            <TableRow key={item.id} className="cursor-pointer" onClick={() => handleSelect(item.id)}>
                              <TableCell className="font-mono text-xs">
                                {getDisplayId(item)}
                              </TableCell>
                              <TableCell>{item.name}</TableCell>
                              <TableCell className="font-mono text-xs">{item.sku}</TableCell>
                              <TableCell className="text-right">
                                <Button
                                  type="button"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleSelect(item.id)
                                  }}
                                >
                                  Select
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )
            })()}
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
