"use client"

import { useFirestoreCollection } from "./use-firestore-collection"
import { addEmployee, updateEmployee, deleteEmployee, COLLECTIONS } from "@/lib/firebase/firestore-operations"
import type { Employee } from "@/lib/types"

export function useEmployees() {
  const { data: employees, loading, error } = useFirestoreCollection<Employee>(COLLECTIONS.EMPLOYEES)

  const createEmployee = async (employee: Employee) => {
    return await addEmployee(employee)
  }

  const updateEmployeeData = async (uid: string, updates: Partial<Employee>) => {
    await updateEmployee(uid, updates)
  }

  const deleteEmployeeData = async (uid: string) => {
    await deleteEmployee(uid)
  }

  return {
    employees,
    loading,
    error,
    createEmployee,
    updateEmployee: updateEmployeeData,
    deleteEmployee: deleteEmployeeData,
  }
}
