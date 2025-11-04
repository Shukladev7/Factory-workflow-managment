"use client"

import { useEffect, useState } from "react"
import { onAuthStateChanged } from "firebase/auth"
import { getFirebaseAuth } from "@/lib/firebase-client"
import { getEmployeeByUid } from "@/lib/firebase/firestore-operations"
import { canViewModule, canEditModule } from "@/lib/permissions"
import type { Employee, Role, AppModule } from "@/lib/types"

export function usePermissions() {
  const [employee, setEmployee] = useState<Employee | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    const auth = getFirebaseAuth()
    
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setEmployee(null)
        setLoading(false)
        return
      }

      try {
        const employeeData = await getEmployeeByUid(user.uid)
        setEmployee(employeeData)
        setError(null)
      } catch (err) {
        console.error("Error fetching employee data:", err)
        setError(err as Error)
      } finally {
        setLoading(false)
      }
    })

    return () => unsubscribe()
  }, [])

  const canView = (module: AppModule): boolean => {
    if (!employee) return false
    return canViewModule(employee.role, module)
  }

  const canEdit = (module: AppModule): boolean => {
    if (!employee) return false
    return canEditModule(employee.role, module)
  }

  const hasRole = (role: Role): boolean => {
    if (!employee) return false
    return employee.role === role
  }

  const isAdmin = (): boolean => {
    return hasRole("admin")
  }

  return {
    employee,
    loading,
    error,
    canView,
    canEdit,
    hasRole,
    isAdmin,
  }
}
