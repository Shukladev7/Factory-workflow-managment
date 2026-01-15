"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useFieldArray } from "react-hook-form";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { useEffect, useState, useRef } from "react";
import type {
  Batch,
  RawMaterial,
  FinalStock,
  ActivityLog,
  ProcessingStageName,
} from "@/lib/types";
import { PlusCircle, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Combobox } from "./ui/combobox";
import { useRawMaterials } from "@/hooks/use-raw-materials";
import { useFinalStock } from "@/hooks/use-final-stock";
import { useActivityLog } from "@/hooks/use-activity-log";
import { createBatch } from "@/lib/firebase";

const processingStages = [
  "Molding",
  "Machining",
  "Assembling",
  "Testing",
] as const;

const numberInputClassName =
  "appearance-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

const materialSchema = z.object({
  materialId: z.string().min(1, "Please select a material."),
  quantity: z.coerce.number().min(0, "Quantity must be greater than 0."),
  stage: z.enum(processingStages, { required_error: "Please select a stage." }),
  materialType: z.enum(["raw", "moulded", "finished", "assembled"]).optional(),
});


const formSchema = z.object({
  batchId: z.string(),
  productId: z.string().min(1, "Please select a product."),
  quantityToBuild: z.coerce.number().min(1, "Quantity must be at least 1."),
  selectedProcesses: z
    .array(z.enum(processingStages))
    .min(1, "Please select at least one process."),
  materials: z
    .array(materialSchema)
    .min(1, "Please add at least one material."),
});

interface CreateBatchFormProps {
  onBatchCreated: (batch: Batch) => void;
  initialProductId?: string;
  initialStage?: ProcessingStageName;
}

export function CreateBatchForm({ onBatchCreated, initialProductId, initialStage }: CreateBatchFormProps) {
  const [isClient, setIsClient] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const {
    rawMaterials,
    regularMaterials,
    mouldedMaterials,
    finishedMaterials,
    assembledMaterials,
  } = useRawMaterials();
  const { finalStock } = useFinalStock();
  const { createActivityLog } = useActivityLog();

  
  console.log("[CreateBatchForm] Total finalStock items:", finalStock.length);
  console.log(
    "[CreateBatchForm] finalStock IDs:",
    finalStock.map((p) => ({ name: p.name, id: p.id })),
  );

  const validProducts = finalStock.filter((p) => p.id && p.id.trim() !== "");
  console.log(
    "[CreateBatchForm] Valid products with IDs:",
    validProducts.length,
  );

  const productOptions = validProducts.map((p) => ({
    label: p.name,
    value: p.id,
  }));
  console.log(
    "[CreateBatchForm] Product options for dropdown:",
    productOptions,
  );

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      batchId: "",
      productId: "",
      quantityToBuild: 1,
      selectedProcesses: [], // Start with no process selected
      materials: [
        { materialId: "", quantity: 1, stage: "Molding", materialType: "raw" },
      ],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "materials",
  });

  const selectedProcesses = form.watch("selectedProcesses");
  const selectedProductId = form.watch("productId");
  const quantityToBuild = form.watch("quantityToBuild") || 1;
  const hasAppliedInitialConfigRef = useRef(false);

  // Derive allowed stages from the selected product's manufacturing stages.
  // If the product has defined manufacturing stages, only those should be selectable
  // when creating a batch for that product. Otherwise, all stages remain available.
  const selectedProduct = finalStock.find((p) => p.id === selectedProductId);
  const allowedStages: ProcessingStageName[] =
    selectedProduct &&
    Array.isArray(selectedProduct.manufacturingStages) &&
    selectedProduct.manufacturingStages.length > 0
      ? selectedProduct.manufacturingStages
      : [...processingStages];

  // Note: Users must manually select processes; no auto-fill of manufacturing stages on product selection

   // Ensure selected processes are always compatible with the selected product's stages
   useEffect(() => {
    if (!selectedProductId) return;

    const product = finalStock.find((p) => p.id === selectedProductId);
    const productStages = product?.manufacturingStages || [];

    if (productStages.length === 0) return;

    const currentProcesses = form.getValues("selectedProcesses");
    const filteredProcesses = currentProcesses.filter((stage) =>
      productStages.includes(stage),
    );

    if (filteredProcesses.length !== currentProcesses.length) {
      form.setValue("selectedProcesses", filteredProcesses);
    }
  }, [selectedProductId, finalStock, form]);

  // Auto-load BOM when product or processes are selected
  useEffect(() => {
    if (selectedProductId && selectedProcesses.length > 0) {
      const product = finalStock.find((p) => p.id === selectedProductId);
      if (
        product &&
        product.bom_per_piece &&
        product.bom_per_piece.length > 0
      ) {
        // Filter BOM rows based on selected processes
        const filteredBOM = product.bom_per_piece.filter((bomRow) =>
          selectedProcesses.includes(bomRow.stage),
        );

        // Convert filtered BOM to materials format; support Final Stock inputs
        const bomMaterials = filteredBOM.map((bomRow) => {
          const isFinal = (bomRow as any).source === "final";
          // Determine material type for UI grouping; keep as 'raw' for final inputs so they appear in Raw Materials section
          let materialType: "raw" | "moulded" | "finished" | "assembled" = "raw";
          if (!isFinal) {
            const material = rawMaterials.find((m) => m.id === bomRow.raw_material_id);
            if (material) {
              if (material.isFinished) materialType = "finished";
              else if (material.isMoulded) materialType = "moulded";
              else if (material.isAssembled) materialType = "assembled";
            }
          }

          return {
            materialId: bomRow.raw_material_id, // may be raw material id or final stock id
            quantity: bomRow.qty_per_piece * quantityToBuild,
            stage: bomRow.stage,
            materialType,
          };
        });

        // Only update if there are materials, otherwise set default
        if (bomMaterials.length > 0) {
          form.setValue("materials", bomMaterials);
        } else {
          form.setValue("materials", [
            {
              materialId: "",
              quantity: 1,
              stage: selectedProcesses[0],
              materialType: "raw",
            },
          ]);
        }
      }
    }
  }, [selectedProductId, selectedProcesses, quantityToBuild, finalStock, form, rawMaterials]);

  useEffect(() => {
    if (!initialProductId || hasAppliedInitialConfigRef.current) return;

    const currentProductId = form.getValues("productId");
    if (currentProductId && currentProductId !== initialProductId) return;

    const product = finalStock.find((p) => p.id === initialProductId);
    if (!product) return;

    const productStages = product.manufacturingStages || [];

    // Set the product; do not auto-fill processes. If an initialStage is provided and valid, select only that one.
    form.setValue("productId", initialProductId);
    if (initialStage && productStages.includes(initialStage)) {
      form.setValue("selectedProcesses", [initialStage]);
    }

    hasAppliedInitialConfigRef.current = true;
  }, [initialProductId, initialStage, finalStock, form, hasAppliedInitialConfigRef]);

  useEffect(() => {
    setIsClient(true);
    // Display placeholder; Firestore document ID will be generated and stored server-side
    form.setValue("batchId", "batch_000");
  }, [form]);

  const addLog = async (
    newLog: Omit<ActivityLog, "id" | "timestamp" | "user">,
  ) => {
    await createActivityLog({
      ...newLog,
      timestamp: new Date().toISOString(),
      user: "System",
    });
  };

  async function onSubmit(values: z.infer<typeof formSchema>) {
    if (isSubmitting) return;
    setIsSubmitting(true);

    const invalidMaterials = values.materials.filter(
      (material) => !values.selectedProcesses.includes(material.stage),
    );

    if (invalidMaterials.length > 0) {
      toast({
        variant: "destructive",
        title: "Invalid Material Stages",
        description:
          "All materials must be assigned to selected processes only.",
      });
      setIsSubmitting(false);
      return;
    }

    // Inventory Check (supports Raw Materials and Final Stock inputs)
    for (const material of values.materials) {
      const stockItemRaw = rawMaterials.find((rm) => rm.id === material.materialId);
      const stockItemFinal = finalStock.find((p) => p.id === material.materialId);
      const stockItem = stockItemRaw || stockItemFinal;
      const availableFinal = stockItemFinal
        ? ((stockItemFinal.batches && stockItemFinal.batches.length > 0)
            ? stockItemFinal.batches.reduce((sum, b) => sum + Number(b.quantity || 0), 0)
            : Number(stockItemFinal.quantity || 0))
        : undefined;
      const available = Number((stockItemRaw?.quantity ?? availableFinal) || 0);
      if (!stockItem || available < material.quantity) {
        toast({
          variant: "destructive",
          title: "Insufficient Stock",
          description: `Not enough ${(stockItemRaw?.name || stockItemFinal?.name) || "material"}. Required: ${material.quantity}, Available: ${available}.`,
        });
        setIsSubmitting(false);
        return;
      }
    }

    const selectedProduct = finalStock.find((p) => p.id === values.productId);
    if (!selectedProduct) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Selected product not found.",
      });
      setIsSubmitting(false);
      return;
    }

    const selectedMaterials = values.materials.map((mat) => {
      const materialRaw = rawMaterials.find((m) => m.id === mat.materialId);
      const materialFinal = finalStock.find((p) => p.id === mat.materialId);
      const item = materialRaw || materialFinal!;
      const unit = (materialRaw?.unit as string | undefined) || "pcs";
      return {
        id: item!.id,
        name: item!.name,
        quantity: mat.quantity,
        unit,
        stage: mat.stage,
      };
    });

    const totalMaterialQuantity = selectedMaterials.reduce(
      (sum, mat) => sum + mat.quantity,
      0,
    );

    const newBatch: Omit<Batch, "processingStages" | "status"> & {
      status: "Planned";
    } = {
      // Use the form's batchId as a temporary placeholder; Firestore will assign
      // the canonical batchId when persisting the batch.
      id: values.batchId,
      batchId: values.batchId,
      productId: values.productId,
      productName: selectedProduct.name,
      quantityToBuild: values.quantityToBuild,
      totalMaterialQuantity,
      materials: selectedMaterials,
      createdAt: new Date().toISOString(),
      status: "Planned",
      selectedProcesses: values.selectedProcesses, // Store selected processes
    };

    const processingStages: Record<ProcessingStageName, any> = {} as any;

    // Initialize all possible stages first
    processingStages.Molding = {
      accepted: 0,
      rejected: 0,
      actualConsumption: 0,
      completed: false,
    };
    processingStages.Machining = {
      accepted: 0,
      rejected: 0,
      actualConsumption: 0,
      completed: false,
    };
    processingStages.Assembling = {
      accepted: 0,
      rejected: 0,
      actualConsumption: 0,
      completed: false,
    };
    processingStages.Testing = {
      accepted: 0,
      rejected: 0,
      actualConsumption: 0,
      completed: false,
    };

    const fullBatch: Batch = {
      ...newBatch,
      processingStages,
    };

    try {
      // Persist the batch and get the authoritative Firestore ID
      const createdId = await createBatch(fullBatch);
      const createdBatch: Batch = { ...fullBatch, id: createdId };

      onBatchCreated(createdBatch);
      await addLog({
        recordId: createdId,
        recordType: "Batch",
        action: "Created",
        details: `Batch for "${fullBatch.productName}" created with processes: ${values.selectedProcesses.join(", ")}.`,
      });
      toast({
        title: "Batch Created",
        description: `Batch ${createdId} has been created successfully.`,
      });

      // Reset form after successful submission
      form.reset({
        batchId: "batch_000", // Placeholder only; actual ID comes from Firestore
        productId: "",
        quantityToBuild: 1,
        selectedProcesses: [],
        materials: [
          {
            materialId: "",
            quantity: 1,
            stage: "Molding",
            materialType: "raw",
          },
        ],
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to create batch. Please try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!isClient) {
    return null;
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 pt-4">
        <FormField
          control={form.control}
          name="batchId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Batch ID</FormLabel>
              <FormControl>
                <Input
                  placeholder="Batch ID"
                  {...field}
                  readOnly
                  className="bg-muted"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <FormField
              control={form.control}
              name="productId"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Product to Build *</FormLabel>
                  <Combobox
                    options={productOptions}
                    value={field.value}
                    onChange={field.onChange}
                    placeholder="Select product..."
                    searchPlaceholder="Search products..."
                    notfoundPlaceholder="No product found."
                  />
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <FormField
            control={form.control}
            name="quantityToBuild"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Quantity to Build *</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min="1"
                    placeholder="1"
                    className={numberInputClassName}
                    {...field}
                    onChange={(e) => {
                      const rawValue = e.target.value;
                      // Coerce to positive integer (at least 1)
                      let value = Math.max(1, Number(rawValue) || 0);
                      e.target.value = value.toString();
                      field.onChange(value);
                    }}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="selectedProcesses"
          render={() => (
            <FormItem>
              <div className="mb-4">
                <FormLabel className="text-base">
                  Manufacturing Processes
                </FormLabel>
                <p className="text-sm text-muted-foreground">
                  Choose <strong>only one</strong> of these processes: either{" "}
                  <strong>Moulding</strong> or <strong>Machining</strong> (cannot select both).
                  Or choose any combination of <strong>Assembling/Testing</strong> instead.
                </p>
              </div>
              <div className="space-y-4">
                {/* Single-Select Processes */}
                <div className="border rounded-lg p-4">
                  <div className="mb-3">
                    <p className="text-sm font-semibold">
                      Primary Processes (Choose Only One)
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Select either Moulding OR Machining (mutually exclusive)
                    </p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Moulding */}
                    <FormField
                      control={form.control}
                      name="selectedProcesses"
                      render={({ field }) => {
                        const hasMoulding = field.value?.includes("Molding");
                        const hasOtherProcesses = field.value?.some(
                          (p) => p !== "Molding",
                        );
                        const isAllowed = allowedStages.includes("Molding");
                        return (
                          <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                            <FormControl>
                              <Checkbox
                                checked={hasMoulding}
                                disabled={hasOtherProcesses || !isAllowed}
                                onCheckedChange={(checked) => {
                                  if (checked) {
                                    field.onChange(["Molding"]);
                                  } else {
                                    field.onChange([]);
                                  }
                                }}
                              />
                            </FormControl>
                            <div className="space-y-1 leading-none">
                              <FormLabel className="text-base font-semibold">
                                Moulding
                              </FormLabel>
                              <p className="text-sm text-muted-foreground">
                                Raw materials → Moulded materials
                              </p>
                            </div>
                          </FormItem>
                        );
                      }}
                    />

                    {/* Machining */}
                    <FormField
                      control={form.control}
                      name="selectedProcesses"
                      render={({ field }) => {
                        const hasMachining = field.value?.includes("Machining");
                        const hasOtherProcesses = field.value?.some(
                          (p) => p !== "Machining",
                        );
                        const isAllowed = allowedStages.includes("Machining");
                        return (
                          <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                            <FormControl>
                              <Checkbox
                                checked={hasMachining}
                                disabled={hasOtherProcesses || !isAllowed}
                                onCheckedChange={(checked) => {
                                  if (checked) {
                                    field.onChange(["Machining"]);
                                  } else {
                                    field.onChange([]);
                                  }
                                }}
                              />
                            </FormControl>
                            <div className="space-y-1 leading-none">
                              <FormLabel className="text-base font-semibold">
                                Machining
                              </FormLabel>
                              <p className="text-sm text-muted-foreground">
                                Raw materials → Finished materials
                              </p>
                            </div>
                          </FormItem>
                        );
                      }}
                    />
                  </div>
                </div>

                {/* Multi-Select Processes */}
                <div className="border rounded-lg p-4">
                  <div className="mb-3">
                    <p className="text-sm font-semibold">
                      Multi-Select Processes
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Select any combination of these processes
                    </p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {(["Assembling", "Testing"] as const).map((process) => (
                      <FormField
                        key={process}
                        control={form.control}
                        name="selectedProcesses"
                        render={({ field }) => {
                          const hasSingleSelect =
                            field.value?.includes("Molding") ||
                            field.value?.includes("Machining");
                          const isChecked = field.value?.includes(process);
                          const isAllowed = allowedStages.includes(process);
                          return (
                            <FormItem
                              key={process}
                              className="flex flex-row items-start space-x-3 space-y-0"
                            >
                              <FormControl>
                                <Checkbox
                                  checked={isChecked}
                                  disabled={hasSingleSelect || !isAllowed}
                                  onCheckedChange={(checked) => {
                                    const otherMultiProcesses =
                                      field.value?.filter(
                                        (p) =>
                                          p !== "Molding" && p !== "Machining",
                                      ) || [];
                                    if (checked) {
                                      field.onChange([
                                        ...otherMultiProcesses,
                                        process,
                                      ]);
                                    } else {
                                      field.onChange(
                                        otherMultiProcesses.filter(
                                          (p) => p !== process,
                                        ),
                                      );
                                    }
                                  }}
                                />
                              </FormControl>
                              <div className="space-y-1 leading-none">
                                <FormLabel>{process}</FormLabel>
                              </div>
                            </FormItem>
                          );
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Materials Section - Different layout based on process type */}
        {(() => {
          const selectedProduct = finalStock.find(
            (p) => p.id === selectedProductId,
          );
          const hasBOM =
            selectedProduct &&
            selectedProduct.bom_per_piece &&
            selectedProduct.bom_per_piece.length > 0;

          if (!hasBOM) return null;

          // Filter BOM by selected processes
          const filteredBOM =
            selectedProduct.bom_per_piece?.filter((bomRow) =>
              selectedProcesses.includes(bomRow.stage),
            ) || [];

          if (filteredBOM.length === 0) return null;

          // return (
          //   <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
          //     <div className="flex items-center gap-2 mb-2">
          //       <Badge className="bg-blue-600">BOM Auto-Loaded</Badge>
          //       <span className="text-sm font-medium">Materials calculated from Bill of Materials</span>
          //     </div>
          //     <p className="text-sm text-muted-foreground">
          //       Loaded {filteredBOM.length} material(s) for selected processes ({selectedProcesses.join(", ")}) × {quantityToBuild} pieces. You can still edit them if needed.
          //     </p>
          //   </div>
          // )
        })()}
        {selectedProcesses.includes("Molding") ? (
          // Moulding Process: Single section for raw materials only
          <div className="space-y-4">
            <FormLabel>Required Raw Materials</FormLabel>
            {fields
              .filter(
                (_, idx) =>
                  form.watch(`materials.${idx}.materialType`) === "raw" ||
                  !form.watch(`materials.${idx}.materialType`),
              )
              .map((field, arrayIndex) => {
                const index = fields.indexOf(field);
                const selectedId = form.watch(`materials.${index}.materialId`);
                const selectedMaterial = rawMaterials.find(
                  (m) => m.id === selectedId,
                );
                const selectedFinal = finalStock.find((p) => p.id === selectedId);

                return (
                  <div
                    key={field.id}
                    className="flex items-end gap-4 p-4 border rounded-md relative"
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full">
                      <FormField
                        control={form.control}
                        name={`materials.${index}.materialId`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Material</FormLabel>
                            <Select
                              onValueChange={field.onChange}
                              defaultValue={field.value}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select a material" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {regularMaterials.length === 0 ? (
                                  <div className="p-2 text-sm text-muted-foreground">
                                    No raw materials available
                                  </div>
                                ) : (
                                  <>
                                    {regularMaterials.map((material) => (
                                      <SelectItem
                                        key={material.id}
                                        value={material.id}
                                      >
                                        {material.name} (In Stock:{" "}
                                        {material.quantity.toLocaleString()})
                                      </SelectItem>
                                    ))}
                                    {/* If selected is a Final Stock ID, inject a label so Select shows the name instead of ID */}
                                    {selectedFinal && !regularMaterials.some((m) => m.id === selectedId) && (
                                      <SelectItem key={selectedId} value={selectedId}>
                                        {selectedFinal.name} (Final Stock)
                                      </SelectItem>
                                    )}
                                  </>
                                )}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name={`materials.${index}.stage`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Production Stage</FormLabel>
                            <Select
                              onValueChange={field.onChange}
                              defaultValue={field.value}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select a stage" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {selectedProcesses.map((stage) => (
                                  <SelectItem key={stage} value={stage}>
                                    {stage}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name={`materials.${index}.quantity`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>
                              Quantity{" "}
                              {selectedMaterial && `(${selectedMaterial.unit})`}
                            </FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                placeholder="0"
                                className={numberInputClassName}
                                {...field}
                                onChange={(e) => {
                                  const rawValue = e.target.value;
                                  const value = Math.max(0, Number(rawValue) || 0);
                                  e.target.value = value.toString();
                                  field.onChange(value);
                                }}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    {fields.filter(
                      (_, idx) =>
                        form.watch(`materials.${idx}.materialType`) === "raw" ||
                        !form.watch(`materials.${idx}.materialType`),
                    ).length > 1 && (
                      <Button
                        type="button"
                        variant="destructive"
                        size="icon"
                        onClick={() => remove(index)}
                        className="flex-shrink-0"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                );
              })}
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                append({
                  materialId: "",
                  quantity: 1,
                  stage: selectedProcesses[0] || "Molding",
                  materialType: "raw",
                })
              }
            >
              <PlusCircle className="mr-2 h-4 w-4" /> Add Raw Material
            </Button>
          </div>
        ) : (
          // Other Processes: Separate sections for Raw Materials and Moulded Items
          <>
            {/* Raw Materials Section */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <FormLabel className="text-base font-semibold">
                  Raw Materials
                </FormLabel>
                <Badge variant="secondary">Optional</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Select regular raw materials for this batch
              </p>
              {fields
                .filter(
                  (_, idx) =>
                    form.watch(`materials.${idx}.materialType`) === "raw",
                )
                .map((field) => {
                  const index = fields.indexOf(field);
                  const selectedMaterial = regularMaterials.find(
                    (m) => m.id === form.watch(`materials.${index}.materialId`),
                  );

                  return (
                    <div
                      key={field.id}
                      className="flex items-end gap-4 p-4 border rounded-md relative bg-blue-50/30"
                    >
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full">
                        <FormField
                          control={form.control}
                          name={`materials.${index}.materialId`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Raw Material</FormLabel>
                              <Select
                                onValueChange={field.onChange}
                                defaultValue={field.value}
                              >
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select raw material" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {regularMaterials.length === 0 ? (
                                    <div className="p-2 text-sm text-muted-foreground">
                                      No raw materials available
                                    </div>
                                  ) : (
                                    regularMaterials.map((material) => (
                                      <SelectItem
                                        key={material.id}
                                        value={material.id}
                                      >
                                        {material.name} (Stock:{" "}
                                        {material.quantity.toLocaleString()}{" "}
                                        {material.unit})
                                      </SelectItem>
                                    ))
                                  )}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name={`materials.${index}.stage`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Production Stage</FormLabel>
                              <Select
                                onValueChange={field.onChange}
                                defaultValue={field.value}
                                disabled
                              >
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select a stage" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {selectedProcesses.map((stage) => (
                                    <SelectItem key={stage} value={stage}>
                                      {stage}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name={`materials.${index}.quantity`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>
                                Quantity{" "}
                                {selectedMaterial &&
                                  `(${selectedMaterial.unit})`}
                              </FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  placeholder="0"
                                  {...field}
                                  disabled
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      <Button
                        type="button"
                        variant="destructive"
                        size="icon"
                        onClick={() => remove(index)}
                        className="flex-shrink-0"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })}
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  append({
                    materialId: "",
                    quantity: 1,
                    stage: selectedProcesses[0] || "Machining",
                    materialType: "raw",
                  })
                }
              >
                <PlusCircle className="mr-2 h-4 w-4" /> Add Raw Material
              </Button>
            </div>

            {/* Moulded Items Section - Auto-filled and locked */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <FormLabel className="text-base font-semibold">
                  Moulded Items from Store
                </FormLabel>
                <Badge variant="secondary">Optional</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Select moulded products from the Store
              </p>
              {fields
                .filter(
                  (_, idx) =>
                    form.watch(`materials.${idx}.materialType`) === "moulded",
                )
                .map((field) => {
                  const index = fields.indexOf(field);
                  const selectedMaterial = mouldedMaterials.find(
                    (m) => m.id === form.watch(`materials.${index}.materialId`),
                  );

                  return (
                    <div
                      key={field.id}
                      className="flex items-end gap-4 p-4 border rounded-md relative bg-purple-50/30"
                    >
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full">
                        <FormField
                          control={form.control}
                          name={`materials.${index}.materialId`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Moulded Item</FormLabel>
                              <Select
                                onValueChange={field.onChange}
                                defaultValue={field.value}
                                disabled
                              >
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select moulded item" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {mouldedMaterials.length === 0 ? (
                                    <div className="p-2 text-sm text-muted-foreground">
                                      No moulded items in Store. Complete a
                                      moulding batch first.
                                    </div>
                                  ) : (
                                    mouldedMaterials.map((material) => (
                                      <SelectItem
                                        key={material.id}
                                        value={material.id}
                                      >
                                        🔷 {material.name} (Stock:{" "}
                                        {material.quantity.toLocaleString()}{" "}
                                        {material.unit})
                                      </SelectItem>
                                    ))
                                  )}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name={`materials.${index}.stage`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Production Stage</FormLabel>
                              <Select
                                onValueChange={field.onChange}
                                defaultValue={field.value}
                                disabled
                              >
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select a stage" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {selectedProcesses.map((stage) => (
                                    <SelectItem key={stage} value={stage}>
                                      {stage}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name={`materials.${index}.quantity`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>
                                Quantity{" "}
                                {selectedMaterial &&
                                  `(${selectedMaterial.unit})`}
                              </FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  placeholder="0"
                                  {...field}
                                  disabled
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      <div className="flex-shrink-0 h-10" />
                    </div>
                  );
                })}
              {/* No manual add button - moulded items are fully auto-managed */}
            </div>

            {/* Machined Items Section - Auto-filled and locked
                Only show when Assembling/Testing is selected without Machining */}
            {(selectedProcesses.includes("Assembling") ||
              selectedProcesses.includes("Testing")) &&
              !selectedProcesses.includes("Machining") && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <FormLabel className="text-base font-semibold">
                      Machined Items from Store
                    </FormLabel>
                    <Badge variant="secondary">Optional</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Select machined products from the Store
                  </p>
                  {fields
                    .filter(
                      (_, idx) =>
                        form.watch(`materials.${idx}.materialType`) ===
                        "finished",
                    )
                    .map((field) => {
                      const index = fields.indexOf(field);
                      const selectedMaterial = finishedMaterials.find(
                        (m) =>
                          m.id === form.watch(`materials.${index}.materialId`),
                      );

                      return (
                        <div
                          key={field.id}
                          className="flex items-end gap-4 p-4 border rounded-md relative bg-green-50/30"
                        >
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full">
                            <FormField
                              control={form.control}
                              name={`materials.${index}.materialId`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Finished Item</FormLabel>
                                  <Select
                                    onValueChange={field.onChange}
                                    defaultValue={field.value}
                                    disabled
                                  >
                                    <FormControl>
                                      <SelectTrigger>
                                        <SelectValue placeholder="Select finished item" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      {finishedMaterials.length === 0 ? (
                                        <div className="p-2 text-sm text-muted-foreground">
                                          No finished items in Store. Complete a
                                          finishing-only batch first.
                                        </div>
                                      ) : (
                                        finishedMaterials.map((material) => (
                                          <SelectItem
                                            key={material.id}
                                            value={material.id}
                                          >
                                            ✨ {material.name} (Stock:{" "}
                                            {material.quantity.toLocaleString()}{" "}
                                            {material.unit})
                                          </SelectItem>
                                        ))
                                      )}
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={form.control}
                              name={`materials.${index}.stage`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Production Stage</FormLabel>
                                  <Select
                                    onValueChange={field.onChange}
                                    defaultValue={field.value}
                                    disabled
                                  >
                                    <FormControl>
                                      <SelectTrigger>
                                        <SelectValue placeholder="Select a stage" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      {selectedProcesses.map((stage) => (
                                        <SelectItem key={stage} value={stage}>
                                          {stage}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={form.control}
                              name={`materials.${index}.quantity`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>
                                    Quantity{" "}
                                    {selectedMaterial &&
                                      `(${selectedMaterial.unit})`}
                                  </FormLabel>
                                  <FormControl>
                                    <Input
                                      type="number"
                                      placeholder="0"
                                      {...field}
                                      disabled
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                          <div className="flex-shrink-0 h-10" />
                        </div>
                      );
                    })}
                  {/* No manual add button - finished items are fully auto-managed */}
                </div>
              )}
            {/* Assembled Items Section - Visible when Testing is selected */}
            {selectedProcesses.includes("Testing") && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <FormLabel className="text-base font-semibold">
                    Assembled Items from Store
                  </FormLabel>
                  <Badge variant="secondary">Optional</Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  Select assembled units to be consumed at Testing
                </p>
                {fields
                  .filter((_, idx) =>
                    form.watch(`materials.${idx}.materialType`) === "assembled",
                  )
                  .map((field) => {
                    const index = fields.indexOf(field);
                    const selectedMaterial = assembledMaterials.find(
                      (m) => m.id === form.watch(`materials.${index}.materialId`),
                    );

                    return (
                      <div
                        key={field.id}
                        className="flex items-end gap-4 p-4 border rounded-md relative bg-amber-50/40"
                      >
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full">
                          <FormField
                            control={form.control}
                            name={`materials.${index}.materialId`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Assembled Item</FormLabel>
                                <Select
                                  onValueChange={field.onChange}
                                  defaultValue={field.value}
                                >
                                  <FormControl>
                                    <SelectTrigger>
                                      <SelectValue placeholder="Select assembled item" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    {assembledMaterials.length === 0 ? (
                                      <div className="p-2 text-sm text-muted-foreground">
                                        No assembled items in Store. Complete an assembling batch first.
                                      </div>
                                    ) : (
                                      assembledMaterials.map((material) => (
                                        <SelectItem
                                          key={material.id}
                                          value={material.id}
                                        >
                                          🧩 {material.name} (Stock: {material.quantity.toLocaleString()} {material.unit})
                                        </SelectItem>
                                      ))
                                    )}
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name={`materials.${index}.stage`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Production Stage</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={"Testing"} disabled>
                                  <FormControl>
                                    <SelectTrigger>
                                      <SelectValue placeholder="Testing" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    <SelectItem value="Testing">Testing</SelectItem>
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name={`materials.${index}.quantity`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>
                                  Quantity {selectedMaterial && `(${selectedMaterial.unit})`}
                                </FormLabel>
                                <FormControl>
                                  <Input type="number" placeholder="0" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        <Button
                          type="button"
                          variant="destructive"
                          size="icon"
                          onClick={() => remove(index)}
                          className="flex-shrink-0"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    );
                  })}
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    append({
                      materialId: "",
                      quantity: quantityToBuild,
                      stage: "Testing",
                      materialType: "assembled",
                    })
                  }
                >
                  <PlusCircle className="mr-2 h-4 w-4" /> Add Assembled Item
                </Button>
              </div>
            )}
          </>
        )}

        {form.formState.errors.materials &&
          !form.formState.errors.materials.root &&
          typeof form.formState.errors.materials.message === "string" && (
            <p className="text-sm font-medium text-destructive">
              {form.formState.errors.materials.message}
            </p>
          )}

        <div className="flex justify-end">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Creating..." : "Create Batch"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
