"use client"

import { useState, useEffect } from "react"
import PageHeader from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useLocalStorage } from "@/hooks/use-local-storage"
import { useToast } from "@/hooks/use-toast"
import { usePermissions } from "@/hooks/use-permissions"
import { useEmployees } from "@/hooks/use-employee"
import { ROLE_LABELS } from "@/lib/permissions"
import type { UnitOfMeasure, Employee } from "@/lib/types"
import { getAllBatches, deleteBatch } from "@/lib/firebase"
import { PlusCircle, Trash2, MoreHorizontal } from "lucide-react"
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { EmployeeForm } from "@/components/employee-form"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { getFirebaseAuth } from "@/lib/firebase-client"
import { sendPasswordResetEmail } from "firebase/auth"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { ShieldX } from "lucide-react"

const initialUnits: UnitOfMeasure[] = [
  { id: "uom-1", name: "kg" },
  { id: "uom-2", name: "coils" },
  { id: "uom-3", name: "units" },
  { id: "uom-4", name: "ingots" },
  { id: "uom-5", name: "tons" },
  { id: "uom-6", name: "meters" },
]

export default function SetupPage() {
  const [units, setUnits] = useLocalStorage<UnitOfMeasure[]>("unitsOfMeasure", initialUnits)
  const [newUnit, setNewUnit] = useState("")
  const {
    employees,
    loading: employeesLoading,
    createEmployee,
    updateEmployee,
    deleteEmployee: deleteEmployeeData,
  } = useEmployees()
  const [isEmployeeFormOpen, setIsEmployeeFormOpen] = useState(false)
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null)
  const { toast } = useToast()
  const { canEdit, loading: permissionsLoading } = usePermissions()
  const [isClient, setIsClient] = useState(false)
  
  const canAccessSetup = canEdit("Setup")

  useEffect(() => {
    setIsClient(true)
  }, [])

  const handleAddUnit = () => {
    if (newUnit.trim() === "") {
      toast({ variant: "destructive", title: "Error", description: "Unit name cannot be empty." })
      return
    }
    if (units.some((u) => u.name.toLowerCase() === newUnit.trim().toLowerCase())) {
      toast({ variant: "destructive", title: "Error", description: "Unit already exists." })
      return
    }

    const newUnitOfMeasure: UnitOfMeasure = {
      id: `uom-${Date.now()}`,
      name: newUnit.trim(),
    }

    setUnits([...units, newUnitOfMeasure])
    setNewUnit("")
    toast({ title: "Success", description: "New unit of measure added." })
  }

  const handleDeleteUnit = (id: string) => {
    setUnits(units.filter((u) => u.id !== id))
    toast({ title: "Success", description: "Unit of measure deleted." })
  }

  const handleEmployeeSaved = async (employee: Employee) => {
    const isNew = !employees.some((e) => e.uid === employee.uid) || !employee.uid

    try {
      if (isNew) {
        // Create Firebase Auth user first
        const res = await fetch("/api/auth/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: employee.email, fullName: employee.name }),
        })

        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data?.error || "Failed to create user in auth.")
        }

        const { uid } = await res.json()

        // Add employee to Firestore with the Firebase Auth UID
        await createEmployee({
          ...employee,
          uid,
        })

        // Send the set-password email
        const auth = getFirebaseAuth()
        await sendPasswordResetEmail(auth, employee.email, {
          url: `${window.location.origin}/auth/login`,
        })

        toast({
          title: "Employee created",
          description: `Employee added successfully. A password setup link has been sent to ${employee.email}.`,
        })
      } else {
        // Update existing employee
        await updateEmployee(employee.uid, employee)
        toast({ title: "Success", description: "Employee details updated." })
      }
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: e?.message || "Something went wrong.",
      })
    }

    setIsEmployeeFormOpen(false)
    setSelectedEmployee(null)
  }

  const handleDeleteEmployee = async (uid: string) => {
    try {
      await deleteEmployeeData(uid)
      toast({ title: "Success", description: "Employee deleted." })
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: e?.message || "Failed to delete employee.",
      })
    }
  }

  const handleClearBatchData = async () => {
    try {
      const batches = await getAllBatches()
      await Promise.all(batches.map((batch) => deleteBatch(batch.id)))
      toast({ title: "Success", description: "All batch data has been cleared." })
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: "Failed to clear batch data." })
    }
  }

  const openEmployeeForm = (employee: Employee | null) => {
    setSelectedEmployee(employee)
    setIsEmployeeFormOpen(true)
  }
  
  if (permissionsLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-gray-700" />
      </div>
    )
  }
  
  if (!canAccessSetup) {
    return (
      <>
        <PageHeader title="Setup" description="Manage application-wide settings and lists." />
        <Alert variant="destructive" className="max-w-2xl">
          <ShieldX className="h-4 w-4" />
          <AlertDescription>
            You don&apos;t have permission to access the Setup page. Only administrators can manage system settings and employees.
          </AlertDescription>
        </Alert>
      </>
    )
  }

  return (
    <>
      <PageHeader title="Setup" description="Manage application-wide settings and lists." />
      <Tabs defaultValue="employees">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="units">Units of Measure</TabsTrigger>
          <TabsTrigger value="employees">Employee Management</TabsTrigger>
          <TabsTrigger value="data">Data Management</TabsTrigger>
        </TabsList>
        <TabsContent value="units">
          <Card>
            <CardHeader>
              <CardTitle>Manage Units of Measure</CardTitle>
              <CardDescription>Add or remove units of measure used for raw materials.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2 mb-4">
                <Input
                  placeholder="Enter new unit name..."
                  value={newUnit}
                  onChange={(e) => setNewUnit(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddUnit()}
                />
                <Button onClick={handleAddUnit}>
                  <PlusCircle className="mr-2 h-4 w-4" /> Add Unit
                </Button>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Unit Name</TableHead>
                    <TableHead className="w-[100px] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isClient &&
                    units.map((unit) => (
                      <TableRow key={unit.id}>
                        <TableCell className="font-medium">{unit.name}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" onClick={() => handleDeleteUnit(unit.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  {isClient && units.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={2} className="h-24 text-center">
                        No units of measure defined.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="employees">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Manage Employees</CardTitle>
                <CardDescription>Onboard new employees and manage existing staff.</CardDescription>
              </div>
              <Dialog
                open={isEmployeeFormOpen}
                onOpenChange={(isOpen) => {
                  if (!isOpen) setSelectedEmployee(null)
                  setIsEmployeeFormOpen(isOpen)
                }}
              >
                <DialogTrigger asChild>
                  <Button onClick={() => openEmployeeForm(null)}>
                    <PlusCircle className="mr-2 h-4 w-4" /> Add Employee
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>{selectedEmployee ? "Edit Employee" : "Add New Employee"}</DialogTitle>
                    <DialogDescription>
                      {selectedEmployee
                        ? "Update the details and permissions for this employee."
                        : "Enter the details for the new employee and set their permissions."}
                    </DialogDescription>
                  </DialogHeader>
                  <EmployeeForm employee={selectedEmployee} onEmployeeSaved={handleEmployeeSaved} />
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee Name</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead className="w-[100px] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {employeesLoading ? (
                    <TableRow>
                      <TableCell colSpan={4} className="h-24 text-center">
                        Loading employees...
                      </TableCell>
                    </TableRow>
                  ) : isClient && employees && employees.length > 0 ? (
                    employees.map((employee) => (
                      <TableRow key={employee.uid}>
                        <TableCell className="font-medium">{employee.name}</TableCell>
                        <TableCell>
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            {ROLE_LABELS[employee.role]}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">{employee.email}</div>
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent>
                              <DropdownMenuItem onClick={() => openEmployeeForm(employee)}>Edit</DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleDeleteEmployee(employee.uid)}
                                className="text-destructive"
                              >
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={4} className="h-24 text-center">
                        No employees added yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="data">
          <Card>
            <CardHeader>
              <CardTitle>Data Management</CardTitle>
              <CardDescription>Manage application data. Use these actions with caution.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between p-4 border rounded-md">
                <div>
                  <h4 className="font-medium">Clear Batch Data</h4>
                  <p className="text-sm text-muted-foreground">
                    This will permanently delete all batch records from local storage.
                  </p>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive">Clear Data</Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This action cannot be undone. This will permanently delete all batch data from your local
                        storage.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleClearBatchData}>Confirm</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  )
}
