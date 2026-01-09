"use client"

import Link from "next/link"
import PageHeader from "@/components/page-header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { usePermissions } from "@/hooks/use-permissions"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { ShieldX, Package, ShoppingCart, PlusCircle } from "lucide-react"
import { cn } from "@/lib/utils"

export default function ReportsPage() {
  const { canEdit, loading: permissionsLoading } = usePermissions()
  const canAccessReports = canEdit("Reports")

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
          title="Reports"
          description="View production and order reports with detailed analytics and filtering options."
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
        title="Reports"
        description="View production and order reports with detailed analytics and filtering options."
      />
      <div className="grid gap-6 md:grid-cols-2">
        <Link href="/reports/production">
          <Card className={cn(
            "transition-all hover:shadow-lg hover:border-primary cursor-pointer h-full"
          )}>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Package className="h-6 w-6 text-primary" />
                </div>
                <div className="flex-1">
                  <CardTitle>Production Reports</CardTitle>
                  <CardDescription>
                    Daily production by batch with date filtering and CSV export
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                View production reports by batch, including final output, rejected units, and stage durations. Filter by date range and batch ID, and download CSV reports.
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/reports/orders">
          <Card className={cn(
            "transition-all hover:shadow-lg hover:border-primary cursor-pointer h-full"
          )}>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <ShoppingCart className="h-6 w-6 text-primary" />
                </div>
                <div className="flex-1">
                  <CardTitle>Order Reports</CardTitle>
                  <CardDescription>
                    Daily orders with date filtering and CSV export
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                View order reports with customer information, product details, quantities, and order types. Filter by date range and order ID, and download CSV reports.
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/reports/restocking">
          <Card className={cn(
            "transition-all hover:shadow-lg hover:border-primary cursor-pointer h-full"
          )}>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <PlusCircle className="h-6 w-6 text-primary" />
                </div>
                <div className="flex-1">
                  <CardTitle>Restocking Report</CardTitle>
                  <CardDescription>
                    Track product restocking events with supplier and stock change details
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                View a history of restocks for finished products, including company name, quantity added,
                and previous vs updated stock levels.
              </p>
            </CardContent>
          </Card>
        </Link>

                <Link href="/reports/testing">
          <Card className={cn(
            "transition-all hover:shadow-lg hover:border-primary cursor-pointer h-full"
          )}>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <PlusCircle className="h-6 w-6 text-primary" />
                </div>
                <div className="flex-1">
                  <CardTitle>Testing Report</CardTitle>
                  <CardDescription>
                    Track product testing events with batch reference, tested quantity, pass/fail results.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                View a history of testing for finished products, quantity tested, pass/fail results.
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/reports/audit">
          <Card className={cn(
            "transition-all hover:shadow-lg hover:border-primary cursor-pointer h-full"
          )}>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Package className="h-6 w-6 text-primary" />
                </div>
                <div className="flex-1">
                  <CardTitle>Audit Trail</CardTitle>
                  <CardDescription>
                    Centralized audit log of create and delete actions for key entities.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Review who created or deleted Raw Materials, Store Items, and Final Stock items, with timestamps and
                detailed descriptions for each action.
              </p>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  )
}
