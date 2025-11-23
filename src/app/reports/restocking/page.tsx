"use client"

import { useMemo } from "react"
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

export default function RestockingReportsPage() {
  const { canEdit, loading: permissionsLoading } = usePermissions()
  const canAccessReports = canEdit("Reports")

  const { data: restocks, loading } = useFirestoreCollection<RestockRecord>(
    COLLECTIONS.RESTOCKS,
    orderBy("restockDate", "desc"),
  )

  const rows = useMemo(() => restocks || [], [restocks])

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
      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Restock Date</TableHead>
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
                  <TableCell colSpan={6} className="h-24 text-center">
                    Loading restocking data...
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                    No restocking records found.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      {r.restockDate ? new Date(r.restockDate).toLocaleDateString() : "-"}
                    </TableCell>
                    <TableCell>{r.productName}</TableCell>
                    <TableCell>{r.companyName}</TableCell>
                    <TableCell className="text-right">{r.quantityAdded}</TableCell>
                    <TableCell className="text-right">{r.previousStock}</TableCell>
                    <TableCell className="text-right">{r.updatedStock}</TableCell>
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
