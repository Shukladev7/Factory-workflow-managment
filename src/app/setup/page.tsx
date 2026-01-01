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
import { useFinalStock } from "@/hooks/use-final-stock"
import { useProductGroups } from "@/hooks/use-product-groups"
import { ROLE_LABELS } from "@/lib/permissions"
import type { UnitOfMeasure, Employee, ProductGroup } from "@/lib/types"
import { getAllBatches, deleteBatch } from "@/lib/firebase"
import { PlusCircle, Trash2, MoreHorizontal } from "lucide-react"
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
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
  { id: "unit_001", name: "kg" },
  { id: "unit_002", name: "coils" },
  { id: "unit_003", name: "units" },
  { id: "unit_004", name: "ingots" },
  { id: "unit_005", name: "tons" },
  { id: "unit_006", name: "meters" },
]

export default function SetupPage() {
  const [units, setUnits] = useLocalStorage<UnitOfMeasure[]>("unitsOfMeasure", initialUnits)
  const [newUnit, setNewUnit] = useState("")
  const [orderTypes, setOrderTypes] = useLocalStorage<string[]>("orderTypes", [])
  const [newOrderType, setNewOrderType] = useState("")
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
  const { finalStock } = useFinalStock()
  const {
    productGroups,
    loading: productGroupsLoading,
    error: productGroupsError,
    createProductGroup,
    updateProductGroup,
    deleteProductGroup,
  } = useProductGroups()
  const [newGroupName, setNewGroupName] = useState("")
  const [newGroupDescription, setNewGroupDescription] = useState("")
  const [isGroupDialogOpen, setIsGroupDialogOpen] = useState(false)
  const [editingGroup, setEditingGroup] = useState<ProductGroup | null>(null)
  const [editingProductIds, setEditingProductIds] = useState<string[]>([])
  const [editingProductQuantities, setEditingProductQuantities] = useState<Record<string, string>>({})
  
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

    // Generate next sequential unit ID like unit_007
    const seq = units
      .map((u) => (u.id.match(/^unit_(\d+)$/)?.[1] ? Number(u.id.match(/^unit_(\d+)$/)![1]) : 0))
      .reduce((max, n) => Math.max(max, n), 0) + 1
    const nextId = `unit_${String(seq).padStart(3, "0")}`

    const newUnitOfMeasure: UnitOfMeasure = {
      id: nextId,
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

  const handleCreateGroup = async () => {
    if (newGroupName.trim() === "") {
      toast({ variant: "destructive", title: "Error", description: "Group name cannot be empty." })
      return
    }

    try {
      await createProductGroup({
        name: newGroupName.trim(),
        description: newGroupDescription.trim() || undefined,
        productIds: [],
      })
      setNewGroupName("")
      setNewGroupDescription("")
      toast({ title: "Success", description: "Product group created." })
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e?.message || "Failed to create product group." })
    }
  }

  const openGroupDialog = (group: ProductGroup) => {
    setEditingGroup(group)
    const ids = group.productIds || []
    setEditingProductIds(ids)
    const quantities: Record<string, string> = {}
    ids.forEach((id) => {
      const existing = group.productQuantities?.[id]
      quantities[id] = existing && existing > 0 ? String(existing) : "1"
    })
    setEditingProductQuantities(quantities)
    setIsGroupDialogOpen(true)
  }

  const handleToggleProductInGroup = (productId: string) => {
    setEditingProductIds((prev) => {
      const isSelected = prev.includes(productId)
      const nextIds = isSelected ? prev.filter((id) => id !== productId) : [...prev, productId]

      setEditingProductQuantities((prevQty) => {
        const nextQty = { ...prevQty }
        if (isSelected) {
          delete nextQty[productId]
        } else if (!nextQty[productId]) {
          nextQty[productId] = "1"
        }
        return nextQty
      })

      return nextIds
    })
  }

  const handleChangeProductQuantity = (productId: string, value: string) => {
    setEditingProductQuantities((prev) => ({
      ...prev,
      [productId]: value,
    }))
  }

  const handleSaveGroupProducts = async () => {
    if (!editingGroup) return

    try {
      const quantities: Record<string, number> = {}
      editingProductIds.forEach((id) => {
        const raw = editingProductQuantities[id]
        const num = Number.parseFloat(raw ?? "")
        quantities[id] = Number.isFinite(num) && num > 0 ? num : 1
      })

      await updateProductGroup(editingGroup.id, {
        productIds: editingProductIds,
        productQuantities: quantities,
      })
      toast({ title: "Success", description: "Product group updated." })
      setIsGroupDialogOpen(false)
      setEditingGroup(null)
      setEditingProductIds([])
      setEditingProductQuantities({})
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e?.message || "Failed to update product group." })
    }
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
      <Tabs defaultValue="units">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="units">Units of Measure</TabsTrigger>
          <TabsTrigger value="orderTypes">Order Types</TabsTrigger>
          <TabsTrigger value="productGroups">Product Groups</TabsTrigger>
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
        <TabsContent value="productGroups">
          <Card>
            <CardHeader>
              <CardTitle>Manage Product Groups</CardTitle>
              <CardDescription>Create groups of products for quick ordering.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-4 space-y-2">
                <Input
                  placeholder="Enter group name..."
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                />
                <Textarea
                  placeholder="Enter description (optional)..."
                  value={newGroupDescription}
                  onChange={(e) => setNewGroupDescription(e.target.value)}
                />
                <Button onClick={handleCreateGroup} disabled={productGroupsLoading}>
                  <PlusCircle className="mr-2 h-4 w-4" /> Create Group
                </Button>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Group Name</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Products</TableHead>
                    <TableHead className="w-[160px] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {productGroupsLoading ? (
                    <TableRow>
                      <TableCell colSpan={4} className="h-24 text-center">
                        Loading product groups...
                      </TableCell>
                    </TableRow>
                  ) : productGroupsError ? (
                    <TableRow>
                      <TableCell colSpan={4} className="h-24 text-center text-destructive">
                        Failed to load product groups.
                      </TableCell>
                    </TableRow>
                  ) : productGroups && productGroups.length > 0 ? (
                    productGroups.map((group) => (
                      <TableRow key={group.id}>
                        <TableCell className="font-medium">{group.name}</TableCell>
                        <TableCell className="max-w-xs truncate">{group.description || "—"}</TableCell>
                        <TableCell>{group.productIds?.length || 0}</TableCell>
                        <TableCell className="text-right space-x-2">
                          <Dialog open={isGroupDialogOpen && editingGroup?.id === group.id} onOpenChange={(open) => {
                            if (!open) {
                              setIsGroupDialogOpen(false)
                              setEditingGroup(null)
                              setEditingProductIds([])
                              setEditingProductQuantities({})
                            }
                          }}>
                            <DialogTrigger asChild>
                              <Button variant="outline" size="sm" onClick={() => openGroupDialog(group)}>
                                Manage Products
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="sm:max-w-xl max-h-[80vh] overflow-y-auto">
                              <DialogHeader>
                                <DialogTitle>Manage Products in {group.name}</DialogTitle>
                                <DialogDescription>
                                  Select which products belong to this group.
                                </DialogDescription>
                              </DialogHeader>
                              <div className="space-y-2">
                                {finalStock.length === 0 ? (
                                  <p className="text-sm text-muted-foreground">
                                    No products in Final Stock. Add products before assigning them to groups.
                                  </p>
                                ) : (
                                  <Table>
                                    <TableHeader>
                                      <TableRow>
                                        <TableHead className="w-[40px]"></TableHead>
                                        <TableHead>Product</TableHead>
                                        <TableHead>SKU</TableHead>
                                        <TableHead className="w-32">Default Qty</TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {finalStock.map((product) => (
                                        <TableRow key={product.id}>
                                          <TableCell>
                                            <Checkbox
                                              checked={editingProductIds.includes(product.id)}
                                              onCheckedChange={() => handleToggleProductInGroup(product.id)}
                                            />
                                          </TableCell>
                                          <TableCell className="font-medium">{product.name}</TableCell>
                                          <TableCell>{product.sku}</TableCell>
                                          <TableCell>
                                            <Input
                                              type="number"
                                              step="0.0001"
                                              min="0"
                                              value={editingProductQuantities[product.id] ?? "1"}
                                              onChange={(e) => handleChangeProductQuantity(product.id, e.target.value)}
                                              disabled={!editingProductIds.includes(product.id)}
                                            />
                                          </TableCell>
                                        </TableRow>
                                      ))}
                                    </TableBody>
                                  </Table>
                                )}
                              </div>
                              <div className="flex justify-end gap-2 pt-4">
                                <Button variant="outline" onClick={() => {
                                  setIsGroupDialogOpen(false)
                                  setEditingGroup(null)
                                  setEditingProductIds([])
                                  setEditingProductQuantities({})
                                }}>
                                  Cancel
                                </Button>
                                <Button onClick={handleSaveGroupProducts}>Save</Button>
                              </div>
                            </DialogContent>
                          </Dialog>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={async () => {
                              try {
                                await deleteProductGroup(group.id)
                                toast({ title: "Success", description: "Product group deleted." })
                              } catch (e: any) {
                                toast({
                                  variant: "destructive",
                                  title: "Error",
                                  description: e?.message || "Failed to delete product group.",
                                })
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={4} className="h-24 text-center">
                        No product groups defined.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="orderTypes">
          <Card>
            <CardHeader>
              <CardTitle>Manage Order Types</CardTitle>
              <CardDescription>Define order types available when creating orders.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2 mb-4">
                <Input
                  placeholder="Enter new order type..."
                  value={newOrderType}
                  onChange={(e) => setNewOrderType(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (() => {
                    if (newOrderType.trim() === "") {
                      toast({ variant: "destructive", title: "Error", description: "Order type cannot be empty." })
                      return
                    }
                    if (orderTypes.some((t) => t.toLowerCase() === newOrderType.trim().toLowerCase())) {
                      toast({ variant: "destructive", title: "Error", description: "Order type already exists." })
                      return
                    }
                    setOrderTypes([...(orderTypes || []), newOrderType.trim()])
                    setNewOrderType("")
                    toast({ title: "Success", description: "New order type added." })
                  })()}
                />
                <Button onClick={() => {
                  if (newOrderType.trim() === "") {
                    toast({ variant: "destructive", title: "Error", description: "Order type cannot be empty." })
                    return
                  }
                  if (orderTypes.some((t) => t.toLowerCase() === newOrderType.trim().toLowerCase())) {
                    toast({ variant: "destructive", title: "Error", description: "Order type already exists." })
                    return
                  }
                  setOrderTypes([...(orderTypes || []), newOrderType.trim()])
                  setNewOrderType("")
                  toast({ title: "Success", description: "New order type added." })
                }}>
                  <PlusCircle className="mr-2 h-4 w-4" /> Add Type
                </Button>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead className="w-[100px] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isClient && orderTypes && orderTypes.map((t) => (
                    <TableRow key={t}>
                      <TableCell className="font-medium">{t}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => setOrderTypes(orderTypes.filter((x) => x !== t))}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {isClient && (!orderTypes || orderTypes.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={2} className="h-24 text-center">
                        No order types defined.
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
