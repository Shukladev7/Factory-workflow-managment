"use client"

import { useFirestoreCollection } from "./use-firestore-collection"
import { addFinalStock, updateFinalStock, deleteFinalStock, COLLECTIONS } from "@/lib/firebase/firestore-operations"
import type { FinalStock } from "@/lib/types"

export function useFinalStock() {
  const { data: finalStock, loading, error } = useFirestoreCollection<FinalStock>(COLLECTIONS.FINAL_STOCK)

  const createFinalStock = async (product: Omit<FinalStock, "id">) => {
    return await addFinalStock(product)
  }

  const updateFinalStockData = async (id: string, updates: Partial<FinalStock>) => {
    await updateFinalStock(id, updates)
  }

  const deleteFinalStockData = async (id: string) => {
    await deleteFinalStock(id)
  }

  return {
    finalStock,
    loading,
    error,
    createFinalStock,
    updateFinalStock: updateFinalStockData,
    deleteFinalStock: deleteFinalStockData,
  }
}
