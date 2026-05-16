"use client"

import { useFirestoreCollection } from "./use-firestore-collection"
import { addBatch, updateBatch, deleteBatch, COLLECTIONS } from "@/lib/firebase/firestore-operations"
import type { Batch } from "@/lib/types"

export function useBatches() {
  const { data: batches, loading, error } = useFirestoreCollection<Batch>(COLLECTIONS.BATCHES)

  const createBatch = async (batch: Omit<Batch, "id">) => {
    return await addBatch(batch)
  }

  const updateBatchData = async (id: string, updates: Partial<Batch>) => {
    await updateBatch(id, updates)
  }

  const deleteBatchData = async (id: string) => {
    await deleteBatch(id)
  }

  return {
    batches,
    loading,
    error,
    createBatch,
    updateBatch: updateBatchData,
    deleteBatch: deleteBatchData,
  }
}
