"use client";

import { useFirestoreCollection } from "./use-firestore-collection";
import {
  addOrderType,
  updateOrderType,
  deleteOrderType,
  COLLECTIONS,
} from "@/lib/firebase/firestore-operations";
import type { OrderType } from "@/lib/types";

export function useOrderTypes() {
  const { data: orderTypes, loading, error } =
    useFirestoreCollection<OrderType>(COLLECTIONS.ORDER_TYPES);

  const createOrderType = async (type: Omit<OrderType, "id">) => {
    return await addOrderType(type);
  };

  const updateOrderTypeData = async (
    id: string,
    updates: Partial<OrderType>,
  ) => {
    await updateOrderType(id, updates);
  };

  const deleteOrderTypeData = async (id: string) => {
    await deleteOrderType(id);
  };

  return {
    orderTypes,
    loading,
    error,
    createOrderType,
    updateOrderType: updateOrderTypeData,
    deleteOrderType: deleteOrderTypeData,
  };
}
