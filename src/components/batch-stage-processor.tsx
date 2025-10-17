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
import { useRouter } from "next/navigation";
import {
  subscribeToBatchesForStage,
  updateBatchStage,
  completeStage,
} from "@/lib/firebase";
import { useRawMaterials } from "@/hooks/use-raw-materials";
import { useFinalStock } from "@/hooks/use-final-stock";
import { useActivityLog } from "@/hooks/use-activity-log";

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
  
  const { rawMaterials, updateRawMaterial, deleteRawMaterial } =
    useRawMaterials();
  const { finalStock, createFinalStock } = useFinalStock();
  const { createActivityLog } = useActivityLog();
  const { employee } = usePermissions();
  const { toast } = useToast();
  const router = useRouter();
  
  // Check if user has permission to edit this stage
  const canEditStage = employee ? canEditProcessingStage(employee.role, stage) : false;

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
        rejected: b.processingStages[stage]?.rejected || 0,
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
        rejected: b.processingStages[stage]?.rejected || 0,
        materialConsumptions: b.materials
          .filter((m) => m.stage === stage)
          .map((m) => ({
            materialId: m.id,
            actualConsumption: b.processingStages[stage]?.materialConsumptions?.[m.id] || 0,
          })),
      })),
    });
  }, [batches, form, stage]);

  const addLog = async (
    newLog: Omit<ActivityLog, "id" | "timestamp" | "user">,
  ) => {
    await createActivityLog({
      ...newLog,
      timestamp: new Date().toISOString(),
      user: "System",
    });
  };

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
      return getRawMaterialForStage(batch);
    }

    return getInputFromPreviousStage(batch);
  };

  const getNextDepartment = (
    batch: Batch,
    currentStage: ProcessingStageName,
  ): string | null => {
    const selectedProcesses = batch.selectedProcesses || [];
    const currentIndex = selectedProcesses.indexOf(currentStage);

    if (currentIndex >= 0 && currentIndex < selectedProcesses.length - 1) {
      return selectedProcesses[currentIndex + 1];
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
    isCompleted: boolean
  ) => {
    if (!isCompleted) return;

    const materialsForStage = batch.materials.filter((m) => m.stage === stage);
    
    for (const materialInBatch of materialsForStage) {
      const materialToUpdate = rawMaterials.find(
        (rm) => rm.id === materialInBatch.id,
      );
      
      if (materialToUpdate) {
        const consumptionData = materialConsumptions.find(
          (mc) => mc.materialId === materialInBatch.id
        );
        
        const consumptionAmount = consumptionData?.actualConsumption > 0
          ? consumptionData.actualConsumption
          : materialInBatch.quantity;
        
        const oldQuantity = materialToUpdate.quantity;
        const newQuantity = oldQuantity - consumptionAmount;

        if (newQuantity <= 0) {
          await deleteRawMaterial(materialToUpdate.id);
          await addLog({
            recordId: materialToUpdate.id,
            recordType: "RawMaterial",
            action: "Deleted",
            details: `Batch ${batch.id} (${stage}) consumed all remaining stock (${oldQuantity} ${materialToUpdate.unit}). Material deleted.`,
          });
        } else {
          await updateRawMaterial(materialToUpdate.id, {
            quantity: newQuantity,
          });
          await addLog({
            recordId: materialToUpdate.id,
            recordType: "RawMaterial",
            action: "Stock Adjustment (Batch)",
            details: `Batch ${batch.id} (${stage}) consumed ${consumptionAmount} ${materialToUpdate.unit}. Old qty: ${oldQuantity}, New qty: ${newQuantity}.`,
          });
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
    const materialName = `Finished ${batch.productName}`;
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
        details: `${accepted} finished items from batch ${batch.id} added to Store. Old qty: ${oldQuantity}, New qty: ${newQuantity}.`,
      });

      toast({
        title: "Finished Material Updated",
        description: `${accepted} finished ${batch.productName} added to existing stock.`,
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
        details: `${accepted} finished items from batch ${batch.id} added to Store.`,
      });

      toast({
        title: "Finished Material Created",
        description: `${accepted} finished ${batch.productName} added to Store.`,
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

    setIsSubmitting(true);

    try {
      for (const batch of batches) {
        if (!selectedBatches.has(batch.id)) continue;
        const formData = values.batches.find((b) => b.id === batch.id);
        if (!formData) continue;

        const currentTotal = formData.accepted + formData.rejected;
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
            rejected: formData.rejected,
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

        if (!batch.processingStages[stage]?.completed) {
          const nextDept = getNextDepartment(batch, stage);
          toast({
            title: `${nextDept} Dept. Notification`,
            description: `Batch ${batch.id} for ${batch.productName} has completed the ${stage} stage.`,
          });

          await processMaterialConsumptions(batch, formData.materialConsumptions, isCompleted);

          const selectedProcesses = batch.selectedProcesses || [];
          const isLastStage = selectedProcesses[selectedProcesses.length - 1] === stage;
          const isMachiningOnly = selectedProcesses.length === 1 && selectedProcesses[0] === "Machining";

          if (stage === "Molding" && formData.accepted > 0) {
            await createMouldedMaterial(batch, formData.accepted);
          } else if (stage === "Machining" && isMachiningOnly && formData.accepted > 0) {
            await createFinishedMaterial(batch, formData.accepted);
          } else if (isLastStage && stage !== "Molding" && !isMachiningOnly) {
            await addToFinalStock(batch, formData.accepted);
          }

          await completeStage(batch.id, stage);
        }
      }

      toast({
        title: "Batches Updated",
        description: `The ${stage} stage has been updated for the submitted batches.`,
      });

      const batchWithNextStage = batches.find((batch) => {
        const selectedProcesses = batch.selectedProcesses || [];
        const currentIndex = selectedProcesses.indexOf(stage);
        return currentIndex >= 0 && currentIndex < selectedProcesses.length - 1;
      });

      if (batchWithNextStage) {
        const selectedProcesses = batchWithNextStage.selectedProcesses || [];
        const currentIndex = selectedProcesses.indexOf(stage);
        const nextStage = selectedProcesses[currentIndex + 1];

        if (nextStage) {
          setTimeout(() => {
            router.push(`/batches/${nextStage.toLowerCase()}`);
          }, 500);
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  const handleEndCycle = async () => {
    if (isEndingCycle) return;
    
    setIsEndingCycle(true);

    try {
      const values = form.getValues();

      for (const batch of batches) {
        const formData = values.batches.find((b) => b.id === batch.id);
        if (!formData) continue;

        const currentTotal = formData.accepted + formData.rejected;
        const isCompleted = currentTotal > 0;

        const materialConsumptions: Record<string, number> = {};
        formData.materialConsumptions.forEach((mc) => {
          materialConsumptions[mc.materialId] = mc.actualConsumption;
        });

        try {
          await updateBatchStage(batch.id, stage, {
            accepted: formData.accepted,
            rejected: formData.rejected,
            materialConsumptions,
          });
        } catch (error) {
          console.error(`[v0] Failed to update batch ${batch.id}:`, error);
          continue;
        }

        if (isCompleted && !batch.processingStages[stage]?.completed) {
          await processMaterialConsumptions(batch, formData.materialConsumptions, isCompleted);

          const selectedProcesses = batch.selectedProcesses || [];
          const isMachiningOnly = selectedProcesses.length === 1 && selectedProcesses[0] === "Machining";

          if (stage === "Molding" && formData.accepted > 0) {
            await createMouldedMaterial(batch, formData.accepted);
          } else if (stage === "Machining" && isMachiningOnly && formData.accepted > 0) {
            await createFinishedMaterial(batch, formData.accepted);
          } else if (stage !== "Molding" && !isMachiningOnly) {
            await addToFinalStock(batch, formData.accepted);
          }

          await completeStage(batch.id, stage);
        }
      }

      toast({
        title: "Cycle Ended",
        description: `The production cycle has been ended at the ${stage} stage for the submitted batches.`,
      });

      setTimeout(() => {
        router.push("/batches/overview");
      }, 500);
    } finally {
      setIsEndingCycle(false);
    }
  };

  const handleFinishBatch = async () => {
    if (isFinishing) return;
    
    setIsFinishing(true);

    try {
      const values = form.getValues();

      const batchesWithThisAsLastStage = batches.filter((batch) => {
        const selectedProcesses = batch.selectedProcesses || [];
        return selectedProcesses[selectedProcesses.length - 1] === stage;
      });

      if (batchesWithThisAsLastStage.length === 0) return;

      for (const batch of batchesWithThisAsLastStage) {
        const formData = values.batches.find((b) => b.id === batch.id);
        if (!formData) continue;

        const currentTotal = formData.accepted + formData.rejected;
        const isCompleted = currentTotal > 0;

        const materialConsumptions: Record<string, number> = {};
        formData.materialConsumptions.forEach((mc) => {
          materialConsumptions[mc.materialId] = mc.actualConsumption;
        });

        try {
          await updateBatchStage(batch.id, stage, {
            accepted: formData.accepted,
            rejected: formData.rejected,
            materialConsumptions,
          });
        } catch (error) {
          console.error(`[v0] Failed to update batch ${batch.id}:`, error);
          continue;
        }

        if (!batch.processingStages[stage]?.completed) {
          await processMaterialConsumptions(batch, formData.materialConsumptions, isCompleted);

          const selectedProcesses = batch.selectedProcesses || [];
          const isMachiningOnly = selectedProcesses.length === 1 && selectedProcesses[0] === "Machining";

          if (stage === "Molding" && formData.accepted > 0) {
            await createMouldedMaterial(batch, formData.accepted);
          } else if (stage === "Machining" && isMachiningOnly && formData.accepted > 0) {
            await createFinishedMaterial(batch, formData.accepted);
          } else if (stage !== "Molding" && !isMachiningOnly) {
            await addToFinalStock(batch, formData.accepted);
          }

          await completeStage(batch.id, stage);
        }
      }

      const hasMachiningOnlyBatch = batchesWithThisAsLastStage.some((batch) => {
        const selectedProcesses = batch.selectedProcesses || [];
        return selectedProcesses.length === 1 && selectedProcesses[0] === "Machining";
      });

      toast({
        title: "Batch Finished",
        description:
          stage === "Molding"
            ? "Moulding completed. Items have been added to Store."
            : stage === "Machining" && hasMachiningOnlyBatch
              ? "Machining completed. Items have been added to Store."
              : "The batch has been finalized and added to the Final Stock list.",
      });

      setTimeout(() => {
        router.push("/batches/overview");
      }, 500);
    } finally {
      setIsFinishing(false);
    }
  };

  const hasAnyBatchWithThisAsLastStage = batches.some((batch) => {
    const selectedProcesses = batch.selectedProcesses || [];
    return selectedProcesses[selectedProcesses.length - 1] === stage;
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
                  <TableHead>Date Created</TableHead>
                  {labels.prevStage && (
                    <TableHead>{labels.prevStage}</TableHead>
                  )}
                  <TableHead>{labels.input}</TableHead>
                  <TableHead className="w-[150px]">
                    Actual Consumption
                  </TableHead>
                  <TableHead className="w-[150px]">{labels.accepted}</TableHead>
                  <TableHead className="w-[150px]">{labels.rejected}</TableHead>
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
                        <TableCell className="font-bold">
                          {batch.productName}
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
                                    {...field} 
                                    disabled={isAnyButtonDisabled}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </TableCell>
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
                                    {...field} 
                                    disabled={isAnyButtonDisabled}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </TableCell>
                      </TableRow>

                      {materialsForStage.map((material, matIndex) => {
                        const batchFormData = form.getValues(`batches.${index}`);
                        const materialConsumptionIndex = batchFormData?.materialConsumptions?.findIndex(
                          (mc: any) => mc.materialId === material.id
                        ) ?? -1;

                        return (
                          <TableRow
                            key={`${field.id}-material-${matIndex}`}
                            className={
                              matIndex === materialsForStage.length - 1
                                ? "border-b-2 border-gray-300"
                                : ""
                            }
                          >
                            <TableCell className="pl-8 text-sm italic">
                              {material.name}
                            </TableCell>
                            <TableCell></TableCell>
                            <TableCell></TableCell>
                            {labels.prevStage && <TableCell></TableCell>}
                            <TableCell className="font-medium">
                              {material.quantity.toLocaleString()} {material.unit}
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
                                          {...field}
                                          placeholder={material.quantity.toString()}
                                          disabled={isAnyButtonDisabled}
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
                    <TableCell colSpan={9} className="h-24 text-center">
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
            {hasAnyBatchWithThisAsLastStage ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleEndCycle}
                  disabled={isAnyButtonDisabled}
                >
                  {isEndingCycle ? "Ending Cycle..." : "End cycle at this stage"}
                </Button>
                <Button 
                  type="button" 
                  onClick={handleFinishBatch}
                  disabled={isAnyButtonDisabled}
                >
                  {isFinishing ? "Finishing..." : "Finish Batch"}
                </Button>
              </>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleEndCycle}
                  disabled={isAnyButtonDisabled}
                >
                  {isEndingCycle ? "Ending Cycle..." : "End cycle at this stage"}
                </Button>
                <Button 
                  type="submit"
                  disabled={isAnyButtonDisabled}
                >
                  {isSubmitting ? "Processing..." : "Proceed to next stage"}
                </Button>
              </>
            )}
          </div>
        )}
      </form>
    </Form>
  );
}