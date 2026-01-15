"use client"

import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatNumber } from "@/lib/utils"

type OrderReportRow = {
  dateISO: string
  date: string | Date
  orderId: string
  productName: string
  quantity: number
  orderType: string
  productSystemId?: string
  productPid?: string
  productSku?: string
}

function toRowDate(r: OrderReportRow) {
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

export default function OrderReportsTable({ rows }: { rows: OrderReportRow[] }) {
  const [from, setFrom] = useState<string>("")
  const [to, setTo] = useState<string>("")
  const [orderQuery, setOrderQuery] = useState<string>("")

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
        if (orderQuery.trim()) {
          const q = orderQuery.trim().toLowerCase()
          if (!r.orderId.toLowerCase().includes(q)) return false
        }
        return true
      })
      .sort((a, b) => toRowDate(b).getTime() - toRowDate(a).getTime())
  }, [rows, from, to, orderQuery])

  const dailyTotals = useMemo(() => {
    const map = new Map<string, number>()
    for (const r of filtered) {
      const key = formatYMD(toRowDate(r))
      map.set(key, (map.get(key) ?? 0) + (r.quantity || 0))
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
        return sum + (isToday ? r.quantity || 0 : 0)
      }, 0),
    [filtered, todayYMD],
  )

  function downloadCSV() {
    const headers = [
      "Date",
      "Order ID",
      "Product ID / System ID",
      "SKU",
      "Product Name",
      "Quantity",
      "Order Type",
    ]
    const lines = [headers.join(",")]
    for (const r of filtered) {
      const d = toRowDate(r)
      const displayId = (r.productPid || r.productSystemId || "").replaceAll(",", " ")
      const sku = (r.productSku || "").replaceAll(",", " ")
      const row = [
        formatYMD(d),
        r.orderId,
        displayId,
        sku,
        r.productName.replaceAll(",", " "),
        String(r.quantity ?? 0),
        r.orderType,
      ]
      lines.push(row.join(","))
    }
    const csv = lines.join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    const ts = formatYMD(new Date())
    a.download = `order-report-${ts}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  function clearFilters() {
    setFrom("")
    setTo("")
    setOrderQuery("")
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
          <label htmlFor="order" className="text-sm text-muted-foreground">
            Order ID contains
          </label>
          <Input
            id="order"
            placeholder="e.g. ORD-001"
            value={orderQuery}
            onChange={(e) => setOrderQuery(e.target.value)}
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
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Order ID</TableHead>
              <TableHead>Product ID / System ID</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>Product</TableHead>
              <TableHead className="text-right">Quantity</TableHead>
              <TableHead>Order Type</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  No records match your filters.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((r) => {
                const d = toRowDate(r)
                return (
                  <TableRow key={`${r.orderId}-${formatYMD(d)}`}>
                    <TableCell>{formatHuman(d)}</TableCell>
                    <TableCell className="font-mono text-sm">{r.orderId}</TableCell>
                    <TableCell className="font-mono text-xs">{r.productPid || r.productSystemId || "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{r.productSku || "—"}</TableCell>
                    <TableCell>{r.productName}</TableCell>
                    <TableCell className="text-right font-medium">{formatNumber(r.quantity || 0)}</TableCell>
                    <TableCell>{r.orderType}</TableCell>
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
