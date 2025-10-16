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
import { BOMEditor } from "@/components/bom-editor";

import type { FinalStock, BOMRow } from "@/lib/types";

interface EditProductFormProps {
  product: FinalStock;
  onProductUpdated: (product: FinalStock) => void;
}

const formSchema = z.object({
  id: z.string(),
  name: z.string().min(1, "Please enter a name."),
  sku: z.string().min(1, "Please enter a SKU."),
  price: z.coerce.number().min(0, "Price must be 0 or greater."),
  gstRate: z.coerce.number().min(0, "GST Rate must be 0 or greater."),
  imageUrl: z
    .string()
    .url("Please enter a valid URL.")
    .or(z.literal(""))
    .optional(),
  imageHint: z.string().optional(),
});

export function EditProductForm({ product, onProductUpdated }: EditProductFormProps) {
  const [bomRows, setBomRows] = useState<BOMRow[]>([]);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      id: product.id ?? "",
      name: product.name ?? "",
      sku: product.sku ?? "",
      price: typeof product.price !== "undefined" ? product.price : 0,
      gstRate: typeof product.gstRate !== "undefined" ? product.gstRate : 0,
      imageUrl: product.imageUrl ?? "",
      imageHint: product.imageHint ?? "",
    },
  });

  // keep react-hook-form in sync when product changes
  useEffect(() => {
    form.reset({
      id: product.id ?? "",
      name: product.name ?? "",
      sku: product.sku ?? "",
      price: typeof product.price !== "undefined" ? product.price : 0,
      gstRate: typeof product.gstRate !== "undefined" ? product.gstRate : 0,
      imageUrl: product.imageUrl ?? "",
      imageHint: product.imageHint ?? "",
    });

    // initialize BOM rows if present
    if (Array.isArray(product.bom_per_piece) && product.bom_per_piece.length > 0) {
      setBomRows(product.bom_per_piece);
    } else {
      setBomRows([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product]);

  function onSubmit(values: z.infer<typeof formSchema>) {
    // keep only valid BOM rows
    const validBomRows = bomRows.filter(
      (r) => r.raw_material_id && r.stage && Number(r.qty_per_piece) > 0,
    );

    const updatedProduct: FinalStock = {
      // start from existing product so we keep any other fields
      ...product,
      // then override with the form values
      id: values.id,
      name: values.name,
      sku: values.sku,
      price: values.price,
      gstRate: values.gstRate,
      imageUrl:
        values.imageUrl && values.imageUrl.length > 0
          ? values.imageUrl
          : product.imageUrl ??
            `https://picsum.photos/seed/${values.id ?? "product"}/400/300`,
      imageHint: values.imageHint ?? product.imageHint,
      // attach bom_per_piece only if valid rows exist
      bom_per_piece: validBomRows.length > 0 ? validBomRows : undefined,
    };

    onProductUpdated(updatedProduct);
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
        </div>

        <FormField
          control={form.control}
          name="imageUrl"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Image URL (Optional)</FormLabel>
              <FormControl>
                <Input placeholder="https://..." {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* BOM Editor */}
        <div className="border-t pt-6">
          <BOMEditor bomRows={bomRows} onBOMChange={setBomRows} />
        </div>

        <div className="flex justify-end">
          <Button type="submit">Save Changes</Button>
        </div>
      </form>
    </Form>
  );
}
