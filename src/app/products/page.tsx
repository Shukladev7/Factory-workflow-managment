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
import { PlusCircle, MoreHorizontal, FileDown, Upload, Search, AlertTriangle, XCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useFinalStock } from "@/hooks/use-final-stock";
import { useActivityLog } from "@/hooks/use-activity-log";
import { usePermissions } from "@/hooks/use-permissions";
import { useBatches } from "@/hooks/use-batches";
import { useRawMaterials } from "@/hooks/use-raw-materials";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
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
import { Badge } from "@/components/ui/badge";
import { RestockModal } from "@/components/restock-modal";
import { SortControls, sortArray, type SortDirection } from "@/components/sort-controls";
import { addRawMaterial, updateRawMaterial, batchUpdateRawMaterials } from "@/lib/firebase/firestore-operations";

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

// Ensure linked raw materials' thresholds reflect the product-level thresholds
async function syncLinkedMaterialThresholds(product: FinalStock) {
  const updates: Array<{ id: string; updates: { threshold: number } }> = [];

  if (product.mouldedMaterialId && product.mouldedMaterialId.trim().length > 0) {
    updates.push({ id: product.mouldedMaterialId, updates: { threshold: product.mouldedThreshold ?? 0 } });
  }
  if (product.machinedMaterialId && product.machinedMaterialId.trim().length > 0) {
    updates.push({ id: product.machinedMaterialId, updates: { threshold: product.machinedThreshold ?? 0 } });
  }
  if (product.assembledMaterialId && product.assembledMaterialId.trim().length > 0) {
    updates.push({ id: product.assembledMaterialId, updates: { threshold: product.assembledThreshold ?? 0 } });
  }

  if (updates.length > 0) {
    await batchUpdateRawMaterials(updates);
  }
}

const MOULDED_UNIT_ID = "__MOULDED_UNIT__";
const MACHINED_UNIT_ID = "__MACHINED_UNIT__";
const ASSEMBLED_UNIT_ID = "__ASSEMBLED_UNIT__";

async function buildLinkedUnitUpdatesForProduct(
  product: FinalStock,
): Promise<Partial<FinalStock>> {
  if (!product.bom_per_piece || product.bom_per_piece.length === 0) {
    return {};
  }

  const updatedBom = product.bom_per_piece.map((row) => ({ ...row }));
  let mouldedMaterialId = product.mouldedMaterialId;
  let machinedMaterialId = product.machinedMaterialId;
  let assembledMaterialId = product.assembledMaterialId;
  let bomChanged = false;
  const now = new Date().toISOString();

  const hasMouldedPlaceholder = updatedBom.some(
    (row) => row.raw_material_id === MOULDED_UNIT_ID,
  );
  if (hasMouldedPlaceholder) {
    if (!mouldedMaterialId) {
      mouldedMaterialId = await addRawMaterial({
        name: `Moulded ${product.name}`,
        sku: `M-${product.sku}`,
        quantity: 0,
        unit: "pcs",
        threshold: product.mouldedThreshold ?? 0,
        isMoulded: true,
        isFinished: false,
        createdAt: now,
      });
    }

    updatedBom.forEach((row) => {
      if (row.raw_material_id === MOULDED_UNIT_ID) {
        row.raw_material_id = mouldedMaterialId as string;
        bomChanged = true;
      }
    });
  }

  const hasMachinedPlaceholder = updatedBom.some(
    (row) => row.raw_material_id === MACHINED_UNIT_ID,
  );
  if (hasMachinedPlaceholder) {
    if (!machinedMaterialId) {
      machinedMaterialId = await addRawMaterial({
        name: `Machined ${product.name}`,
        sku: `F-${product.sku}`,
        quantity: 0,
        unit: "pcs",
        threshold: product.machinedThreshold ?? 0,
        isMoulded: false,
        isFinished: true,
        createdAt: now,
      });
    }

    updatedBom.forEach((row) => {
      if (row.raw_material_id === MACHINED_UNIT_ID) {
        row.raw_material_id = machinedMaterialId as string;
        bomChanged = true;
      }
    });
  }

  const hasAssembledPlaceholder = updatedBom.some(
    (row) => row.raw_material_id === ASSEMBLED_UNIT_ID,
  );
  if (hasAssembledPlaceholder) {
    if (!assembledMaterialId) {
      assembledMaterialId = await addRawMaterial({
        name: `Assembled ${product.name}`,
        sku: `A-${product.sku}`,
        quantity: 0,
        unit: "pcs",
        threshold: product.assembledThreshold ?? 0,
        isMoulded: false,
        isFinished: false,
        isAssembled: true,
        createdAt: now,
      });
    }

    updatedBom.forEach((row) => {
      if (row.raw_material_id === ASSEMBLED_UNIT_ID) {
        row.raw_material_id = assembledMaterialId as string;
        bomChanged = true;
      }
    });
  }

  const updates: Partial<FinalStock> = {};

  if (bomChanged) {
    updates.bom_per_piece = updatedBom;
  }
  if (mouldedMaterialId && mouldedMaterialId !== product.mouldedMaterialId) {
    updates.mouldedMaterialId = mouldedMaterialId;
  }
  if (machinedMaterialId && machinedMaterialId !== product.machinedMaterialId) {
    updates.machinedMaterialId = machinedMaterialId;
  }
  if (assembledMaterialId && assembledMaterialId !== product.assembledMaterialId) {
    updates.assembledMaterialId = assembledMaterialId;
  }

  return updates;
}

export default function ProductsPage() {
  const { finalStock, createFinalStock, updateFinalStock, deleteFinalStock } =
    useFinalStock();
  const { activityLog, createActivityLog } = useActivityLog();
  const { canEdit } = usePermissions();
  const { batches } = useBatches();
  const { rawMaterials } = useRawMaterials();
  const [isCreateFormOpen, setIsCreateFormOpen] = useState(false);
  const [selectedGroupedProduct, setSelectedGroupedProduct] =
    useState<GroupedProduct | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isClient, setIsClient] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortDirection, setSortDirection] = useState<SortDirection>("none");
  const [restockModal, setRestockModal] = useState<{
    isOpen: boolean;
    product: GroupedProduct | null;
  }>({ isOpen: false, product: null });
  const [deleteTargetProduct, setDeleteTargetProduct] = useState<FinalStock | null>(null);
  const [deleteDependentProducts, setDeleteDependentProducts] = useState<FinalStock[]>([]);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
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

      // After product is created, create/link moulded & machined materials if required
      const linkedUpdates = await buildLinkedUnitUpdatesForProduct({
        ...newProduct,
        id: productId,
      });
      if (Object.keys(linkedUpdates).length > 0) {
        await updateFinalStock(productId, linkedUpdates);
      }

      // Sync thresholds to any linked materials (both newly created and pre-linked)
      const effectiveProductForSync: FinalStock = {
        ...newProduct,
        id: productId,
        ...linkedUpdates,
      } as FinalStock;
      await syncLinkedMaterialThresholds(effectiveProductForSync);

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

  const handleConfirmProductDeleteWithDependencies = async () => {
    if (!deleteTargetProduct) {
      setIsDeleteConfirmOpen(false);
      return;
    }

    const stageMaterialIds = [
      deleteTargetProduct.mouldedMaterialId,
      deleteTargetProduct.machinedMaterialId,
      deleteTargetProduct.assembledMaterialId,
    ].filter(Boolean) as string[];

    if (stageMaterialIds.length > 0) {
      const stageMaterials = rawMaterials.filter((m) =>
        stageMaterialIds.includes(m.id),
      );
      const hasStageStock = stageMaterials.some(
        (m) => Number(m.quantity || 0) > 0,
      );

      if (hasStageStock) {
        toast({
          variant: "destructive",
          title: "Cannot delete product",
          description:
            "Final stock cannot be deleted while stage-wise inventory exists. Please clear all stage quantities first.",
        });
        setIsDeleteConfirmOpen(false);
        setDeleteTargetProduct(null);
        setDeleteDependentProducts([]);
        return;
      }
    }

    const productId = deleteTargetProduct.id;
    const batchCount = deleteTargetProduct.batches?.length || 0;

    try {
      console.log("[ProductsPage] Cleaning reverse-dependent BOMs before delete...", {
        productId,
        dependents: deleteDependentProducts.map((p) => ({ id: p.id, name: p.name })),
      });

      // Remove this Final Stock item from BOMs of all dependent products
      await Promise.all(
        deleteDependentProducts.map(async (product) => {
          if (!Array.isArray(product.bom_per_piece)) return;
          const cleanedBom = product.bom_per_piece!.filter(
            (row) => !(row.raw_material_id === productId && row.source === "final"),
          );
          await updateFinalStock(product.id, { bom_per_piece: cleanedBom });
        }),
      );

      console.log("[ProductsPage] Reverse-dependent BOMs cleaned. Proceeding with deleteFinalStock...");

      await deleteFinalStock(productId);

      await createActivityLog({
        recordId: productId,
        recordType: "FinalStock",
        action: "Deleted",
        details: `Product "${deleteTargetProduct.name}" and ${batchCount} batch(es) were deleted. It was also removed from the BOM of ${deleteDependentProducts.length} dependent final stock item(s).`,
        timestamp: new Date().toISOString(),
        user: "System",
      });

      toast({
        title: "Product Deleted",
        description: `${deleteTargetProduct.name} and ${batchCount} batch(es) have been deleted and removed from all dependent BOMs.`,
      });
    } catch (error) {
      console.error("[ProductsPage] ❌ Dependency-aware delete failed:", error);
      toast({
        variant: "destructive",
        title: "Delete Failed",
        description:
          deleteTargetProduct.name +
          " could not be deleted due to an error while updating dependent BOMs.",
      });
    } finally {
      setIsDeleteConfirmOpen(false);
      setDeleteTargetProduct(null);
      setDeleteDependentProducts([]);
    }
  };

  const handleProductUpdated = async (updatedProduct: FinalStock) => {
    // Remove id field from updates as it shouldn't be stored as a document field
    const { id, ...baseUpdates } = updatedProduct;

    // Ensure linked moulded/machined materials exist and BOM references use real IDs
    const linkedUpdates = await buildLinkedUnitUpdatesForProduct(updatedProduct);
    const finalUpdates = { ...baseUpdates, ...linkedUpdates };

    await updateFinalStock(id, finalUpdates);

    // After saving product, sync thresholds to linked materials so Store shows correct values
    const effectiveProductForSync: FinalStock = {
      ...updatedProduct,
      ...linkedUpdates,
    } as FinalStock;
    await syncLinkedMaterialThresholds(effectiveProductForSync);
    await createActivityLog({
      recordId: id,
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

    // Keep the currently open ProductDetailsDialog in sync without requiring a reopen
    setSelectedGroupedProduct((current) => {
      if (!current || !current.productTemplate || current.productTemplate.id !== id) {
        return current;
      }

      // Merge the latest product data into the template and firstEntry
      const mergedTemplate: FinalStock = {
        ...current.productTemplate,
        ...effectiveProductForSync,
      };

      const mergedFirstEntry: FinalStock = {
        ...current.firstEntry,
        ...mergedTemplate,
      };

      return {
        ...current,
        productName: mergedTemplate.name,
        productTemplate: mergedTemplate,
        firstEntry: mergedFirstEntry,
        batches: current.batches.map((b) => ({
          ...b,
          fullEntry: {
            // Preserve the synthetic batch-level ID, but refresh all other fields
            ...b.fullEntry,
            ...mergedTemplate,
            id: b.fullEntry.id,
          },
        })),
      };
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

    const stageMaterialIds = [
      productToDelete.mouldedMaterialId,
      productToDelete.machinedMaterialId,
      productToDelete.assembledMaterialId,
    ].filter(Boolean) as string[];

    if (stageMaterialIds.length > 0) {
      const stageMaterials = rawMaterials.filter((m) =>
        stageMaterialIds.includes(m.id),
      );
      const hasStageStock = stageMaterials.some(
        (m) => Number(m.quantity || 0) > 0,
      );

      if (hasStageStock) {
        toast({
          variant: "destructive",
          title: "Cannot delete product",
          description:
            "Final stock cannot be deleted while stage-wise inventory exists. Please clear all stage quantities first.",
        });
        return;
      }
    }

    // Check reverse dependencies: other Final Stock items that use this product as an input (source = "final")
    const reverseDependencies = finalStock.filter(
      (product) =>
        product.id !== productToDelete.id &&
        Array.isArray(product.bom_per_piece) &&
        product.bom_per_piece!.some(
          (row) => row.raw_material_id === productId && row.source === "final",
        ),
    );

    if (reverseDependencies.length > 0) {
      // Show warning modal listing dependent Final Stock items. Actual deletion is handled on confirmation.
      setDeleteTargetProduct(productToDelete);
      setDeleteDependentProducts(reverseDependencies);
      setIsDeleteConfirmOpen(true);
      return;
    }

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
      manufacturingStages: [],
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

  const handleRestock = async (
    product: GroupedProduct,
    data: { quantity: number; batchId: string; sku: string; companyName: string; restockDate: string },
  ) => {
    try {
      if (!product.productTemplate) {
        throw new Error("Product template not found");
      }

      // Import the functions dynamically to avoid circular imports
      const { addBatchToProduct, addRestockRecord } = await import("@/lib/firebase/firestore-operations");

      const existingBatches = product.productTemplate.batches || [];
      const previousStock = existingBatches.reduce(
        (sum, b) => sum + Number(b.quantity ?? 0),
        0,
      );
      const updatedStock = previousStock + Number(data.quantity);

      const newBatch = {
        batchId: data.batchId,
        sourceBatchId: data.batchId,
        quantity: data.quantity,
        sku: data.sku,
        createdAt: new Date().toISOString(),
      };

      await addBatchToProduct(product.productTemplate.id, newBatch);

      await addRestockRecord({
        productId: product.productTemplate.id,
        productName: product.productName,
        quantityAdded: data.quantity,
        companyName: data.companyName,
        restockDate: new Date(data.restockDate + "T00:00:00").toISOString(),
        previousStock,
        updatedStock,
        createdAt: new Date().toISOString(),
      });

      await createActivityLog({
        recordId: product.productTemplate.id,
        recordType: "FinalStock",
        action: "Restocked",
        details: `Added ${data.quantity} units via batch ${data.batchId} from ${data.companyName} (prev: ${previousStock}, new: ${updatedStock}).`,
        timestamp: new Date().toISOString(),
        user: "System",
      });

      toast({
        title: "Stock Added",
        description: `Successfully added ${data.quantity} units to ${product.productName}`,
      });
    } catch (error) {
      console.error("Restock failed:", error);
      toast({
        variant: "destructive",
        title: "Restock Failed",
        description: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

const filteredAndSortedProducts = useMemo(() => {
  const rawQuery = searchQuery.trim();

  if (!rawQuery) {
    return sortArray(groupedProducts, sortDirection, (group) => group.productName);
  }

  const query = rawQuery.toLowerCase();

  const filtered = groupedProducts.filter((group) => {
    const template = group.productTemplate || group.firstEntry;

    const name = (group.productName || "").toLowerCase();
    const pid = (template?.productId || template?.id || "").toLowerCase();
    const sku = (template?.sku || "").toLowerCase();

    return (
      name.includes(query) ||
      pid.includes(query) ||
      sku.includes(query)
    );
  });

  // Sort the filtered results by product name, with simple alphabetic ordering
  const sorted = filtered.sort((a, b) => {
    const aName = (a.productName || "").toLowerCase();
    const bName = (b.productName || "").toLowerCase();
    return aName.localeCompare(bName);
  });

  if (sortDirection !== "none") {
    return sortArray(sorted, sortDirection, (group) => group.productName);
  }

  return sorted;
}, [groupedProducts, searchQuery, sortDirection]);

  const getStatus = (quantity: number, threshold: number = 0) => {
    if (quantity <= 0) {
      return (
        <Badge variant="destructive" className="flex items-center gap-1 w-fit">
          <XCircle className="h-3 w-3" /> Out of Stock
        </Badge>
      )
    }
    if (threshold > 0 && quantity < threshold) {
      return (
        <Badge variant="destructive" className="flex items-center gap-1 w-fit">
          <AlertTriangle className="h-3 w-3" /> Low Stock
        </Badge>
      )
    }
    return <Badge variant="secondary">In Stock</Badge>
  }

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
            <DialogContent className="sm:max-w-[900px] overflow-y-hidden">
              <div className="flex max-h-[85vh] flex-col">
                <DialogHeader className="shrink-0">
                  <DialogTitle>Add New Product</DialogTitle>
                  <DialogDescription>
                    Enter the details for the new finished product.
                  </DialogDescription>
                </DialogHeader>
                <div className="mt-4 flex-1 overflow-y-auto pr-2 pb-2">
                  <CreateProductForm onProductCreated={handleProductCreated} />
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </PageHeader>
      <div className="mb-4 flex gap-4 items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name, SKU, or Product ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <SortControls
          sortDirection={sortDirection}
          onSortChange={setSortDirection}
          label="Sort Products"
        />
      </div>
      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[80px]">Image</TableHead>
                <TableHead>Product ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Quantity</TableHead>
                <TableHead>Low Stock Threshold</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Unit Price</TableHead>
                <TableHead>GST Rate</TableHead>
                <TableHead className="text-right w-[60px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAndSortedProducts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                    No products found matching your search.
                  </TableCell>
                </TableRow>
              ) : (
                filteredAndSortedProducts.map((group: GroupedProduct) => (
                  <TableRow key={group.productTemplate?.id}>
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
                    {group.firstEntry.productId || "—"}
                  </TableCell>
                  <TableCell className="font-medium">
                    {group.productName}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {group.firstEntry.sku}
                  </TableCell>
                  <TableCell>
                    {group.batches.reduce((sum: number, b: any) => sum + Number(b.fullEntry.quantity ?? 0), 0)} pcs
                  </TableCell>
                  <TableCell>
                    {group.productTemplate?.threshold ?? 0} pcs
                  </TableCell>
                  <TableCell>
                    {getStatus(
                      group.batches.reduce((sum: number, b: any) => sum + Number(b.fullEntry.quantity ?? 0), 0),
                      group.productTemplate?.threshold ?? 0
                    )}
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
                        {canEditFinalStock && (
                          <DropdownMenuItem
                            onClick={() => setRestockModal({ isOpen: true, product: group })}
                          >
                            Restock
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {/* Dependency-aware delete confirmation for Final Stock items */}
      <Dialog open={isDeleteConfirmOpen} onOpenChange={setIsDeleteConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Final Stock Item</DialogTitle>
            <DialogDescription>
              This final stock item is used as an input material in the following final stock items.
              Deleting it will remove it from their Bill of Materials.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm">Dependent final stock items:</p>
            <ul className="list-disc pl-6 space-y-1 max-h-48 overflow-y-auto text-sm">
              {deleteDependentProducts.map((product) => (
                <li key={product.id}>
                  <span className="font-medium">{product.name}</span>
                  <span className="text-xs text-muted-foreground"> (ID: {product.id})</span>
                </li>
              ))}
            </ul>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsDeleteConfirmOpen(false);
                setDeleteTargetProduct(null);
                setDeleteDependentProducts([]);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleConfirmProductDeleteWithDependencies}
            >
              Confirm Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {selectedGroupedProduct && (
        <ProductDetailsDialog
          isOpen={isDetailsOpen}
          onOpenChange={handleDialogClose}
          groupedProduct={selectedGroupedProduct}
          activityLog={activityLog.filter((log) =>
            log.recordId === selectedGroupedProduct.productTemplate?.id ||
            log.recordId === selectedGroupedProduct.firstEntry.id
          )}
          onProductUpdate={handleProductUpdated}
          onProductDelete={handleProductDeleted}
          canEdit={canEditFinalStock}
          batches={batches || []}
        />
      )}
      {restockModal.product && (
        <RestockModal
          isOpen={restockModal.isOpen}
          onOpenChange={(isOpen) => setRestockModal({ isOpen, product: null })}
          productName={restockModal.product.productName}
          onRestock={(data) => handleRestock(restockModal.product!, data)}
        />
      )}
    </>
  );
}
