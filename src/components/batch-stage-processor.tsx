"use client";

import { useEffect, useState } from "react";
import type { Batch, ProcessingStageName, ActivityLog } from "@/lib/types";
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
} from "@/lib/firebase";
import { useRawMaterials } from "@/hooks/use-raw-materials";
import { useFinalStock } from "@/hooks/use-final-stock";
import { useActivityLog } from "@/hooks/use-activity-log";
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
  
  const { rawMaterials, mouldedMaterials, finishedMaterials, assembledMaterials, updateRawMaterial, deleteRawMaterial } =
    useRawMaterials();
  const { finalStock, createFinalStock, updateFinalStock } = useFinalStock();
  const { createActivityLog } = useActivityLog();
  const { employee } = usePermissions();
  const { toast } = useToast();
  
  // Check if user has permission to edit this stage
  const canEditStage = employee ? canEditProcessingStage(employee.role, stage) : false;
  const showRejected = false;

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
        accepted: b.processingStages[stage]?.accepted || 0,
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
        accepted: b.processingStages[stage]?.accepted || 0,
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

  // Helper: prefer productId lookup, fallback to name. Then prefer product.manufacturingStages over batch.selectedProcesses
  const getProductForBatch = (batch: Batch) => {
    const byId = finalStock.find((p) => p.id === batch.productId);
    if (byId) return byId;
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

  const labels = getStageLabels(stage);

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
          await addLog({
            recordId: inv.item.id,
            recordType: "RawMaterial",
            action: "Stock Adjustment (Batch)",
            details: `Batch ${batch.id} (${stage}) consumed ${consumptionAmount} ${inv.item.unit || "pcs"}. Old qty: ${oldQuantity}, New qty: ${newQuantity}.`,
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
            await addLog({
              recordId: inv.item.id,
              recordType: "FinalStock",
              action: "Stock Adjustment (Batch)",
              details: `Batch ${batch.id} (${stage}) consumed ${consumptionAmount} pcs from batches. Old qty: ${oldQuantity}, New qty: ${newTotal}.`,
            });
          } else {
            await updateFinalStock(inv.item.id, { quantity: newQuantity } as any);
            await addLog({
              recordId: inv.item.id,
              recordType: "FinalStock",
              action: "Stock Adjustment (Batch)",
              details: `Batch ${batch.id} (${stage}) consumed ${consumptionAmount} pcs. Old qty: ${oldQuantity}, New qty: ${newQuantity}.`,
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

      await addLog({
        recordId: existingMaterial.id,
        recordType: "RawMaterial",
        action: "Stock Adjustment (Batch)",
        details: `${accepted} moulded items from batch ${batch.id} added to Store. Old qty: ${oldQuantity}, New qty: ${newQuantity}.`,
      });

      toast({
        title: "Moulded Material Updated",
        description: `${accepted} moulded ${batch.productName} added to existing stock.`,
      });
    } else {
      const mouldedMaterialId = await addRawMaterial({
        name: materialName,
        sku: `MOULD-${Date.now()}`,
        quantity: accepted,
        unit: "pcs",
        threshold: 10,
        isMoulded: true,
        sourceBatchId: batch.id,
        createdAt: new Date().toISOString(),
      });

      await addLog({
        recordId: mouldedMaterialId,
        recordType: "RawMaterial",
        action: "Created",
        details: `${accepted} moulded items from batch ${batch.id} added to Store.`,
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

      await addLog({
        recordId: existingMaterial.id,
        recordType: "RawMaterial",
        action: "Stock Adjustment (Batch)",
        details: `${accepted} machined items from batch ${batch.id} added to Store. Old qty: ${oldQuantity}, New qty: ${newQuantity}.`,
      });

      toast({
        title: "Machined Material Updated",
        description: `${accepted} machined ${batch.productName} added to existing stock.`,
      });
    } else {
      const finishedMaterialId = await addRawMaterial({
        name: materialName,
        sku: `FINISH-${Date.now()}`,
        quantity: accepted,
        unit: "pcs",
        threshold: 10,
        isFinished: true,
        sourceBatchId: batch.id,
        createdAt: new Date().toISOString(),
      });

      await addLog({
        recordId: finishedMaterialId,
        recordType: "RawMaterial",
        action: "Created",
        details: `${accepted} machined items from batch ${batch.id} added to Store.`,
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

      await addLog({
        recordId: existingMaterial.id,
        recordType: "RawMaterial",
        action: "Stock Adjustment (Batch)",
        details: `${accepted} assembled items from batch ${batch.id} added to Store. Old qty: ${oldQuantity}, New qty: ${newQuantity}.`,
      });

      toast({
        title: "Assembled Material Updated",
        description: `${accepted} assembled ${batch.productName} added to existing stock.`,
      });
    } else {
      const assembledMaterialId = await addRawMaterial({
        name: materialName,
        sku: `ASSEMB-${Date.now()}`,
        quantity: accepted,
        unit: "pcs",
        threshold: 10,
        isAssembled: true,
        sourceBatchId: batch.id,
        createdAt: new Date().toISOString(),
      });

      await addLog({
        recordId: assembledMaterialId,
        recordType: "RawMaterial",
        action: "Created",
        details: `${accepted} assembled items from batch ${batch.id} added to Store.`,
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

    const newBatch = {
      batchId: batch.id,
      sourceBatchId: batch.id,
      quantity: accepted,
      sku: `BATCH-${batch.id}`,
      createdAt: new Date().toISOString(),
    };

    console.log(`[BatchStageProcessor] Getting/creating product for: ${batch.productName}`);
    const product = await getOrCreateProduct(batch.productName, {
      imageUrl: "/placeholder.svg?height=100&width=100",
      imageHint: batch.productName,
    });
    console.log(`[BatchStageProcessor] Product obtained: ${product.id} - "${product.name}"`);

    try {
      await addBatchToProduct(product.id, newBatch);
      console.log(`[BatchStageProcessor] ✓ Successfully added batch ${batch.id} to product ${product.name} (${product.id})`);
    } catch (error) {
      console.error(`[BatchStageProcessor] ❌ Failed to add batch ${batch.id} to product ${product.id}:`, error);
      throw error;
    }
  };

  async function onSubmit(values: z.infer<typeof formSchema>) {
    console.log("🚀 DEBUG: onSubmit function called for stage:", stage);
    
    if (isSubmitting) return;
    
    console.log("[v0] Submitting form for stage:", stage, "with values:", values);

    if (selectedBatches.size === 0) {
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
        if (!selectedBatches.has(batch.id)) continue;
        const formData = values.batches.find((b) => b.id === batch.id);
        if (!formData) continue;

        const currentTotal = showRejected
          ? formData.accepted + formData.rejected
          : formData.accepted;
        const isCompleted = currentTotal > 0;

        console.log("[v0] Processing batch:", batch.id, "isCompleted:", isCompleted);

        // Build materialConsumptions object
        const materialConsumptions: Record<string, number> = {};
        formData.materialConsumptions.forEach((mc) => {
          materialConsumptions[mc.materialId] = mc.actualConsumption;
        });

        try {
          await updateBatchStage(batch.id, stage, {
            accepted: formData.accepted,
            ...(showRejected ? { rejected: formData.rejected } : {}),
            materialConsumptions,
          });
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

          await processMaterialConsumptions(batch, formData.materialConsumptions, isCompleted, formData.accepted);

            // Get product/effective stages to determine correct flow
          const product = getProductForBatch(batch);
          const effectiveStages = getEffectiveStagesForBatch(batch);
          
          // Debug logging
          console.log("DEBUG onSubmit - Batch:", batch.productName, "Stage:", stage);
          console.log("DEBUG onSubmit - Product found:", !!product);
          console.log("DEBUG onSubmit - Effective stages:", effectiveStages);
          const isLastStage = effectiveStages[effectiveStages.length - 1] === stage;
          const isMachiningOnly = effectiveStages.length === 1 && effectiveStages[0] === "Machining";
          
          // Use effective stages to determine if it should go to Final Stock
          const productIsMoldingAndMachiningOnly = effectiveStages.length === 2 && 
            effectiveStages.includes("Molding") && effectiveStages.includes("Machining");
            
          console.log("DEBUG onSubmit - productIsMoldingAndMachiningOnly:", productIsMoldingAndMachiningOnly);

          if (stage === "Molding" && formData.accepted > 0) {
            await createMouldedMaterial(batch, formData.accepted);
          }
          if (stage === "Assembling" && formData.accepted > 0) {
            // Always increment Assembled stage inventory
            await createAssembledMaterial(batch, formData.accepted);
          }
          if (stage === "Machining" && productIsMoldingAndMachiningOnly && formData.accepted > 0) {
            // Special case: Product with Molding + Machining only - add to Final Stock when Machining completes
            console.log("DEBUG onSubmit: Adding to Final Stock - Product has only Molding + Machining stages");
            await addToFinalStock(batch, formData.accepted);
          }
          if (stage === "Machining" && formData.accepted > 0) {
            // Always increment Machined stage inventory
            console.log("DEBUG onSubmit: Creating/Updating machined materials for accepted units");
            await createFinishedMaterial(batch, formData.accepted);
          }
          if (isLastStage && stage === "Testing" && !isMachiningOnly && !productIsMoldingAndMachiningOnly) {
            console.log("DEBUG onSubmit: Adding to Final Stock - Testing as last stage of multi-stage product");
            await addToFinalStock(batch, formData.accepted);
          }

          await completeStage(batch.id, stage);
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

      // No upper bound validation for accepted quantity; it can be any non-negative value.

      for (const batch of batches) {
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
          await updateBatchStage(batch.id, stage, {
            accepted: formData.accepted,
            ...(showRejected ? { rejected: formData.rejected } : {}),
            materialConsumptions,
          });
        } catch (error) {
          console.error(`[v0] Failed to update batch ${batch.id}:`, error);
          continue;
        }

        // Debug: Check handleEndCycle condition
        console.log("DEBUG handleEndCycle - Batch stage status:", batch.id, stage, "completed:", batch.processingStages[stage]?.completed, "isCompleted:", isCompleted);
        
        if (isCompleted && !batch.processingStages[stage]?.completed) {
          await processMaterialConsumptions(batch, formData.materialConsumptions, isCompleted, formData.accepted);

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
          
          // Use effective stages to determine if it should go to Final Stock
          // Check for both "Molding" and "Moulding" spelling variations
          const productIsMoldingAndMachiningOnly = effectiveStages.length === 2 && 
            (effectiveStages.includes("Molding") || effectiveStages.includes("Moulding")) && 
            effectiveStages.includes("Machining");
            
          console.log("DEBUG - productIsMoldingAndMachiningOnly:", productIsMoldingAndMachiningOnly);

          if (stage === "Molding" && formData.accepted > 0) {
            await createMouldedMaterial(batch, formData.accepted);
          }
          if (stage === "Assembling" && formData.accepted > 0) {
            // Always increment Assembled stage inventory
            await createAssembledMaterial(batch, formData.accepted);
          }
          if (stage === "Machining" && productIsMoldingAndMachiningOnly && formData.accepted > 0) {
            // Special case: Product with Molding + Machining only - add to Final Stock when Machining completes
            console.log("DEBUG handleEndCycle: Adding to Final Stock - Product has only Molding + Machining stages");
            await addToFinalStock(batch, formData.accepted);
          }
          if (stage === "Machining" && formData.accepted > 0) {
            // Always increment Machined stage inventory
            console.log("DEBUG handleEndCycle: Creating/Updating machined materials for accepted units");
            await createFinishedMaterial(batch, formData.accepted);
          }
          if (isLastStage && stage === "Testing" && !isMachiningOnly && !productIsMoldingAndMachiningOnly) {
            console.log("DEBUG handleEndCycle: Adding to Final Stock - Testing as last stage of multi-stage product");
            await addToFinalStock(batch, formData.accepted);
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

      console.log("DEBUG handleFinishBatch - All batches:", batches.length);
      console.log("DEBUG handleFinishBatch - Current stage:", stage);
      
      const batchesWithThisAsLastStage = batches.filter((batch) => {
        const effectiveStages = getEffectiveStagesForBatch(batch);
        const lastStage = effectiveStages[effectiveStages.length - 1];
        console.log("DEBUG handleFinishBatch - Batch:", batch.id, "effectiveStages:", effectiveStages, "lastStage:", lastStage);
        return lastStage === stage;
      });

      console.log("DEBUG handleFinishBatch - Batches with this as last stage:", batchesWithThisAsLastStage.length);
      
      const targetBatches = batchesWithThisAsLastStage.length > 0 ? batchesWithThisAsLastStage : batches;
      if (targetBatches.length === 0) {
        console.log("DEBUG handleFinishBatch - No target batches for this stage, returning");
        return;
      }

      // Stock check before finishing: ensure available inventory covers required consumption for this stage
      const shortages: string[] = []
      for (const batch of targetBatches) {
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

      // Note: Acceptance limits are intentionally not enforced here per user request.

      // No upper bound validation for accepted quantity; it can be any non-negative value.

      for (const batch of targetBatches) {
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
          await updateBatchStage(batch.id, stage, {
            accepted: formData.accepted,
            ...(showRejected ? { rejected: formData.rejected } : {}),
            materialConsumptions,
          });
        } catch (error) {
          console.error(`[v0] Failed to update batch ${batch.id}:`, error);
          continue;
        }

        if (!batch.processingStages[stage]?.completed) {
          await processMaterialConsumptions(batch, formData.materialConsumptions, isCompleted, formData.accepted);

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

// Use product's manufacturing stages to determine if it should go to Final Stock
const productIsMoldingAndMachiningOnly = effectiveStages.length === 2 && 
  effectiveStages.includes("Molding") && effectiveStages.includes("Machining");
  
console.log("DEBUG handleFinishBatch - productIsMoldingAndMachiningOnly:", productIsMoldingAndMachiningOnly);
console.log("DEBUG handleFinishBatch - Current stage:", stage, "hasNext:", hasNext, "isLastStage:", isLastStage);

          if (stage === "Molding" && formData.accepted > 0) {
            await createMouldedMaterial(batch, formData.accepted);
          }
          if (stage === "Assembling" && formData.accepted > 0) {
            // Always increment Assembled stage inventory
            await createAssembledMaterial(batch, formData.accepted);
          }
          if (stage === "Machining" && productIsMoldingAndMachiningOnly && formData.accepted > 0) {
            // Special case: Product with Molding + Machining only - add to Final Stock when Machining completes
            console.log("DEBUG: Adding to Final Stock - Product has only Molding + Machining stages");
            await addToFinalStock(batch, formData.accepted);
          }
          if (stage === "Machining" && formData.accepted > 0) {
            // Always increment Machined stage inventory
            console.log("DEBUG: Creating/Updating machined materials for accepted units");
            await createFinishedMaterial(batch, formData.accepted);
          }
          if (isLastStage && stage === "Testing" && !isMachiningOnly && !productIsMoldingAndMachiningOnly) {
            console.log("DEBUG: Adding to Final Stock - Testing as last stage of multi-stage product");
            await addToFinalStock(batch, formData.accepted);
          }

          await completeStage(batch.id, stage);
        }
      }

      // Check if any batch has a product with only Molding + Machining manufacturing stages
      const hasProductWithMoldingAndMachiningOnly = batchesWithThisAsLastStage.some((batch) => {
        const product = finalStock.find(p => p.name === batch.productName);
        const productManufacturingStages = product?.manufacturingStages || [];
        return productManufacturingStages.length === 2 && 
          productManufacturingStages.includes("Molding") && productManufacturingStages.includes("Machining");
      });

      const hasMachiningOnlyBatch = batchesWithThisAsLastStage.some((batch) => {
        const selectedProcesses = batch.selectedProcesses || [];
        return selectedProcesses.length === 1 && selectedProcesses[0] === "Machining";
      });

      toast({
        title: "Batch Finished",
        description:
          stage === "Molding"
            ? "Moulding completed. Items have been added to Store."
            : stage === "Machining" && hasProductWithMoldingAndMachiningOnly
              ? "Machining completed. Items have been added to Final Stock (Product has only Molding + Machining stages)."
              : stage === "Machining" && hasMachiningOnlyBatch
                ? "Machining completed. Items have been added to Store."
                : stage === "Testing"
                  ? "Testing completed. Final product added to Final Stock."
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
                  <TableHead>Product</TableHead>
                  <TableHead>Measurement Sketch</TableHead>
                  <TableHead>Date Created</TableHead>
                  {labels.prevStage && (
                    <TableHead>{labels.prevStage}</TableHead>
                  )}
                  <TableHead>{labels.input}</TableHead>
                  <TableHead className="w-[150px]">
                    Actual Consumption
                  </TableHead>
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

                  const rawMaterialInput = getRawMaterialForStage(batch);
                  const fromPrevStageInput = getInputFromPreviousStage(batch);
                  const materialsForStage = batch.materials.filter(
                    (m) => m.stage === stage,
                  );
                  const product = finalStock.find(
                    (p) => p.name === batch.productName,
                  );
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
                          {batch.id}
                        </TableCell>
                        <TableCell
                          className="font-bold cursor-pointer select-none"
                          onClick={() => {
                            if (isAnyButtonDisabled) return;
                            const fieldPath = `batches.${index}.accepted` as const;
                            const currentAccepted =
                              Number(form.getValues(fieldPath) as any) || 0;
                            const nextAccepted = currentAccepted + 1;
                            form.setValue(fieldPath, nextAccepted);
                          }}
                        >
                          {batch.productName}
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
                          {format(new Date(batch.createdAt), "MM/dd/yyyy")}
                        </TableCell>
                        {labels.prevStage && (
                          <TableCell>
                            {fromPrevStageInput.toLocaleString()}
                          </TableCell>
                        )}
                        <TableCell></TableCell>
                        <TableCell></TableCell>
                        <TableCell
                          rowSpan={
                            materialsForStage.length > 0
                              ? materialsForStage.length + 1
                              : 1
                          }
                        >
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
                                      // Normalize display value (strip leading zeros)
                                      e.target.value = acceptedValue.toString();
                                      field.onChange(acceptedValue);
                                    }}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
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

                        // Auto-compute Raw Material Input = Accepted × (BOM qty per piece)
                        const acceptedValue = Number(form.watch(`batches.${index}.accepted`) ?? 0) || 0;
                        const bomPerPiece = (() => {
                          const rows = (product?.bom_per_piece as any[]) || [];
                          const match = rows.find((row: any) => row.stage === stage && row.raw_material_id === material.id);
                          if (match && typeof match.qty_per_piece === "number") return match.qty_per_piece;
                          const qtyToBuild = Number(batch.quantityToBuild || 0);
                          return qtyToBuild > 0 ? Number(material.quantity || 0) / qtyToBuild : 0;
                        })();
                        const autoRawInput = acceptedValue * bomPerPiece;
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
                            {labels.prevStage && <TableCell></TableCell>}
                            <TableCell className="font-medium">
                              {autoRawInput.toLocaleString()} {material.unit}
                            </TableCell>
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
                          </TableRow>
                        );
                      })}
                    </>
                  );
                })}
                {batches.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={showRejected ? 10 : 9} className="h-24 text-center">
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