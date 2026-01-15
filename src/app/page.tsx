"use client"

import { useEffect, useState, useMemo } from "react"
import { useBatches } from "@/hooks/use-batches"
import { useRawMaterials } from "@/hooks/use-raw-materials"
import PageHeader from "@/components/page-header"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell, ResponsiveContainer, ReferenceLine } from "recharts"
import { ChartContainer, ChartTooltipContent } from "@/components/ui/chart"
import type { ProductionSuggestion } from "@/ai/flows/get-production-suggestions"
import { getProductionSuggestions } from "@/ai/flows/get-production-suggestions"
import { AlertCircle, Lightbulb, Factory, PackageCheck, Hammer, TestTube, Filter, TrendingUp, Clock, Target, AlertTriangle, Zap, MessageSquare } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { SuggestionChart } from "@/components/suggestion-chart"
import { Chatbot } from "@/components/chatbot"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { formatMsToHMS } from "@/lib/utils"
import { KPICard, KPIGrid } from "@/components/ui/kpi-card"
import { TruncatedId } from "@/components/ui/data-table"
import { MotivationalQuote } from "@/components/motivational-quote"
import { ProductsStagesHeatmap, type HeatmapData } from "@/components/products-stages-heatmap"
import { FallbackAISuggestions } from "@/components/fallback-ai-suggestions"

export default function DashboardPage() {
  const { batches } = useBatches()
  const { rawMaterials } = useRawMaterials()
  const [suggestions, setSuggestions] = useState<ProductionSuggestion[]>([])
  const [loadingSuggestions, setLoadingSuggestions] = useState(true)
  const [suggestionsError, setSuggestionsError] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)
  const [isClient, setIsClient] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<string>("All")
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null)
  const [isSmallScreen, setIsSmallScreen] = useState(false)

  useEffect(() => {
    setIsClient(true)
  }, [])

  useEffect(() => {
    if (!isClient) return
    if (selectedBatchId) return
    const firstCompleted = batches.find((b) => b.status === "Completed")
    const fallback = batches[0]
    if (firstCompleted?.id) setSelectedBatchId(firstCompleted.id)
    else if (fallback?.id) setSelectedBatchId(fallback.id)
  }, [isClient, batches, selectedBatchId])

  useEffect(() => {
    const onResize = () => setIsSmallScreen(window.innerWidth < 640)
    onResize()
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])

  const completedBatches = useMemo(() => batches.filter((b) => b.status === "Completed"), [batches])

  // Load AI suggestions
  useEffect(() => {
    async function loadSuggestions() {
      if (!isClient) {
        setLoadingSuggestions(false)
        return
      }

      // Only try AI suggestions if we have sufficient data
      if (completedBatches.length > 0 && rawMaterials.length > 0) {
        try {
          setLoadingSuggestions(true)
          setSuggestionsError(null)
          setRetryCount(0)
          const result = await getProductionSuggestions({
            batches: completedBatches.slice(-10), // Last 10 completed batches for performance
            rawMaterials: rawMaterials
          })
          setSuggestions(result.suggestions)
        } catch (error) {
          console.error("Failed to load AI suggestions:", error)
          setSuggestionsError("Failed to generate AI insights. Using fallback suggestions.")
          setSuggestions([])
        }
      } else {
        // Use fallback when insufficient data
        setSuggestions([])
        setSuggestionsError(null)
      }
      setLoadingSuggestions(false)
    }

    loadSuggestions()
  }, [isClient, completedBatches, rawMaterials])
  
  const retryAISuggestions = async () => {
    if (retryCount >= 2) return; // Max 2 retries
    
    setRetryCount(prev => prev + 1)
    setLoadingSuggestions(true)
    setSuggestionsError(null)
    
    try {
      const result = await getProductionSuggestions({
        batches: completedBatches.slice(-10),
        rawMaterials: rawMaterials
      })
      setSuggestions(result.suggestions)
      setRetryCount(0)
    } catch (error) {
      console.error("Retry failed:", error)
      setSuggestionsError("Failed to generate AI insights. Using fallback suggestions.")
    } finally {
      setLoadingSuggestions(false)
    }
  }
  const inProgressBatches = useMemo(() => batches.filter((b) => b.status === "In Progress"), [batches])
  const pendingBatches = useMemo(() => batches.filter((b) => b.status === "Pending" || b.status === "Created"), [batches])

  // Calculate overall metrics
  const totalProduction = useMemo(() => {
    return completedBatches.reduce((sum, batch) => {
      const accepted = Object.values(batch.processingStages || {}).reduce((stageSum, stage: any) => {
        const stageValue = Number(stage?.accepted) || 0
        return stageSum + (isNaN(stageValue) ? 0 : stageValue)
      }, 0)
      return sum + accepted
    }, 0)
  }, [completedBatches])

  const totalWastage = useMemo(() => 0, [])

  const averageEfficiency = useMemo(() => {
    if (Number(totalProduction) > 0) return 100
    return 0
  }, [totalProduction])

  const stageCounts = useMemo(() => {
    type StageName = "Molding" | "Machining" | "Assembling" | "Testing"
    const counts: Record<StageName, number> = { Molding: 0, Machining: 0, Assembling: 0, Testing: 0 }

    for (const b of batches) {
      // Exclude fully completed batches from "currently in stage"
      if (b.status === "Completed") continue

      const processes = b.selectedProcesses || []
      // Find the latest stage that has started but not completed
      let currentStage: StageName | null = null
      for (let i = processes.length - 1; i >= 0; i--) {
        const st = processes[i] as StageName
        const s = b.processingStages?.[st]
        if (s?.startedAt && !s?.completed) {
          currentStage = st
          break
        }
      }

      if (currentStage) {
        counts[currentStage]++
      }
    }

    return counts
  }, [batches])

  const wastageData = useMemo(() => {
    const wastageByStage = completedBatches.reduce(
      (acc, batch) => {
        if (batch.processingStages) {
          Object.entries(batch.processingStages).forEach(([stage, data]) => {
            if (!acc[stage]) {
              acc[stage] = 0
            }
            const rejectedValue = Number(data?.rejected) || 0
            acc[stage] += isNaN(rejectedValue) ? 0 : rejectedValue
          })
        }
        return acc
      },
      {} as Record<string, number>,
    )

    return Object.entries(wastageByStage)
      .map(([name, value]) => ({ 
        name, 
        rejected: isNaN(value) ? 0 : Math.round(value) 
      }))
      .filter(item => item.rejected > 0) // Only show stages with actual wastage
  }, [completedBatches])

  const cycleTimeData = useMemo(() => {
    const cycleTimes: Record<string, { totalDays: number; count: number }> = {}
    completedBatches.forEach((batch) => {
      const createdAt = new Date(batch.createdAt)
      // This is a simplification. A more robust solution would timestamp each stage completion.
      const lastStageCompletionDate = new Date() // Simulate completion date as now for demo
      const cycleDays = (lastStageCompletionDate.getTime() - createdAt.getTime()) / (1000 * 3600 * 24)

      if (!cycleTimes[batch.productName]) {
        cycleTimes[batch.productName] = { totalDays: 0, count: 0 }
      }
      cycleTimes[batch.productName].totalDays += cycleDays
      cycleTimes[batch.productName].count++
    })

    return Object.entries(cycleTimes).map(([name, data]) => ({
      name,
      avgCycleTime: Number.parseFloat((data.totalDays / data.count).toFixed(1)),
    }))
  }, [completedBatches])

  // Helper function to format batch ID for display
  const formatBatchId = (batch: { id: string; batchId?: string; batchCode?: string }) => {
    const value = batch.batchId || batch.batchCode || batch.id
    return value.length > 12 ? `${value.slice(0, 8)}...${value.slice(-4)}` : value
  }

  // Product-based production data aggregation
  const productStageProductionData = useMemo(() => {
    const filteredBatches = completedBatches.filter(
      (batch) => selectedProduct === "All" || batch.productName === selectedProduct
    )

    // Group batches by product and aggregate production data
    const productAggregation = filteredBatches.reduce((acc, batch) => {
      const productName = batch.productName
      
      if (!acc[productName]) {
        acc[productName] = {
          productName,
          batchCount: 0,
          Molding: 0,
          Machining: 0,
          Assembling: 0,
          Testing: 0,
          totalRejected: 0,
          efficiency: 0,
        }
      }

      const moldingAccepted = Math.max(0, Number(batch.processingStages?.Molding?.accepted) || 0)
      const machiningAccepted = Math.max(0, Number(batch.processingStages?.Machining?.accepted) || 0)
      const assemblingAccepted = Math.max(0, Number(batch.processingStages?.Assembling?.accepted) || 0)
      const testingAccepted = Math.max(0, Number(batch.processingStages?.Testing?.accepted) || 0)

      const moldingRejected = 0
      const machiningRejected = 0
      const assemblingRejected = 0
      const testingRejected = 0

      acc[productName].batchCount += 1
      acc[productName].Molding += moldingAccepted
      acc[productName].Machining += machiningAccepted
      acc[productName].Assembling += assemblingAccepted
      acc[productName].Testing += testingAccepted
      acc[productName].totalRejected += moldingRejected + machiningRejected + assemblingRejected + testingRejected

      return acc
    }, {} as Record<string, {
      productName: string
      batchCount: number
      Molding: number
      Machining: number
      Assembling: number
      Testing: number
      totalRejected: number
      efficiency: number
    }>)

    // Convert to array and calculate totals and efficiency
    return Object.values(productAggregation)
      .map((product) => {
        const totalAccepted = product.Molding + product.Machining + product.Assembling + product.Testing
        const totalProduced = totalAccepted + product.totalRejected
        
        const efficiency = totalProduced > 0 ? (totalAccepted / totalProduced) * 100 : 0
        const avgPerBatch = product.batchCount > 0 ? totalAccepted / product.batchCount : 0
        
        return {
          ...product,
          total: totalAccepted,
          efficiency: isNaN(efficiency) ? 0 : Math.round(efficiency * 10) / 10,
          avgPerBatch: isNaN(avgPerBatch) ? 0 : Math.round(avgPerBatch * 10) / 10,
        }
      })
      .sort((a, b) => b.total - a.total) // Sort by total production descending
  }, [completedBatches, selectedProduct])

  const uniqueProducts = useMemo(() => {
    const products = Array.from(new Set(batches.map((batch) => batch.productName)))
    return ["All", ...products]
  }, [batches])

  // Heatmap data transformation
  const heatmapData = useMemo((): HeatmapData[] => {
    const productMap = new Map<string, {
      stages: {
        Molding: { accepted: number; rejected: number }
        Machining: { accepted: number; rejected: number }
        Assembling: { accepted: number; rejected: number }
        Testing: { accepted: number; rejected: number }
      }
      totalProduced: number
      totalRejected: number
    }>()

    // Aggregate data by product
    completedBatches.forEach(batch => {
      const productName = batch.productName
      if (!productMap.has(productName)) {
        productMap.set(productName, {
          stages: {
            Molding: { accepted: 0, rejected: 0 },
            Machining: { accepted: 0, rejected: 0 },
            Assembling: { accepted: 0, rejected: 0 },
            Testing: { accepted: 0, rejected: 0 }
          },
          totalProduced: 0,
          totalRejected: 0
        })
      }

      const product = productMap.get(productName)!
      
      // Aggregate stage data
      Object.entries(batch.processingStages || {}).forEach(([stageName, stageData]: [string, any]) => {
        if (stageName in product.stages) {
          const stage = stageName as keyof typeof product.stages
          const accepted = Math.max(0, Number(stageData?.accepted) || 0)
          const rejected = Math.max(0, Number(stageData?.rejected) || 0)
          
          product.stages[stage].accepted += accepted
          product.stages[stage].rejected += rejected
          product.totalProduced += accepted
          product.totalRejected += rejected
        }
      })
    })

    // Convert to heatmap format with efficiency calculations
    return Array.from(productMap.entries()).map(([productName, productData]) => {
      const stages = {
        Molding: {
          ...productData.stages.Molding,
          rejected: 0,
          efficiency: productData.stages.Molding.accepted > 0 ? 100 : 0
        },
        Machining: {
          ...productData.stages.Machining,
          rejected: 0,
          efficiency: productData.stages.Machining.accepted > 0 ? 100 : 0
        },
        Assembling: {
          ...productData.stages.Assembling,
          rejected: 0,
          efficiency: productData.stages.Assembling.accepted > 0 ? 100 : 0
        },
        Testing: {
          ...productData.stages.Testing,
          rejected: 0,
          efficiency: productData.stages.Testing.accepted > 0 ? 100 : 0
        }
      }

      const overallEfficiency = productData.totalProduced > 0 ? 100 : 0

      return {
        productName,
        stages,
        totalProduced: productData.totalProduced,
        overallEfficiency
      }
    }).filter(product => product.totalProduced > 0) // Only include products with production data
  }, [completedBatches])

  const outOfStockMaterials = useMemo(() => rawMaterials.filter((m) => m.quantity <= 0), [rawMaterials])

  const selectedBatch = useMemo(
    () => (selectedBatchId ? batches.find((b) => b.id === selectedBatchId) : undefined),
    [batches, selectedBatchId],
  )


  const stageOrder = ["Molding", "Machining", "Assembling", "Testing"] as const
  const stageColors = {
    Molding: "#8884d8",
    Machining: "#82ca9d",
    Assembling: "#ffc658",
    Testing: "#ff8042",
  } as const

  const stageDurationsData = useMemo(() => {
    if (!selectedBatch?.processingStages) return []
    return stageOrder.map((stage) => {
      const s = (selectedBatch.processingStages as any)[stage] as
        | { startedAt?: string; finishedAt?: string }
        | undefined
      const ms = s?.startedAt && s?.finishedAt ? Math.max(0, Date.parse(s.finishedAt) - Date.parse(s.startedAt)) : 0
      return {
        stage,
        hours: Number((ms / 3600000).toFixed(2)),
        label: formatMsToHMS(ms),
        color: (stageColors as any)[stage],
      }
    })
  }, [selectedBatch])

  const ProductTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload
      return (
        <div className="bg-background border rounded-lg p-3 shadow-lg min-w-[250px]">
          <div className="mb-2">
            <p className="font-bold text-base">{data.productName}</p>
            <p className="text-sm text-muted-foreground">{data.batchCount} completed batches</p>
          </div>
          
          <div className="space-y-1 mb-3">
            {payload.map((entry: any, index: number) => (
              <div key={index} className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }} />
                  <span className="text-sm">{entry.dataKey}:</span>
                </div>
                <span className="font-medium">{Number(entry.value).toLocaleString()} units</span>
              </div>
            ))}
          </div>
          
          <div className="space-y-1 pt-2 border-t">
            <div className="flex justify-between font-semibold">
              <span>Total Accepted:</span>
              <span>{Number(data.total).toLocaleString()} units</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Efficiency:</span>
              <span className={data.efficiency > 90 ? "text-green-600" : data.efficiency > 75 ? "text-yellow-600" : "text-red-600"}>
                {data.efficiency.toFixed(1)}%
              </span>
            </div>
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Avg per Batch:</span>
              <span>{Number(data.avgPerBatch).toLocaleString()} units</span>
            </div>
          </div>
        </div>
      )
    }
    return null
  }

  const DurationTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const p = payload[0]?.payload
      if (!p) return null
      return (
        <div className="bg-background border rounded-lg p-3 shadow-lg">
          <div className="font-semibold">{p.stage}</div>
          <div className="text-sm text-muted-foreground">Time Taken</div>
          <div className="mt-1 flex items-center justify-between gap-6">
            <span className="text-xs text-muted-foreground">Hours</span>
            <span className="font-medium">{p.hours} h</span>
          </div>
          <div className="mt-1 flex items-center justify-between gap-6">
            <span className="text-xs text-muted-foreground">HH:MM:SS</span>
            <span className="font-mono">{p.label}</span>
          </div>
        </div>
      )
    }
    return null
  }

  if (!isClient) {
    return (
      <>
        <PageHeader title="Dashboard" description="Insights into your production performance." />
        <div className="space-y-6">
          <Skeleton className="h-48 w-full" />
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            <Skeleton className="h-48" />
            <Skeleton className="h-48" />
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            <Skeleton className="h-80" />
            <Skeleton className="h-80" />
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <PageHeader title="Dashboard" description="Real-time insights into your production performance and operational metrics." />

      <div className="space-y-8">
        {/* AI Suggestions - Prominent placement */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-blue-600" />
              StockPilot AI
            </CardTitle>
            <CardDescription>
              Ask questions about your production data and get intelligent insights from your AI assistant
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Chatbot />
          </CardContent>
        </Card>
        <Card className="border-2 border-primary/20 bg-gradient-to-r from-primary/5 to-transparent">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-primary/10">
                <Zap className="h-5 w-5 text-primary" />
              </div>
              AI-Powered Insights & Recommendations
            </CardTitle>
            <CardDescription>
              Smart recommendations based on your production data to optimize efficiency and reduce waste.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingSuggestions ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full"></div>
                  Generating AI insights...
                </div>
                <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
                  <Skeleton className="h-32 w-full" />
                  <Skeleton className="h-32 w-full" />
                  <Skeleton className="h-32 w-full" />
                </div>
              </div>
            ) : suggestionsError ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between text-sm text-amber-600 bg-amber-50 p-3 rounded-lg border border-amber-200">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    {suggestionsError}
                  </div>
                  {retryCount < 2 && (
                    <button 
                      onClick={retryAISuggestions}
                      className="text-xs px-2 py-1 bg-amber-100 hover:bg-amber-200 border border-amber-300 rounded transition-colors"
                      disabled={loadingSuggestions}
                    >
                      {loadingSuggestions ? 'Retrying...' : 'Retry AI'}
                    </button>
                  )}
                </div>
                <FallbackAISuggestions 
                  completedBatches={completedBatches}
                  wastageData={wastageData}
                  outOfStockMaterials={outOfStockMaterials}
                />
              </div>
            ) : suggestions.length > 0 ? (
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
                  {suggestions.slice(0, 3).map((suggestion, index) => (
                    <div key={index} className="flex flex-col p-4 bg-background/50 rounded-lg border min-h-0">
                      <h4 className="font-semibold text-sm mb-2 line-clamp-2 break-words">{suggestion.suggestion}</h4>
                      <p className="text-xs text-muted-foreground mb-3 line-clamp-3 break-words flex-grow">{suggestion.reasoning}</p>
                      <div className="h-20 w-full flex-shrink-0 overflow-hidden">
                        <SuggestionChart title="" data={suggestion.chart.data} />
                      </div>
                    </div>
                  ))}
                </div>
                {suggestions.length > 3 && (
                  <Accordion type="single" collapsible className="mt-4">
                    <AccordionItem value="more-suggestions">
                      <AccordionTrigger className="text-sm">
                        View {suggestions.length - 3} more suggestions
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
                          {suggestions.slice(3).map((suggestion, index) => (
                            <div key={index + 3} className="flex flex-col p-4 bg-background/50 rounded-lg border min-h-0">
                              <h4 className="font-semibold text-sm mb-2 line-clamp-2 break-words">{suggestion.suggestion}</h4>
                              <p className="text-xs text-muted-foreground mb-3 line-clamp-3 break-words flex-grow">{suggestion.reasoning}</p>
                              <div className="h-20 w-full flex-shrink-0 overflow-hidden">
                                <SuggestionChart title="" data={suggestion.chart.data} />
                              </div>
                            </div>
                          ))}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                )}
              </div>
            ) : (
              <FallbackAISuggestions 
                completedBatches={completedBatches}
                wastageData={wastageData}
                outOfStockMaterials={outOfStockMaterials}
              />
            )}
          </CardContent>
        </Card>

        {/* Key Performance Indicators */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold tracking-tight">Key Performance Indicators</h2>
          <KPIGrid>
            <KPICard
              title="Total Production"
              value={totalProduction}
              icon={Factory}
              description="Total accepted units across all completed batches"
              format="number"
              status={totalProduction > 1000 ? "success" : "neutral"}
              trend={{
                value: 12.5,
                label: "from last month",
                direction: "up",
              }}
            />
            <KPICard
              title="Production Efficiency"
              value={averageEfficiency}
              icon={Target}
              description="Percentage of accepted vs total produced units"
              format="percentage"
              status={averageEfficiency > 90 ? "success" : averageEfficiency > 75 ? "warning" : "error"}
              priority={averageEfficiency < 75 ? "high" : "medium"}
              trend={{
                value: 3.2,
                label: "efficiency gain",
                direction: "up",
              }}
            />
            <KPICard
              title="Active Batches"
              value={inProgressBatches.length + pendingBatches.length}
              icon={Clock}
              description={`${inProgressBatches.length} in progress, ${pendingBatches.length} pending`}
              status={inProgressBatches.length > 10 ? "warning" : "neutral"}
            />
            <KPICard
              title="Material Alerts"
              value={outOfStockMaterials.length}
              icon={AlertTriangle}
              description="Raw materials requiring immediate attention"
              status={outOfStockMaterials.length > 0 ? "error" : "success"}
              priority={outOfStockMaterials.length > 0 ? "high" : "low"}
            />
          </KPIGrid>
        </div>

        {/* Current Production Status */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold tracking-tight">Production Pipeline Status</h2>
          <KPIGrid>
            <KPICard
              title="Molding Stage"
              value={stageCounts.Molding}
              icon={Factory}
              description="Batches currently in molding"
              status={stageCounts.Molding > 0 ? "success" : "neutral"}
            />
            <KPICard
              title="Machining Stage"
              value={stageCounts.Machining}
              icon={Hammer}
              description="Batches currently in machining"
              status={stageCounts.Machining > 0 ? "success" : "neutral"}
            />
            <KPICard
              title="Assembly Stage"
              value={stageCounts.Assembling}
              icon={PackageCheck}
              description="Batches currently in assembly"
              status={stageCounts.Assembling > 0 ? "success" : "neutral"}
            />
            <KPICard
              title="Testing Stage"
              value={stageCounts.Testing}
              icon={TestTube}
              description="Batches currently in testing"
              status={stageCounts.Testing > 0 ? "success" : "neutral"}
            />
          </KPIGrid>
        </div>


        {/* Critical Alerts */}
        {outOfStockMaterials.length > 0 && (
          <Card className="border-red-200 bg-red-50/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-red-800">
                <AlertCircle className="h-5 w-5" /> 
                Critical Material Shortage Alert
              </CardTitle>
              <CardDescription className="text-red-700">
                {outOfStockMaterials.length} material{outOfStockMaterials.length > 1 ? 's' : ''} require immediate restocking
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {outOfStockMaterials.map((item) => (
                  <div key={item.id} className="flex items-center justify-between p-3 bg-background rounded-lg border">
                    <span className="font-medium">{item.name}</span>
                    <TruncatedId id={item.sku} maxLength={8} />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Enhanced Charts Section */}
        <div className="space-y-6">
          <h2 className="text-xl font-semibold tracking-tight">Production Analytics</h2>
          
          {/* Products × Stages Performance Heatmap */}
          <ProductsStagesHeatmap 
            data={heatmapData} 
            className=""
          />
          {/* Production Performance by Product */}
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-blue-600" />
                    Production Performance by Product
                  </CardTitle>
                </div>
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-muted-foreground" />
                  <div className="flex flex-wrap gap-2">
                    {uniqueProducts.map((product) => (
                      <Badge
                        key={product}
                        variant={selectedProduct === product ? "default" : "outline"}
                        className="cursor-pointer transition-colors hover:bg-primary/10"
                        onClick={() => setSelectedProduct(product)}
                      >
                        {product}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-center">
                  <div className="space-y-1">
                    <div className="text-2xl font-bold text-[#8884d8]">
                      {productStageProductionData
                        .reduce((sum, item) => sum + Number(item.Molding ?? 0), 0)
                        .toLocaleString()}
                    </div>
                    <div className="text-sm text-muted-foreground">Molding Total</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-2xl font-bold text-[#82ca9d]">
                      {productStageProductionData
                        .reduce((sum, item) => sum + Number(item.Machining ?? 0), 0)
                        .toLocaleString()}
                    </div>
                    <div className="text-sm text-muted-foreground">Machining Total</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-2xl font-bold text-[#ffc658]">
                      {productStageProductionData
                        .reduce((sum, item) => sum + Number(item.Assembling ?? 0), 0)
                        .toLocaleString()}
                    </div>
                    <div className="text-sm text-muted-foreground">Assembling Total</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-2xl font-bold text-[#ff8042]">
                      {productStageProductionData
                        .reduce((sum, item) => sum + Number(item.Testing ?? 0), 0)
                        .toLocaleString()}
                    </div>
                    <div className="text-sm text-muted-foreground">Testing Total</div>
                  </div>
                </div>

                <ChartContainer
                  config={{
                    Molding: { label: "Molding", color: "hsl(248, 70%, 70%)" },
                    Machining: { label: "Machining", color: "hsl(142, 50%, 65%)" },
                    Assembling: { label: "Assembling", color: "hsl(45, 100%, 70%)" },
                    Testing: { label: "Testing", color: "hsl(20, 100%, 65%)" },
                  }}
                  className="h-[350px] w-full"
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={productStageProductionData}
                      margin={{ top: 20, right: 16, left: 12, bottom: isSmallScreen ? 20 : 60 }}
                      barGap={0}
                      barCategoryGap="15%"
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted))" />
                      <XAxis
                        dataKey="productName"
                        angle={isSmallScreen ? 0 : -30}
                        textAnchor={isSmallScreen ? "middle" : "end"}
                        height={isSmallScreen ? 40 : 60}
                        tick={{ fontSize: isSmallScreen ? 10 : 12 }}
                        interval={0}
                      />
                      <YAxis
                        tick={{ fontSize: isSmallScreen ? 10 : 12 }}
                        label={{
                          value: "Total Accepted Units",
                          angle: -90,
                          position: "insideLeft",
                          offset: -10,
                          style: { textAnchor: "middle" },
                        }}
                      />
                      <Tooltip content={<ProductTooltip />} cursor={{ fill: "rgba(0,0,0,0.05)" }} />
                      <Legend verticalAlign="top" height={36} iconSize={12} wrapperStyle={{ fontSize: "12px" }} />
                      
                      {/* Average production line annotation */}
                      {productStageProductionData.length > 0 && (
                        <ReferenceLine
                          y={productStageProductionData.reduce((sum, item) => sum + item.total, 0) / productStageProductionData.length}
                          stroke="hsl(var(--muted-foreground))"
                          strokeDasharray="5 5"
                          label={{ value: "Avg per Product", position: "insideTopRight", fontSize: 10 }}
                        />
                      )}
                      
                      <Bar dataKey="Molding" fill={stageColors.Molding} name="Molding" radius={[2, 2, 0, 0]} />
                      <Bar dataKey="Machining" fill={stageColors.Machining} name="Machining" radius={[2, 2, 0, 0]} />
                      <Bar dataKey="Assembling" fill={stageColors.Assembling} name="Assembling" radius={[2, 2, 0, 0]} />
                      <Bar dataKey="Testing" fill={stageColors.Testing} name="Testing" radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartContainer>

                {productStageProductionData.length > 0 && (
                  <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-4 text-sm">
                    <div className="space-y-2">
                      <h4 className="font-semibold">Top Performing Product</h4>
                      <p className="text-muted-foreground font-medium">
                        {productStageProductionData[0]?.productName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {productStageProductionData[0]?.total.toLocaleString()} total units
                      </p>
                    </div>
                    <div className="space-y-2">
                      <h4 className="font-semibold">Most Efficient Product</h4>
                      <p className="text-muted-foreground font-medium">
                        {
                          productStageProductionData
                            .sort((a, b) => b.efficiency - a.efficiency)[0]?.productName || "N/A"
                        }
                      </p>
                      <p className="text-xs text-green-600 font-medium">
                        {productStageProductionData
                          .sort((a, b) => b.efficiency - a.efficiency)[0]?.efficiency.toFixed(1) || "0"}% efficiency
                      </p>
                    </div>
                    <div className="space-y-2">
                      <h4 className="font-semibold">Most Active Stage</h4>
                      <p className="text-muted-foreground">
                        {
                          Object.entries(stageColors).reduce(
                            (max, [stage, color]) => {
                              const total = productStageProductionData.reduce((sum, item) => sum + (item as any)[stage], 0)
                              const maxTotal = productStageProductionData.reduce(
                                (sum, item) => sum + (item as any)[max[0]],
                                0,
                              )
                              return total > maxTotal ? [stage, color] : max
                            },
                            ["Molding", ""],
                          )[0]
                        }
                      </p>
                    </div>
                    <div className="space-y-2">
                      <h4 className="font-semibold">Products Displayed</h4>
                      <p className="text-muted-foreground">{productStageProductionData.length} products</p>
                      <p className="text-xs text-muted-foreground">
                        {productStageProductionData.reduce((sum, product) => sum + product.batchCount, 0)} total batches
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-6 md:grid-cols-2">
            {/* Wastage Analytics */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-orange-600" />
                  Quality Control: Wastage by Stage
                </CardTitle>
                <CardDescription>Rejected units analysis to identify improvement opportunities</CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer
                  config={{ rejected: { label: "Rejected Units", color: "hsl(var(--destructive))" } }}
                  className="h-[280px] w-full"
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={wastageData} layout="vertical" margin={{ left: 80, right: 20, top: 20, bottom: 20 }}>
                      <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="hsl(var(--muted))" />
                      <XAxis 
                        type="number" 
                        dataKey="rejected" 
                        tick={{ fontSize: 12 }}
                        label={{ value: "Rejected Units", position: "bottom", fontSize: 11 }}
                      />
                      <YAxis 
                        dataKey="name" 
                        type="category" 
                        tickLine={false} 
                        axisLine={false} 
                        width={70}
                        tick={{ fontSize: 11 }}
                      />
                      <Tooltip 
                        content={({ active, payload, label }) => {
                          if (active && payload && payload.length) {
                            const value = Number(payload[0].value) || 0
                            return (
                              <div className="bg-background border rounded-lg p-3 shadow-lg">
                                <p className="font-semibold">{label} Stage</p>
                                <p className="text-destructive">Rejected: {value.toLocaleString()} units</p>
                                <p className="text-xs text-muted-foreground mt-1">Focus area for quality improvement</p>
                              </div>
                            )
                          }
                          return null
                        }}
                      />
                      <Bar dataKey="rejected" fill="hsl(var(--destructive))" radius={4} />
                      {/* Target line for acceptable waste */}
                      {wastageData.length > 0 && wastageData.some(d => d.rejected > 0) && (
                        <ReferenceLine 
                          x={Math.max(...wastageData.filter(d => d.rejected > 0).map(d => d.rejected)) * 0.5} 
                          stroke="hsl(var(--muted-foreground))"
                          strokeDasharray="5 5"
                          label={{ value: "Target Threshold", position: "top", fontSize: 10 }}
                        />
                      )}
                    </BarChart>
                  </ResponsiveContainer>
                </ChartContainer>
              </CardContent>
            </Card>

            {/* Cycle Time Analytics */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-green-600" />
                  Production Cycle Time Analysis
                </CardTitle>
                <CardDescription>
                  Time efficiency metrics from batch creation to completion
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer
                  config={{ avgCycleTime: { label: "Avg. Cycle Time (Days)", color: "hsl(var(--primary))" } }}
                  className="h-[280px] w-full"
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={cycleTimeData} margin={{ top: 20, right: 20, left: 20, bottom: 60 }}>
                      <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--muted))" />
                      <XAxis 
                        dataKey="name" 
                        tickLine={false} 
                        tickMargin={10} 
                        axisLine={false}
                        angle={-45}
                        textAnchor="end"
                        height={60}
                        tick={{ fontSize: 10 }}
                      />
                      <YAxis 
                        tick={{ fontSize: 12 }}
                        label={{ value: "Days", angle: -90, position: "insideLeft", fontSize: 11 }}
                      />
                      <Tooltip 
                        content={({ active, payload, label }) => {
                          if (active && payload && payload.length) {
                            const days = payload[0].value as number
                            return (
                              <div className="bg-background border rounded-lg p-3 shadow-lg">
                                <p className="font-semibold">{label}</p>
                                <p className="text-primary">Avg. Cycle Time: {days} days</p>
                                <p className="text-xs text-muted-foreground mt-1">
                                  {days > 7 ? 'Above average - consider optimization' : 'Efficient production cycle'}
                                </p>
                              </div>
                            )
                          }
                          return null
                        }}
                      />
                      <Bar dataKey="avgCycleTime" fill="hsl(var(--primary))" radius={4} />
                      {/* Industry benchmark line */}
                      {cycleTimeData.length > 0 && (
                        <ReferenceLine
                          y={cycleTimeData.reduce((sum, item) => sum + item.avgCycleTime, 0) / cycleTimeData.length}
                          stroke="hsl(var(--muted-foreground))"
                          strokeDasharray="5 5"
                          label={{ value: "Average", position: "insideTopRight", fontSize: 10 }}
                        />
                      )}
                    </BarChart>
                  </ResponsiveContainer>
                </ChartContainer>
              </CardContent>
            </Card>
          </div>

          {/* Stage Duration Analysis */}
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="h-5 w-5 text-purple-600" />
                    Stage Duration Deep Dive
                  </CardTitle>
                  <CardDescription>Detailed time analysis per production stage for batch optimization</CardDescription>
                </div>
                <div className="w-full sm:w-64">
                  <Select value={selectedBatchId ?? ""} onValueChange={(v) => setSelectedBatchId(v)}>
                    <SelectTrigger aria-label="Select batch for stage duration analysis">
                      <SelectValue placeholder="Select batch for analysis" />
                    </SelectTrigger>
                    <SelectContent>
                      {(batches || []).map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          <div className="flex items-center gap-2">
                            <TruncatedId id={b.id} maxLength={8} />
                            <span>— {b.productName}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {selectedBatch ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                    {stageDurationsData.map((stage) => (
                      <div key={stage.stage} className="space-y-1">
                        <div 
                          className="text-lg font-bold" 
                          style={{ color: stage.color }}
                        >
                          {stage.hours}h
                        </div>
                        <div className="text-xs text-muted-foreground">{stage.stage}</div>
                      </div>
                    ))}
                  </div>
                  
                  <ChartContainer
                    config={{ hours: { label: "Hours", color: "hsl(var(--chart-1))" } }}
                    className="h-[280px] w-full"
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart 
                        data={stageDurationsData} 
                        layout="vertical" 
                        margin={{ left: 80, right: 30, top: 20, bottom: 20 }}
                      >
                        <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="hsl(var(--muted))" />
                        <XAxis 
                          type="number" 
                          dataKey="hours" 
                          tick={{ fontSize: 12 }}
                          label={{ value: "Hours", position: "bottom", fontSize: 11 }}
                        />
                        <YAxis 
                          dataKey="stage" 
                          type="category" 
                          tickLine={false} 
                          axisLine={false} 
                          width={70}
                          tick={{ fontSize: 11 }}
                        />
                        <Tooltip content={<DurationTooltip />} cursor={{ fill: "hsl(var(--muted))", opacity: 0.1 }} />
                        <Bar dataKey="hours" radius={4}>
                          {stageDurationsData.map((d: any, idx: number) => (
                            <Cell key={`cell-${idx}`} fill={d.color} />
                          ))}
                        </Bar>
                        {/* Efficiency benchmark */}
                        {stageDurationsData.length > 0 && (
                          <ReferenceLine
                            x={stageDurationsData.reduce((sum, item) => sum + item.hours, 0) / stageDurationsData.length}
                            stroke="hsl(var(--muted-foreground))"
                            strokeDasharray="5 5"
                            label={{ value: "Avg Time", position: "insideTopRight", fontSize: 10 }}
                          />
                        )}
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartContainer>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Clock className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-sm text-muted-foreground">Select a batch to analyze stage durations</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* StockPilot AI Assistant */}
        
      </div>

      {/* Motivational Quote - Fixed at bottom */}
      <MotivationalQuote />
    </>
  )
}
