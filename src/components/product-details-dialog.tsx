"use client";

import { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { type ActivityLog, type FinalStock, type Batch } from "@/lib/types";
import { InventoryTracking } from "./inventory-tracking";
import { Button } from "./ui/button";
import { EditProductForm } from "./edit-product-form";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "./ui/alert-dialog";
import Image from "next/image";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";

interface GroupedProduct {
  productName: string;
  batches: Array<{
    batchId: string;
    fullEntry: FinalStock;
  }>;
  firstEntry: FinalStock;
  productTemplate: FinalStock | null; // The main product template (if exists)
}

interface ProductDetailsDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  groupedProduct: GroupedProduct;
  activityLog: ActivityLog[];
  onProductUpdate: (product: FinalStock) => void;
  onProductDelete: (id: string) => Promise<void>;
  canEdit?: boolean;
  batches?: Batch[]; // Optional batches for batch name lookup in inventory tracking
}

export function ProductDetailsDialog({
  isOpen,
  onOpenChange,
  groupedProduct,
  activityLog,
  onProductUpdate,
  onProductDelete,
  canEdit = true,
  batches = [],
}: ProductDetailsDialogProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleUpdate = (updatedProduct: FinalStock) => {
    onProductUpdate(updatedProduct);
    setIsEditing(false);
  };

  const handleDelete = async () => {
    setIsDeleting(true);

    try {
      console.log(
        "[ProductDetailsDialog] ========== DELETE DEBUG START ==========",
      );
      console.log(
        "[ProductDetailsDialog] Product name:",
        groupedProduct.productName,
      );
      console.log(
        "[ProductDetailsDialog] Full groupedProduct object:",
        JSON.stringify(groupedProduct, null, 2),
      );
      console.log(
        "[ProductDetailsDialog] Product template exists:",
        !!groupedProduct.productTemplate,
      );

      if (groupedProduct.productTemplate) {
        console.log(
          "[ProductDetailsDialog] Product template ID:",
          groupedProduct.productTemplate.id,
        );
        console.log(
          "[ProductDetailsDialog] Product template full object:",
          JSON.stringify(groupedProduct.productTemplate, null, 2),
        );
      }

      console.log(
        "[ProductDetailsDialog] Number of embedded batches:",
        groupedProduct.batches.length,
      );
      console.log(
        "[ProductDetailsDialog] First entry ID:",
        groupedProduct.firstEntry?.id,
      );

      // Delete the product (which includes all embedded batches)
      if (!groupedProduct.productTemplate) {
        console.error("[ProductDetailsDialog] No product template found");
        alert("Cannot delete: Product template not found");
        setIsDeleting(false);
        return;
      }

      const productIdToDelete = groupedProduct.productTemplate.id;
      console.log(
        "[ProductDetailsDialog] Product ID to delete:",
        productIdToDelete,
      );
      console.log(
        "[ProductDetailsDialog] Product ID type:",
        typeof productIdToDelete,
      );
      console.log(
        "[ProductDetailsDialog] Product ID length:",
        productIdToDelete?.length,
      );

      console.log(
        "[ProductDetailsDialog] Calling onProductDelete with ID:",
        productIdToDelete,
      );
      await onProductDelete(productIdToDelete);

      console.log(
        "[ProductDetailsDialog] ✓ Product and all batches deleted successfully",
      );

      // Close dialog after successful deletion
      onOpenChange(false);
    } catch (error) {
      console.error("[ProductDetailsDialog] ❌ Delete failed:", error);
      console.error(
        "[ProductDetailsDialog] Error details:",
        error instanceof Error ? error.message : "Unknown error",
      );
      alert(
        `Delete failed: ${error instanceof Error ? error.message : "Unknown error"}. Please try again or check the console for details.`,
      );
      setIsDeleting(false);
    }
  };

  // Filter activity logs for all batch entries and product template
  const relevantActivityLogs = useMemo(() => {
    const relevantIds = new Set(
      groupedProduct.batches.map((b) => b.fullEntry.id),
    );
    if (groupedProduct.productTemplate) {
      relevantIds.add(groupedProduct.productTemplate.id);
    }
    return activityLog.filter((log) => relevantIds.has(log.recordId));
  }, [activityLog, groupedProduct.batches, groupedProduct.productTemplate]);

  // Calculate total quantity across all batches
  const totalQuantity = useMemo(() => {
    return groupedProduct.batches.reduce((sum, batch) => {
      return sum + Number(batch.fullEntry.quantity ?? 0);
    }, 0);
  }, [groupedProduct.batches]);

  // Reset edit state when dialog closes
  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setIsEditing(false);
    }
    onOpenChange(open);
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[1200px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing
              ? `Edit ${groupedProduct.productName}`
              : groupedProduct.productName}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? `Update the details for this product.`
              : `Viewing details and batch information for ${groupedProduct.productName}.`}
          </DialogDescription>
        </DialogHeader>

        {isEditing ? (
          groupedProduct.productTemplate ? (
            <EditProductForm
              product={groupedProduct.productTemplate}
              onProductUpdated={handleUpdate}
            />
          ) : (
            <p className="text-sm text-muted-foreground py-4">
              Cannot edit - no product template exists. Only batch entries
              available.
            </p>
          )
        ) : (
          <Tabs defaultValue="details" className="pt-4">
            <TabsList>
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="batches">
                Batches ({groupedProduct.batches.length})
              </TabsTrigger>
              <TabsTrigger value="inventory">Inventory</TabsTrigger>
              <TabsTrigger value="log">Activity Log</TabsTrigger>
            </TabsList>

            <TabsContent value="details" className="mt-4">
              <div className="space-y-4">
                <div className="relative aspect-video w-full rounded-lg overflow-hidden">
                  <Image
                    src={groupedProduct.firstEntry.imageUrl || "/placeholder.svg"}
                    alt={groupedProduct.productName}
                    data-ai-hint={groupedProduct.firstEntry.imageHint}
                    fill
                    className="object-cover"
                  />
                </div>
                <div className="space-y-2">
                  <p>
                    <strong>System ID:</strong>{" "}
                    <span className="font-mono text-sm">
                      {groupedProduct.firstEntry.id}
                    </span>
                  </p>
                  <p>
                    <strong>SKU:</strong>{" "}
                    <span className="font-mono text-sm">
                      {groupedProduct.firstEntry.sku}
                    </span>
                  </p>
                  <p>
                    <strong>Unit Price:</strong> ₹
                    {groupedProduct.firstEntry.price.toLocaleString()}
                  </p>
                  <p>
                    <strong>GST Rate:</strong>{" "}
                    {groupedProduct.firstEntry.gstRate}%
                  </p>
                  <p>
                    <strong>Total Batches:</strong>{" "}
                    {groupedProduct.batches.length}
                  </p>
                  <p>
                    <strong>Total Quantity:</strong> {totalQuantity} pcs
                  </p>
                </div>
              </div>
              <DialogFooter className="pt-6">
                {groupedProduct.productTemplate && canEdit ? (
                  <>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="destructive">Delete Product</Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This action cannot be undone. This will permanently
                            delete the product "{groupedProduct.productName}"
                            and all {groupedProduct.batches.length} embedded
                            batch
                            {groupedProduct.batches.length !== 1 ? "es" : ""}.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel disabled={isDeleting}>
                            Cancel
                          </AlertDialogCancel>
                          <AlertDialogAction
                            onClick={handleDelete}
                            disabled={isDeleting}
                          >
                            {isDeleting ? "Deleting..." : "Delete All"}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                    <Button onClick={() => setIsEditing(true)}>Edit</Button>
                  </>
                ) : !canEdit ? (
                  <p className="text-sm text-muted-foreground">
                    View only - No edit permission
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No product template found.
                  </p>
                )}
              </DialogFooter>
            </TabsContent>

            <TabsContent value="batches" className="mt-4 space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Batch Inventory</CardTitle>
                  <CardDescription>
                    All batches of {groupedProduct.productName} in Final Stock
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {groupedProduct.batches.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No batches available
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {/* Header row */}
                        <div className="grid grid-cols-3 gap-4 pb-2 border-b font-semibold text-sm">
                          <div>Batch ID</div>
                          <div>Quantity</div>
                          <div>Date</div>
                        </div>
                        {/* Batch rows */}
                        {groupedProduct.batches.map((batch, index) => (
                          <div
                            key={batch.fullEntry.id}
                            className="grid grid-cols-3 gap-4 p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                          >
                            <div>
                              <div className="font-semibold text-sm">
                                Batch {batch.batchId}
                              </div>
                              <p className="text-xs text-muted-foreground mt-1">
                                {batch.fullEntry.sku}
                              </p>
                            </div>
                            <div>
                              <div className="text-sm font-medium">
                                {batch.fullEntry.quantity !== undefined
                                  ? `${batch.fullEntry.quantity} pcs`
                                  : "N/A"}
                              </div>
                              <p className="text-xs text-muted-foreground mt-1">
                                Accepted quantity
                              </p>
                            </div>
                            <div>
                              <div className="text-sm">
                                {batch.fullEntry.createdAt
                                  ? new Date(
                                      batch.fullEntry.createdAt,
                                    ).toLocaleDateString("en-IN", {
                                      year: "numeric",
                                      month: "short",
                                      day: "numeric",
                                    })
                                  : "N/A"}
                              </div>
                              <p className="text-xs text-muted-foreground mt-1">
                                {batch.fullEntry.createdAt
                                  ? new Date(
                                      batch.fullEntry.createdAt,
                                    ).toLocaleTimeString("en-IN", {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })
                                  : ""}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="inventory" className="mt-4">
              <InventoryTracking
                item={groupedProduct.firstEntry}
                itemType="FinalStock"
                activityLog={relevantActivityLogs}
                batches={batches}
              />
            </TabsContent>

            <TabsContent value="log" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Activity Log</CardTitle>
                  <CardDescription>
                    All activities related to this product and its batches
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {relevantActivityLogs.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No activity recorded yet.
                    </p>
                  ) : (
                    <div className="space-y-4">
                      {relevantActivityLogs
                        .sort(
                          (a, b) =>
                            new Date(b.timestamp).getTime() -
                            new Date(a.timestamp).getTime(),
                        )
                        .map((log) => (
                          <div
                            key={log.id}
                            className="border-l-2 border-primary pl-4 py-2"
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-semibold text-sm">
                                {log.action}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {new Date(log.timestamp).toLocaleString()}
                              </span>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {log.details}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                              By: {log.user}
                            </p>
                          </div>
                        ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
