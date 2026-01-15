"use client"

import { useMemo, useState } from "react"
import PageHeader from "@/components/page-header"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { usePermissions } from "@/hooks/use-permissions"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { ShieldX } from "lucide-react"
import { useActivityLog } from "@/hooks/use-activity-log"
import { useRawMaterials } from "@/hooks/use-raw-materials"
import { useFinalStock } from "@/hooks/use-final-stock"
import type { ActivityLog, RawMaterial, FinalStock, LogAction } from "@/lib/types"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface EnrichedLog extends ActivityLog {
  entityType: "RawMaterial" | "FinalStockItem" | "StoreItem" | "Batch" | "Unknown"
  entityName?: string
  entitySystemId?: string
  entityProductId?: string
  entitySku?: string
}

const PAGE_SIZE = 25

export default function AuditTrailPage() {
  const { canEdit, loading: permissionsLoading } = usePermissions()
  const canAccessReports = canEdit("Reports")

  const { activityLog, loading } = useActivityLog()
  const { rawMaterials } = useRawMaterials()
  const { finalStock } = useFinalStock()

  const [from, setFrom] = useState<string>("")
  const [to, setTo] = useState<string>("")
  const [actionFilter, setActionFilter] = useState<LogAction | "all">("all")
  const [entityFilter, setEntityFilter] = useState<EnrichedLog["entityType"] | "all">("all")
  const [userFilter, setUserFilter] = useState<string>("")
  const [page, setPage] = useState<number>(0)

  const rawMap = useMemo(() => {
    const map = new Map<string, RawMaterial>()
    rawMaterials.forEach((m) => map.set(m.id, m))
    return map
  }, [rawMaterials])

  const finalStockMap = useMemo(() => {
    const map = new Map<string, FinalStock>()
    finalStock.forEach((p) => map.set(p.id, p))
    return map
  }, [finalStock])

  const enrichedLogs: EnrichedLog[] = useMemo(() => {
    return activityLog.map((log) => {
      let entityType: EnrichedLog["entityType"] = "Unknown"
      let entityName: string | undefined
      let entitySystemId: string | undefined = log.recordId
      let entityProductId: string | undefined
      let entitySku: string | undefined

      if (log.recordType === "RawMaterial") {
        const material = rawMap.get(log.recordId)
        const isStoreItem = !!material && (material.isMoulded || material.isFinished || material.isAssembled)
        entityType = isStoreItem ? "StoreItem" : "RawMaterial"
        entityName = material?.name
        entitySystemId = material?.id ?? log.recordId
        entitySku = material?.sku
      } else if (log.recordType === "FinalStock") {
        const product = finalStockMap.get(log.recordId)
        entityType = "FinalStockItem"
        entityName = product?.name
        entitySystemId = product?.id ?? log.recordId
        entityProductId = product?.productId
        entitySku = product?.sku
      } else if (log.recordType === "Batch") {
        entityType = "Batch"
      }

      return { ...log, entityType, entityName, entitySystemId, entityProductId, entitySku }
    })
  }, [activityLog, rawMap, finalStockMap])

  const filteredLogs = useMemo(() => {
    return enrichedLogs.filter((log) => {
      const ts = new Date(log.timestamp)

      if (from) {
        const fromDate = new Date(from)
        fromDate.setHours(0, 0, 0, 0)
        if (ts < fromDate) return false
      }

      if (to) {
        const toDate = new Date(to)
        toDate.setHours(23, 59, 59, 999)
        if (ts > toDate) return false
      }

      // Global restriction: only show Created/Deleted for the core entity types
      if (log.action !== "Created" && log.action !== "Deleted") {
        return false
      }

      if (
        log.entityType !== "RawMaterial" &&
        log.entityType !== "StoreItem" &&
        log.entityType !== "FinalStockItem"
      ) {
        return false
      }

      if (actionFilter !== "all" && log.action !== actionFilter) {
        return false
      }

      if (entityFilter !== "all" && log.entityType !== entityFilter) {
        return false
      }

      if (userFilter && !log.user.toLowerCase().includes(userFilter.toLowerCase())) {
        return false
      }

      return true
    })
  }, [enrichedLogs, from, to, actionFilter, entityFilter, userFilter])

  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages - 1)

  const pageItems = useMemo(() => {
    const start = currentPage * PAGE_SIZE
    return filteredLogs.slice(start, start + PAGE_SIZE)
  }, [filteredLogs, currentPage])

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
          title="Audit Trail"
          description="View a centralized audit trail of key actions across Raw Materials, Store Items, and Final Stock."
        />
        <Alert variant="destructive" className="max-w-2xl">
          <ShieldX className="h-4 w-4" />
          <AlertDescription>
            You don't have permission to access Reports. Only users with Reports edit permissions can view this page.
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit Trail"
        description="Centralized audit log of create and delete actions for Raw Materials, Store Items, and Final Stock items."
      />

      <div className="flex flex-wrap gap-3 items-end">
        <div className="grid gap-1">
          <label htmlFor="from" className="text-sm text-muted-foreground">
            From date
          </label>
          <Input
            id="from"
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value)
              setPage(0)
            }}
            className="w-44"
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
            onChange={(e) => {
              setTo(e.target.value)
              setPage(0)
            }}
            className="w-44"
          />
        </div>
        <div className="grid gap-1">
          <span className="text-sm text-muted-foreground">Action type</span>
          <Select
            value={actionFilter}
            onValueChange={(value) => {
              setActionFilter(value as LogAction | "all")
              setPage(0)
            }}
          >
            <SelectTrigger className="w-40">
              <SelectValue placeholder="All actions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="Created">Created</SelectItem>
              <SelectItem value="Deleted">Deleted</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1">
          <span className="text-sm text-muted-foreground">Entity type</span>
          <Select
            value={entityFilter}
            onValueChange={(value) => {
              setEntityFilter(value as EnrichedLog["entityType"] | "all")
              setPage(0)
            }}
          >
            <SelectTrigger className="w-48">
              <SelectValue placeholder="All entities" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="RawMaterial">Raw Material</SelectItem>
              <SelectItem value="StoreItem">Store Item</SelectItem>
              <SelectItem value="FinalStockItem">Final Stock Item</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1">
          <span className="text-sm text-muted-foreground">User</span>
          <Input
            placeholder="Filter by user"
            value={userFilter}
            onChange={(e) => {
              setUserFilter(e.target.value)
              setPage(0)
            }}
            className="w-44"
          />
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              setFrom("")
              setTo("")
              setActionFilter("all")
              setEntityFilter("all")
              setUserFilter("")
              setPage(0)
            }}
          >
            Clear filters
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Timestamp</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Entity Type</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>Product ID / System ID</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-24 text-center">
                    Loading audit trail...
                  </TableCell>
                </TableRow>
              ) : pageItems.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                    No audit records found for the selected filters.
                  </TableCell>
                </TableRow>
              ) : (
                pageItems.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="whitespace-nowrap text-xs">
                      {new Date(log.timestamp).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-xs font-medium">{log.action}</TableCell>
                    <TableCell className="text-xs">{log.entityType}</TableCell>
                    <TableCell className="text-xs">
                      {log.entityName ? (
                        <>
                          <span className="font-medium">{log.entityName}</span>
                          <span className="ml-1 text-[10px] text-muted-foreground">(ID: {log.recordId})</span>
                        </>
                      ) : (
                        <span className="text-muted-foreground text-xs">{log.recordId}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs font-mono">
                      {log.entityProductId || log.entitySystemId || "—"}
                    </TableCell>
                    <TableCell className="text-xs font-mono">
                      {log.entitySku || "—"}
                    </TableCell>
                    <TableCell className="text-xs">{log.user}</TableCell>
                    <TableCell className="text-xs max-w-xl whitespace-pre-wrap">
                      {log.details}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          <div className="flex items-center justify-between mt-4 text-xs text-muted-foreground">
            <span>
              Page {currentPage + 1} of {totalPages} ({filteredLogs.length} record
              {filteredLogs.length === 1 ? "" : "s"})
            </span>
            <div className="space-x-2">
              <Button
                size="sm"
                variant="outline"
                disabled={currentPage === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                Previous
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={currentPage >= totalPages - 1}
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
