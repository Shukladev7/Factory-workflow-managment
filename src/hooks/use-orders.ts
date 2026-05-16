"use client"

import { useMemo } from "react"
import { where } from "firebase/firestore"
import { useFirestoreCollection } from "./use-firestore-collection"
import {
  addOrder,
  updateOrder,
  updateOrderStatus,
  deleteOrder,
  reserveNextOrderId,
  COLLECTIONS,
} from "@/lib/firebase/firestore-operations"
import type { Order } from "@/lib/types"

export function useOrders(status?: Order["status"]) {
  const constraints = useMemo(
    () => (status ? [where("status", "==", status)] : []),
    [status],
  )
  const { data: orders, loading, error } = useFirestoreCollection<Order>(
    COLLECTIONS.ORDERS,
    ...constraints,
  )

  const createOrder = async (order: Omit<Order, "id">) => {
    return await addOrder(order)
  }

  const getNextOrderId = async () => {
    return await reserveNextOrderId()
  }

  const updateOrderData = async (id: string, updates: Partial<Order>) => {
    await updateOrder(id, updates)
  }

  const updateOrderStatusData = async (id: string, status: Order["status"]) => {
    return await updateOrderStatus(id, status)
  }

  const deleteOrderData = async (id: string) => {
    await deleteOrder(id)
  }

  return {
    orders,
    loading,
    error,
    createOrder,
    getNextOrderId,
    updateOrder: updateOrderData,
    updateOrderStatus: updateOrderStatusData,
    deleteOrder: deleteOrderData,
  }
}
