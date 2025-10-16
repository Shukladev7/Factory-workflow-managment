"use client"

import { useFirestoreCollection } from "./use-firestore-collection"
import { addUnit, updateUnit, deleteUnit, COLLECTIONS } from "@/lib/firebase/firestore-operations"
import type { UnitOfMeasure } from "@/lib/types"

export function useUnits() {
  const { data: units, loading, error } = useFirestoreCollection<UnitOfMeasure>(COLLECTIONS.UNITS)

  const createUnit = async (unit: Omit<UnitOfMeasure, "id">) => {
    return await addUnit(unit)
  }

  const updateUnitData = async (id: string, updates: Partial<UnitOfMeasure>) => {
    await updateUnit(id, updates)
  }

  const deleteUnitData = async (id: string) => {
    await deleteUnit(id)
  }

  return {
    units,
    loading,
    error,
    createUnit,
    updateUnit: updateUnitData,
    deleteUnit: deleteUnitData,
  }
}
