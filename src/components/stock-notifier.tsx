'use client';

import { useEffect, useRef } from 'react';
import { useLocalStorage } from '@/hooks/use-local-storage';
import { useToast } from '@/hooks/use-toast';
import { type RawMaterial } from '@/lib/types';

export function StockNotifier() {
  const [rawMaterials] = useLocalStorage<RawMaterial[]>('rawMaterials', []);
  const { toast } = useToast();
  const previousMaterials = useRef<RawMaterial[]>(rawMaterials);

  useEffect(() => {
    const checkStockLevels = () => {
      rawMaterials.forEach(current => {
        const previous = previousMaterials.current.find(p => p.id === current.id);
        const wasPreviouslyOk = previous ? previous.quantity >= previous.threshold : true;
        const isNowLow = current.quantity < current.threshold;

        if (isNowLow && wasPreviouslyOk) {
          toast({
            variant: 'destructive',
            title: 'Low Stock Alert',
            description: `${current.name} is low in stock. Current quantity: ${current.quantity} ${current.unit}.`,
          });
        }
      });
      previousMaterials.current = rawMaterials;
    };

    checkStockLevels();
  }, [rawMaterials, toast]);

  return null;
}
