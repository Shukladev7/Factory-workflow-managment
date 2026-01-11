"use client"

import { useMemo, useState } from "react"
import PageHeader from "@/components/page-header"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { usePermissions } from "@/hooks/use-permissions"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { ShieldX } from "lucide-react"
import { useFirestoreCollection } from "@/hooks/use-firestore-collection"
import { COLLECTIONS } from "@/lib/firebase/firestore-operations"
import type { RestockRecord } from "@/lib/types"
import { orderBy } from "firebase/firestore"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { useFinalStock } from "@/hooks/use-final-stock"

export default function RestockingReportsPage() {
  const { canEdit, loading: permissionsLoading } = usePermissions()
  const canAccessReports = canEdit("Reports")

  const { data: restocks, loading } = useFirestoreCollection<RestockRecord>(
    COLLECTIONS.RESTOCKS,
    orderBy("restockDate", "desc"),
  )

  const [from, setFrom] = useState<string>("")
  const [to, setTo] = useState<string>("")

  const { finalStock } = useFinalStock()

  const rows = useMemo(() => restocks || [], [restocks])

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (!r.restockDate) return true
      const d = new Date(r.restockDate)
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
      return true
    })
  }, [rows, from, to])

  if (permissionsLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-gray-700" />
      </div>
    )
  }

  if (!canAccessReports) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Restocking Report"
          description="View all product restocking events, including quantities, suppliers, and stock changes."
        />
        <Alert variant="destructive" className="max-w-2xl">
          <ShieldX className="h-4 w-4" />
          <AlertDescription>
            You don&apos;t have permission to access Reports. Only users with Reports edit permissions can view this page.
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Restocking Report"
        description="All restocking events for finished products, including company name and stock levels."
      />
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:gap-4">
        <div className="grid gap-1">
          <label htmlFor="from" className="text-sm text-muted-foreground">
            From date
          </label>
          <Input
            id="from"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="w-48"
          />
        </div>
        <div className="grid gap-1">
          <label htmlFor="to" className="text-sm text-muted-foreground">
            To date
          </label>
          <Input
            id="to"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="w-48"
          />
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              setFrom("")
              setTo("")
            }}
          >
            Clear
          </Button>
        </div>
      </div>
      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Restock Date</TableHead>
                <TableHead>Product ID / System ID</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Product Name</TableHead>
                <TableHead>Company Name</TableHead>
                <TableHead className="text-right">Quantity Added</TableHead>
                <TableHead className="text-right">Previous Stock</TableHead>
                <TableHead className="text-right">Updated Stock</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center">
                    Loading restocking data...
                  </TableCell>
                </TableRow>
              ) : filteredRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                    No restocking records found.
                  </TableCell>
                </TableRow>
              ) : (
                filteredRows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      {r.restockDate ? new Date(r.restockDate).toLocaleDateString() : "-"}
                    </TableCell>
                    {(() => {
                      const product = finalStock.find(
                        (p) => p.id === r.productId || p.productId === r.productId,
                      )
                      const displayId = product?.productId || product?.id || "—"
                      const sku = product?.sku || "—"
                      return (
                        <>
                          <TableCell className="font-mono text-xs">{displayId}</TableCell>
                          <TableCell className="font-mono text-xs">{sku}</TableCell>
                          <TableCell>{r.productName}</TableCell>
                          <TableCell>{r.companyName}</TableCell>
                          <TableCell className="text-right">{r.quantityAdded}</TableCell>
                          <TableCell className="text-right">{r.previousStock}</TableCell>
                          <TableCell className="text-right">{r.updatedStock}</TableCell>
                        </>
                      )
                    })()}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
