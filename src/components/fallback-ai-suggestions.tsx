import React from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { TrendingUp, AlertTriangle, Package, Clock, Target, Settings, Zap } from "lucide-react"

interface FallbackSuggestion {
  icon: React.ReactNode
  title: string
  description: string
  priority: "high" | "medium" | "low"
  category: string
  actionItems?: string[]
  impact: "high" | "medium" | "low"
}

interface FallbackAISuggestionsProps {
  completedBatches: any[]
  wastageData: any[]
  outOfStockMaterials: any[]
}

export function FallbackAISuggestions({ 
  completedBatches, 
  wastageData, 
  outOfStockMaterials 
}: FallbackAISuggestionsProps) {
  
  const generateBasicSuggestions = (): FallbackSuggestion[] => {
    const suggestions: FallbackSuggestion[] = []

    // Critical inventory shortage analysis
    if (outOfStockMaterials.length > 0) {
      const criticalMaterials = outOfStockMaterials.slice(0, 3).map(m => m.name).join(', ')
      suggestions.push({
        icon: <Package className="h-4 w-4" />,
        title: "Urgent: Restock Critical Materials",
        description: `${outOfStockMaterials.length} materials are critically low: ${criticalMaterials}. Immediate restocking required to prevent production shutdown.`,
        priority: "high",
        category: "Inventory",
        impact: "high",
        actionItems: [
          "Contact suppliers immediately for emergency orders",
          "Review safety stock levels for these materials",
          "Implement automated reorder points"
        ]
      })
    }

    // Advanced wastage analysis
    const totalWastage = wastageData.reduce((sum, stage) => sum + stage.rejected, 0)
    if (totalWastage > 0) {
      const highestWastageStage = wastageData.reduce((max, stage) => 
        stage.rejected > max.rejected ? stage : max, { name: "N/A", rejected: 0 }
      )
      const wastageRate = totalWastage > 0 ? Math.round((highestWastageStage.rejected / totalWastage) * 100) : 0
      
      suggestions.push({
        icon: <AlertTriangle className="h-4 w-4" />,
        title: "Quality Control Enhancement",
        description: `${highestWastageStage.name} stage accounts for ${wastageRate}% of total wastage (${highestWastageStage.rejected.toLocaleString()} units). Root cause analysis needed.`,
        priority: totalWastage > 1000 ? "high" : "medium",
        category: "Quality",
        impact: "medium",
        actionItems: [
          "Conduct detailed root cause analysis",
          "Review process parameters and equipment calibration",
          "Implement additional quality checkpoints"
        ]
      })
    }

    // Production efficiency analysis
    if (completedBatches.length > 0) {
      const avgBatchesPerWeek = completedBatches.length / 4
      const totalProduction = completedBatches.reduce((sum, batch) => {
        return sum + Object.values(batch.processingStages || {}).reduce((stageSum: number, stage: any) => {
          return stageSum + (stage?.accepted || 0)
        }, 0)
      }, 0)
      const avgProductionPerBatch = totalProduction / completedBatches.length
      
      if (avgBatchesPerWeek < 5) {
        suggestions.push({
          icon: <TrendingUp className="h-4 w-4" />,
          title: "Scale Production Operations",
          description: `Production rate of ${avgBatchesPerWeek.toFixed(1)} batches/week is below optimal. Average yield: ${avgProductionPerBatch.toFixed(0)} units/batch.`,
          priority: "medium",
          category: "Capacity",
          impact: "high",
          actionItems: [
            "Analyze current bottlenecks in production flow",
            "Consider additional shifts or equipment",
            "Optimize batch scheduling algorithms"
          ]
        })
      }
    }

    // Operational efficiency suggestion
    const efficiencyMetrics = completedBatches.map(batch => {
      const totalAccepted = Object.values(batch.processingStages || {}).reduce((sum: number, stage: any) => sum + (stage?.accepted || 0), 0)
      const totalRejected = Object.values(batch.processingStages || {}).reduce((sum: number, stage: any) => sum + (stage?.rejected || 0), 0)
      return totalAccepted + totalRejected > 0 ? (totalAccepted / (totalAccepted + totalRejected)) * 100 : 0
    })
    const avgEfficiency = efficiencyMetrics.length > 0 ? efficiencyMetrics.reduce((sum, eff) => sum + eff, 0) / efficiencyMetrics.length : 0
    
    if (avgEfficiency < 85 && completedBatches.length > 0) {
      suggestions.push({
        icon: <Target className="h-4 w-4" />,
        title: "Improve Overall Equipment Effectiveness",
        description: `Current production efficiency is ${avgEfficiency.toFixed(1)}%. Target efficiency should be above 85% for optimal operations.`,
        priority: "medium",
        category: "Efficiency",
        impact: "medium",
        actionItems: [
          "Implement predictive maintenance schedules",
          "Train operators on best practices",
          "Review and optimize process parameters"
        ]
      })
    }

    // Smart monitoring suggestion (always show if no other suggestions)
    if (suggestions.length === 0 || suggestions.length < 2) {
      suggestions.push({
        icon: <Zap className="h-4 w-4" />,
        title: "Implement Smart Production Monitoring",
        description: "Establish real-time monitoring systems to track KPIs, automate alerts, and enable data-driven decision making.",
        priority: "low",
        category: "Technology",
        impact: "high",
        actionItems: [
          "Deploy IoT sensors for real-time data collection",
          "Set up automated alert systems for key metrics",
          "Create executive dashboards for strategic insights"
        ]
      })
    }

    return suggestions.slice(0, 3) // Show max 3 suggestions
  }

  const suggestions = generateBasicSuggestions()

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "high": return "bg-red-500"
      case "medium": return "bg-yellow-500"
      case "low": return "bg-blue-500"
      default: return "bg-gray-500"
    }
  }

  const getPriorityVariant = (priority: string) => {
    switch (priority) {
      case "high": return "destructive"
      case "medium": return "secondary"
      case "low": return "outline"
      default: return "outline"
    }
  }
  
  const getImpactColor = (impact: string) => {
    switch (impact) {
      case "high": return "text-green-600"
      case "medium": return "text-yellow-600"
      case "low": return "text-blue-600"
      default: return "text-gray-600"
    }
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {suggestions.map((suggestion, index) => (
        <Card key={index} className="p-4 transition-all hover:shadow-md">
          <CardContent className="p-0">
            <div className="flex items-start gap-3 mb-3">
              <div className={`p-2 rounded-lg ${getPriorityColor(suggestion.priority)}/10`}>
                {suggestion.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="font-semibold text-sm truncate">{suggestion.title}</h4>
                  <Badge 
                    variant={getPriorityVariant(suggestion.priority) as any}
                    className="text-xs"
                  >
                    {suggestion.priority}
                  </Badge>
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="outline" className="text-xs">
                    {suggestion.category}
                  </Badge>
                  <Badge variant="outline" className={`text-xs ${getImpactColor(suggestion.impact)}`}>
                    {suggestion.impact} impact
                  </Badge>
                </div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed mb-3">
              {suggestion.description}
            </p>
            {suggestion.actionItems && (
              <div className="mt-3">
                <p className="text-xs font-medium mb-2">Recommended Actions:</p>
                <ul className="text-xs text-muted-foreground space-y-1">
                  {suggestion.actionItems.map((action, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="text-primary">•</span>
                      <span>{action}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
      
      {suggestions.length === 0 && (
        <Card className="col-span-full p-8 text-center">
          <CardContent className="p-0">
            <TrendingUp className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">
              Complete more production batches to unlock intelligent suggestions.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}