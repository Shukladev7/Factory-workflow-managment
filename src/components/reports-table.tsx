"use client"

import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatMsToHMS, formatNumber } from "@/lib/utils"
import type { Batch, BatchMaterial } from "@/lib/types"

type ReportRow = {
  dateISO: string
  date: string | Date
  batchId: string
  productName: string
  productSystemId?: string
  productPid?: string
  productSku?: string
  status: string
  producedUnits: number
  rawMaterialWastage: Record<string, number> // material name -> wastage amount
  durations?: {
    Molding?: number
    Machining?: number
    Assembling?: number
    Testing?: number
  }
  batch: Batch // Store full batch for accessing materials
}

function toRowDate(r: ReportRow) {
  if (r.date instanceof Date) return r.date
  if (typeof r.date === "string" && r.date) return new Date(r.date)
  return new Date(r.dateISO)
}

function formatYMD(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function formatHuman(d: Date) {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(d)
}

const STAGES: Array<keyof Batch["processingStages"]> = [
  "Molding",
  "Machining",
  "Assembling",
  "Testing",
]

function getFinalStage(batch: Batch): string | undefined {
  const s = batch.processingStages || ({} as Batch["processingStages"])
  if (s?.Testing?.completed) return "Testing"
  if (s?.Machining?.completed) return "Machining"
  if (s?.Assembling?.completed) return "Assembling"
  if (s?.Molding?.completed) return "Molding"
  return undefined
}

// Calculate Raw Material Input per stage = accepted_at_stage × sum(bom_per_unit for materials in that stage)
function calculateRawMaterialInputPerStage(batch: Batch): Record<string, number> {
  const res: Record<string, number> = {}
  const qtyToBuild = Number(batch.quantityToBuild || 0)
  for (const stage of STAGES) {
    const stageData = batch.processingStages?.[stage]
    if (!stageData) continue
    const accepted = Number(stageData.accepted || 0)
    if (!accepted || !isFinite(accepted)) continue
    const matsInStage = (batch.materials || []).filter((m) => m.stage === stage)
    let sumBomPerUnit = 0
    if (qtyToBuild > 0) {
      for (const m of matsInStage) {
        sumBomPerUnit += Number(m.quantity || 0) / qtyToBuild
      }
    }
    const value = accepted * sumBomPerUnit
    if (value > 0) res[stage] = Math.round(value * 100) / 100
  }
  return res
}

// Actual consumption per stage comes directly from processingStages[stage].actualConsumption
function calculateActualConsumptionPerStage(batch: Batch): Record<string, number> {
  const res: Record<string, number> = {}
  for (const stage of STAGES) {
    const stageData = batch.processingStages?.[stage]
    if (!stageData) continue
    const v = Number(stageData.actualConsumption || 0)
    if (v > 0) res[stage] = Math.round(v * 100) / 100
  }
  return res
}

function formatStageMap(values: Record<string, number>): string {
  const entries = Object.entries(values)
    .filter(([, v]) => v > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v.toFixed(2)}`)
  return entries.length > 0 ? entries.join(" | ") : "-"
}

// Per-material Raw Material Input = accepted_at_material_stage × (bom_per_unit for that material)
function calculateRawMaterialInputPerMaterial(batch: Batch): Record<string, number> {
  const res: Record<string, number> = {}
  const qtyToBuild = Number(batch.quantityToBuild || 0)
  for (const material of batch.materials || []) {
    const stage = material.stage as keyof Batch["processingStages"]
    const stageData = batch.processingStages?.[stage]
    if (!stageData) continue
    const accepted = Number(stageData.accepted || 0)
    if (!accepted || !isFinite(accepted)) continue
    const bomPerUnit = qtyToBuild > 0 ? Number(material.quantity || 0) / qtyToBuild : 0
    const value = accepted * bomPerUnit
    if (value > 0) res[material.name] = Math.round(value * 100) / 100
  }
  return res
}

// Per-material Actual Consumption, using explicit per-material consumptions if present, otherwise proportional split
function calculateActualConsumptionPerMaterial(batch: Batch): Record<string, number> {
  const res: Record<string, number> = {}
  for (const material of batch.materials || []) {
    const stage = material.stage as keyof Batch["processingStages"]
    const stageData = batch.processingStages?.[stage]
    if (!stageData) continue
    const materialConsumptions = (stageData as any)?.materialConsumptions as Record<string, number> | undefined
    let actualConsumption = 0
    if (materialConsumptions && materialConsumptions[material.id]) {
      actualConsumption = Number(materialConsumptions[material.id]) || 0
    } else {
      const materialsInStage = (batch.materials || []).filter((m) => m.stage === stage)
      const totalPlannedForStage = materialsInStage.reduce((sum, m) => sum + Number(m.quantity || 0), 0)
      if (totalPlannedForStage > 0) {
        const materialRatio = Number(material.quantity || 0) / totalPlannedForStage
        actualConsumption = (Number(stageData.actualConsumption) || 0) * materialRatio
      } else {
        actualConsumption = Number(stageData.actualConsumption) || 0
      }
    }
    if (actualConsumption > 0) res[material.name] = Math.round(actualConsumption * 100) / 100
  }
  return res
}

function formatMaterialMap(values: Record<string, number>): string {
  const entries = Object.entries(values)
    .filter(([, v]) => v > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, value]) => `${name}=${value.toFixed(2)}`)
  return entries.length > 0 ? entries.join(" | ") : "-"
}

// Calculate raw material wastage for a batch
function calculateRawMaterialWastage(batch: Batch): Record<string, number> {
  const wastage: Record<string, number> = {}
  
  for (const material of batch.materials) {
    const stage = material.stage
    const stageData = batch.processingStages[stage]
    
    if (!stageData) {
      wastage[material.name] = 0
      continue
    }
    
    // Get actual consumption - check if there's per-material consumption data
    const materialConsumptions = (stageData as any)?.materialConsumptions as Record<string, number> | undefined
    let actualConsumption = 0
    
    if (materialConsumptions && materialConsumptions[material.id]) {
      // Use per-material consumption if available
      actualConsumption = Number(materialConsumptions[material.id]) || 0
    } else {
      // If multiple materials in same stage, distribute actualConsumption proportionally
      const materialsInStage = batch.materials.filter(m => m.stage === stage)
      const totalPlannedForStage = materialsInStage.reduce((sum, m) => sum + Number(m.quantity || 0), 0)
      
      if (totalPlannedForStage > 0) {
        const materialRatio = Number(material.quantity || 0) / totalPlannedForStage
        actualConsumption = (Number(stageData.actualConsumption) || 0) * materialRatio
      } else {
        // Fallback: if no planned quantity, use stage's actualConsumption directly
        actualConsumption = Number(stageData.actualConsumption) || 0
      }
    }
    
    // Raw Material Input = Accepted × (BOM qty per piece)
    const accepted = Number(stageData?.accepted || 0)
    const qtyToBuild = Number(batch.quantityToBuild || 0)
    const bomPerPiece = qtyToBuild > 0 ? Number(material.quantity || 0) / qtyToBuild : 0
    const rawInput = accepted * bomPerPiece
    const wastageAmount = Math.max(0, actualConsumption - rawInput)
    wastage[material.name] = Math.round(wastageAmount * 100) / 100
  }
  
  return wastage
}

// Format raw material wastage as a string: raw1=10 | raw2=7 | raw3=5
function formatRawMaterialWastage(wastage: Record<string, number>): string {
  const entriesRaw = Object.entries(wastage)
  if (entriesRaw.length === 0) return "-"
  const entries = entriesRaw
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, value]) => `${name}=${Number(value || 0).toFixed(2)}`)
  return entries.join(" | ")
}

export default function ReportsTable({ rows }: { rows: ReportRow[] }) {
  const [from, setFrom] = useState<string>("")
  const [to, setTo] = useState<string>("")
  const [batchQuery, setBatchQuery] = useState<string>("")

  const filtered = useMemo(() => {
    return rows
      .filter((r) => {
        const d = toRowDate(r)
        if (from) {
          const fromDate = new Date(from)
          fromDate.setHours(0, 0, 0, 0)
          const cmp = new Date(d)
          cmp.setHours(0, 0, 0, 0)
          if (cmp < fromDate) return false
        }
        if (to) {
          const toDate = new Date(to)
          toDate.setHours(23, 59, 59, 999)
          if (d > toDate) return false
        }
        if (batchQuery.trim()) {
          const q = batchQuery.trim().toLowerCase()
          if (!r.batchId.toLowerCase().includes(q)) return false
        }
        return true
      })
      .sort((a, b) => toRowDate(b).getTime() - toRowDate(a).getTime())
  }, [rows, from, to, batchQuery])


  const dailyTotals = useMemo(() => {
    const map = new Map<string, number>()
    for (const r of filtered) {
      const key = formatYMD(toRowDate(r))
      map.set(key, (map.get(key) ?? 0) + (r.producedUnits || 0))
    }
    return Array.from(map.entries())
      .map(([day, total]) => ({ day, total }))
      .sort((a, b) => (a.day < b.day ? 1 : -1))
  }, [filtered])

  const dateFilterActive = useMemo(() => Boolean(from || to), [from, to])
  const todayYMD = formatYMD(new Date())
  const todayTotal = useMemo(
    () =>
      filtered.reduce((sum, r) => {
        const isToday = formatYMD(toRowDate(r)) === todayYMD
        return sum + (isToday ? r.producedUnits || 0 : 0)
      }, 0),
    [filtered, todayYMD],
  )

  function downloadCSV() {
    const headers = [
      "Date",
      "Batch ID",
      "Product ID / System ID",
      "SKU",
      "Product",
      "Status",
      "Produced Units",
      "Raw Material Input (per material)",
      "Actual Consumption (per material)",
      "Raw Material Wastage",
      "Molding Time (HH:MM:SS)",
      "Machining Time (HH:MM:SS)",
      "Assembling Time (HH:MM:SS)",
      "Testing Time (HH:MM:SS)",
    ]
    const lines = [headers.join(",")]
    for (const r of filtered) {
      const d = toRowDate(r)
      const dur = r.durations || {}
      const finalStage = getFinalStage(r.batch)
      const rawInputPerMaterial = formatMaterialMap(calculateRawMaterialInputPerMaterial(r.batch))
      const actualPerMaterial = formatMaterialMap(calculateActualConsumptionPerMaterial(r.batch))
      const wastageString = formatRawMaterialWastage(r.rawMaterialWastage)
      const displayId = (r.productPid || r.productSystemId || "").replaceAll(",", " ")
      const sku = (r.productSku || "").replaceAll(",", " ")
      const row = [
        formatYMD(d),
        r.batchId,
        displayId,
        sku,
        `${finalStage ? `${finalStage} - ` : ""}${r.productName}`.replaceAll(",", " "),
        r.status,
        String(r.producedUnits ?? 0),
        `"${rawInputPerMaterial}"`,
        `"${actualPerMaterial}"`,
        `"${wastageString}"`, // Quote to handle pipe characters in CSV
        dur.Molding != null ? formatMsToHMS(dur.Molding) : "",
        dur.Machining != null ? formatMsToHMS(dur.Machining) : "",
        dur.Assembling != null ? formatMsToHMS(dur.Assembling) : "",
        dur.Testing != null ? formatMsToHMS(dur.Testing) : "",
      ]
      lines.push(row.join(","))
    }
    const csv = lines.join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    const ts = formatYMD(new Date())
    a.download = `production-report-${ts}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  function clearFilters() {
    setFrom("")
    setTo("")
    setBatchQuery("")
  }

  const totalColumns = 9 // Date, Batch ID, Product ID / System ID, SKU, Product, Produced Units, Raw Material Input, Actual Consumption, Raw Material Wastage

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:gap-4">
        <div className="grid gap-1">
          <label htmlFor="from" className="text-sm text-muted-foreground">
            From date
          </label>
          <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-48" />
        </div>
        <div className="grid gap-1">
          <label htmlFor="to" className="text-sm text-muted-foreground">
            To date
          </label>
          <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-48" />
        </div>
        <div className="grid gap-1 md:flex-1">
          <label htmlFor="batch" className="text-sm text-muted-foreground">
            Batch ID contains
          </label>
          <Input
            id="batch"
            placeholder="e.g. BATCH-1672"
            value={batchQuery}
            onChange={(e) => setBatchQuery(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={clearFilters}>
            Clear
          </Button>
          <Button onClick={downloadCSV}>Download CSV</Button>
        </div>
      </div>

      <div className="flex rounded-lg border bg-card overflow-x-auto text-center">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-center font-medium">Date</TableHead>
              <TableHead className="text-center font-medium">Batch ID</TableHead>
              <TableHead className="text-center font-medium">Product ID / System ID</TableHead>
              <TableHead className="text-center font-medium">SKU</TableHead>
              <TableHead className="text-center font-medium">Product</TableHead>
              {/* <TableHead>Status</TableHead> */}
              <TableHead className="text-center font-medium">Produced Units</TableHead>
              <TableHead>Raw Material Input</TableHead>
              <TableHead>Actual Consumption</TableHead>
              <TableHead>Raw Material Wastage</TableHead>
              {/* <TableHead className="text-right">Molding Time</TableHead>
              <TableHead className="text-right">Machining Time</TableHead>
              <TableHead className="text-right">Assembling Time</TableHead>
              <TableHead className="text-right">Testing Time</TableHead> */}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={totalColumns} className="text-center text-muted-foreground">
                  No records match your filters.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((r) => {
                const d = toRowDate(r)
                const dur = r.durations || {}
                const finalStage = getFinalStage(r.batch)
                const rawInputPerMaterial = formatMaterialMap(calculateRawMaterialInputPerMaterial(r.batch))
                const actualPerMaterial = formatMaterialMap(calculateActualConsumptionPerMaterial(r.batch))
                const wastageString = formatRawMaterialWastage(r.rawMaterialWastage)
                return (
                  <TableRow key={`${r.batchId}-${formatYMD(d)}`}>
                    <TableCell>{formatHuman(d)}</TableCell>
                    <TableCell className="font-mono text-sm">{r.batchId}</TableCell>
                    <TableCell className="font-mono text-xs">{r.productPid || r.productSystemId || "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{r.productSku || "—"}</TableCell>
                    <TableCell>{finalStage ? `${finalStage} - ` : ""}{r.productName}</TableCell>
                    {/* <TableCell>{r.status}</TableCell> */}
                    <TableCell className="text-center font-medium">{formatNumber(r.producedUnits || 0)}</TableCell>
                    <TableCell className="text-left font-mono text-sm">{rawInputPerMaterial}</TableCell>
                    <TableCell className="text-left font-mono text-sm">{actualPerMaterial}</TableCell>
                    <TableCell className="text-left font-mono text-sm">{wastageString}</TableCell>
                    {/* <TableCell className="text-right">
                      {dur.Molding != null ? formatMsToHMS(dur.Molding) : "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      {dur.Machining != null ? formatMsToHMS(dur.Machining) : "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      {dur.Assembling != null ? formatMsToHMS(dur.Assembling) : "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      {dur.Testing != null ? formatMsToHMS(dur.Testing) : "-"}
                    </TableCell> */}
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
