"use client"

import { useMemo } from "react"
import PageHeader from "@/components/page-header"
import type { Order } from "@/lib/types"
import OrderReportsTable from "@/components/order-reports-table"
import { useOrders } from "@/hooks/use-orders"
import { usePermissions } from "@/hooks/use-permissions"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { ShieldX } from "lucide-react"
import { useFinalStock } from "@/hooks/use-final-stock"

export default function OrderReportsPage() {
  const { orders, loading: ordersLoading } = useOrders()
  const { canEdit, loading: permissionsLoading } = usePermissions()
  const { finalStock } = useFinalStock()
  
  const canAccessOrderReports = canEdit("Reports")

  const rows = useMemo(() => {
    return orders.map((o) => {
      const product = finalStock.find(
        (p) => p.id === o.productId || p.productId === o.productId,
      )

      return {
        dateISO: o.createdAt,
        date: new Date(o.createdAt),
        orderId: o.orderId,
        name: o.name,
        productName: o.productName,
        quantity: o.quantity,
        orderType: o.orderType,
        productSystemId: product?.id || "",
        productPid: product?.productId || "",
        productSku: product?.sku || "",
      }
    })
  }, [orders, finalStock])

  if (permissionsLoading || ordersLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-gray-700" />
      </div>
    )
  }
  
  if (!canAccessOrderReports) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Order Reports"
          description="Daily orders by date. Filters by date range and order ID. View order quantities and types."
        />
        <Alert variant="destructive" className="max-w-2xl">
          <ShieldX className="h-4 w-4" />
          <AlertDescription>
            You don&apos;t have permission to access Order Reports. Only users with Reports edit permissions can view this page.
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Order Reports"
        description="Daily orders by date. Filters by date range and order ID. View order quantities and types."
      />
      <OrderReportsTable rows={rows} />
    </div>
  )
}

