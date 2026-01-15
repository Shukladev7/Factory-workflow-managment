"use client"

import { useEffect, useMemo, useState } from "react"
import PageHeader from "@/components/page-header"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { Batch } from "@/lib/types"
import { subscribeToAllBatches } from "@/lib/firebase"
import { useFinalStock } from "@/hooks/use-final-stock"

export default function TestingReportPage() {
  const [batches, setBatches] = useState<Batch[]>([])
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const { finalStock } = useFinalStock()

  useEffect(() => {
    const unsubscribe = subscribeToAllBatches((all) => {
      const onlyTesting = (all || []).filter((b) => Array.isArray(b.selectedProcesses) && b.selectedProcesses.includes("Testing"))
      setBatches(onlyTesting)
    })
    return () => unsubscribe()
  }, [])

  const rows = useMemo(() => {
    return (batches || []).map((b) => {
      const t = b.processingStages?.Testing || { accepted: 0, rejected: 0, actualConsumption: 0, completed: false }
      const product = finalStock.find(
        (p) => p.id === b.productId || p.productId === b.productId,
      )
      return {
        id: b.id,
        productName: b.productName,
        productSystemId: product?.id || "",
        productPid: product?.productId || "",
        productSku: product?.sku || "",
        quantityToBuild: b.quantityToBuild,
        status: b.status,
        accepted: t.accepted ?? 0,
        rejected: t.rejected ?? 0,
        consumption: t.actualConsumption ?? 0,
        startedAt: b.processingStages?.Testing?.startedAt,
        finishedAt: b.processingStages?.Testing?.finishedAt,
        completed: Boolean(b.processingStages?.Testing?.completed),
        createdAt: b.createdAt,
      }
    })
  }, [batches, finalStock])

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      const created = r.createdAt ? new Date(r.createdAt) : null
      if (!created) return false
      if (from) {
        const f = new Date(from)
        f.setHours(0, 0, 0, 0)
        const cmp = new Date(created)
        cmp.setHours(0, 0, 0, 0)
        if (cmp < f) return false
      }
      if (to) {
        const t = new Date(to)
        t.setHours(23, 59, 59, 999)
        if (created > t) return false
      }
      return true
    })
  }, [rows, from, to])

  function formatYMD(d: Date) {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, "0")
    const day = String(d.getDate()).padStart(2, "0")
    return `${y}-${m}-${day}`
  }

  function downloadCSV() {
    const headers = [
      "Batch ID",
      "Product ID / System ID",
      "SKU",
      "Product",
      "Qty",
      "Accepted",
      "Rejected Tested",
      "Created",
      "Finished",
    ]
    const lines = [headers.join(",")]
    for (const r of filtered) {
      const row = [
        r.id,
        (r.productPid || r.productSystemId || "").replaceAll(",", " "),
        (r.productSku || "").replaceAll(",", " "),
        (r.productName || "").replaceAll(",", " "),
        String((r.accepted ?? 0) + (r.rejected ?? 0)),
        String(r.accepted ?? 0),
        String(r.rejected ?? 0),
        r.createdAt ? new Date(r.createdAt).toISOString() : "",
        r.finishedAt ? new Date(r.finishedAt).toISOString() : "",
      ]
      lines.push(row.join(","))
    }
    const csv = lines.join("\n")
    const ts = formatYMD(new Date())
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `testing-report-${ts}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  function clearFilters() {
    setFrom("")
    setTo("")
  }

  const fmt = (iso?: string) => (iso ? new Date(iso).toLocaleString() : "-")

  return (
    <>
      <PageHeader title="Testing Report" description="All batches that include the Testing stage." />

      <div className="flex flex-col gap-3 md:flex-row md:items-end md:gap-4 mb-4">
        <div className="grid gap-1">
          <label htmlFor="from" className="text-sm text-muted-foreground">From date</label>
          <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-48" />
        </div>
        <div className="grid gap-1">
          <label htmlFor="to" className="text-sm text-muted-foreground">To date</label>
          <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-48" />
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={clearFilters}>Clear</Button>
          <Button onClick={downloadCSV}>Download CSV</Button>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Batch ID</TableHead>
                <TableHead>Product ID / System ID</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead>Accepted</TableHead>
                <TableHead>Rejected Tested</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Finished</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="h-24 text-center">
                    No testing records found
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">{r.id}</TableCell>
                    <TableCell className="font-mono text-xs">{r.productPid || r.productSystemId || "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{r.productSku || "—"}</TableCell>
                    <TableCell className="font-medium">{r.productName}</TableCell>
                    <TableCell>{(r.accepted ?? 0) + (r.rejected ?? 0)}</TableCell>
                    <TableCell>{r.accepted}</TableCell>
                    <TableCell>{r.rejected}</TableCell>
                    <TableCell>{fmt(r.createdAt)}</TableCell>
                    <TableCell>{fmt(r.finishedAt)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  )
}
