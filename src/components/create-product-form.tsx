"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
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
import { Input } from "@/components/ui/input";
import type { FinalStock, BOMRow, ProcessingStageName } from "@/lib/types";
import { useEffect, useState } from "react";
import { PlaceHolderImages } from "@/lib/placeholder-images";
import { ImageUpload } from "@/components/image-upload";
import { BOMEditor } from "@/components/bom-editor";
import { ManufacturingStagesSelector } from "@/components/manufacturing-stages-selector";
import { Checkbox } from "@/components/ui/checkbox";
import { uploadImage, deleteImage } from "@/lib/firebase/storage";
import { useToast } from "@/hooks/use-toast";
import { useRawMaterials } from "@/hooks/use-raw-materials";

const formSchema = z.object({
  productId: z.string().min(1, "Please enter a Product ID."),
  name: z.string().min(1, "Please enter a name."),
  sku: z.string().min(1, "Please enter a SKU."),
  price: z.coerce.number().min(0, "Price must be 0 or greater."),
  gstRate: z.coerce.number().min(0, "GST Rate must be 0 or greater."),
  threshold: z.coerce.number().min(0, "Threshold must be 0 or greater.").default(0),
  imageUrl: z.string().optional(),
  imageHint: z.string().optional(),
  measurementSketch: z.string().optional(),
  hasManufacturingDetails: z.boolean().default(true),
});

interface CreateProductFormProps {
  onProductCreated: (product: FinalStock) => void;
}

export function CreateProductForm({
  onProductCreated,
}: CreateProductFormProps) {
  const [isClient, setIsClient] = useState(false);
  const [bomRows, setBomRows] = useState<BOMRow[]>([]);
  const [manufacturingStages, setManufacturingStages] = useState<ProcessingStageName[]>([]);
  const [unitThresholds, setUnitThresholds] = useState<{ moulded?: number; machined?: number; assembled?: number }>({});
  const { toast } = useToast();
  const { createRawMaterial, rawMaterials, mouldedMaterials, finishedMaterials, assembledMaterials } = useRawMaterials();
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      productId: "",
      name: "",
      sku: "",
      price: 0,
      gstRate: 0,
      threshold: 0,
      imageUrl: "",
      imageHint: "",
      measurementSketch: "",
      hasManufacturingDetails: true,
    },
  });

  useEffect(() => {
    setIsClient(true);

    const randomPlaceholder =
      PlaceHolderImages[Math.floor(Math.random() * PlaceHolderImages.length)];
    if (randomPlaceholder) {
      form.setValue("imageHint", randomPlaceholder.imageHint);
    }
  }, [form]);

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
          console.warn("[CreateProductForm] Failed to delete existing measurement sketch:", error);
        }
      }

      const url = await uploadImage(file, "measurement-sketches");
      form.setValue("measurementSketch", url);
    } catch (error) {
      console.error("[CreateProductForm] Measurement sketch upload failed:", error);
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
    const { hasManufacturingDetails } = values;

    const MOULDED_PLACEHOLDER = "__MOULDED_UNIT__";
    const MACHINED_PLACEHOLDER = "__MACHINED_UNIT__";
    const ASSEMBLED_PLACEHOLDER = "__ASSEMBLED_UNIT__";

    let validBomRows: BOMRow[] = [];

    if (hasManufacturingDetails) {
      const existingMaterialIds = new Set(rawMaterials.map((m) => m.id));
      validBomRows = bomRows.filter((row) => {
        if (!row.raw_material_id || !row.stage || row.qty_per_piece <= 0) {
          return false;
        }

        if (
          row.raw_material_id === MOULDED_PLACEHOLDER ||
          row.raw_material_id === MACHINED_PLACEHOLDER ||
          row.raw_material_id === ASSEMBLED_PLACEHOLDER
        ) {
          return true;
        }

        if (row.source === "final") {
          return true;
        }

        return existingMaterialIds.has(row.raw_material_id);
      });
    }

    const measurementSketch = form.getValues("measurementSketch") as
      | string
      | undefined;

    // Determine product-level unit intents from BOM rows

    const wantMoulded = validBomRows.some(
      (r) => r.stage === "Machining" && (r.raw_material_id === MOULDED_PLACEHOLDER || mouldedMaterials.some((m) => m.id === r.raw_material_id))
    );
    const wantMachined = validBomRows.some(
      (r) => r.stage === "Assembling" && (r.raw_material_id === MACHINED_PLACEHOLDER || finishedMaterials.some((m) => m.id === r.raw_material_id))
    );
    const wantAssembled = validBomRows.some(
      (r) => r.stage === "Testing" && (r.raw_material_id === ASSEMBLED_PLACEHOLDER || assembledMaterials.some((m) => m.id === r.raw_material_id))
    );

    // Create missing materials based on intent
    let mouldedId: string | undefined = mouldedMaterials.find((m) => m.name === `Moulded ${values.name}`)?.id;
    let machinedId: string | undefined = finishedMaterials.find((m) => m.name === `Machined ${values.name}`)?.id;
    let assembledId: string | undefined = assembledMaterials.find((m) => m.name === `Assembled ${values.name}`)?.id;

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
    // Ensure no undefined fields exist in BOM rows for Firestore
    const sanitizedBomRows = adjustedBomRows.map(({ raw_material_id, stage, qty_per_piece, unit, notes, source }) => {
      const row: any = { raw_material_id, stage, qty_per_piece, unit };
      if (typeof notes === "string" && notes.length > 0) row.notes = notes;
      if (source) row.source = source;
      return row;
    });

    // Note: id will be generated by Firestore when document is created
    const newProduct: FinalStock = {
      id: "",
      ...values,
      manufacturingStages: hasManufacturingDetails ? manufacturingStages : [],
      imageUrl: values.imageUrl || undefined,
      measurementSketch: measurementSketch || undefined,
      ...(hasManufacturingDetails && sanitizedBomRows.length > 0 ? { bom_per_piece: sanitizedBomRows } : {}),
      mouldedThreshold: unitThresholds.moulded ?? 0,
      machinedThreshold: unitThresholds.machined ?? 0,
      assembledThreshold: unitThresholds.assembled ?? 0,
      ...(mouldedId ? { mouldedMaterialId: mouldedId } : {}),
      ...(machinedId ? { machinedMaterialId: machinedId } : {}),
      ...(assembledId ? { assembledMaterialId: assembledId } : {}),
      batches: [],
      createdAt: new Date().toISOString(),
    };
    onProductCreated(newProduct);
  }

  if (!isClient) {
    return null;
  }

  const hasManufacturingDetails = form.watch("hasManufacturingDetails");

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 pt-4">
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
            name="hasManufacturingDetails"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center space-x-2 space-y-0 border-t pt-4">
                <FormControl>
                  <Checkbox
                    checked={field.value}
                    onCheckedChange={(checked) => field.onChange(checked === true)}
                  />
                </FormControl>
                <FormLabel className="font-medium">
                  To be Manufactured
                </FormLabel>
              </FormItem>
            )}
          />

          {hasManufacturingDetails && (
            <>
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

              {/* Manufacturing Stages Selector */}
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
            </>
          )}

          {/* Form Errors */}
          {form.formState.errors.root && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-800">{form.formState.errors.root.message}</p>
            </div>
          )}

          <div className="flex justify-end">
            <Button type="submit">Add Product</Button>
          </div>
      </form>
    </Form>
  );
}
