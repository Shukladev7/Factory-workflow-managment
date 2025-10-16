"use client"

import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatMsToHMS } from "@/lib/utils"

type ReportRow = {
  dateISO: string
  date: string | Date
  batchId: string
  productName: string
  status: string
  finalOutput: number
  durations?: {
    Molding?: number
    Machining?: number
    Assembling?: number
    Testing?: number
  }
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
      map.set(key, (map.get(key) ?? 0) + (r.finalOutput || 0))
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
        return sum + (isToday ? r.finalOutput || 0 : 0)
      }, 0),
    [filtered, todayYMD],
  )

  function downloadCSV() {
    const headers = [
      "Date",
      "Batch ID",
      "Product Name",
      "Status",
      "Final Output (units)",
      "Molding Time (HH:MM:SS)",
      "Machining Time (HH:MM:SS)",
      "Assembling Time (HH:MM:SS)",
      "Testing Time (HH:MM:SS)",
    ]
    const lines = [headers.join(",")]
    for (const r of filtered) {
      const d = toRowDate(r)
      const dur = r.durations || {}
      const row = [
        formatYMD(d),
        r.batchId,
        r.productName.replaceAll(",", " "),
        r.status,
        String(r.finalOutput ?? 0),
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

      <div className="rounded-lg border bg-card">
        <div className="p-4">
          <h3 className="font-semibold">Total Units </h3>
          {!dateFilterActive ? (
            <div className="mt-2 grid gap-1">
              <div className="text-sm flex items-center justify-between">
                <span className="text-muted-foreground">Today ({todayYMD})</span>
                <span className="font-medium">{todayTotal} units</span>
              </div>
            </div>
          ) : dailyTotals.length === 0 ? (
            <p className="text-sm text-muted-foreground mt-1">No data.</p>
          ) : (
            <div className="mt-2 grid gap-1">
              {dailyTotals.map(({ day, total }) => (
                <div key={day} className="text-sm flex items-center justify-between">
                  <span className="text-muted-foreground">{day}</span>
                  <span className="font-medium">{total} units</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="border-t">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Batch ID</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Final Output</TableHead>
                <TableHead className="text-right">Molding Time</TableHead>
                <TableHead className="text-right">Machining Time</TableHead>
                <TableHead className="text-right">Assembling Time</TableHead>
                <TableHead className="text-right">Testing Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground">
                    No records match your filters.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((r) => {
                  const d = toRowDate(r)
                  const dur = r.durations || {}
                  return (
                    <TableRow key={`${r.batchId}-${formatYMD(d)}`}>
                      <TableCell>{formatHuman(d)}</TableCell>
                      <TableCell className="font-mono text-sm">{r.batchId}</TableCell>
                      <TableCell>{r.productName}</TableCell>
                      <TableCell>{r.status}</TableCell>
                      <TableCell className="text-right">{r.finalOutput}</TableCell>
                      <TableCell className="text-right">
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
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  )
}
