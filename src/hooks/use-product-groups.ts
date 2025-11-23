"use client"

import { useFirestoreCollection } from "./use-firestore-collection"
import { addProductGroup, updateProductGroup, deleteProductGroup, COLLECTIONS } from "@/lib/firebase/firestore-operations"
import type { ProductGroup } from "@/lib/types"

export function useProductGroups() {
  const { data: productGroups, loading, error } = useFirestoreCollection<ProductGroup>(COLLECTIONS.PRODUCT_GROUPS)

  const createProductGroup = async (group: Omit<ProductGroup, "id">) => {
    return await addProductGroup(group)
  }

  const updateProductGroupData = async (id: string, updates: Partial<ProductGroup>) => {
    await updateProductGroup(id, updates)
  }

  const deleteProductGroupData = async (id: string) => {
    await deleteProductGroup(id)
  }

  return {
    productGroups,
    loading,
    error,
    createProductGroup,
    updateProductGroup: updateProductGroupData,
    deleteProductGroup: deleteProductGroupData,
  }
}
