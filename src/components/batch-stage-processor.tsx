"use client";

import { useEffect, useState } from "react";
import type { Batch, ProcessingStageName, ActivityLog, BatchMaterial } from "@/lib/types";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/use-permissions";
import { canEditProcessingStage } from "@/lib/permissions";
import { format } from "date-fns";
import { validateBatchStageAccess } from "@/lib/manufacturing-stages-validation";
import {
  subscribeToBatchesForStage,
  updateBatchStage,
  completeStage,
  createBatch,
} from "@/lib/firebase";
import { useRawMaterials } from "@/hooks/use-raw-materials";
import { useFinalStock } from "@/hooks/use-final-stock";
import { useActivityLog } from "@/hooks/use-activity-log";
import { getBatchId } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const formSchema = z.object({
  batches: z.array(
    z.object({
      id: z.string(),
      accepted: z.coerce.number().min(0),
      rejected: z.coerce.number().min(0),
      materialConsumptions: z.array(
        z.object({
          materialId: z.string(),
          actualConsumption: z.coerce.number().min(0),
        })
      ),
    }),
  ),
});

interface BatchStageProcessorProps {
  stage: ProcessingStageName;
  previousStage: ProcessingStageName | null;
}

export function BatchStageProcessor({
  stage,
  previousStage,
}: BatchStageProcessorProps) {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [selectedBatches, setSelectedBatches] = useState<Set<string>>(
    new Set(),
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isEndingCycle, setIsEndingCycle] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);
  const [assemblySelections, setAssemblySelections] = useState<Record<string, Record<string, boolean>>>({});
  
  const { rawMaterials, mouldedMaterials, finishedMaterials, assembledMaterials, updateRawMaterial, deleteRawMaterial } =
    useRawMaterials();
  const { finalStock, createFinalStock, updateFinalStock } = useFinalStock();
  const { createActivityLog } = useActivityLog();
  const { employee } = usePermissions();
  const { toast } = useToast();
  
  // Check if user has permission to edit this stage
  const canEditStage = employee ? canEditProcessingStage(employee.role, stage) : false;
  const showRejected = stage === "Testing";

  useEffect(() => {
    console.log("[v0] Setting up real-time subscription for stage:", stage);
    const unsubscribe = subscribeToBatchesForStage(stage, (updatedBatches) => {
      console.log(
        "[v0] Received batches for",
        stage,
        ":",
        updatedBatches.length,
      );
      setBatches(updatedBatches);
    });

    return () => {
      console.log("[v0] Cleaning up subscription for stage:", stage);
      unsubscribe();
    };
  }, [stage]);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      batches: batches.map((b) => ({
        id: b.id,
        accepted:
          stage === "Assembling" && b.autoCreatedFromTestingRejected
            ? (b.processingStages[stage]?.accepted ?? b.quantityToBuild ?? 0)
            : (b.processingStages[stage]?.accepted || 0),
        rejected: showRejected ? (b.processingStages[stage]?.rejected || 0) : 0,
        materialConsumptions: b.materials
          .filter((m) => m.stage === stage)
          .map((m) => ({
            materialId: m.id,
            actualConsumption: b.processingStages[stage]?.materialConsumptions?.[m.id] || 0,
          })),
      })),
    },
  });

  const { fields } = useFieldArray({
    control: form.control,
    name: "batches",
  });

  useEffect(() => {
    form.reset({
      batches: batches.map((b) => ({
        id: b.id,
        accepted:
          stage === "Assembling" && b.autoCreatedFromTestingRejected
            ? (b.processingStages[stage]?.accepted ?? b.quantityToBuild ?? 0)
            : (b.processingStages[stage]?.accepted || 0),
        rejected: showRejected ? (b.processingStages[stage]?.rejected || 0) : 0,
        materialConsumptions: b.materials
          .filter((m) => m.stage === stage)
          .map((m) => ({
            materialId: m.id,
            actualConsumption: b.processingStages[stage]?.materialConsumptions?.[m.id] || 0,
          })),
      })),
    });
  }, [batches, form, stage, showRejected]);

  const addLog = async (
    newLog: Omit<ActivityLog, "id" | "timestamp" | "user">,
  ) => {
    await createActivityLog({
      ...newLog,
      timestamp: new Date().toISOString(),
      user: "System",
    });
  };

  const findStoreMaterialById = (id: string) => {
    return (
      rawMaterials.find((m) => m.id === id) ||
      mouldedMaterials.find((m) => m.id === id) ||
      finishedMaterials.find((m) => m.id === id) ||
      assembledMaterials.find((m) => m.id === id) ||
      null
    )
  }

  // Find inventory item across Raw Materials and Final Stock
  const findInventoryItemById = (
    id: string,
  ): { item: { id: string; name: string; quantity: number; unit?: string }; kind: "raw" | "final" } | null => {
    const raw = findStoreMaterialById(id)
    if (raw) return { item: raw as any, kind: "raw" }
    const fin = finalStock.find((p) => p.id === id)
    if (fin) {
      // Aggregate available quantity: prefer sum of batches when present, else fallback to quantity field
      const batchesQty = (fin.batches || []).reduce((sum, b) => sum + Number(b.quantity || 0), 0)
      const available = (fin.batches && fin.batches.length > 0) ? batchesQty : Number(fin.quantity || 0)
      return { item: { id: fin.id, name: fin.name, quantity: available, unit: "pcs" }, kind: "final" }
    }
    return null
  }

  const getMaxAcceptableUnitsForFirstStage = (batch: Batch, currentStage: ProcessingStageName): number => {
    const qtyToBuild = Math.max(1, Number(batch.quantityToBuild) || 1)
    const stageMaterials = batch.materials.filter((m) => m.stage === currentStage)
    if (stageMaterials.length === 0) return Infinity
    let maxUnits = Infinity
    for (const mat of stageMaterials) {
      const inv = findInventoryItemById(mat.id)
      const available = Number(inv?.item.quantity || 0)
      const perPiece = (Number(mat.quantity) || 0) / qtyToBuild
      if (perPiece > 0) {
        const possible = Math.floor(available / perPiece)
        maxUnits = Math.min(maxUnits, possible)
      }
    }
    return maxUnits
  }

  const getStageInputAvailableUnits = (batch: Batch, currentStage: ProcessingStageName): number => {
    switch (currentStage) {
      case "Machining": {
        const item = mouldedMaterials.find((m) => m.name === `Moulded ${batch.productName}`)
        return Number(item?.quantity || 0)
      }
      case "Assembling": {
        const item = finishedMaterials.find((m) => m.name === `Machined ${batch.productName}`)
        return Number(item?.quantity || 0)
      }
      case "Testing": {
        const item = assembledMaterials.find((m) => m.name === `Assembled ${batch.productName}`)
        return Number(item?.quantity || 0)
      }
      default:
        return Infinity
    }
  }

  const getRawMaterialForStage = (batch: Batch) => {
    return batch.materials
      .filter((mat) => mat.stage === stage)
      .reduce((sum, mat) => sum + mat.quantity, 0);
  };

  const getInputFromPreviousStage = (batch: Batch) => {
    const selectedProcesses = batch.selectedProcesses || [];
    const currentIndex = selectedProcesses.indexOf(stage);

    if (currentIndex <= 0) return 0;

    const actualPreviousStage = selectedProcesses[currentIndex - 1];
    return batch.processingStages[actualPreviousStage]?.accepted || 0;
  };

  const getTotalInput = (batch: Batch): number => {
    const selectedProcesses = batch.selectedProcesses || [];
    const currentIndex = selectedProcesses.indexOf(stage);

    if (currentIndex === 0) {
      // For the first stage, use quantityToBuild
      // Fallback to raw material input for older batches without quantityToBuild
      return batch.quantityToBuild || getRawMaterialForStage(batch);
    }

    // For subsequent stages, use accepted from previous stage
    return getInputFromPreviousStage(batch);
  };

  const numberInputClassName =
    "appearance-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

  // Canonical global stage order
  const STAGE_ORDER: ProcessingStageName[] = [
    "Molding",
    "Machining",
    "Assembling",
    "Testing",
  ];

  // Helper: resolve product for a batch using external PID first (FinalStock.productId),
  // then fall back to legacy doc ID semantics and finally to name-based lookup.
  const getProductForBatch = (batch: Batch) => {
    // Primary: match on external Product ID (PID)
    const byExternalPid = finalStock.find((p) => p.productId === batch.productId);
    if (byExternalPid) return byExternalPid;

    // Legacy fallback: older batches may have stored the Firestore document ID in productId
    const byDocId = finalStock.find((p) => p.id === batch.productId);
    if (byDocId) return byDocId;

    // Last resort: name-based match (can be ambiguous, but keeps backward compatibility)
    return finalStock.find((p) => p.name === batch.productName);
  };

  const getEffectiveStagesForBatch = (batch: Batch): ProcessingStageName[] => {
    const product = getProductForBatch(batch);
    const productStages = product?.manufacturingStages || [];
    if (Array.isArray(productStages) && productStages.length > 0) {
      return productStages as ProcessingStageName[];
    }
    // Derive from product BOM if available
    const bomStages: ProcessingStageName[] = Array.from(
      new Set(
        (product?.bom_per_piece || [])
          .map((row: any) => row.stage)
          .filter((s: any): s is ProcessingStageName =>
            STAGE_ORDER.includes(s as ProcessingStageName),
          ),
      ),
    ) as ProcessingStageName[];
    if (bomStages.length > 0) {
      // Sort according to canonical order
      return STAGE_ORDER.filter((s) => bomStages.includes(s));
    }
    return (batch.selectedProcesses || []) as ProcessingStageName[];
  };

  const getAssemblyMaterialsForBatch = (batch: Batch): BatchMaterial[] => {
    const product = getProductForBatch(batch);
    const bom = product?.bom_per_piece || [];
    const assemblyRows = bom.filter((row: any) => row.stage === "Assembling");

    if (assemblyRows.length === 0) {
      // Fallback: use any Assembling-stage materials already expanded on the batch itself
      return batch.materials.filter((m) => m.stage === "Assembling");
    }

    const qtyToBuild = Math.max(1, Number(batch.quantityToBuild) || 1);

    return assemblyRows.map((row: any) => {
      const sourceMat = findStoreMaterialById(row.raw_material_id);
      const name = sourceMat?.name || row.raw_material_id;
      const qtyPerPiece = Number(row.qty_per_piece || 0);
      const quantity = qtyPerPiece * qtyToBuild;

      return {
        id: row.raw_material_id,
        name,
        quantity,
        unit: row.unit,
        stage: "Assembling",
      } as BatchMaterial;
    });
  };

  const getNextDepartment = (
    batch: Batch,
    currentStage: ProcessingStageName,
  ): string | null => {
    const effective = getEffectiveStagesForBatch(batch);
    const currentIndex = effective.indexOf(currentStage);

    if (currentIndex >= 0 && currentIndex < effective.length - 1) {
      return effective[currentIndex + 1];
    }

    return "Final Stock";
  };

  const getStageLabels = (stageName: ProcessingStageName, batch?: Batch) => {
    const nextDept = batch ? getNextDepartment(batch, stageName) : null;

    switch (stageName) {
      case "Molding":
        return {
          input: "Molding Raw Mat. Input",
          prevStage: null,
          accepted: "Accepted Moulded",
          rejected: "Rejected Moulded",
          consumption: "Actual Consumption",
          nextDept: nextDept || "Machining",
        };
      case "Machining":
        return {
          input: "Machining Raw Mat. Input",
          prevStage: "From Molding",
          accepted: "Accepted Machined",
          rejected: "Rejected Machined",
          consumption: "Actual Consumption",
          nextDept: nextDept || "Assembling",
        };
      case "Assembling":
        return {
          input: "Assembling Raw Mat. Input",
          prevStage: "From Machining",
          accepted: "Accepted Assembled",
          rejected: "Rejected Assembled",
          consumption: "Actual Consumption",
          nextDept: nextDept || "Testing",
        };
      case "Testing":
        return {
          input: "Testing Raw Mat. Input",
          prevStage: "From Assembling",
          accepted: "Accepted Tested",
          rejected: "Rejected Tested",
          consumption: "Actual Consumption",
          nextDept: nextDept || "Final Stock",
        };
    }
  };

  const createFailedAssemblyBatch = async (
    originalBatch: Batch,
    rejectedQty: number,
    uncheckedAssemblyMaterials: BatchMaterial[],
  ) => {
    if (rejectedQty <= 0) return;
    if (uncheckedAssemblyMaterials.length === 0) return;

    console.log("[Testing] Creating failed Assembly batch:", {
      originalBatchId: originalBatch.id,
      rejectedQty,
      uncheckedCount: uncheckedAssemblyMaterials.length,
    });

    const qtyToBuildOriginal = Math.max(1, Number(originalBatch.quantityToBuild) || 1);

    const scaledMaterials = uncheckedAssemblyMaterials.map((mat) => {
      const perPiece = qtyToBuildOriginal > 0
        ? Number(mat.quantity || 0) / qtyToBuildOriginal
        : 0;
      const scaledQty = perPiece > 0 ? perPiece * rejectedQty : Number(mat.quantity || 0);
      return {
        id: mat.id,
        name: mat.name,
        quantity: scaledQty,
        unit: mat.unit,
        stage: "Assembling" as ProcessingStageName,
      };
    });

    const totalMaterialQuantity = scaledMaterials.reduce(
      (sum, m) => sum + Number(m.quantity || 0),
      0,
    );

    const processingStages: Record<ProcessingStageName, any> = {
      Molding: { accepted: 0, rejected: 0, actualConsumption: 0, completed: false },
      Machining: { accepted: 0, rejected: 0, actualConsumption: 0, completed: false },
      Assembling: { accepted: rejectedQty, rejected: 0, actualConsumption: 0, completed: false },
      Testing: { accepted: 0, rejected: 0, actualConsumption: 0, completed: false },
    };

    const newBatchId = await createBatch({
      productId: originalBatch.productId,
      productName: originalBatch.productName,
      quantityToBuild: rejectedQty,
      totalMaterialQuantity,
      materials: scaledMaterials,
      createdAt: new Date().toISOString(),
      status: "Planned",
      processingStages,
      selectedProcesses: ["Assembling", "Testing"],
      autoCreatedFromTestingRejected: true,
    });

    await addLog({
      recordId: newBatchId,
      recordType: "Batch",
      action: "Created",
            details: `Failed Assembly batch created from Testing batch ${getBatchId(originalBatch)} for ${rejectedQty} rejected units.`,
    });

    toast({
      title: "Failed Assembly Batch Created",
      description: `Created Assembly batch ${newBatchId} for ${rejectedQty} rejected units from Testing batch ${getBatchId(originalBatch)}.`,
    });
  };

  const labels = getStageLabels(stage);
  
  // After hiding previous stage and raw material input columns globally,
  // compute total visible columns for empty-state colSpan.
  // Visible columns:
  // [Select, Batch ID, Product, Measurement Sketch, Date Created, (Actual Consumption if not Testing), Accepted, (Rejected if enabled)]
  const totalColumns = 7 + (stage !== "Testing" ? 1 : 0) + (showRejected ? 1 : 0);

  const processMaterialConsumptions = async (
    batch: Batch,
    materialConsumptions: { materialId: string; actualConsumption: number }[],
    isCompleted: boolean,
    acceptedUnits: number,
  ) => {
    if (!isCompleted) return;

    const materialsForStage = batch.materials.filter((m) => m.stage === stage);
    
    for (const materialInBatch of materialsForStage) {
      const inv = findInventoryItemById(materialInBatch.id);
      
      if (inv) {
        const consumptionData = materialConsumptions.find(
          (mc) => mc.materialId === materialInBatch.id
        );
        
        // Default to Accepted × (BOM qty per piece). We approximate per-piece as
        // materialInBatch.quantity / batch.quantityToBuild when BOM is pre-expanded for the batch size.
        const perPiece = Number(batch.quantityToBuild) > 0
          ? Number(materialInBatch.quantity || 0) / Number(batch.quantityToBuild)
          : 0
        const defaultConsumption = Math.max(0, Number(acceptedUnits || 0) * perPiece)
        const consumptionAmount = consumptionData && Number(consumptionData.actualConsumption) > 0
          ? Number(consumptionData.actualConsumption)
          : defaultConsumption
        
        const oldQuantity = Number(inv.item.quantity || 0);
        const newQuantity = Math.max(0, oldQuantity - consumptionAmount); // Ensure quantity doesn't go negative

        if (inv.kind === "raw") {
          await updateRawMaterial(inv.item.id, { quantity: newQuantity });
          const batchId = getBatchId(batch);
          await addLog({
            recordId: inv.item.id,
            recordType: "RawMaterial",
            action: "Stock Adjustment (Batch)",
            details: `Batch ${batchId} (${stage}) consumed ${consumptionAmount} ${inv.item.unit || "pcs"}. Old qty: ${oldQuantity}, New qty: ${newQuantity}.`,
          });
        } else {
          const product = finalStock.find((p) => p.id === inv.item.id);
          const hasBatches = product && Array.isArray(product.batches) && product.batches.length > 0;
          if (hasBatches) {
            let remaining = consumptionAmount;
            const sorted = [...(product!.batches as any[])].sort((a, b) => {
              const ta = new Date(a.createdAt || 0).getTime();
              const tb = new Date(b.createdAt || 0).getTime();
              return ta - tb;
            });
            for (const entry of sorted) {
              if (remaining <= 0) break;
              const q = Math.max(0, Number(entry.quantity || 0));
              const deduct = Math.min(q, remaining);
              entry.quantity = q - deduct;
              remaining -= deduct;
            }
            const updatedBatches = sorted.filter((e) => Number(e.quantity || 0) > 0);
            await updateFinalStock(inv.item.id, { batches: updatedBatches } as any);
            const newTotal = updatedBatches.reduce((sum, b) => sum + Number(b.quantity || 0), 0);
            const batchId = getBatchId(batch);
            await addLog({
              recordId: inv.item.id,
              recordType: "FinalStock",
              action: "Stock Adjustment (Batch)",
              details: `Batch ${batchId} (${stage}) consumed ${consumptionAmount} pcs from batches. Old qty: ${oldQuantity}, New qty: ${newTotal}.`,
            });
          } else {
            await updateFinalStock(inv.item.id, { quantity: newQuantity } as any);
            const batchId = getBatchId(batch);
            await addLog({
              recordId: inv.item.id,
              recordType: "FinalStock",
              action: "Stock Adjustment (Batch)",
              details: `Batch ${batchId} (${stage}) consumed ${consumptionAmount} pcs. Old qty: ${oldQuantity}, New qty: ${newQuantity}.`,
            });
          }
        }
      }
    }
  };

  const createMouldedMaterial = async (batch: Batch, accepted: number) => {
    const { addRawMaterial } = await import("@/lib/firebase/firestore-operations");
    const materialName = `Moulded ${batch.productName}`;
    const existingMaterial = rawMaterials.find(
      (m) => m.name === materialName && m.isMoulded === true,
    );

    if (existingMaterial) {
      const oldQuantity = Number(existingMaterial.quantity) || 0;
      const newQuantity = oldQuantity + Number(accepted);
      await updateRawMaterial(existingMaterial.id, {
        quantity: newQuantity,
      });

      const batchId = getBatchId(batch);
      await addLog({
        recordId: existingMaterial.id,
        recordType: "RawMaterial",
        action: "Stock Adjustment (Batch)",
        details: `${accepted} moulded items from batch ${batchId} added to Store. Old qty: ${oldQuantity}, New qty: ${newQuantity}.`,
      });

      toast({
        title: "Moulded Material Updated",
        description: `${accepted} moulded ${batch.productName} added to existing stock.`,
      });
    } else {
      const batchId = getBatchId(batch);
      const mouldedMaterialId = await addRawMaterial({
        name: materialName,
        sku: `MOULD-${Date.now()}`,
        quantity: accepted,
        unit: "pcs",
        threshold: 10,
        isMoulded: true,
        sourceBatchId: batchId,
        createdAt: new Date().toISOString(),
      });

      await addLog({
        recordId: mouldedMaterialId,
        recordType: "RawMaterial",
        action: "Created",
        details: `${accepted} moulded items from batch ${batchId} added to Store.`,
      });

      toast({
        title: "Moulded Material Created",
        description: `${accepted} moulded ${batch.productName} added to Store.`,
      });
    }
  };

  const createFinishedMaterial = async (batch: Batch, accepted: number) => {
    const { addRawMaterial } = await import("@/lib/firebase/firestore-operations");
    const materialName = `Machined ${batch.productName}`;
    const existingMaterial = rawMaterials.find(
      (m) => m.name === materialName && m.isFinished === true,
    );

    if (existingMaterial) {
      const oldQuantity = Number(existingMaterial.quantity) || 0;
      const newQuantity = oldQuantity + Number(accepted);
      await updateRawMaterial(existingMaterial.id, {
        quantity: newQuantity,
      });

      const batchId = getBatchId(batch);
      await addLog({
        recordId: existingMaterial.id,
        recordType: "RawMaterial",
        action: "Stock Adjustment (Batch)",
        details: `${accepted} machined items from batch ${batchId} added to Store. Old qty: ${oldQuantity}, New qty: ${newQuantity}.`,
      });

      toast({
        title: "Machined Material Updated",
        description: `${accepted} machined ${batch.productName} added to existing stock.`,
      });
    } else {
      const batchId = getBatchId(batch);
      const finishedMaterialId = await addRawMaterial({
        name: materialName,
        sku: `FINISH-${Date.now()}`,
        quantity: accepted,
        unit: "pcs",
        threshold: 10,
        isFinished: true,
        sourceBatchId: batchId,
        createdAt: new Date().toISOString(),
      });
      await addLog({
        recordId: finishedMaterialId,
        recordType: "RawMaterial",
        action: "Created",
        details: `${accepted} machined items from batch ${batchId} added to Store.`,
      });

      toast({
        title: "Machined Material Created",
        description: `${accepted} machined ${batch.productName} added to Store.`,
      });
    }
  };
  const createAssembledMaterial = async (batch: Batch, accepted: number) => {
    const { addRawMaterial } = await import("@/lib/firebase/firestore-operations");
    const materialName = `Assembled ${batch.productName}`;
    const existingMaterial = rawMaterials.find(
      (m) => m.name === materialName && m.isAssembled === true,
    );

    if (existingMaterial) {
      const oldQuantity = Number(existingMaterial.quantity) || 0;
      const newQuantity = oldQuantity + Number(accepted);
      await updateRawMaterial(existingMaterial.id, {
        quantity: newQuantity,
      });

      const batchId = getBatchId(batch);
      await addLog({
        recordId: existingMaterial.id,
        recordType: "RawMaterial",
        action: "Stock Adjustment (Batch)",
        details: `${accepted} assembled items from batch ${batchId} added to Store. Old qty: ${oldQuantity}, New qty: ${newQuantity}.`,
      });

      toast({
        title: "Assembled Material Updated",
        description: `${accepted} assembled ${batch.productName} added to existing stock.`,
      });
    } else {
      const batchId = getBatchId(batch);
      const assembledMaterialId = await addRawMaterial({
        name: materialName,
        sku: `ASSEMB-${Date.now()}`,
        quantity: accepted,
        unit: "pcs",
        threshold: 10,
        isAssembled: true,
        sourceBatchId: batchId,
        createdAt: new Date().toISOString(),
      });
      await addLog({
        recordId: assembledMaterialId,
        recordType: "RawMaterial",
        action: "Created",
        details: `${accepted} assembled items from batch ${batchId} added to Store.`,
      });

      toast({
        title: "Assembled Material Created",
        description: `${accepted} assembled ${batch.productName} added to Store.`,
      });
    }
  };

  const addToFinalStock = async (batch: Batch, accepted: number) => {
    const { getOrCreateProduct, addBatchToProduct } = await import(
      "@/lib/firebase/firestore-operations"
    );

    const batchId = getBatchId(batch);
    const newBatch = {
      batchId: batchId,
      sourceBatchId: batchId,
      quantity: accepted,
      sku: `BATCH-${batchId}`,
      createdAt: new Date().toISOString(),
    };

    // Prefer resolving the product using the batch's productId (PID semantics),
    // then fall back to legacy doc ID, and only then to name-based creation.
    let product = finalStock.find((p) => p.productId === batch.productId);
    if (!product) {
      product = finalStock.find((p) => p.id === batch.productId);
    }

    if (!product) {
      console.warn(
        `[BatchStageProcessor] No FinalStock product found for batch.productId="${batch.productId}". Falling back to getOrCreateProduct by name: "${batch.productName}"`,
      );
      product = await getOrCreateProduct(batch.productName, {
        imageUrl: "/placeholder.svg?height=100&width=100",
        imageHint: batch.productName,
      });
    }

    console.log(`[BatchStageProcessor] Product resolved for Final Stock: ${product.id} (PID=${product.productId || product.id}) - "${product.name}"`);

    try {
      await addBatchToProduct(product.id, newBatch);
      console.log(
        `[BatchStageProcessor] ✓ Successfully added batch ${batch.id} to product ${product.name} (${product.id})`,
      );
    } catch (error) {
      console.error(
        `[BatchStageProcessor] ❌ Failed to add batch ${batch.id} to product ${product.id}:`,
        error,
      );
      throw error;
    }
  };

  const getEffectiveSelectedBatches = (
    formValues: z.infer<typeof formSchema>,
  ): Set<string> => {
    const effective = new Set(selectedBatches);
    for (const batchForm of formValues.batches) {
      const hasAccepted = Number(batchForm.accepted || 0) > 0;
      const hasRejected =
        showRejected && Number((batchForm as any).rejected || 0) > 0;
      if (hasAccepted || hasRejected) {
        effective.add(batchForm.id);
      }
    }
    return effective;
  };

  async function onSubmit(values: z.infer<typeof formSchema>) {
    console.log("🚀 DEBUG: onSubmit function called for stage:", stage);
    
    if (isSubmitting) return;
    
    console.log("[v0] Submitting form for stage:", stage, "with values:", values);

    const effectiveSelected = getEffectiveSelectedBatches(values);
    setSelectedBatches(effectiveSelected);

    if (effectiveSelected.size === 0) {
      toast({
        variant: "destructive",
        title: "No Batches Selected",
        description: "Please select at least one batch to proceed.",
      });
      return;
    }

    // No upper bound validation for accepted quantity; it can be any non-negative value.

    setIsSubmitting(true);

    try {
      for (const batch of batches) {
        if (!effectiveSelected.has(batch.id)) continue;
        const formData = values.batches.find((b) => b.id === batch.id);
        if (!formData) continue;

        const currentTotal = showRejected
          ? formData.accepted + formData.rejected
          : formData.accepted;
        const isCompleted = currentTotal > 0;

        console.log("[v0] Processing batch:", batch.id, "isCompleted:", isCompleted);

        // Build materialConsumptions object (non-Testing stages only)
        const materialConsumptions: Record<string, number> = {};
        if (stage !== "Testing") {
          formData.materialConsumptions.forEach((mc) => {
            materialConsumptions[mc.materialId] = mc.actualConsumption;
          });
        }

        try {
          if (stage === "Testing") {
            await updateBatchStage(batch.id, stage, {
              accepted: formData.accepted,
              ...(showRejected ? { rejected: formData.rejected } : {}),
              actualConsumption: formData.accepted + (showRejected ? (formData.rejected || 0) : 0),
            });
          } else {
            const enforcedAccepted =
              stage === "Assembling" && batch.autoCreatedFromTestingRejected
                ? (batch.processingStages["Assembling"]?.accepted ?? batch.quantityToBuild ?? 0)
                : formData.accepted;
            await updateBatchStage(batch.id, stage, {
              accepted: enforcedAccepted,
              ...(showRejected ? { rejected: formData.rejected } : {}),
              materialConsumptions,
            });
          }
        } catch (error) {
          console.error(`[v0] Failed to update batch ${batch.id}:`, error);
          toast({
            variant: "destructive",
            title: "Batch Update Failed",
            description: `Failed to update batch ${batch.id}. It may have been deleted.`,
          });
          continue;
        }

        // Debug: Check why the condition might not be met
        console.log("DEBUG - Batch stage status:", batch.id, stage, "completed:", batch.processingStages[stage]?.completed);
        console.log("DEBUG - Full batch processing stages:", batch.processingStages);
        
        if (!batch.processingStages[stage]?.completed) {
          const nextDept = getNextDepartment(batch, stage);
          toast({
            title: `${nextDept} Dept. Notification`,
            description: `Batch ${batch.id} for ${batch.productName} has completed the ${stage} stage.`,
          });

          if (stage !== "Testing") {
            await processMaterialConsumptions(batch, formData.materialConsumptions, isCompleted, formData.accepted);
          } else {
            const totalConsumed = formData.accepted + (showRejected ? (formData.rejected || 0) : 0);
            await processMaterialConsumptions(batch, [], isCompleted, totalConsumed);
          }

            // Get product/effective stages to determine correct flow
          const product = getProductForBatch(batch);
          const effectiveStages = getEffectiveStagesForBatch(batch);
          
          // Debug logging
          console.log("DEBUG onSubmit - Batch:", batch.productName, "Stage:", stage);
          console.log("DEBUG onSubmit - Product found:", !!product);
          console.log("DEBUG onSubmit - Effective stages:", effectiveStages);
          const isLastStage = effectiveStages[effectiveStages.length - 1] === stage;
          const isMachiningOnly = effectiveStages.length === 1 && effectiveStages[0] === "Machining";
          const isSingleStageProduct =
            effectiveStages.length === 1 && effectiveStages[0] === stage;
          
          // Use effective stages to determine if it should go to Final Stock
          const productIsMoldingAndMachiningOnly = effectiveStages.length === 2 && 
            effectiveStages.includes("Molding") && effectiveStages.includes("Machining");
            
          console.log("DEBUG onSubmit - productIsMoldingAndMachiningOnly:", productIsMoldingAndMachiningOnly);
          if (isSingleStageProduct && formData.accepted > 0) {
            // Single-stage products: send directly to Final Stock, skip Store intermediates
            console.log("DEBUG onSubmit: Single-stage product - adding directly to Final Stock and skipping Store inventory");
            await addToFinalStock(batch, formData.accepted);
          } else {
            if (stage === "Molding" && formData.accepted > 0) {
              await createMouldedMaterial(batch, formData.accepted);
            }
            if (stage === "Assembling" && formData.accepted > 0) {
              // Always increment Assembled stage inventory for multi-stage flows
              await createAssembledMaterial(batch, formData.accepted);
            }
            if (stage === "Machining" && productIsMoldingAndMachiningOnly && formData.accepted > 0) {
              // Special case: Product with Molding + Machining only - add to Final Stock when Machining completes
              console.log("DEBUG onSubmit: Adding to Final Stock - Product has only Molding + Machining stages");
              await addToFinalStock(batch, formData.accepted);
            }
            if (stage === "Machining" && formData.accepted > 0) {
              // For multi-stage flows, increment Machined stage inventory in Store
              console.log("DEBUG onSubmit: Creating/Updating machined materials for accepted units");
              await createFinishedMaterial(batch, formData.accepted);
            }
            if (isLastStage && stage === "Testing" && !isMachiningOnly && !productIsMoldingAndMachiningOnly) {
              console.log("DEBUG onSubmit: Adding to Final Stock - Testing as last stage of multi-stage product");
              await addToFinalStock(batch, formData.accepted);
            }
          }

          await completeStage(batch.id, stage);

          if (stage === "Testing") {
            const rejectedQty = Number((formData as any).rejected || 0);
            if (rejectedQty > 0) {
              const assemblyMaterials = getAssemblyMaterialsForBatch(batch);
              const selectionForBatch = assemblySelections[batch.id] || {};
              const uncheckedMaterials = assemblyMaterials.filter(
                (mat) => !selectionForBatch[mat.id],
              );

              if (uncheckedMaterials.length > 0) {
                try {
                  await createFailedAssemblyBatch(batch, rejectedQty, uncheckedMaterials);
                } catch (error) {
                  console.error("Failed to create failed Assembly batch from Testing:", error);
                  toast({
                    variant: "destructive",
                    title: "Failed to Create Failed Assembly Batch",
                    description: "An error occurred while creating the failed Assembly batch. Please check console logs or try again.",
                  });
                }
              }
            }
          }
        }
      }

      toast({
        title: "Batches Updated",
        description: `The ${stage} stage has been updated for the submitted batches.`,
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  const handleEndCycle = async () => {
    console.log("🚀 DEBUG: handleEndCycle function called for stage:", stage);
    
    if (isEndingCycle) return;
    
    setIsEndingCycle(true);

    try {
      const values = form.getValues();
      const effectiveSelected = getEffectiveSelectedBatches(values);
      setSelectedBatches(effectiveSelected);

      if (effectiveSelected.size === 0) {
        toast({
          variant: "destructive",
          title: "No Batches Selected",
          description: "Please select at least one batch to proceed.",
        });
        return;
      }

      // No upper bound validation for accepted quantity; it can be any non-negative value.

      for (const batch of batches) {
        if (!effectiveSelected.has(batch.id)) continue;
        const formData = values.batches.find((b) => b.id === batch.id);
        if (!formData) continue;

        const currentTotal = showRejected
          ? formData.accepted + formData.rejected
          : formData.accepted;
        const isCompleted = currentTotal > 0;

        console.log("[v0] Processing batch:", batch.id, "isCompleted:", isCompleted);

        // Build materialConsumptions object (non-Testing stages only)
        const materialConsumptions: Record<string, number> = {};
        if (stage !== "Testing") {
          formData.materialConsumptions.forEach((mc) => {
            materialConsumptions[mc.materialId] = mc.actualConsumption;
          });
        }

        try {
          if (stage === "Testing") {
            await updateBatchStage(batch.id, stage, {
              accepted: formData.accepted,
              ...(showRejected ? { rejected: formData.rejected } : {}),
              actualConsumption: formData.accepted + (showRejected ? (formData.rejected || 0) : 0),
            });
          } else {
            const enforcedAccepted =
              stage === "Assembling" && batch.autoCreatedFromTestingRejected
                ? (batch.processingStages["Assembling"]?.accepted ?? batch.quantityToBuild ?? 0)
                : formData.accepted;
            await updateBatchStage(batch.id, stage, {
              accepted: enforcedAccepted,
              ...(showRejected ? { rejected: formData.rejected } : {}),
              materialConsumptions,
            });
          }
        } catch (error) {
          console.error(`[v0] Failed to update batch ${batch.id}:`, error);
          continue;
        }

        // Debug: Check handleEndCycle condition
        console.log("DEBUG handleEndCycle - Batch stage status:", batch.id, stage, "completed:", batch.processingStages[stage]?.completed, "isCompleted:", isCompleted);
        
        if (isCompleted && !batch.processingStages[stage]?.completed) {
          if (stage !== "Testing") {
            await processMaterialConsumptions(batch, formData.materialConsumptions, isCompleted, formData.accepted);
          } else {
            const totalConsumed = formData.accepted + (showRejected ? (formData.rejected || 0) : 0);
            await processMaterialConsumptions(batch, [], isCompleted, totalConsumed);
          }

          // Get product/effective stages to determine correct flow
          const product = getProductForBatch(batch);
          const effectiveStages = getEffectiveStagesForBatch(batch);
          
          // Debug logging
          console.log("DEBUG - Batch:", batch.productName, "Stage:", stage);
          console.log("DEBUG - Product found:", !!product);
          console.log("DEBUG - Effective stages:", effectiveStages);
          const currentIndex = effectiveStages.indexOf(stage);
          const hasNext = currentIndex >= 0 && currentIndex < effectiveStages.length - 1;
          const isLastStage = effectiveStages[effectiveStages.length - 1] === stage;
          const isMachiningOnly = effectiveStages.length === 1 && effectiveStages[0] === "Machining";
          const isSingleStageProduct =
            effectiveStages.length === 1 && effectiveStages[0] === stage;
          
          // Use effective stages to determine if it should go to Final Stock
          const productIsMoldingAndMachiningOnly = effectiveStages.length === 2 && 
            effectiveStages.includes("Molding") && effectiveStages.includes("Machining");
            
          console.log("DEBUG - productIsMoldingAndMachiningOnly:", productIsMoldingAndMachiningOnly);
          if (isSingleStageProduct && formData.accepted > 0) {
            // Single-stage products: send directly to Final Stock, skip Store intermediates
            console.log("DEBUG handleEndCycle: Single-stage product - adding directly to Final Stock and skipping Store inventory");
            await addToFinalStock(batch, formData.accepted);
          } else {
            if (stage === "Molding" && formData.accepted > 0) {
              await createMouldedMaterial(batch, formData.accepted);
            }
            if (stage === "Assembling" && formData.accepted > 0) {
              // Always increment Assembled stage inventory for multi-stage flows
              await createAssembledMaterial(batch, formData.accepted);
            }
            if (stage === "Machining" && productIsMoldingAndMachiningOnly && formData.accepted > 0) {
              // Special case: Product with Molding + Machining only - add to Final Stock when Machining completes
              console.log("DEBUG handleEndCycle: Adding to Final Stock - Product has only Molding + Machining stages");
              await addToFinalStock(batch, formData.accepted);
            }
            if (stage === "Machining" && formData.accepted > 0) {
              // For multi-stage flows, increment Machined stage inventory in Store
              console.log("DEBUG handleEndCycle: Creating/Updating machined materials for accepted units");
              await createFinishedMaterial(batch, formData.accepted);
            }
            if (isLastStage && stage === "Testing" && !isMachiningOnly && !productIsMoldingAndMachiningOnly) {
              console.log("DEBUG handleEndCycle: Adding to Final Stock - Testing as last stage of multi-stage product");
              await addToFinalStock(batch, formData.accepted);
            }
          }

          await completeStage(batch.id, stage);
        }
      }

      toast({
        title: "Cycle Ended",
        description: `The production cycle has been ended at the ${stage} stage for the submitted batches.`,
      });
    } finally {
      setIsEndingCycle(false);
    }
  };

  const handleFinishBatch = async () => {
    console.log("🚀 DEBUG: handleFinishBatch function called for stage:", stage);
    
    if (isFinishing) return;
    
    setIsFinishing(true);

    try {
      const values = form.getValues();
      const effectiveSelected = getEffectiveSelectedBatches(values);
      setSelectedBatches(effectiveSelected);

      if (effectiveSelected.size === 0) {
        toast({
          variant: "destructive",
          title: "No Batches Selected",
          description: "Please select at least one batch to finish.",
        })
        return
      }

      console.log("DEBUG handleFinishBatch - All batches:", batches.length);
      console.log("DEBUG handleFinishBatch - Current stage:", stage);
      
      // Work on all effectively selected batches for this stage
      const selectedTargetBatches = batches.filter((b) => effectiveSelected.has(b.id));
      if (selectedTargetBatches.length === 0) {
        toast({
          variant: "destructive",
          title: "No Selected Batches",
          description: "Please select at least one batch checkbox to proceed.",
        })
        return
      }

      // Stock check before finishing: ensure available inventory covers required consumption for this stage
      const shortages: string[] = []
      for (const batch of selectedTargetBatches) {
        const formData = values.batches.find((b) => b.id === batch.id)
        if (!formData) continue
        const materialsForStage = batch.materials.filter((m) => m.stage === stage)
        for (const materialInBatch of materialsForStage) {
          const inv = findInventoryItemById(materialInBatch.id)
          const mc = formData.materialConsumptions.find((x) => x.materialId === materialInBatch.id)
          const required = Math.max(0, Number(mc?.actualConsumption) || 0)
          const available = Number(inv?.item.quantity || 0)
          if (inv && required > available) {
            shortages.push(`Batch ${batch.id} - ${inv.item.name}: need ${required} ${(inv.item.unit || "pcs")}, have ${available} ${(inv.item.unit || "pcs")}`)
          }
        }
      }

      if (shortages.length > 0) {
        toast({
          variant: "destructive",
          title: "Insufficient Stock",
          description: `Cannot finish batch. Shortages -> ${shortages.join("; ")}`,
        })
        return
      }

      if (stage === "Testing") {
        let hasAssemblySelectionError = false;
        for (const batch of selectedTargetBatches) {
          const formData = values.batches.find((b) => b.id === batch.id);
          if (!formData) continue;

          const rejectedQty = Number((formData as any).rejected || 0);
          if (rejectedQty <= 0) continue;

          const assemblyMaterials = getAssemblyMaterialsForBatch(batch);
          if (assemblyMaterials.length === 0) continue;

          const selectionForBatch = assemblySelections[batch.id] || {};
          const uncheckedMaterials = assemblyMaterials.filter(
            (mat) => !selectionForBatch[mat.id],
          );

          if (uncheckedMaterials.length === 0) {
            hasAssemblySelectionError = true;
            break;
          }
        }

        if (hasAssemblySelectionError) {
          toast({
            variant: "destructive",
            title: "Invalid Assembly Material Selection",
            description: "At least one assembly material must be left unchecked for rejected units.",
          });
          return;
        }
      }

      // Note: Acceptance limits are intentionally not enforced here per user request.

      // No upper bound validation for accepted quantity; it can be any non-negative value.

      for (const batch of selectedTargetBatches) {
        const formData = values.batches.find((b) => b.id === batch.id);
        if (!formData) continue;

        const currentTotal = showRejected
          ? formData.accepted + formData.rejected
          : formData.accepted;
        const isCompleted = currentTotal > 0;

        const materialConsumptions: Record<string, number> = {};
        formData.materialConsumptions.forEach((mc) => {
          materialConsumptions[mc.materialId] = mc.actualConsumption;
        });

        try {
          if (stage === "Testing") {
            const totalConsumed = formData.accepted + (showRejected ? (formData.rejected || 0) : 0);
            await updateBatchStage(batch.id, stage, {
              accepted: formData.accepted,
              ...(showRejected ? { rejected: formData.rejected } : {}),
              materialConsumptions,
              actualConsumption: totalConsumed,
            });
          } else {
            const enforcedAccepted =
              stage === "Assembling" && batch.autoCreatedFromTestingRejected
                ? (batch.processingStages["Assembling"]?.accepted ?? batch.quantityToBuild ?? 0)
                : formData.accepted;
            await updateBatchStage(batch.id, stage, {
              accepted: enforcedAccepted,
              ...(showRejected ? { rejected: formData.rejected } : {}),
              materialConsumptions,
            });
          }
        } catch (error) {
          console.error(`[v0] Failed to update batch ${batch.id}:`, error);
          continue;
        }

        if (!batch.processingStages[stage]?.completed) {
          const acceptedUnitsForConsumption = stage === "Testing"
            ? (formData.accepted + (showRejected ? (formData.rejected || 0) : 0))
            : formData.accepted;
          await processMaterialConsumptions(batch, formData.materialConsumptions, isCompleted, acceptedUnitsForConsumption);

          // Get product/effective stages to determine correct flow
          const product = getProductForBatch(batch);
          const effectiveStages = getEffectiveStagesForBatch(batch);

          console.log("DEBUG handleFinishBatch - Product lookup:", batch.productName);
          console.log("DEBUG handleFinishBatch - Product found:", !!product);
          console.log("DEBUG handleFinishBatch - Effective stages:", effectiveStages);
          console.log("DEBUG handleFinishBatch - All finalStock products:", finalStock.map(p => p.name));
          const currentIndex = effectiveStages.indexOf(stage);
          const hasNext = currentIndex >= 0 && currentIndex < effectiveStages.length - 1;
          const isLastStage = effectiveStages[effectiveStages.length - 1] === stage;
          const isMachiningOnly = effectiveStages.length === 1 && effectiveStages[0] === "Machining";
          const isSingleStageProduct =
            effectiveStages.length === 1 && effectiveStages[0] === stage;

          // Use product's manufacturing stages to determine if it should go to Final Stock
          const productIsMoldingAndMachiningOnly = effectiveStages.length === 2 && 
            effectiveStages.includes("Molding") && effectiveStages.includes("Machining");
            
          console.log("DEBUG handleFinishBatch - productIsMoldingAndMachiningOnly:", productIsMoldingAndMachiningOnly);
          console.log("DEBUG handleFinishBatch - Current stage:", stage, "hasNext:", hasNext, "isLastStage:", isLastStage);

          if (isSingleStageProduct && formData.accepted > 0) {
            // Single-stage products: send directly to Final Stock, skip Store intermediates
            console.log("DEBUG handleFinishBatch: Single-stage product - adding directly to Final Stock and skipping Store inventory");
            await addToFinalStock(batch, formData.accepted);
          } else {
            if (stage === "Molding" && formData.accepted > 0) {
              await createMouldedMaterial(batch, formData.accepted);
            }
            if (stage === "Assembling" && formData.accepted > 0) {
              // Always increment Assembled stage inventory for multi-stage flows
              await createAssembledMaterial(batch, formData.accepted);
            }
            if (stage === "Machining" && productIsMoldingAndMachiningOnly && formData.accepted > 0) {
              // Special case: Product with Molding + Machining only - add to Final Stock when Machining completes
              console.log("DEBUG: Adding to Final Stock - Product has only Molding + Machining stages");
              await addToFinalStock(batch, formData.accepted);
            }
            if (stage === "Machining" && formData.accepted > 0) {
              // For multi-stage flows, increment Machined stage inventory in Store
              console.log("DEBUG: Creating/Updating machined materials for accepted units");
              await createFinishedMaterial(batch, formData.accepted);
            }
            if (isLastStage && stage === "Testing" && !isMachiningOnly && !productIsMoldingAndMachiningOnly) {
              console.log("DEBUG: Adding to Final Stock - Testing as last stage of multi-stage product");
              await addToFinalStock(batch, formData.accepted);
            }
          }

          await completeStage(batch.id, stage);
        }

        if (stage === "Testing") {
          const rejectedQty = Number((formData as any).rejected || 0);
          if (rejectedQty > 0) {
            const assemblyMaterials = getAssemblyMaterialsForBatch(batch);
            if (assemblyMaterials.length > 0) {
              const selectionForBatch = assemblySelections[batch.id] || {};
              const uncheckedMaterials = assemblyMaterials.filter(
                (mat) => !selectionForBatch[mat.id],
              );

              if (uncheckedMaterials.length > 0) {
                try {
                  await createFailedAssemblyBatch(batch, rejectedQty, uncheckedMaterials);
                } catch (error) {
                  console.error("Failed to create failed Assembly batch from Testing:", error);
                  toast({
                    variant: "destructive",
                    title: "Failed to Create Failed Assembly Batch",
                    description: "An error occurred while creating the failed Assembly batch. Please check console logs or try again.",
                  });
                }
              }
            }
          }
        }
      }

      toast({
        title: "Batch Finished",
        description:
          stage === "Molding"
            ? "Moulding completed. Items have been added to Store."
            : stage === "Machining"
              ? "Machining completed. Items have been updated."
              : stage === "Testing"
                ? "Testing completed. Final product updated."
                : "Stage completed.",
      });
    } finally {
      setIsFinishing(false);
    }
  };

  const hasAnyBatchWithThisAsLastStage = batches.some((batch) => {
    const effectiveStages = getEffectiveStagesForBatch(batch);
    return effectiveStages[effectiveStages.length - 1] === stage;
  });

  const isAnyButtonDisabled = isSubmitting || isEndingCycle || isFinishing || !canEditStage;

  return (
    <Form {...form}>
      <form
        id={`stage-form-${stage.toLowerCase()}`}
        onSubmit={form.handleSubmit(onSubmit)}
      >
        {!canEditStage && (
          <Card className="mb-4 border-amber-200 bg-amber-50">
            <CardHeader>
              <CardTitle className="text-amber-800 text-sm font-medium">
                View Only - No Edit Permission
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-amber-700">
              You don&apos;t have permission to edit the {stage} stage. Contact an admin to request access.
            </CardContent>
          </Card>
        )}
        <Card>
          <CardContent className="pt-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]">
                    <Checkbox
                      checked={
                        selectedBatches.size === batches.length &&
                        batches.length > 0
                      }
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedBatches(new Set(batches.map((b) => b.id)));
                        } else {
                          setSelectedBatches(new Set());
                        }
                      }}
                      disabled={isAnyButtonDisabled}
                    />
                  </TableHead>
                  <TableHead>Batch ID</TableHead>
                  <TableHead>Product ID</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Measurement Sketch</TableHead>
                  <TableHead>Date Created</TableHead>
                  {stage !== "Testing" && (
                    <TableHead className="w-[150px]">Actual Consumption</TableHead>
                  )}
                  <TableHead className="w-[150px]">{labels.accepted}</TableHead>
                  {showRejected && (
                    <TableHead className="w-[150px]">{labels.rejected}</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {fields.map((field, index) => {
                  const batch = batches[index];
                  if (!batch) return null;

                  const materialsForStage = batch.materials.filter(
                    (m) => m.stage === stage,
                  );
                  const assemblyMaterials = stage === "Testing"
                    ? getAssemblyMaterialsForBatch(batch)
                    : [];
                  const product = getProductForBatch(batch);
                  const measurementSketch = product?.measurementSketch;

                  return (
                    <>
                      <TableRow
                        key={field.id}
                        className="border-b-2 border-gray-300"
                      >
                        <TableCell
                          rowSpan={
                            materialsForStage.length > 0
                              ? materialsForStage.length + 1
                              : 1
                          }
                        >
                          <Checkbox
                            checked={selectedBatches.has(batch.id)}
                            onCheckedChange={(checked) => {
                              const newSelected = new Set(selectedBatches);
                              if (checked) {
                                newSelected.add(batch.id);
                              } else {
                                newSelected.delete(batch.id);
                              }
                              setSelectedBatches(newSelected);
                            }}
                            disabled={isAnyButtonDisabled}
                          />
                        </TableCell>
                        <TableCell className="font-mono text-xs font-bold">
                          {batch.batchId || batch.batchCode || batch.id}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {batch.productId}
                        </TableCell>
                        <TableCell
                          className="font-bold cursor-pointer select-none"
                          onClick={() => {
                            if (isAnyButtonDisabled) return;
                            const shouldLockAccepted =
                              stage === "Assembling" && (
                                batch.autoCreatedFromTestingRejected ||
                                ((batch.selectedProcesses?.[0] === "Assembling") &&
                                  (Number(batch.processingStages?.["Assembling"]?.accepted ?? 0) === Number(batch.quantityToBuild ?? 0)) &&
                                  Number(batch.quantityToBuild ?? 0) > 0)
                              );
                            if (shouldLockAccepted) return;
                            const fieldPath = `batches.${index}.accepted` as const;
                            const currentAccepted =
                              Number(form.getValues(fieldPath) as any) || 0;
                            const nextAccepted = currentAccepted + 1;
                            form.setValue(fieldPath, nextAccepted);
                          }}
                        >
                          {batch.productName}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {product?.sku || "—"}
                        </TableCell>
                        <TableCell>
                          {measurementSketch ? (
                            <Dialog>
                              <DialogTrigger asChild>
                                <button
                                  type="button"
                                  className="focus:outline-none"
                                  disabled={!measurementSketch}
                                >
                                  <img
                                    src={measurementSketch}
                                    alt={`Measurement sketch for ${batch.productName}`}
                                    className="h-10 w-10 rounded border object-contain"
                                  />
                                </button>
                              </DialogTrigger>
                              <DialogContent>
                                <DialogHeader>
                                  <DialogTitle>
                                    Measurement Sketch - {batch.productName}
                                  </DialogTitle>
                                  
                                </DialogHeader>
                                <div className="flex justify-center">
                                  <img
                                    src={measurementSketch}
                                    alt={`Measurement sketch for ${batch.productName}`}
                                    className="max-h-[90vh] w-auto rounded border object-contain"
                                  />
                                </div>
                              </DialogContent>
                            </Dialog>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              No Image
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="font-bold">
                          {format(new Date(batch.createdAt), "dd/MM/yyyy")}
                        </TableCell>
                        {stage !== "Testing" && <TableCell></TableCell>}
                        <TableCell
                          rowSpan={
                            materialsForStage.length > 0
                              ? materialsForStage.length + 1
                              : 1
                          }
                        >
                          {(() => {
                            const lockAccepted =
                              stage === "Assembling" && (
                                batch.autoCreatedFromTestingRejected ||
                                ((batch.selectedProcesses?.[0] === "Assembling") &&
                                  (Number(batch.processingStages?.["Assembling"]?.accepted ?? 0) === Number(batch.quantityToBuild ?? 0)) &&
                                  Number(batch.quantityToBuild ?? 0) > 0)
                              );
                            return lockAccepted ? (
                            <div className="font-mono text-sm select-none">
                              {String(form.getValues(`batches.${index}.accepted`) ?? batch.processingStages["Assembling"]?.accepted ?? batch.quantityToBuild ?? 0)}
                            </div>
                          ) : (
                            <FormField
                              control={form.control}
                              name={`batches.${index}.accepted`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormControl>
                                    <Input 
                                      type="number" 
                                      className={numberInputClassName}
                                      {...field} 
                                      disabled={isAnyButtonDisabled}
                                      onChange={(e) => {
                                        const rawValue = e.target.value;
                                        const acceptedValue = Math.max(0, Number(rawValue) || 0);
                                        e.target.value = acceptedValue.toString();
                                        field.onChange(acceptedValue);
                                      }}
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          );
                          })()}
                        </TableCell>
                        {showRejected && (
                          <TableCell
                            rowSpan={
                              materialsForStage.length > 0
                                ? materialsForStage.length + 1
                                : 1
                            }
                          >
                            <FormField
                              control={form.control}
                              name={`batches.${index}.rejected`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormControl>
                                    <Input 
                                      type="number" 
                                      className={numberInputClassName}
                                      {...field} 
                                      disabled={isAnyButtonDisabled}
                                      onChange={(e) => {
                                        const rawValue = e.target.value;
                                        const rejectedValue = Math.max(0, Number(rawValue) || 0);

                                        // Normalize display value (strip leading zeros)
                                        e.target.value = rejectedValue.toString();

                                        field.onChange(rejectedValue);
                                      }}
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </TableCell>
                        )}
                      </TableRow>

                      {materialsForStage.map((material, matIndex) => {
                        const batchFormData = form.getValues(`batches.${index}`);
                        const materialConsumptionIndex = batchFormData?.materialConsumptions?.findIndex(
                          (mc: any) => mc.materialId === material.id
                        ) ?? -1;

                        const invInfo = findInventoryItemById(material.id);
                        const displayName = (invInfo?.item?.name) || material.name || material.id;

                        return (
                          <TableRow
                            key={`${field.id}-material-${matIndex}`}
                            className={
                              matIndex === materialsForStage.length - 1
                                ? "border-b-2 border-gray-300"
                                : ""
                            }
                          >
                            <TableCell
                              className="pl-8 text-sm italic cursor-pointer select-none"
                              onClick={() => {
                                if (isAnyButtonDisabled) return;
                                if (materialConsumptionIndex < 0) return;

                                const fieldPath =
                                  `batches.${index}.materialConsumptions.${materialConsumptionIndex}.actualConsumption` as const;
                                const current =
                                  Number(form.getValues(fieldPath) as any) || 0;
                                const next = current + 1;

                                form.setValue(fieldPath, next);
                              }}
                            >
                              {displayName}
                            </TableCell>
                            <TableCell></TableCell>
                            <TableCell></TableCell>
                            <TableCell></TableCell>
                            <TableCell></TableCell>
                            <TableCell></TableCell>
                            
                            {stage !== "Testing" && (
                              <TableCell>
                                {materialConsumptionIndex >= 0 && (
                                  <FormField
                                    control={form.control}
                                    name={`batches.${index}.materialConsumptions.${materialConsumptionIndex}.actualConsumption`}
                                    render={({ field }) => (
                                      <FormItem>
                                        <FormControl>
                                          <Input 
                                            type="number" 
                                            className={numberInputClassName}
                                            {...field}
                                            placeholder={material.quantity.toString()}
                                            disabled={isAnyButtonDisabled}
                                            onChange={(e) => {
                                              const rawValue = e.target.value;
                                              const consumptionValue = Math.max(0, Number(rawValue) || 0);

                                              // Normalize display value (strip leading zeros)
                                              e.target.value = consumptionValue.toString();

                                              field.onChange(consumptionValue);
                                            }}
                                          />
                                        </FormControl>
                                        <FormMessage />
                                      </FormItem>
                                    )}
                                  />
                                )}
                              </TableCell>
                            )}
                          </TableRow>
                        );
                      })}

                      {stage === "Testing" && (
                        <TableRow className="bg-muted/30">
                          <TableCell colSpan={totalColumns}>
                            <div className="mt-2 rounded-md border p-3">
                              <div className="mb-2 text-sm font-semibold">
                                Assembly Input Materials
                              </div>
                              {assemblyMaterials.length === 0 ? (
                                <div className="text-xs text-muted-foreground">
                                  No assembly materials found for this batch.
                                </div>
                              ) : (
                                <div className="space-y-1">
                                  {assemblyMaterials.map((mat) => {
                                    const selectionForBatch = assemblySelections[batch.id] || {};
                                    const isOk = !!selectionForBatch[mat.id];

                                    return (
                                      <div
                                        key={mat.id}
                                        className="flex items-center gap-3 text-xs"
                                      >
                                        <Checkbox
                                          checked={isOk}
                                          onCheckedChange={(checked) => {
                                            setAssemblySelections((prev) => {
                                              const current = prev[batch.id] || {};
                                              const next = { ...current };
                                              if (checked) {
                                                next[mat.id] = true;
                                              } else {
                                                delete next[mat.id];
                                              }
                                              return { ...prev, [batch.id]: next };
                                            });
                                          }}
                                          disabled={isAnyButtonDisabled}
                                        />
                                        <div>
                                          <div className="font-medium">
                                            {mat.name || mat.id}
                                          </div>
                                          <div className="font-mono text-[10px] text-muted-foreground">
                                            Raw Material ID: {mat.id}
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  );
                })}
                {batches.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={totalColumns} className="h-24 text-center">
                      No batches are ready for the {stage} stage.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        {batches.length > 0 && (
          <div className="flex justify-end gap-2 mt-4">
            <Button 
              type="button" 
              onClick={handleFinishBatch}
              disabled={isAnyButtonDisabled}
            >
              {isFinishing ? "Finishing..." : "Finish Batch"}
            </Button>
          </div>
        )}
      </form>
    </Form>
  );
}