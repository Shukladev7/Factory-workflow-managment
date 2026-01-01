'use client';

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
import { Input } from '@/components/ui/input';
import type { RawMaterial, UnitOfMeasure } from '@/lib/types';
import { useEffect } from 'react';
import { useLocalStorage } from '@/hooks/use-local-storage';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const formSchema = z.object({
  id: z.string(),
  name: z.string().min(1, 'Please enter a name.'),
  sku: z.string().min(1, 'Please enter a SKU.'),
  quantity: z.coerce.number().min(0, 'Quantity must be 0 or greater.'),
  unit: z.string().min(1, 'Please enter a unit (e.g., kg, coils, units).'),
  threshold: z.coerce.number().min(0, 'Threshold must be 0 or greater.'),
});

interface CreateMaterialFormProps {
  onMaterialCreated: (material: RawMaterial) => void;
}

export function CreateMaterialForm({ onMaterialCreated }: CreateMaterialFormProps) {
  const [unitsOfMeasure] = useLocalStorage<UnitOfMeasure[]>('unitsOfMeasure', [
    { id: 'unit_001', name: 'kg' },
    { id: 'unit_002', name: 'coils' },
    { id: 'unit_003', name: 'units' },
    { id: 'unit_004', name: 'ingots' },
    { id: 'unit_005', name: 'tons' },
    { id: 'unit_006', name: 'meters' },
  ]);
  const unitOptions: UnitOfMeasure[] = (Array.isArray(unitsOfMeasure) && unitsOfMeasure.length > 0)
    ? unitsOfMeasure
    : [
        { id: 'unit_001', name: 'kg' },
        { id: 'unit_002', name: 'coils' },
        { id: 'unit_003', name: 'units' },
        { id: 'unit_004', name: 'ingots' },
        { id: 'unit_005', name: 'tons' },
        { id: 'unit_006', name: 'meters' },
      ];

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      id: '',
      name: '',
      sku: '',
      quantity: 0,
      unit: '',
      threshold: 0,
    },
  });

  useEffect(() => {
    // Display placeholder; Firestore document ID will be generated on save
    form.setValue('id', 'material_000');
  }, [form]);

  function onSubmit(values: z.infer<typeof formSchema>) {
    onMaterialCreated(values);
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 pt-4">
        <FormField
          control={form.control}
          name="id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>System ID</FormLabel>
              <FormControl>
                <Input {...field} readOnly className="bg-muted font-mono text-xs" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel>Materials Name</FormLabel>
                    <FormControl>
                        <Input placeholder="e.g., Steel Coil" {...field} />
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
                    <FormLabel>Supplier SKU</FormLabel>
                    <FormControl>
                        <Input placeholder="e.g., SC-001" {...field} />
                    </FormControl>
                    <FormMessage />
                    </FormItem>
                )}
            />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FormField
                control={form.control}
                name="quantity"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel>Initial Quantity</FormLabel>
                    <FormControl>
                        <Input type="number" placeholder="0" {...field} />
                    </FormControl>
                    <FormMessage />
                    </FormItem>
                )}
            />
            <FormField
              control={form.control}
              name="unit"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Unit</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a unit" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {unitOptions.map((unit) => (
                        <SelectItem key={unit.id} value={unit.name}>
                          {unit.name}
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
        <div className="flex justify-end">
          <Button type="submit">Add Material</Button>
        </div>
      </form>
    </Form>
  );
}
