
'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { type RawMaterial, type ActivityLog, type FinalStock, type Batch } from '@/lib/types';
import { Button } from './ui/button';
import { EditMaterialForm } from './edit-material-form';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from './ui/alert-dialog';
import { ActivityLogList } from './activity-log-list';
import Image from 'next/image';
import { EditProductForm } from './edit-product-form';
import { InventoryTracking } from './inventory-tracking';

type Item = RawMaterial | FinalStock;
type ItemType = 'RawMaterial' | 'FinalStock';

interface ItemDetailsDialogProps<T extends Item> {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  item: T;
  itemType: ItemType;
  activityLog: ActivityLog[];
  onItemUpdate: (item: T) => void;
  onItemDelete?: (id: string) => void;
  // When true, hide the Delete button entirely (e.g., for Store items which must be permanent)
  disableDelete?: boolean;
  batches?: Batch[]; // Optional batches for batch name lookup in inventory tracking
}

export function ItemDetailsDialog<T extends Item>({
  isOpen,
  onOpenChange,
  item,
  itemType,
  activityLog,
  onItemUpdate,
  onItemDelete,
  disableDelete = false,
  batches = [],
}: ItemDetailsDialogProps<T>) {
  const [isEditing, setIsEditing] = useState(false);

  const handleUpdate = (updatedItem: T) => {
    onItemUpdate(updatedItem);
    setIsEditing(false);
  };

  const handleDelete = () => {
    if (!onItemDelete) {
      return;
    }
    onItemDelete(item.id);
    onOpenChange(false);
  };

  const renderItemDetails = () => {
    if (itemType === 'RawMaterial') {
      const material = item as RawMaterial;
      return (
        <div className="space-y-2">
          <p><strong>System ID:</strong> <span className="font-mono text-sm">{material.id}</span></p>
          <p><strong>SKU:</strong> <span className="font-mono text-sm">{material.sku}</span></p>
          <p><strong>Quantity:</strong> {material.quantity.toLocaleString()} {material.unit}</p>
          <p><strong>Low Stock Threshold:</strong> {material.threshold.toLocaleString()} {material.unit}</p>
        </div>
      );
    }
     if (itemType === 'FinalStock') {
      const product = item as FinalStock;
      return (
        <div className="space-y-4">
            <div className="relative aspect-video w-full rounded-lg overflow-hidden">
                <Image 
                    src={product.imageUrl} 
                    alt={product.name} 
                    data-ai-hint={product.imageHint}
                    fill
                    className="object-cover"
                />
            </div>
            <div className="space-y-2">
                <p><strong>System ID:</strong> <span className="font-mono text-sm">{product.id}</span></p>
                <p><strong>SKU:</strong> <span className="font-mono text-sm">{product.sku}</span></p>
                <p><strong>Unit Price:</strong> ₹{product.price.toLocaleString()}</p>
                <p><strong>GST Rate:</strong> {product.gstRate}%</p>
            </div>
        </div>
      );
    }
    return null;
  };

  const renderEditForm = () => {
    if (itemType === 'RawMaterial') {
      return <EditMaterialForm material={item as RawMaterial} onMaterialUpdated={handleUpdate as (item: RawMaterial) => void} />;
    }
     if (itemType === 'FinalStock') {
      return <EditProductForm product={item as FinalStock} onProductUpdated={handleUpdate as (item: FinalStock) => void} />;
    }
    return null;
  };

  // Reset edit state when dialog closes
  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setIsEditing(false);
    }
    onOpenChange(open);
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? `Edit ${item.name}` : item.name}</DialogTitle>
          <DialogDescription>
            {isEditing ? `Update the details for this item.` : `Viewing details and activity for ${item.name}.`}
          </DialogDescription>
        </DialogHeader>

        {isEditing ? (
            <div className="py-4">{renderEditForm()}</div>
        ) : (
            <Tabs defaultValue="details" className="pt-4">
                <TabsList>
                    <TabsTrigger value="details">Details</TabsTrigger>
                    <TabsTrigger value="inventory">Inventory</TabsTrigger>
                    <TabsTrigger value="log">Activity Log</TabsTrigger>
                </TabsList>
                <TabsContent value="details" className="mt-4">
                    {renderItemDetails()}
                    <DialogFooter className="pt-6">
                        {!disableDelete && onItemDelete && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button variant="destructive">Delete</Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    This action cannot be undone. This will permanently delete the item
                                    and all its associated activity logs.
                                </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                        <Button onClick={() => setIsEditing(true)}>Edit</Button>
                    </DialogFooter>
                </TabsContent>
                <TabsContent value="inventory" className="mt-4">
                    <InventoryTracking
                        item={item}
                        itemType={itemType}
                        activityLog={activityLog}
                        batches={batches}
                    />
                </TabsContent>
                <TabsContent value="log">
                    <ActivityLogList log={activityLog} />
                </TabsContent>
            </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
