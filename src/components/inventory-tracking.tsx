"use client";

import { useMemo } from "react";
import { type ActivityLog, type RawMaterial, type FinalStock, type Batch } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { ArrowDownCircle, ArrowUpCircle } from "lucide-react";
import { format } from "date-fns";
import { getBatchId } from "@/lib/utils";

interface InventoryMovement {
  id: string;
  date: string;
  quantity: number;
  batchId: string;
  batchName?: string;
  orderId?: string;
  details: string;
  type: "inward" | "outward";
}

interface InventoryTrackingProps {
  item: RawMaterial | FinalStock;
  itemType: "RawMaterial" | "FinalStock";
  activityLog: ActivityLog[];
  batches?: Batch[]; // For batch name lookup
}

export function InventoryTracking({
  item,
  itemType,
  activityLog,
  batches = [],
}: InventoryTrackingProps) {
  // Create batch lookup map
  const batchMap = useMemo(() => {
    const map = new Map<string, Batch>();
    batches.forEach((batch) => {
      const batchId = getBatchId(batch);
      map.set(batchId, batch);
    });
    return map;
  }, [batches]);

  // Parse activity logs to extract inventory movements
  const movements = useMemo(() => {
    const movementsList: InventoryMovement[] = [];

    if (itemType === "RawMaterial") {
      const material = item as RawMaterial;

      // Parse activity logs for this material
      activityLog
        .filter((log) => log.recordId === material.id)
        .forEach((log) => {
          const details = log.details || "";
          const timestamp = log.timestamp;

          // INWARD: Material created/added from batch
          if (
            log.action === "Created" ||
            (log.action === "Stock Adjustment (Batch)" && details.includes("added to Store"))
          ) {
            // Extract batch ID from details: "X items from batch BATCH-ID added to Store"
            const batchMatch = details.match(/batch\s+([A-Z0-9-]+)/i);
            if (batchMatch) {
              const batchId = batchMatch[1];
              const quantityMatch = details.match(/(\d+)\s+(?:moulded|machined|assembled)\s+items/i);
              const quantity = quantityMatch ? parseInt(quantityMatch[1], 10) : 0;

              movementsList.push({
                id: log.id,
                date: timestamp,
                quantity,
                batchId,
                batchName: batchMap.get(batchId)?.productName,
                details: log.details || "",
                type: "inward",
              });
            }
            // Also check sourceBatchId if available
            if (material.sourceBatchId) {
              movementsList.push({
                id: `${log.id}-source`,
                date: timestamp,
                quantity: material.quantity, // Approximate, actual quantity from log details preferred
                batchId: material.sourceBatchId,
                batchName: batchMap.get(material.sourceBatchId)?.productName,
                details: `Initial creation from batch ${material.sourceBatchId}`,
                type: "inward",
              });
            }
          }

          // OUTWARD: Material consumed by batch
          if (
            log.action === "Stock Adjustment (Batch)" &&
            details.includes("consumed")
          ) {
            // Extract batch ID: "Batch BATCH-ID (Stage) consumed X pcs"
            const batchMatch = details.match(/Batch\s+([A-Z0-9-]+)\s*\(/i);
            if (batchMatch) {
              const batchId = batchMatch[1];
              const quantityMatch = details.match(/consumed\s+(\d+)/i);
              const quantity = quantityMatch ? parseInt(quantityMatch[1], 10) : 0;

              movementsList.push({
                id: log.id,
                date: timestamp,
                quantity,
                batchId,
                batchName: batchMap.get(batchId)?.productName,
                details: log.details || "",
                type: "outward",
              });
            }
          }

          // OUTWARD: Material deleted (fully consumed)
          if (log.action === "Deleted" && details.includes("consumed")) {
            const batchMatch = details.match(/Batch\s+([A-Z0-9-]+)\s*\(/i);
            if (batchMatch) {
              const batchId = batchMatch[1];
              const quantityMatch = details.match(/stock\s*\((\d+)/i);
              const quantity = quantityMatch ? parseInt(quantityMatch[1], 10) : 0;

              movementsList.push({
                id: log.id,
                date: timestamp,
                quantity,
                batchId,
                batchName: batchMap.get(batchId)?.productName,
                details: log.details || "",
                type: "outward",
              });
            }
          }
        });
    } else if (itemType === "FinalStock") {
      const product = item as FinalStock;

      // INWARD: Batches that produced this final stock
      if (product.batches && Array.isArray(product.batches)) {
        product.batches.forEach((batchEntry) => {
          const batchId = batchEntry.batchId || batchEntry.sourceBatchId;
          if (batchId) {
            movementsList.push({
              id: `batch-${batchId}-${batchEntry.createdAt}`,
              date: batchEntry.createdAt || new Date().toISOString(),
              quantity: Number(batchEntry.quantity || 0),
              batchId,
              batchName: batchMap.get(batchId)?.productName,
              details: `Batch ${batchId} produced ${batchEntry.quantity} units`,
              type: "inward",
            });
          }
        });
      }

      // Parse activity logs for outward movements
      activityLog
        .filter((log) => {
          // Check if log is for this product or any of its batches
          if (log.recordId === product.id) return true;
          if (product.batches && Array.isArray(product.batches)) {
            return product.batches.some(
              (b) => b.batchId === log.recordId || b.sourceBatchId === log.recordId
            );
          }
          return false;
        })
        .forEach((log) => {
          const details = log.details || "";
          const timestamp = log.timestamp;

          // OUTWARD: Consumed by order
          if (details.includes("order") || details.includes("Order")) {
            const orderMatch = details.match(/[Oo]rder\s*[#:]?\s*([A-Z0-9-]+)/i);
            const orderId = orderMatch ? orderMatch[1] : "Unknown Order";
            const quantityMatch = details.match(/(\d+)\s*(?:units?|pcs?)/i);
            const quantity = quantityMatch ? parseInt(quantityMatch[1], 10) : 0;

            movementsList.push({
              id: log.id,
              date: timestamp,
              quantity,
              orderId,
              batchId: "",
              details: log.details || "",
              type: "outward",
            });
          }

          // OUTWARD: Consumed by batch (used as input)
          if (details.includes("consumed") && details.includes("Batch")) {
            const batchMatch = details.match(/Batch\s+([A-Z0-9-]+)/i);
            if (batchMatch) {
              const batchId = batchMatch[1];
              const quantityMatch = details.match(/(\d+)\s*(?:units?|pcs?)/i);
              const quantity = quantityMatch ? parseInt(quantityMatch[1], 10) : 0;

              movementsList.push({
                id: log.id,
                date: timestamp,
                quantity,
                batchId,
                batchName: batchMap.get(batchId)?.productName,
                details: log.details || "",
                type: "outward",
              });
            }
          }
        });
    }

    // Sort by date (newest first)
    return movementsList.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }, [item, itemType, activityLog, batchMap]);

  const inwardMovements = movements.filter((m) => m.type === "inward");
  const outwardMovements = movements.filter((m) => m.type === "outward");

  return (
    <Tabs defaultValue="inward" className="w-full">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="inward" className="flex items-center gap-2">
          <ArrowDownCircle className="h-4 w-4 text-green-600" />
          Inward
          <Badge variant="secondary" className="ml-1">
            {inwardMovements.length}
          </Badge>
        </TabsTrigger>
        <TabsTrigger value="outward" className="flex items-center gap-2">
          <ArrowUpCircle className="h-4 w-4 text-red-600" />
          Outward
          <Badge variant="secondary" className="ml-1">
            {outwardMovements.length}
          </Badge>
        </TabsTrigger>
      </TabsList>

      <TabsContent value="inward" className="mt-4">
        <Card>
          <CardHeader>
            <CardTitle>Inward Inventory</CardTitle>
            <CardDescription>
              {itemType === "RawMaterial"
                ? "Batches that created this store item"
                : "Batches that produced this final stock item"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {inwardMovements.length === 0 ? (
              <p className="text-sm text-muted-foreground">No inward movements recorded</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Batch ID</TableHead>
                    <TableHead>Batch Name</TableHead>
                    <TableHead className="text-right">Quantity</TableHead>
                    <TableHead>Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inwardMovements.map((movement) => (
                    <TableRow key={movement.id}>
                      <TableCell className="text-sm">
                        {format(new Date(movement.date), "MMM dd, yyyy HH:mm")}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {movement.batchId}
                      </TableCell>
                      <TableCell className="text-sm">
                        {movement.batchName || "—"}
                      </TableCell>
                      <TableCell className="text-right font-medium text-green-600">
                        +{movement.quantity}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                        {movement.details}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="outward" className="mt-4">
        <Card>
          <CardHeader>
            <CardTitle>Outward Inventory</CardTitle>
            <CardDescription>
              {itemType === "RawMaterial"
                ? "Batches that consumed this store item"
                : "Orders or batches that consumed this final stock item"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {outwardMovements.length === 0 ? (
              <p className="text-sm text-muted-foreground">No outward movements recorded</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>
                      {itemType === "RawMaterial" ? "Batch ID" : "Reference"}
                    </TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead className="text-right">Quantity</TableHead>
                    <TableHead>Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {outwardMovements.map((movement) => (
                    <TableRow key={movement.id}>
                      <TableCell className="text-sm">
                        {format(new Date(movement.date), "MMM dd, yyyy HH:mm")}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {movement.batchId || movement.orderId || "—"}
                      </TableCell>
                      <TableCell className="text-sm">
                        {movement.batchName || movement.orderId || "—"}
                      </TableCell>
                      <TableCell className="text-right font-medium text-red-600">
                        -{movement.quantity}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                        {movement.details}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}

