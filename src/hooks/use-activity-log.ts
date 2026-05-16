"use client"

import { useFirestoreCollection } from "./use-firestore-collection"
import { addActivityLog, COLLECTIONS } from "@/lib/firebase/firestore-operations"
import type { ActivityLog } from "@/lib/types"
import { orderBy } from "firebase/firestore"

export function useActivityLog() {
  const {
    data: activityLog,
    loading,
    error,
  } = useFirestoreCollection<ActivityLog>(COLLECTIONS.ACTIVITY_LOG, orderBy("timestamp", "desc"))

  const createActivityLog = async (log: Omit<ActivityLog, "id">) => {
    return await addActivityLog(log)
  }

  return {
    activityLog,
    loading,
    error,
    createActivityLog,
  }
}
