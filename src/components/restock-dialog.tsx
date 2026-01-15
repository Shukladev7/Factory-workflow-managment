
'use client';

import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { type RawMaterial } from '@/lib/types';

const formSchema = z.object({
  quantity: z.coerce.number().min(1, 'Restock quantity must be greater than 0.'),
  companyName: z.string().min(1, 'Company name is required.'),
  restockDate: z.string().min(1, 'Restock date is required.'),
});

interface RestockDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  material: RawMaterial;
  onRestock: (
    material: RawMaterial,
    data: { quantity: number; companyName: string; restockDate: string },
  ) => void;
}

export function RestockDialog({
  isOpen,
  onOpenChange,
  material,
  onRestock,
}: RestockDialogProps) {
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      quantity: 1,
      companyName: '',
      restockDate: new Date().toISOString().slice(0, 10),
    },
  });

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      form.reset();
    }
    onOpenChange(open);
  };

  function onSubmit(values: z.infer<typeof formSchema>) {
    onRestock(material, {
      quantity: values.quantity,
      companyName: values.companyName,
      restockDate: values.restockDate,
    });
    handleOpenChange(false);
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Restock {material.name}</DialogTitle>
          <DialogDescription>
            Add new inventory for this material. Current quantity: {material.quantity.toLocaleString()} {material.unit}.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8 pt-4">
            <FormField
              control={form.control}
              name="quantity"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Quantity to Add</FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="0" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="companyName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Company Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter company name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="restockDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Restock Date</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="submit">Add Stock</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
