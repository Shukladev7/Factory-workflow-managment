
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Batch, BatchStatus } from '@/lib/types';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { format } from 'date-fns';

const formSchema = z.object({
  id: z.string(),
  status: z.enum(['Planned', 'In Progress', 'On Hold', 'Completed']),
});

interface EditBatchFormProps {
  batch: Batch;
  onBatchUpdated: (batch: Batch) => void;
}

export function EditBatchForm({ batch, onBatchUpdated }: EditBatchFormProps) {
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
        id: batch.id,
        status: batch.status,
    },
  });

  function onSubmit(values: z.infer<typeof formSchema>) {
    onBatchUpdated({ ...batch, status: values.status });
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="space-y-4 p-4 border rounded-md">
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <FormLabel>Batch ID</FormLabel>
                    <Input value={batch.batchId || batch.batchCode || batch.id} readOnly className="bg-muted font-mono text-xs mt-2" />
                </div>
                 <div>
                    <FormLabel>Product</FormLabel>
                    <Input value={batch.productName} readOnly className="bg-muted mt-2" />
                </div>
            </div>
             <div className="grid grid-cols-2 gap-4">
                 <div>
                    <FormLabel>Date Created</FormLabel>
                    <Input value={format(new Date(batch.createdAt), "MM/dd/yyyy")} readOnly className="bg-muted mt-2" />
                </div>
                <FormField
                    control={form.control}
                    name="status"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Status</FormLabel>
                             <Select onValueChange={field.onChange} defaultValue={field.value} disabled={batch.processingStages.Assembling.completed}>
                                <FormControl>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select a status" />
                                </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                    {(['Planned', 'In Progress', 'On Hold'] as BatchStatus[]).map((status) => (
                                        <SelectItem key={status} value={status}>
                                            {status}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                             {batch.processingStages.Assembling.completed && (
                                <p className="text-sm text-muted-foreground">Status cannot be changed for completed batches.</p>
                            )}
                            <FormMessage />
                        </FormItem>
                    )}
                />
            </div>
        </div>
        <div className="flex justify-end">
          <Button type="submit">Save Changes</Button>
        </div>
      </form>
    </Form>
  );
}
