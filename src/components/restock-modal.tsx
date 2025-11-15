"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Package } from "lucide-react";

const restockSchema = z.object({
  quantity: z.coerce.number().min(1, "Quantity must be at least 1"),
  batchId: z.string().min(1, "Batch ID is required"),
  sku: z.string().min(1, "SKU is required"),
});

interface RestockModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  productName: string;
  onRestock: (data: { quantity: number; batchId: string; sku: string }) => void;
}

export function RestockModal({
  isOpen,
  onOpenChange,
  productName,
  onRestock,
}: RestockModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<z.infer<typeof restockSchema>>({
    resolver: zodResolver(restockSchema),
    defaultValues: {
      quantity: 1,
      batchId: `BATCH-${Date.now()}`,
      sku: `SKU-${Date.now()}`,
    },
  });

  const onSubmit = async (values: z.infer<typeof restockSchema>) => {
    setIsSubmitting(true);
    try {
      await onRestock(values);
      form.reset();
      onOpenChange(false);
    } catch (error) {
      console.error("Restock failed:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Restock {productName}
          </DialogTitle>
          <DialogDescription>
            Add new stock quantity for this product. This will create a new batch entry.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="quantity"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Quantity</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      placeholder="Enter quantity to add"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="batchId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Batch ID</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter batch ID" {...field} />
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
                    <Input placeholder="Enter SKU for this batch" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Adding..." : "Add Stock"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
