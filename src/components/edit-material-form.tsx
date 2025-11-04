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

interface EditMaterialFormProps {
  material: RawMaterial;
  onMaterialUpdated: (material: RawMaterial) => void;
}

export function EditMaterialForm({ material, onMaterialUpdated }: EditMaterialFormProps) {
  const [unitsOfMeasure] = useLocalStorage<UnitOfMeasure[]>('unitsOfMeasure', []);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: material,
  });

  function onSubmit(values: z.infer<typeof formSchema>) {
    onMaterialUpdated(values);
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
                    <FormLabel>Material Name</FormLabel>
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
                    <FormLabel>Quantity</FormLabel>
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
                      {unitsOfMeasure.map((unit) => (
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
          <Button type="submit">Save Changes</Button>
        </div>
      </form>
    </Form>
  );
}
