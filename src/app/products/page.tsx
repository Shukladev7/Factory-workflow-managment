"use client";

import { useState, useEffect, useMemo } from "react";
import Image from "next/image";
import PageHeader from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { FinalStock } from "@/lib/types";
import { PlusCircle, MoreHorizontal, FileDown, Upload } from "lucide-react";
import { useFinalStock } from "@/hooks/use-final-stock";
import { useActivityLog } from "@/hooks/use-activity-log";
import { usePermissions } from "@/hooks/use-permissions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { CreateProductForm } from "@/components/create-product-form";
import { useToast } from "@/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ItemDetailsDialog } from "@/components/item-details-dialog";
import * as XLSX from "xlsx";
import { CSVImportDialog } from "@/components/csv-import-dialog";
import { ProductDetailsDialog } from "@/components/product-details-dialog";

// Grouped product interface
interface GroupedProduct {
  productName: string;
  batches: Array<{
    batchId: string;
    fullEntry: FinalStock;
  }>;
  firstEntry: FinalStock; // Use first entry for image and SKU display
  productTemplate: FinalStock | null; // The main product template (if exists)
}

export default function ProductsPage() {
  const { finalStock, createFinalStock, updateFinalStock, deleteFinalStock } =
    useFinalStock();
  const { activityLog, createActivityLog } = useActivityLog();
  const { canEdit } = usePermissions();
  const [isCreateFormOpen, setIsCreateFormOpen] = useState(false);
  const [selectedGroupedProduct, setSelectedGroupedProduct] =
    useState<GroupedProduct | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isClient, setIsClient] = useState(false);
  const { toast } = useToast();
  
  const canEditFinalStock = canEdit("Final Stock");

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Map products with embedded batches
  const groupedProducts = useMemo(() => {
    console.log(
      "[ProductsPage] Loading products. Total items in finalStock:",
      finalStock.length,
    );
    console.log(
      "[ProductsPage] FinalStock product IDs:",
      finalStock.map((p) => ({ name: p.name, id: p.id })),
    );

    const result = finalStock.map((product) => {
      console.log(
        `[ProductsPage] Mapping product: "${product.name}" with ID: "${product.id}"`,
      );
      return {
        productName: product.name,
        batches: (product.batches || []).map((batch) => ({
          batchId: batch.batchId,
          fullEntry: {
            ...product,
            id: `${product.id}-${batch.batchId}`, // Virtual ID for batch entry
            sku: batch.sku,
            quantity: batch.quantity,
            createdAt: batch.createdAt,
          } as FinalStock,
        })),
        firstEntry: product,
        productTemplate: product,
      };
    });

    console.log("[ProductsPage] Loaded", result.length, "products");
    result.forEach((group) => {
      console.log(
        `  - ${group.productName}: ${group.batches.length} batches, template ID: ${group.productTemplate?.id}`,
      );
    });

    return result;
  }, [finalStock]);

  const handleProductCreated = async (newProduct: FinalStock) => {
    try {
      console.log("[ProductsPage] Creating product:", newProduct.name);
      console.log(
        "[ProductsPage] Product data:",
        JSON.stringify(newProduct, null, 2),
      );

      // Remove the empty id field before sending to Firestore
      const { id, ...productData } = newProduct;

      // Create product in Firestore and get the generated ID
      const productId = await createFinalStock(productData);
      console.log("[ProductsPage] ✓ Product created with ID:", productId);

      await createActivityLog({
        recordId: productId,
        recordType: "FinalStock",
        action: "Created",
        details: `Product "${newProduct.name}" was created.`,
        timestamp: new Date().toISOString(),
        user: "System",
      });

      console.log("[ProductsPage] ✓ Activity log created");
      console.log(
        "[ProductsPage] Current finalStock count:",
        finalStock.length,
      );

      setIsCreateFormOpen(false);
      toast({
        title: "Product Created",
        description: `Product ${newProduct.name} has been successfully created.`,
      });
    } catch (error) {
      console.error("[ProductsPage] ❌ Failed to create product:", error);
      toast({
        variant: "destructive",
        title: "Creation Failed",
        description: `Failed to create product: ${error instanceof Error ? error.message : "Unknown error"}`,
      });
    }
  };

  const handleProductUpdated = (updatedProduct: FinalStock) => {
    updateFinalStock(updatedProduct.id, updatedProduct);
    createActivityLog({
      recordId: updatedProduct.id,
      recordType: "FinalStock",
      action: "Updated",
      details: `Product "${updatedProduct.name}" was updated.`,
      timestamp: new Date().toISOString(),
      user: "System",
    });
    toast({
      title: "Product Updated",
      description: `${updatedProduct.name} has been updated.`,
    });
  };

  const handleProductDeleted = async (productId: string) => {
    console.log("[ProductsPage] ========== DELETE STARTED ==========");
    console.log(
      "[ProductsPage] handleProductDeleted called with ID:",
      productId,
    );
    console.log("[ProductsPage] Current finalStock length:", finalStock.length);
    console.log(
      "[ProductsPage] All finalStock IDs:",
      finalStock.map((p) => p.id),
    );

    const productToDelete = finalStock.find((p) => p.id === productId);
    if (!productToDelete) {
      console.warn(
        "[ProductsPage] Product not found in finalStock (may already be deleted):",
        productId,
      );
      toast({
        variant: "default",
        title: "Already Deleted",
        description: "This product has already been deleted.",
      });
      return;
    }

    const batchCount = productToDelete.batches?.length || 0;

    console.log("[ProductsPage] Product to delete:", {
      id: productToDelete.id,
      name: productToDelete.name,
      batches: batchCount,
    });

    // Validate document ID before attempting deletion
    if (!productId || productId.trim() === "") {
      console.error("[ProductsPage] Invalid product ID: empty or undefined");
      toast({
        variant: "destructive",
        title: "Delete Failed",
        description: "Invalid product ID. Cannot delete product.",
      });
      return;
    }

    if (productId === "finalStock" || productId.includes("/")) {
      console.error("[ProductsPage] Invalid product ID format:", productId);
      toast({
        variant: "destructive",
        title: "Delete Failed",
        description: `Invalid product ID format: "${productId}". This looks like a collection name or path instead of a document ID.`,
      });
      return;
    }

    try {
      console.log("[ProductsPage] Calling deleteFinalStock...");
      await deleteFinalStock(productId);
      console.log("[ProductsPage] ✓ deleteFinalStock completed successfully");

      console.log("[ProductsPage] Creating activity log...");
      await createActivityLog({
        recordId: productId,
        recordType: "FinalStock",
        action: "Deleted",
        details: `Product "${productToDelete.name}" and ${batchCount} batch(es) were deleted.`,
        timestamp: new Date().toISOString(),
        user: "System",
      });
      console.log("[ProductsPage] ✓ Activity log created");

      toast({
        title: "Product Deleted",
        description: `${productToDelete.name} and ${batchCount} batch(es) have been deleted.`,
      });
      console.log("[ProductsPage] ========== DELETE COMPLETED ==========");
    } catch (error) {
      console.error("[ProductsPage] ❌ Delete operation failed:", error);
      console.error(
        "[ProductsPage] Error details:",
        error instanceof Error ? error.message : "Unknown error",
      );
      toast({
        variant: "destructive",
        title: "Delete Failed",
        description: `Failed to delete ${productToDelete.name}: ${error instanceof Error ? error.message : "Unknown error"}`,
      });
      // Don't re-throw to prevent dialog from staying open
    }
  };

  const handleViewDetails = (groupedProduct: GroupedProduct) => {
    setSelectedGroupedProduct(groupedProduct);
    setIsDetailsOpen(true);
  };

  const handleDialogClose = (isOpen: boolean) => {
    setIsDetailsOpen(isOpen);
    // Clear selected product when dialog closes to prevent stale data
    if (!isOpen) {
      setSelectedGroupedProduct(null);
    }
  };

  const handleExport = () => {
    const worksheet = XLSX.utils.json_to_sheet(finalStock);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Final Stock");
    XLSX.writeFile(workbook, "final_stock.xlsx");
    toast({
      title: "Exporting Data",
      description: "Your final stock data is being downloaded.",
    });
  };

  const validateProductRow = (row: any, index: number) => {
    const errors: string[] = [];

    if (!row.name || row.name.trim() === "") {
      errors.push("Name is required");
    }

    if (!row.sku || row.sku.trim() === "") {
      errors.push("SKU is required");
    }

    if (!row.price || isNaN(Number(row.price)) || Number(row.price) < 0) {
      errors.push("Price must be a valid positive number");
    }

    if (
      !row.gstRate ||
      isNaN(Number(row.gstRate)) ||
      Number(row.gstRate) < 0 ||
      Number(row.gstRate) > 100
    ) {
      errors.push("GST Rate must be a valid number between 0 and 100");
    }

    return { isValid: errors.length === 0, errors };
  };

  const transformProductRow = (
    row: any,
  ): Omit<FinalStock, "id"> & { id: string } => {
    return {
      id: "", // Temporary - will be removed before sending to Firestore
      name: row.name.trim(),
      sku: row.sku.trim(),
      price: Number(row.price),
      gstRate: Number(row.gstRate),
      imageUrl: row.imageUrl?.trim() || "/diverse-products-still-life.png",
      imageHint: row.imageHint?.trim() || row.name.trim(),
      batches: [], // Initialize with empty batches array
    };
  };

  const handleCSVImport = async (importedProducts: FinalStock[]) => {
    try {
      let successCount = 0;
      for (const product of importedProducts) {
        try {
          // Remove id field before creating
          const { id, ...productData } = product;
          const productId = await createFinalStock(productData);
          console.log(
            `[ProductsPage] Imported product: ${product.name} with ID: ${productId}`,
          );

          await createActivityLog({
            recordId: productId,
            recordType: "FinalStock",
            action: "Created",
            details: `Product "${product.name}" was imported from CSV.`,
            timestamp: new Date().toISOString(),
            user: "System",
          });
          successCount++;
        } catch (error) {
          console.error(
            `[ProductsPage] Failed to import product ${product.name}:`,
            error,
          );
        }
      }

      toast({
        title: "Import Complete",
        description: `Successfully imported ${successCount} of ${importedProducts.length} product(s).`,
      });
    } catch (error) {
      console.error("[ProductsPage] CSV import failed:", error);
      toast({
        variant: "destructive",
        title: "Import Failed",
        description: "Failed to import products. Check console for details.",
      });
    }
  };

  if (!isClient) {
    return null;
  }

  return (
    <>
      <PageHeader
        title="Final Stock"
        description="Manage the catalog of finished products that can be produced."
      >
        {canEditFinalStock && (
          <CSVImportDialog
            title="Import Products from CSV"
            description="Upload a CSV file to import multiple products at once. Optional columns: imageUrl, imageHint"
            expectedColumns={["name", "sku", "price", "gstRate"]}
            onImport={handleCSVImport}
            validateRow={validateProductRow}
            transformRow={transformProductRow}
          >
            <Button variant="outline">
              <Upload className="mr-2 h-4 w-4" />
              Import CSV
            </Button>
          </CSVImportDialog>
        )}
        <Button variant="outline" onClick={handleExport}>
          <FileDown className="mr-2 h-4 w-4" />
          Export to Excel
        </Button>

        {canEditFinalStock && (
          <Dialog open={isCreateFormOpen} onOpenChange={setIsCreateFormOpen}>
            <DialogTrigger asChild>
              <Button>
                <PlusCircle className="mr-2 h-4 w-4" /> Add Product
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px] max-h-[700px] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Add New Product</DialogTitle>
                <DialogDescription>
                  Enter the details for the new finished product.
                </DialogDescription>
              </DialogHeader>
              <CreateProductForm onProductCreated={handleProductCreated} />
            </DialogContent>
          </Dialog>
        )}
      </PageHeader>
      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[80px]">Image</TableHead>
                <TableHead>System ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Unit Price</TableHead>
                <TableHead>GST Rate</TableHead>
                <TableHead className="text-right w-[60px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groupedProducts.map((group) => (
                <TableRow key={group.productName}>
                  <TableCell>
                    <div className="relative w-16 h-12 rounded-md overflow-hidden">
                      <Image
                        src={group.firstEntry.imageUrl || "/placeholder.svg"}
                        alt={group.productName}
                        data-ai-hint={group.firstEntry.imageHint}
                        fill
                        className="object-cover"
                      />
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {group.firstEntry.id}
                  </TableCell>
                  <TableCell className="font-medium">
                    {group.productName}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {group.firstEntry.sku}
                  </TableCell>
                  <TableCell>
                    ₹{group.firstEntry.price.toLocaleString()}
                  </TableCell>
                  <TableCell>{group.firstEntry.gstRate}%</TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuItem
                          onClick={() => handleViewDetails(group)}
                        >
                          View Details
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {selectedGroupedProduct && (
        <ProductDetailsDialog
          isOpen={isDetailsOpen}
          onOpenChange={handleDialogClose}
          groupedProduct={selectedGroupedProduct}
          activityLog={activityLog}
          onProductUpdate={handleProductUpdated}
          onProductDelete={handleProductDeleted}
          canEdit={canEditFinalStock}
        />
      )}
    </>
  );
}
