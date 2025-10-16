"use client"

import { useFirestoreCollection } from "./use-firestore-collection"
import { addRawMaterial, updateRawMaterial, deleteRawMaterial, COLLECTIONS } from "@/lib/firebase/firestore-operations"
import type { RawMaterial } from "@/lib/types"
import { useMemo } from "react"

export function useRawMaterials() {
  const { data: rawMaterials, loading, error } = useFirestoreCollection<RawMaterial>(COLLECTIONS.RAW_MATERIALS)

  // Separate regular, moulded, and finished materials
  const regularMaterials = useMemo(() => 
    rawMaterials.filter(m => m.isMoulded !== true && m.isFinished !== true),
    [rawMaterials]
  )

  const mouldedMaterials = useMemo(() => 
    rawMaterials.filter(m => m.isMoulded === true),
    [rawMaterials]
  )

  const finishedMaterials = useMemo(() => 
    rawMaterials.filter(m => m.isFinished === true),
    [rawMaterials]
  )

  const createRawMaterial = async (material: Omit<RawMaterial, "id">) => {
    return await addRawMaterial(material)
  }

  const updateRawMaterialData = async (id: string, updates: Partial<RawMaterial>) => {
    await updateRawMaterial(id, updates)
  }

  const deleteRawMaterialData = async (id: string) => {
    await deleteRawMaterial(id)
  }

  return {
    rawMaterials,
    regularMaterials,
    mouldedMaterials,
    finishedMaterials,
    loading,
    error,
    createRawMaterial,
    updateRawMaterial: updateRawMaterialData,
    deleteRawMaterial: deleteRawMaterialData,
  }
}
