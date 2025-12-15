"use client"

import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { AlertCircle, CheckCircle2 } from "lucide-react"
import type { ProcessingStageName } from "@/lib/types"
import { BOMEditor } from "@/components/bom-editor"

interface ManufacturingStagesSelectorProps {
  selectedStages: ProcessingStageName[]
  onStagesChange: (stages: ProcessingStageName[]) => void
  disabled?: boolean
  // Embed BOM props
  bomRows?: import("@/lib/types").BOMRow[]
  onBOMChange?: (rows: import("@/lib/types").BOMRow[]) => void
  productName?: string
  unitThresholds?: { moulded?: number; machined?: number; assembled?: number }
  onUnitThresholdsChange?: (t: { moulded?: number; machined?: number; assembled?: number }) => void
}

const MANUFACTURING_STAGES: { name: ProcessingStageName; label: string; description: string }[] = [
  {
    name: "Molding",
    label: "Moulding",
    description: "Shape raw materials into desired form"
  },
  {
    name: "Machining", 
    label: "Machining",
    description: "Precision cutting and finishing operations"
  },
  {
    name: "Assembling",
    label: "Assembling", 
    description: "Combine components into final assembly"
  },
  {
    name: "Testing",
    label: "Testing",
    description: "Quality control and validation testing"
  }
]

export function ManufacturingStagesSelector({ 
  selectedStages, 
  onStagesChange, 
  disabled = false,
  bomRows = [],
  onBOMChange,
  productName = "",
  unitThresholds,
  onUnitThresholdsChange,
}: ManufacturingStagesSelectorProps) {
  const handleStageToggle = (stage: ProcessingStageName, checked: boolean) => {
    if (disabled) return

    let newStages: ProcessingStageName[]
    
    if (checked) {
      // Add stage if not already selected
      if (!selectedStages.includes(stage)) {
        newStages = [...selectedStages, stage]
      } else {
        newStages = selectedStages
      }
    } else {
      // Remove stage
      newStages = selectedStages.filter(s => s !== stage)
    }
    
    // Sort stages in the correct order
    const orderedStages = MANUFACTURING_STAGES
      .filter(s => newStages.includes(s.name))
      .map(s => s.name)
    
    onStagesChange(orderedStages)
  }

  const getStageOrder = (stage: ProcessingStageName): number => {
    return MANUFACTURING_STAGES.findIndex(s => s.name === stage) + 1
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-primary" />
          Manufacturing Stages
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Select the manufacturing stages required for this product. BOM entries can only be added for selected stages.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stage Selection - full width rows */}
        <div className="grid grid-cols-1 md:grid-cols-1 gap-4">
          {MANUFACTURING_STAGES.map((stage) => {
            const isSelected = selectedStages.includes(stage.name)
            const stageOrder = isSelected ? getStageOrder(stage.name) : null
            
            return (
              <div
                key={stage.name}
                className={`p-3 rounded-lg border transition-colors ${
                  isSelected 
                    ? "bg-primary/5 border-primary/20" 
                    : "bg-muted/30 border-muted-foreground/20"
                } ${disabled ? "opacity-50" : "hover:bg-muted/50"}`}
              >
                <div className="flex items-start space-x-3">
                  <Checkbox
                    id={stage.name}
                    checked={isSelected}
                    onCheckedChange={(checked) => handleStageToggle(stage.name, checked as boolean)}
                    disabled={disabled}
                    className="mt-1"
                  />
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <Label 
                        htmlFor={stage.name} 
                        className={`font-medium cursor-pointer ${disabled ? "cursor-not-allowed" : ""}`}
                      >
                        {stage.label}
                      </Label>
                      {isSelected && stageOrder && (
                        <Badge variant="secondary" className="text-xs">
                          Step {stageOrder}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {stage.description}
                    </p>
                  </div>
                </div>

                {/* Scoped BOM inside selected process card for production stages */}
                {isSelected && onBOMChange && ["Molding", "Machining", "Assembling"].includes(stage.name) && (
                  <div className="mt-4">
                    <BOMEditor
                      bomRows={bomRows}
                      onBOMChange={onBOMChange}
                      productName={productName}
                      selectedStages={selectedStages}
                      unitThresholds={unitThresholds}
                      onUnitThresholdsChange={onUnitThresholdsChange}
                      scopeStage={stage.name}
                      hideHeader
                      addButtonLabel={`Add Material for ${stage.label}`}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Process Flow Preview */}
        {selectedStages.length > 0 && (
          <div className="mt-6 p-4 bg-muted/30 rounded-lg">
            <div className="flex items-center gap-2 mb-3">
              <AlertCircle className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Process Flow</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {selectedStages.map((stage, index) => (
                <div key={stage} className="flex items-center gap-2">
                  <Badge variant="outline" className="bg-primary/10">
                    {index + 1}. {MANUFACTURING_STAGES.find(s => s.name === stage)?.label}
                  </Badge>
                  {index < selectedStages.length - 1 && (
                    <span className="text-muted-foreground">→</span>
                  )}
                </div>
              ))}
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">→</span>
                <Badge className="bg-green-100 text-green-800 border-green-200">
                  Final Stock
                </Badge>
              </div>
            </div>
          </div>
        )}

        {/* Validation Message */}
        {selectedStages.length === 0 && (
          <div className="flex items-center gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <AlertCircle className="h-4 w-4 text-yellow-600" />
            <span className="text-sm text-yellow-800">
              Please select at least one manufacturing stage to continue.
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
