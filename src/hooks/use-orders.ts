"use client"

import { useFirestoreCollection } from "./use-firestore-collection"
import { addOrder, updateOrder, deleteOrder, COLLECTIONS } from "@/lib/firebase/firestore-operations"
import type { Order } from "@/lib/types"

export function useOrders() {
  const { data: orders, loading, error } = useFirestoreCollection<Order>(COLLECTIONS.ORDERS)

  const createOrder = async (order: Omit<Order, "id">) => {
    return await addOrder(order)
  }

  const updateOrderData = async (id: string, updates: Partial<Order>) => {
    await updateOrder(id, updates)
  }

  const deleteOrderData = async (id: string) => {
    await deleteOrder(id)
  }

  return {
    orders,
    loading,
    error,
    createOrder,
    updateOrder: updateOrderData,
    deleteOrder: deleteOrderData,
  }
}
