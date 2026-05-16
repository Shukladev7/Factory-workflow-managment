import React, { useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { TrendingUp, BarChart3, Activity, Info } from "lucide-react"
import { cn } from "@/lib/utils"

export interface HeatmapData {
  productName: string
  stages: {
    Molding: { accepted: number; rejected: number; efficiency: number }
    Machining: { accepted: number; rejected: number; efficiency: number }
    Assembling: { accepted: number; rejected: number; efficiency: number }
    Testing: { accepted: number; rejected: number; efficiency: number }
  }
  totalProduced: number
  overallEfficiency: number
}

interface ProductsStagesHeatmapProps {
  data: HeatmapData[]
  className?: string
}

type MetricType = "efficiency" | "production"
type ColorScheme = "performance" | "production" | "quality"

const stages = ["Molding", "Machining", "Assembling", "Testing"] as const
type Stage = typeof stages[number]

const getColorIntensity = (value: number, max: number, min: number, metricType: MetricType): string => {
  if (max === min || value === 0) return "bg-gray-100"
  
  const normalizedValue = Math.max(0, Math.min(1, (value - min) / (max - min)))
  
  switch (metricType) {
    case "efficiency":
      // Green scale for efficiency (higher is better)
      if (normalizedValue >= 0.8) return "bg-green-500 text-white"
      if (normalizedValue >= 0.6) return "bg-green-400 text-white"
      if (normalizedValue >= 0.4) return "bg-green-300"
      if (normalizedValue >= 0.2) return "bg-green-200"
      return "bg-green-100"
    
    case "production":
      // Blue scale for production volume
      if (normalizedValue >= 0.8) return "bg-blue-500 text-white"
      if (normalizedValue >= 0.6) return "bg-blue-400 text-white"
      if (normalizedValue >= 0.4) return "bg-blue-300"
      if (normalizedValue >= 0.2) return "bg-blue-200"
      return "bg-blue-100"
    
    
    
    default:
      return "bg-gray-100"
  }
}

const formatValue = (value: number, metricType: MetricType): string => {
  switch (metricType) {
    case "efficiency":
      return `${value.toFixed(1)}%`
    case "production":
      return value.toLocaleString()
    default:
      return value.toString()
  }
}

const getMetricValue = (stageData: HeatmapData["stages"][Stage], metricType: MetricType): number => {
  switch (metricType) {
    case "efficiency":
      return stageData.efficiency
    case "production":
      return stageData.accepted
    default:
      return 0
  }
}

export function ProductsStagesHeatmap({ data, className }: ProductsStagesHeatmapProps) {
  const [selectedMetric, setSelectedMetric] = useState<MetricType>("production")
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null)

  // Calculate min and max values for color scaling
  const { minValue, maxValue } = useMemo(() => {
    let min = Infinity
    let max = -Infinity
    
    data.forEach(product => {
      stages.forEach(stage => {
        const value = getMetricValue(product.stages[stage], selectedMetric)
        min = Math.min(min, value)
        max = Math.max(max, value)
      })
    })
    
    return { minValue: min === Infinity ? 0 : min, maxValue: max === -Infinity ? 0 : max }
  }, [data, selectedMetric])

  const metricLabels = {
    efficiency: "Efficiency (%)",
    production: "Production Volume",
  }

  const metricDescriptions = {
    efficiency: "Production efficiency percentage by product and stage",
    production: "Total accepted units produced by product and stage", 
  }

  const sortedData = useMemo(() => {
    return [...data].sort((a, b) => {
      if (selectedMetric === "efficiency") {
        return b.overallEfficiency - a.overallEfficiency
      }
      // Default to production volume
      return b.totalProduced - a.totalProduced
    })
  }, [data, selectedMetric])

  const handleCellClick = (productName: string, stage: Stage) => {
    if (selectedProduct === `${productName}-${stage}`) {
      setSelectedProduct(null)
    } else {
      setSelectedProduct(`${productName}-${stage}`)
    }
  }

  const renderLegend = () => {
    const steps = 5
    const legendItems = []
    
    for (let i = 0; i < steps; i++) {
      const value = minValue + (maxValue - minValue) * (i / (steps - 1))
      const colorClass = getColorIntensity(value, maxValue, minValue, selectedMetric)
      legendItems.push(
        <div key={i} className="flex flex-col items-center gap-1">
          <div className={cn("w-4 h-4 rounded border", colorClass)} />
          <span className="text-xs text-muted-foreground">
            {formatValue(value, selectedMetric)}
          </span>
        </div>
      )
    }
    
    return (
      <div className="flex justify-center gap-2 mt-4 p-3 bg-muted/30 rounded-lg">
        <span className="text-xs text-muted-foreground mr-2">Scale:</span>
        {legendItems}
      </div>
    )
  }

  if (data.length === 0) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center justify-center h-64">
          <div className="text-center">
            <BarChart3 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No production data available for heatmap</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-purple-600" />
              Products × Stages Performance
            </CardTitle>
            <CardDescription>
              {metricDescriptions[selectedMetric]}
            </CardDescription>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-2">
            <Select value={selectedMetric} onValueChange={(value: MetricType) => setSelectedMetric(value)}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="efficiency">Efficiency</SelectItem>
                <SelectItem value="production">Production Volume</SelectItem>
              </SelectContent>
            </Select>
            
            {selectedProduct && (
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setSelectedProduct(null)}
              >
                Clear Selection
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Mobile view - Stacked cards */}
        <div className="block sm:hidden space-y-4">
          {sortedData.map((product) => (
            <div key={product.productName} className="border rounded-lg p-4">
              <h4 className="font-semibold mb-3 flex items-center justify-between">
                {product.productName}
                <Badge variant="outline" className="text-xs">
                  {selectedMetric === "efficiency" 
                    ? `${product.overallEfficiency.toFixed(1)}%` 
                    : `${product.totalProduced.toLocaleString()}`
                  }
                </Badge>
              </h4>
              
              <div className="grid grid-cols-2 gap-2">
                {stages.map((stage) => {
                  const stageData = product.stages[stage]
                  const value = getMetricValue(stageData, selectedMetric)
                  const colorClass = getColorIntensity(value, maxValue, minValue, selectedMetric)
                  const isSelected = selectedProduct === `${product.productName}-${stage}`
                  
                  return (
                    <button
                      key={stage}
                      onClick={() => handleCellClick(product.productName, stage)}
                      className={cn(
                        "p-3 rounded-lg border text-center transition-all hover:scale-105",
                        colorClass,
                        isSelected && "ring-2 ring-primary ring-offset-2"
                      )}
                    >
                      <div className="font-medium text-xs mb-1">{stage}</div>
                      <div className="font-bold text-sm">
                        {formatValue(value, selectedMetric)}
                      </div>
                      {selectedMetric !== "efficiency" && (
                        <div className="text-xs opacity-75">
                          {stageData.efficiency.toFixed(1)}% eff
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Desktop view - Traditional heatmap */}
        <div className="hidden sm:block overflow-x-auto">
          <div className="min-w-full">
            {/* Header */}
            <div className="grid grid-cols-5 gap-2 mb-2">
              <div className="text-sm font-medium text-muted-foreground p-2">
                Product
              </div>
              {stages.map((stage) => (
                <div key={stage} className="text-sm font-medium text-center p-2 bg-muted/30 rounded">
                  {stage}
                </div>
              ))}
            </div>
            
            {/* Heatmap grid */}
            <div className="space-y-2">
              {sortedData.map((product) => (
                <div key={product.productName} className="grid grid-cols-5 gap-2 items-center">
                  {/* Product name */}
                  <div className="text-sm font-medium p-3 bg-background border rounded-lg">
                    <div className="truncate" title={product.productName}>
                      {product.productName}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {selectedMetric === "efficiency" 
                        ? `Overall: ${product.overallEfficiency.toFixed(1)}%`
                        : `Total: ${product.totalProduced.toLocaleString()}`
                      }
                    </div>
                  </div>
                  
                  {/* Stage cells */}
                  {stages.map((stage) => {
                    const stageData = product.stages[stage]
                    const value = getMetricValue(stageData, selectedMetric)
                    const colorClass = getColorIntensity(value, maxValue, minValue, selectedMetric)
                    const isSelected = selectedProduct === `${product.productName}-${stage}`
                    
                    return (
                      <button
                        key={stage}
                        onClick={() => handleCellClick(product.productName, stage)}
                        className={cn(
                          "p-3 rounded-lg border text-center transition-all hover:scale-105 hover:shadow-md",
                          colorClass,
                          isSelected && "ring-2 ring-primary ring-offset-2"
                        )}
                        title={`${product.productName} - ${stage}: ${formatValue(value, selectedMetric)} (${stageData.efficiency.toFixed(1)}% efficiency)`}
                      >
                        <div className="font-bold text-sm">
                          {formatValue(value, selectedMetric)}
                        </div>
                        {selectedMetric !== "efficiency" && (
                          <div className="text-xs opacity-75 mt-1">
                            {stageData.efficiency.toFixed(1)}%
                          </div>
                        )}
                      </button>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Legend */}
        {renderLegend()}
        
        {/* Selected cell details */}
        {selectedProduct && (
          <div className="mt-4 p-4 bg-primary/5 border border-primary/20 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Info className="h-4 w-4 text-primary" />
              <h4 className="font-medium">Selection Details</h4>
            </div>
            {(() => {
              const [productName, stageName] = selectedProduct.split('-')
              const product = data.find(p => p.productName === productName)
              const stage = product?.stages[stageName as Stage]
              
              if (!product || !stage) return null
              
              return (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Product:</span>
                    <div className="font-medium">{productName}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Stage:</span>
                    <div className="font-medium">{stageName}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Accepted:</span>
                    <div className="font-medium text-green-600">
                      {stage.accepted.toLocaleString()} units
                    </div>
                  </div>
                  {/* Rejected removed */}
                  <div className="col-span-2 md:col-span-4">
                    <span className="text-muted-foreground">Efficiency:</span>
                    <div className={cn(
                      "font-medium text-lg",
                      stage.efficiency > 90 ? "text-green-600" : 
                      stage.efficiency > 75 ? "text-yellow-600" : "text-red-600"
                    )}>
                      {stage.efficiency.toFixed(1)}%
                    </div>
                  </div>
                </div>
              )
            })()}
          </div>
        )}
      </CardContent>
    </Card>
  )
}