"use client"

import { useEffect, useState, useMemo } from "react"
import { useBatches } from "@/hooks/use-batches"
import { useRawMaterials } from "@/hooks/use-raw-materials"
import PageHeader from "@/components/page-header"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell } from "recharts"
import { ChartContainer, ChartTooltipContent } from "@/components/ui/chart"
import type { ProductionSuggestion } from "@/ai/flows/get-production-suggestions"
import { AlertCircle, Lightbulb, Factory, PackageCheck, Hammer, TestTube, Filter } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { SuggestionChart } from "@/components/suggestion-chart"
import { Chatbot } from "@/components/chatbot"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { formatMsToHMS } from "@/lib/utils"

export default function DashboardPage() {
  const { batches } = useBatches()
  const { rawMaterials } = useRawMaterials()
  const [suggestions, setSuggestions] = useState<ProductionSuggestion[]>([])
  const [loadingSuggestions, setLoadingSuggestions] = useState(true)
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
            acc[stage] += data.rejected
          })
        }
        return acc
      },
      {} as Record<string, number>,
    )

    return Object.entries(wastageByStage).map(([name, value]) => ({ name, rejected: value }))
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

  const batchStageProductionData = useMemo(() => {
    const filteredBatches =
      selectedProduct === "All" ? batches : batches.filter((batch) => batch.productName === selectedProduct)

    return filteredBatches
      .map((batch) => {
        const moldingAccepted = Number(batch.processingStages?.Molding?.accepted ?? 0)
        const finishingAccepted = Number(batch.processingStages?.Machining?.accepted ?? 0)
        const assemblingAccepted = Number(batch.processingStages?.Assembling?.accepted ?? 0)
        const testingAccepted = Number(batch.processingStages?.Testing?.accepted ?? 0)

        return {
          batchId: batch.id,
          product: batch.productName,
          status: batch.status,
          Molding: moldingAccepted,
          Machining: finishingAccepted,
          Assembling: assemblingAccepted,
          Testing: testingAccepted,
          total: moldingAccepted + finishingAccepted + assemblingAccepted + testingAccepted,
        }
      })
      .sort((a, b) => b.total - a.total) // Sort by total production descending
  }, [batches, selectedProduct])

  const uniqueProducts = useMemo(() => {
    const products = Array.from(new Set(batches.map((batch) => batch.productName)))
    return ["All", ...products]
  }, [batches])

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

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload
      return (
        <div className="bg-background border rounded-lg p-3 shadow-lg">
          <p className="font-bold">{`Batch: ${label}`}</p>
          <p className="text-sm text-muted-foreground">{`Product: ${data.product}`}</p>
          <div className="mt-2 space-y-1">
            {payload.map((entry: any, index: number) => (
              <div key={index} className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }} />
                  <span className="text-sm">{entry.dataKey}:</span>
                </div>
                <span className="font-medium">{entry.value} units</span>
              </div>
            ))}
          </div>
          <div className="mt-2 pt-2 border-t">
            <div className="flex justify-between font-semibold">
              <span>Total:</span>
              <span>{data.total} units</span>
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
      <PageHeader title="Dashboard" description="Insights into your production performance." />

      <div className="grid gap-6">
        <Chatbot />

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lightbulb className="text-yellow-500" /> AI-Powered Suggestions
            </CardTitle>
            <CardDescription>
              Recommendations based on production data from the last 90 days to improve efficiency.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingSuggestions ? (
              <div className="space-y-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : suggestions.length > 0 ? (
              <Accordion type="single" collapsible className="w-full">
                {suggestions.map((suggestion, index) => (
                  <AccordionItem value={`item-${index}`} key={index}>
                    <AccordionTrigger className="text-left font-semibold hover:no-underline">
                      {suggestion.suggestion}
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="grid md:grid-cols-2 gap-6 items-center">
                        <p className="text-muted-foreground">{suggestion.reasoning}</p>
                        <SuggestionChart title={suggestion.chart.title} data={suggestion.chart.data} />
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            ) : (
              <p className="text-sm text-muted-foreground">
                Not enough data from the last 90 days to generate suggestions. Complete more batches to enable this
                feature.
              </p>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertCircle className="text-destructive" /> Out of Stock Raw Materials
              </CardTitle>
            </CardHeader>
            <CardContent>
              {outOfStockMaterials.length > 0 ? (
                <ul className="space-y-2 text-sm">
                  {outOfStockMaterials.map((item) => (
                    <li key={item.id} className="flex justify-between items-center">
                      <span>{item.name}</span>
                      <span className="font-mono text-xs bg-muted px-2 py-1 rounded">{item.sku}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">All raw materials are in stock.</p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">In Molding</CardTitle>
              <Factory className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stageCounts.Molding}</div>
              <p className="text-xs text-muted-foreground">Batches currently in the molding stage.</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">In Machining</CardTitle>
              <Hammer className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stageCounts.Machining}</div>
              <p className="text-xs text-muted-foreground">Batches currently in the machining stage.</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">In Assembling</CardTitle>
              <PackageCheck className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stageCounts.Assembling}</div>
              <p className="text-xs text-muted-foreground">Batches currently in the assembling stage.</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">In Testing</CardTitle>
              <TestTube className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stageCounts.Testing}</div>
              <p className="text-xs text-muted-foreground">Batches currently in the testing stage.</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <CardTitle>Batch-wise Production Across Stages</CardTitle>
                <CardDescription>Accepted units for each batch across different production stages</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <div className="flex flex-wrap gap-2">
                  {uniqueProducts.map((product) => (
                    <Badge
                      key={product}
                      variant={selectedProduct === product ? "default" : "outline"}
                      className="cursor-pointer"
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
                    {batchStageProductionData
                      .reduce((sum, item) => sum + Number(item.Molding ?? 0), 0)
                      .toLocaleString()}
                  </div>
                  <div className="text-sm text-muted-foreground">Molding Total</div>
                </div>
                <div className="space-y-1">
                  <div className="text-2xl font-bold text-[#82ca9d]">
                    {batchStageProductionData
                      .reduce((sum, item) => sum + Number(item.Machining ?? 0), 0)
                      .toLocaleString()}
                  </div>
                  <div className="text-sm text-muted-foreground">Machining Total</div>
                </div>
                <div className="space-y-1">
                  <div className="text-2xl font-bold text-[#ffc658]">
                    {batchStageProductionData
                      .reduce((sum, item) => sum + Number(item.Assembling ?? 0), 0)
                      .toLocaleString()}
                  </div>
                  <div className="text-sm text-muted-foreground">Assembling Total</div>
                </div>
                <div className="space-y-1">
                  <div className="text-2xl font-bold text-[#ff8042]">
                    {batchStageProductionData
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
                className="h-[280px] sm:h-[360px] md:h-[420px] lg:h-[500px] w-full"
              >
                <BarChart
                  data={batchStageProductionData}
                  margin={{ top: 20, right: 16, left: 12, bottom: isSmallScreen ? 20 : 80 }}
                  barGap={0}
                  barCategoryGap="15%"
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted))" />
                  <XAxis
                    dataKey="batchId"
                    angle={isSmallScreen ? 0 : -45}
                    textAnchor={isSmallScreen ? "middle" : "end"}
                    height={isSmallScreen ? 40 : 70}
                    tick={{ fontSize: isSmallScreen ? 9 : 11 }}
                    interval={0}
                  />
                  <YAxis
                    tick={{ fontSize: isSmallScreen ? 10 : 12 }}
                    label={{
                      value: "Accepted Units",
                      angle: -90,
                      position: "insideLeft",
                      offset: -10,
                      style: { textAnchor: "middle" },
                    }}
                  />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(0,0,0,0.05)" }} />
                  <Legend verticalAlign="top" height={36} iconSize={12} wrapperStyle={{ fontSize: "12px" }} />
                  <Bar dataKey="Molding" fill={stageColors.Molding} name="Molding" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="Machining" fill={stageColors.Machining} name="Machining" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="Assembling" fill={stageColors.Assembling} name="Assembling" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="Testing" fill={stageColors.Testing} name="Testing" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ChartContainer>

              {batchStageProductionData.length > 0 && (
                <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 text-sm">
                  <div className="space-y-2">
                    <h4 className="font-semibold">Top Performing Batch</h4>
                    <p className="text-muted-foreground">
                      {batchStageProductionData[0]?.batchId} ({batchStageProductionData[0]?.total.toLocaleString()}{" "}
                      units)
                    </p>
                  </div>
                  <div className="space-y-2">
                    <h4 className="font-semibold">Most Active Stage</h4>
                    <p className="text-muted-foreground">
                      {
                        Object.entries(stageColors).reduce(
                          (max, [stage, color]) => {
                            const total = batchStageProductionData.reduce((sum, item) => sum + (item as any)[stage], 0)
                            const maxTotal = batchStageProductionData.reduce(
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
                    <h4 className="font-semibold">Total Batches Displayed</h4>
                    <p className="text-muted-foreground">{batchStageProductionData.length} batches</p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Wastage Tracking by Stage</CardTitle>
              <CardDescription>Total rejected units per production stage across all completed batches.</CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer
                config={{ rejected: { label: "Rejected", color: "hsl(var(--chart-5))" } }}
                className="h-[240px] sm:h-[280px] md:h-[300px] w-full"
              >
                <BarChart data={wastageData} layout="vertical" margin={{ left: 10, right: 10 }}>
                  <CartesianGrid horizontal={false} />
                  <XAxis type="number" dataKey="rejected" />
                  <YAxis dataKey="name" type="category" tickLine={false} axisLine={false} width={80} />
                  <Tooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="rejected" fill="var(--color-rejected)" radius={4} />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Average Production Cycle Time</CardTitle>
              <CardDescription>
                Average number of days to produce each product, from batch creation to completion.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer
                config={{ avgCycleTime: { label: "Avg. Cycle Time (Days)", color: "hsl(var(--chart-2))" } }}
                className="h-[240px] sm:h-[280px] md:h-[300px] w-full"
              >
                <BarChart data={cycleTimeData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="name" tickLine={false} tickMargin={10} axisLine={false} />
                  <YAxis />
                  <Tooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="avgCycleTime" fill="var(--color-avgCycleTime)" radius={4} />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <CardTitle>Per-batch Stage Durations</CardTitle>
                <CardDescription>Time taken per stage for the selected batch</CardDescription>
              </div>
              <div className="w-full sm:w-64">
                <Select value={selectedBatchId ?? ""} onValueChange={(v) => setSelectedBatchId(v)}>
                  <SelectTrigger aria-label="Select batch">
                    <SelectValue placeholder="Select batch" />
                  </SelectTrigger>
                  <SelectContent>
                    {(batches || []).map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.id} — {b.productName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {selectedBatch ? (
              <ChartContainer
                // single-series chart, we use per-bar Cell to color by stage
                config={{ hours: { label: "Hours", color: "hsl(var(--chart-1))" } }}
                className="h-[260px] sm:h-[320px] md:h-[360px] w-full"
              >
                <BarChart data={stageDurationsData} layout="vertical" margin={{ left: 10, right: 10 }}>
                  <CartesianGrid horizontal={false} />
                  <XAxis type="number" dataKey="hours" />
                  <YAxis dataKey="stage" type="category" tickLine={false} axisLine={false} width={90} />
                  <Tooltip content={<DurationTooltip />} cursor={{ fill: "hsl(var(--muted))" }} />
                  <Bar dataKey="hours" radius={4}>
                    {stageDurationsData.map((d: any, idx: number) => (
                      <Cell key={`cell-${idx}`} fill={d.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ChartContainer>
            ) : (
              <p className="text-sm text-muted-foreground">No batch selected.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  )
}
