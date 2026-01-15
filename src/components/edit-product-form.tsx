"use client";

import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormField,
  FormItem,
  FormControl,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { ImageUpload } from "@/components/image-upload";
import { ManufacturingStagesSelector } from "@/components/manufacturing-stages-selector";
import { BOMEditor } from "@/components/bom-editor";
import { uploadImage, deleteImage } from "@/lib/firebase/storage";
import { useToast } from "@/hooks/use-toast";
import { useRawMaterials } from "@/hooks/use-raw-materials";

import type { FinalStock, BOMRow, ProcessingStageName } from "@/lib/types";

interface EditProductFormProps {
  product: FinalStock;
  onProductUpdated: (product: FinalStock) => void;
}

const formSchema = z.object({
  id: z.string(),
  productId: z.string().optional(),
  name: z.string().min(1, "Please enter a name."),
  sku: z.string().min(1, "Please enter a SKU."),
  price: z.coerce.number().min(0, "Price must be 0 or greater."),
  gstRate: z.coerce.number().min(0, "GST Rate must be 0 or greater."),
  threshold: z.coerce.number().min(0, "Threshold must be 0 or greater.").default(0),
  imageUrl: z.string().optional(),
  imageHint: z.string().optional(),
  measurementSketch: z.string().optional(),
});

export function EditProductForm({ product, onProductUpdated }: EditProductFormProps) {
  const [bomRows, setBomRows] = useState<BOMRow[]>([]);
  const [manufacturingStages, setManufacturingStages] = useState<ProcessingStageName[]>(
    product.manufacturingStages || []
  );
  const [unitThresholds, setUnitThresholds] = useState<{ moulded?: number; machined?: number; assembled?: number }>({
    moulded: product.mouldedThreshold ?? 0,
    machined: product.machinedThreshold ?? 0,
    assembled: product.assembledThreshold ?? 0,
  });
  const { toast } = useToast();
  const {
    createRawMaterial,
    rawMaterials,
    mouldedMaterials,
    finishedMaterials,
    assembledMaterials,
    deleteRawMaterial,
  } = useRawMaterials();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      id: product.id ?? "",
      productId: product.productId ?? "",
      name: product.name ?? "",
      sku: product.sku ?? "",
      price: typeof product.price !== "undefined" ? product.price : 0,
      gstRate: typeof product.gstRate !== "undefined" ? product.gstRate : 0,
      threshold: typeof product.threshold !== "undefined" ? product.threshold : 0,
      imageUrl: product.imageUrl ?? "",
      imageHint: product.imageHint ?? "",
      measurementSketch: product.measurementSketch ?? "",
    },
  });

  // keep react-hook-form in sync when product changes
  useEffect(() => {
    form.reset({
      id: product.id ?? "",
      productId: product.productId ?? "",
      name: product.name ?? "",
      sku: product.sku ?? "",
      price: typeof product.price !== "undefined" ? product.price : 0,
      gstRate: typeof product.gstRate !== "undefined" ? product.gstRate : 0,
      threshold: typeof product.threshold !== "undefined" ? product.threshold : 0,
      imageUrl: product.imageUrl ?? "",
      imageHint: product.imageHint ?? "",
      measurementSketch: product.measurementSketch ?? "",
    });

    // initialize BOM rows if present
    if (Array.isArray(product.bom_per_piece) && product.bom_per_piece.length > 0) {
      setBomRows(product.bom_per_piece);
    } else {
      setBomRows([]);
    }

    // initialize manufacturing stages
    setManufacturingStages(product.manufacturingStages || []);
    // initialize unit thresholds
    setUnitThresholds({
      moulded: product.mouldedThreshold ?? 0,
      machined: product.machinedThreshold ?? 0,
      assembled: product.assembledThreshold ?? 0,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product]);

  const handleMeasurementSketchUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
    currentUrl?: string,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const allowedTypes = ["image/jpeg", "image/jpg", "image/png"];
    if (!allowedTypes.includes(file.type)) {
      toast({
        variant: "destructive",
        title: "Invalid File",
        description: "Please upload a JPEG or PNG image for the measurement sketch.",
      });
      return;
    }

    try {
      if (currentUrl) {
        try {
          await deleteImage(currentUrl);
        } catch (error) {
          console.warn("[EditProductForm] Failed to delete existing measurement sketch:", error);
        }
      }

      const url = await uploadImage(file, "measurement-sketches");
      form.setValue("measurementSketch", url);
    } catch (error) {
      console.error("[EditProductForm] Measurement sketch upload failed:", error);
      toast({
        variant: "destructive",
        title: "Upload Failed",
        description:
          error instanceof Error
            ? error.message
            : "Failed to upload measurement sketch image.",
      });
    }
  };

  async function onSubmit(values: z.infer<typeof formSchema>) {
    // Determine product-level unit intents from BOM rows
    const MOULDED_PLACEHOLDER = "__MOULDED_UNIT__";
    const MACHINED_PLACEHOLDER = "__MACHINED_UNIT__";
    const ASSEMBLED_PLACEHOLDER = "__ASSEMBLED_UNIT__";

    // keep only valid BOM rows (no stage enforcement) and drop rows
    // whose raw_material_id refers to a deleted/missing raw material
    const existingMaterialIds = new Set(rawMaterials.map((m) => m.id));
    const validBomRows = bomRows.filter((r) => {
      if (!r.raw_material_id || !r.stage || Number(r.qty_per_piece) <= 0) {
        return false;
      }

      if (
        r.raw_material_id === MOULDED_PLACEHOLDER ||
        r.raw_material_id === MACHINED_PLACEHOLDER ||
        r.raw_material_id === ASSEMBLED_PLACEHOLDER
      ) {
        return true;
      }

      if (r.source === "final") {
        return true;
      }

      return existingMaterialIds.has(r.raw_material_id);
    });

    const wantMoulded = validBomRows.some(
      (r) =>
        r.stage === "Machining" &&
        (r.raw_material_id === MOULDED_PLACEHOLDER ||
          mouldedMaterials.some((m) => m.id === r.raw_material_id)),
    );
    const wantMachined = validBomRows.some(
      (r) =>
        r.stage === "Assembling" &&
        (r.raw_material_id === MACHINED_PLACEHOLDER ||
          finishedMaterials.some((m) => m.id === r.raw_material_id)),
    );
    const wantAssembled = validBomRows.some(
      (r) =>
        r.stage === "Testing" &&
        (r.raw_material_id === ASSEMBLED_PLACEHOLDER ||
          assembledMaterials.some((m) => m.id === r.raw_material_id)),
    );

    const originalMouldedId = product.mouldedMaterialId;
    const originalMachinedId = product.machinedMaterialId;
    const originalAssembledId = product.assembledMaterialId;

    const stageUnitsToDelete: string[] = [];

    if (!wantMoulded && originalMouldedId) {
      const mat = rawMaterials.find((m) => m.id === originalMouldedId);
      if (mat && Number(mat.quantity || 0) > 0) {
        toast({
          variant: "destructive",
          title: "Cannot disable stage",
          description:
            "Cannot disable this stage while stock quantity is greater than 0.",
        });
        return;
      }
      stageUnitsToDelete.push(originalMouldedId);
    }

    if (!wantMachined && originalMachinedId) {
      const mat = rawMaterials.find((m) => m.id === originalMachinedId);
      if (mat && Number(mat.quantity || 0) > 0) {
        toast({
          variant: "destructive",
          title: "Cannot disable stage",
          description:
            "Cannot disable this stage while stock quantity is greater than 0.",
        });
        return;
      }
      stageUnitsToDelete.push(originalMachinedId);
    }

    if (!wantAssembled && originalAssembledId) {
      const mat = rawMaterials.find((m) => m.id === originalAssembledId);
      if (mat && Number(mat.quantity || 0) > 0) {
        toast({
          variant: "destructive",
          title: "Cannot disable stage",
          description:
            "Cannot disable this stage while stock quantity is greater than 0.",
        });
        return;
      }
      stageUnitsToDelete.push(originalAssembledId);
    }

    let mouldedId: string | undefined = wantMoulded
      ? originalMouldedId ||
        mouldedMaterials.find((m) => m.name === `Moulded ${values.name}`)?.id
      : undefined;
    let machinedId: string | undefined = wantMachined
      ? originalMachinedId ||
        finishedMaterials.find((m) => m.name === `Machined ${values.name}`)?.id
      : undefined;
    let assembledId: string | undefined = wantAssembled
      ? originalAssembledId ||
        assembledMaterials.find((m) => m.name === `Assembled ${values.name}`)?.id
      : undefined;

    if (wantMoulded && !mouldedId) {
      mouldedId = await createRawMaterial({
        name: `Moulded ${values.name}`,
        sku: `M-${values.name}`,
        quantity: 0,
        unit: "pcs",
        threshold: unitThresholds.moulded ?? 0,
        isMoulded: true,
        isFinished: false,
        createdAt: new Date().toISOString(),
      });
    }

    if (wantMachined && !machinedId) {
      machinedId = await createRawMaterial({
        name: `Machined ${values.name}`,
        sku: `F-${values.name}`,
        quantity: 0,
        unit: "pcs",
        threshold: unitThresholds.machined ?? 0,
        isMoulded: false,
        isFinished: true,
        createdAt: new Date().toISOString(),
      });
    }

    if (wantAssembled && !assembledId) {
      assembledId = await createRawMaterial({
        name: `Assembled ${values.name}`,
        sku: `A-${values.name}`,
        quantity: 0,
        unit: "pcs",
        threshold: unitThresholds.assembled ?? 0,
        isMoulded: false,
        isFinished: false,
        isAssembled: true,
        createdAt: new Date().toISOString(),
      });
    }

    // Replace placeholders in BOM rows with actual created IDs
    const adjustedBomRows = validBomRows.map((r) => {
      if (r.raw_material_id === MOULDED_PLACEHOLDER && mouldedId) return { ...r, raw_material_id: mouldedId };
      if (r.raw_material_id === MACHINED_PLACEHOLDER && machinedId) return { ...r, raw_material_id: machinedId };
      if (r.raw_material_id === ASSEMBLED_PLACEHOLDER && assembledId) return { ...r, raw_material_id: assembledId };
      return r;
    });

    const updatedProduct: FinalStock = {
      // start from existing product so we keep any other fields
      ...product,
      // then override with the form values
      id: values.id,
      productId: values.productId ?? product.productId,
      name: values.name,
      sku: values.sku,
      price: values.price,
      manufacturingStages,
      gstRate: values.gstRate,
      threshold: values.threshold,
      mouldedThreshold: unitThresholds.moulded ?? 0,
      machinedThreshold: unitThresholds.machined ?? 0,
      assembledThreshold: unitThresholds.assembled ?? 0,
      mouldedMaterialId: mouldedId,
      machinedMaterialId: machinedId,
      assembledMaterialId: assembledId,
      imageUrl:
        values.imageUrl && values.imageUrl.length > 0
          ? values.imageUrl
          : product.imageUrl ?? undefined,
      imageHint: values.imageHint ?? product.imageHint,
      measurementSketch: values.measurementSketch ?? product.measurementSketch ?? undefined,
      // attach bom_per_piece only if valid rows exist
      bom_per_piece: adjustedBomRows.length > 0 ? adjustedBomRows : undefined,
    };

    onProductUpdated(updatedProduct);

    if (stageUnitsToDelete.length > 0) {
      try {
        await Promise.all(stageUnitsToDelete.map((id) => deleteRawMaterial(id)));
      } catch (error) {
        console.error("[EditProductForm] Failed to delete stage units:", error);
      }
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <FormField
            control={form.control}
            name="productId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Product ID</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., PROD-1001" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

        <FormField
          control={form.control}
          name="measurementSketch"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Measurement Sketch (Optional)</FormLabel>
              <FormControl>
                <div className="flex items-center gap-4">
                  <Input
                    type="file"
                    accept="image/jpeg,image/jpg,image/png"
                    onChange={(event) =>
                      handleMeasurementSketchUpload(event, field.value || undefined)
                    }
                  />
                  {field.value ? (
                    <img
                      src={field.value}
                      alt="Measurement sketch preview"
                      className="h-12 w-12 rounded border object-contain"
                    />
                  ) : (
                    <span className="text-xs text-muted-foreground">No Image</span>
                  )}
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Product Name</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., Model X Mainframe" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="sku"
            render={({ field }) => (
              <FormItem>
                <FormLabel>SKU</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., MX-MF-001" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <FormField
            control={form.control}
            name="price"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Unit Price (excl. GST)</FormLabel>
                <FormControl>
                  <Input type="number" placeholder="0.00" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="gstRate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>GST Rate (%)</FormLabel>
                <FormControl>
                  <Input type="number" placeholder="0" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="threshold"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Low Stock Threshold</FormLabel>
                <FormControl>
                  <Input type="number" placeholder="0" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="imageUrl"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Product Image (Optional)</FormLabel>
              <FormControl>
                <ImageUpload
                  value={field.value}
                  onChange={field.onChange}
                  folder="products"
                  placeholder="Upload product image"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Product-Level Options (moulded/machined/assembled unit checkboxes) */}
        <div className="border-t pt-6">
          <BOMEditor
            bomRows={bomRows}
            onBOMChange={setBomRows}
            productName={form.watch("name")}
            selectedStages={manufacturingStages}
            unitThresholds={unitThresholds}
            onUnitThresholdsChange={setUnitThresholds}
            showOnlyProductOptions
            hideHeader
          />
        </div>

        {/* Manufacturing Stages Selector with embedded stage-scoped BOM */}
        <div className="border-t pt-6">
          <ManufacturingStagesSelector
            selectedStages={manufacturingStages}
            onStagesChange={setManufacturingStages}
            bomRows={bomRows}
            onBOMChange={setBomRows}
            productName={form.watch("name")}
            unitThresholds={unitThresholds}
            onUnitThresholdsChange={setUnitThresholds}
          />
        </div>

        {/* Form Errors */}
        {form.formState.errors.root && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-800">{form.formState.errors.root.message}</p>
          </div>
        )}

        <div className="flex justify-end">
          <Button type="submit">Save Changes</Button>
        </div>
      </form>
    </Form>
  );
}
