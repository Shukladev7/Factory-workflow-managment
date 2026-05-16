"use client"

import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useOrderTypes } from "@/hooks/use-order-types"
import type { OrderType } from "@/lib/types"
import { useEffect, useMemo, useState } from "react"
import PageHeader from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { PlusCircle, MoreHorizontal, Search, Trash2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useToast } from "@/hooks/use-toast"
import { usePermissions } from "@/hooks/use-permissions"
import type { Order, ProductGroup } from "@/lib/types"
import { useOrders } from "@/hooks/use-orders"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { useForm } from "react-hook-form"
import * as z from "zod"
import { zodResolver } from "@hookform/resolvers/zod"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useFinalStock } from "@/hooks/use-final-stock"
import { useProductGroups } from "@/hooks/use-product-groups"
import {
  SortControls,
  sortArray,
  type SortDirection,
} from "@/components/sort-controls"
import { Combobox } from "@/components/ui/combobox"

const formSchema = z.object({
  orderId: z.string().min(1, "Order ID is required"),
  orderType: z.string().min(1, "Order Type is required"),
  dueDate: z.string().min(1, "Due Date is required"),
  remark: z.string().optional(),
})

type StatusView = "pending" | "sold"

function parseStatusView(value: string | null): StatusView {
  return value === "sold" ? "sold" : "pending"
}

export default function OrdersPage() {
  const searchParams = useSearchParams()
  const statusView = parseStatusView(searchParams.get("status"))
  const statusFilter: Order["status"] = statusView === "sold" ? "SOLD" : "PENDING"

  const { orders, createOrder, getNextOrderId, updateOrderStatus, deleteOrder, loading } =
    useOrders(statusFilter)
  const { finalStock } = useFinalStock()
  const { productGroups, loading: productGroupsLoading } = useProductGroups()
  const { toast } = useToast()
  const { canEdit } = usePermissions()
  const canEditOrders = canEdit("Orders")

  const [isClient, setIsClient] = useState(false)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [isGeneratingOrderId, setIsGeneratingOrderId] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [sortDirection, setSortDirection] = useState<SortDirection>("none")
  const { orderTypes } = useOrderTypes()
  const [selectedGroupId, setSelectedGroupId] = useState("")
  const [lineItems, setLineItems] = useState<{ productId: string; quantity: number }[]>([])
  const [newLineProductId, setNewLineProductId] = useState("")
  const [newLineQuantity, setNewLineQuantity] = useState<string>("1")

  useEffect(() => setIsClient(true), [])

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      orderId: "",
      orderType: "",
      dueDate: new Date().toISOString().slice(0, 10),
      remark: "",
    },
  })

  const finalStockMap = useMemo(() => {
    return new Map(finalStock.map((p) => [p.id, p]))
  }, [finalStock])

  const availableProductOptions = useMemo(() => {
    return finalStock
      .filter((p) => !lineItems.some((li) => li.productId === p.id))
      .map((p) => ({ label: p.name, value: p.id }))
  }, [finalStock, lineItems])

  const filteredAndSortedOrders = useMemo(() => {
    const q = searchQuery.toLowerCase()
    const filtered = orders.filter(
      (o) =>
        o.orderId.toLowerCase().includes(q) ||
        (o.name?.toLowerCase() || "").includes(q) ||
        o.productName?.toLowerCase().includes(q) ||
        (o.remark?.toLowerCase() || "").includes(q) ||
        (o.status?.toLowerCase() || "").includes(q) ||
        o.orderType.toLowerCase().includes(q) ||
        o.id.toLowerCase().includes(q),
    )

    return sortArray(filtered, sortDirection, (order) => order.orderId)
  }, [orders, searchQuery, sortDirection])

  const resetCreateForm = () => {
    form.reset({
      orderId: "",
      orderType: "",
      dueDate: new Date().toISOString().slice(0, 10),
      remark: "",
    })
    setSelectedGroupId("")
    setLineItems([])
    setNewLineProductId("")
    setNewLineQuantity("1")
  }

  const generateAndSetOrderId = async () => {
    setIsGeneratingOrderId(true)
    try {
      const nextOrderId = await getNextOrderId()
      form.setValue("orderId", nextOrderId, { shouldValidate: true })
    } catch {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to generate order ID. Please try again.",
      })
    } finally {
      setIsGeneratingOrderId(false)
    }
  }

  useEffect(() => {
    if (!isCreateOpen) return
    resetCreateForm()
    void generateAndSetOrderId()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCreateOpen])

  const handleSelectGroup = (groupId: string) => {
    setSelectedGroupId(groupId)
    const group = (productGroups as ProductGroup[] | undefined)?.find(
      (g) => g.id === groupId,
    )
    if (!group) {
      setLineItems([])
      return
    }
    const productIds = group.productIds || []
    const items = productIds
      .map((pid) => {
        const product = finalStockMap.get(pid)
        if (!product) return null
        const defaultQty = group.productQuantities?.[pid]
        const quantity = defaultQty && defaultQty > 0 ? defaultQty : 1
        return { productId: product.id, quantity }
      })
      .filter((item): item is { productId: string; quantity: number } => !!item)

    setLineItems(items)
  }

  const handleAddLineItem = () => {
    if (!newLineProductId) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Select a product to add.",
      })
      return
    }
    const quantityNumber = Number(newLineQuantity)
    if (!Number.isFinite(quantityNumber) || quantityNumber <= 0) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Quantity must be greater than 0.",
      })
      return
    }
    if (lineItems.some((li) => li.productId === newLineProductId)) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Product is already in the list.",
      })
      return
    }
    setLineItems((prev) => [
      ...prev,
      { productId: newLineProductId, quantity: quantityNumber },
    ])
    setNewLineProductId("")
    setNewLineQuantity("1")
  }

  const handleUpdateLineQuantity = (productId: string, value: string) => {
    const quantityNumber = Number(value)
    setLineItems((prev) =>
      prev.map((li) =>
        li.productId === productId
          ? {
              ...li,
              quantity:
                Number.isFinite(quantityNumber) && quantityNumber > 0
                  ? quantityNumber
                  : li.quantity,
            }
          : li,
      ),
    )
  }

  const handleRemoveLine = (productId: string) => {
    setLineItems((prev) => prev.filter((li) => li.productId !== productId))
  }

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    if (lineItems.length === 0) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Add at least one product to the order.",
      })
      return
    }

    if (!values.orderId) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Order ID is not ready yet. Please wait a moment.",
      })
      return
    }

    for (const item of lineItems) {
      const product = finalStockMap.get(item.productId)
      if (!product) {
        toast({
          variant: "destructive",
          title: "Error",
          description: "One of the selected products was not found.",
        })
        return
      }
    }

    const now = new Date().toISOString()
    const dueDateIso = new Date(values.dueDate).toISOString()

    try {
      for (const item of lineItems) {
        const product = finalStockMap.get(item.productId)!
        const newOrder: Omit<Order, "id"> = {
          orderId: values.orderId,
          orderType: values.orderType,
          productId: product.id,
          productName: product.name,
          quantity: item.quantity,
          dueDate: dueDateIso,
          remark: values.remark?.trim() || "",
          status: "PENDING",
          isStockDeducted: false,
          createdAt: now,
          updatedAt: now,
        }
        await createOrder(newOrder)
      }

      toast({
        title: "Order Created",
        description: `Created ${lineItems.length} order line${
          lineItems.length > 1 ? "s" : ""
        } for ${values.orderId}.`,
      })

      setIsCreateOpen(false)
      resetCreateForm()
    } catch {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to create order",
      })
    }
  }

  const handleStatusChange = async (order: Order, status: Order["status"]) => {
    if (order.status === status) return

    try {
      const result = await updateOrderStatus(order.id, status)
      if (result.stockDeducted) {
        toast({
          title: "Order Marked as SOLD",
          description: `${order.productName}: ${order.quantity} deducted from stock.`,
        })
        return
      }

      toast({
        title: "Order Updated",
        description: `Status changed to ${result.status}.`,
      })
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to update order status."
      toast({
        variant: "destructive",
        title: "Error",
        description: message,
      })
    }
  }

  if (!isClient) return null

  const pageTitle = statusView === "sold" ? "Sold Orders" : "Pending Orders"
  const pageDescription =
    statusView === "sold"
      ? "All completed orders that are already sold."
      : "Track and manage all pending customer or internal orders."

  return (
    <>
      <PageHeader title={pageTitle} description={pageDescription}>
        <div className="flex items-center gap-2">
          <Button asChild variant={statusView === "pending" ? "default" : "outline"}>
            <Link href="/orders?status=pending">Pending Orders</Link>
          </Button>
          <Button asChild variant={statusView === "sold" ? "default" : "outline"}>
            <Link href="/orders?status=sold">Sold Orders</Link>
          </Button>
        </div>

        {canEditOrders && (
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <PlusCircle className="mr-2 h-4 w-4" /> New Order
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[720px]">
              <DialogHeader>
                <DialogTitle>Create Order</DialogTitle>
                <DialogDescription>Enter order details.</DialogDescription>
              </DialogHeader>
              <Form {...form}>
                <form
                  onSubmit={form.handleSubmit(onSubmit)}
                  className="space-y-4 pt-2"
                >
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <FormField
                      control={form.control}
                      name="orderId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Order ID</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Auto-generated"
                              {...field}
                              disabled
                              readOnly
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="orderType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Order Type</FormLabel>
                          <FormControl>
                            <Select
                              onValueChange={field.onChange}
                              defaultValue={field.value}
                            >
                              <SelectTrigger>
                                <SelectValue
                                  placeholder={
                                    orderTypes && orderTypes.length
                                      ? "Select type"
                                      : "Define types in Setup"
                                  }
                                />
                              </SelectTrigger>
                              <SelectContent>
                                {!orderTypes || orderTypes.length === 0 ? (
                                  <div className="p-2 text-sm text-muted-foreground">
                                    No order types defined in Setup.
                                  </div>
                                ) : (
                                  orderTypes.map((t: OrderType) => (
                                    <SelectItem key={t.id} value={t.name}>
                                      {t.name}
                                    </SelectItem>
                                  ))
                                )}
                              </SelectContent>
                            </Select>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="dueDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Due Date</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="space-y-1">
                      <p className="text-sm font-medium">Product Group (optional)</p>
                      <Select
                        value={selectedGroupId}
                        onValueChange={handleSelectGroup}
                        disabled={productGroupsLoading}
                      >
                        <SelectTrigger>
                          <SelectValue
                            placeholder={
                              productGroupsLoading
                                ? "Loading groups..."
                                : "Select group (optional)"
                            }
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {!productGroupsLoading &&
                          (!productGroups || productGroups.length === 0) ? (
                            <div className="p-2 text-sm text-muted-foreground">
                              No product groups defined.
                            </div>
                          ) : (
                            (productGroups as ProductGroup[] | undefined)?.map((g) => (
                              <SelectItem key={g.id} value={g.id}>
                                {g.name}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Selecting a group will pre-fill the product list below. You
                        can still add or remove products before creating the order.
                      </p>
                    </div>
                  </div>

                  <FormField
                    control={form.control}
                    name="remark"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Remark</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Optional notes for this order"
                            className="min-h-[70px]"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="space-y-3">
                    <div className="flex items-end gap-2">
                      <div className="flex-1">
                        <p className="text-sm font-medium mb-1">Add Product</p>
                        <Combobox
                          options={availableProductOptions}
                          value={newLineProductId}
                          onChange={setNewLineProductId}
                          placeholder={
                            finalStock.length
                              ? "Select product"
                              : "Add products in Final Stock"
                          }
                          searchPlaceholder="Search products by name..."
                          notfoundPlaceholder="No product found."
                        />
                      </div>
                      <div className="w-32">
                        <p className="text-sm font-medium mb-1">Quantity</p>
                        <Input
                          type="number"
                          step="0.0001"
                          min="0"
                          value={newLineQuantity}
                          onChange={(e) => setNewLineQuantity(e.target.value)}
                        />
                      </div>
                      <Button type="button" variant="outline" onClick={handleAddLineItem}>
                        <PlusCircle className="mr-2 h-4 w-4" /> Add to List
                      </Button>
                    </div>

                    <div className="border rounded-md">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Product</TableHead>
                            <TableHead className="w-32">Quantity</TableHead>
                            <TableHead className="w-32">Available</TableHead>
                            <TableHead className="w-[60px] text-right">Remove</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {lineItems.length === 0 ? (
                            <TableRow>
                              <TableCell
                                colSpan={4}
                                className="h-16 text-center text-muted-foreground text-sm"
                              >
                                No products added. Select a group or add products above.
                              </TableCell>
                            </TableRow>
                          ) : (
                            lineItems.map((item) => {
                              const product = finalStockMap.get(item.productId)
                              const batches = [...(product?.batches || [])]
                              const totalAvailable = batches.reduce(
                                (sum, b) => sum + Number(b.quantity ?? 0),
                                0,
                              )
                              return (
                                <TableRow key={item.productId}>
                                  <TableCell>{product?.name || "Unknown product"}</TableCell>
                                  <TableCell>
                                    <Input
                                      type="number"
                                      step="0.0001"
                                      min="0"
                                      value={item.quantity}
                                      onChange={(e) =>
                                        handleUpdateLineQuantity(
                                          item.productId,
                                          e.target.value,
                                        )
                                      }
                                    />
                                  </TableCell>
                                  <TableCell>{totalAvailable}</TableCell>
                                  <TableCell className="text-right">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => handleRemoveLine(item.productId)}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              )
                            })
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </div>

                  <div className="flex justify-end pt-2">
                    <Button
                      type="submit"
                      disabled={isGeneratingOrderId || !form.watch("orderId")}
                    >
                      {isGeneratingOrderId ? "Generating Order ID..." : "Create"}
                    </Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        )}
      </PageHeader>

      <div className="mb-4 flex gap-4 items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by Order ID, Name, Type, or System ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <SortControls
          sortDirection={sortDirection}
          onSortChange={setSortDirection}
          label="Sort Orders"
        />
      </div>

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order ID</TableHead>
                <TableHead>Product ID</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Quantity</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead>Remark</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Order Type</TableHead>
                <TableHead>Created At</TableHead>
                <TableHead className="text-right w-[60px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={10} className="h-24 text-center text-muted-foreground">
                    Loading orders...
                  </TableCell>
                </TableRow>
              ) : filteredAndSortedOrders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="h-24 text-center text-muted-foreground">
                    No {statusView} orders found.
                  </TableCell>
                </TableRow>
              ) : (
                filteredAndSortedOrders.map((o: Order) => {
                  const linkedProduct = finalStockMap.get(o.productId)
                  const displayProductId = linkedProduct?.productId || "—"

                  return (
                    <TableRow key={o.id}>
                      <TableCell className="font-mono text-xs">{o.orderId}</TableCell>
                      <TableCell className="font-mono text-xs">{displayProductId}</TableCell>
                      <TableCell>{o.productName}</TableCell>
                      <TableCell>{o.quantity}</TableCell>
                      <TableCell>
                        {o.dueDate ? new Date(o.dueDate).toLocaleDateString() : "—"}
                      </TableCell>
                      <TableCell className="max-w-[260px] truncate" title={o.remark || ""}>
                        {o.remark || "—"}
                      </TableCell>
                      <TableCell>
                        {o.status === "SOLD" ? (
                          <Badge variant="success">SOLD</Badge>
                        ) : canEditOrders ? (
                          <Select
                            value={o.status || "PENDING"}
                            onValueChange={(value) =>
                              handleStatusChange(o, value as Order["status"])
                            }
                            disabled={!canEditOrders}
                          >
                            <SelectTrigger className="w-[130px]">
                              <SelectValue placeholder="Status" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="PENDING">PENDING</SelectItem>
                              <SelectItem value="SOLD">SOLD</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <Badge variant="warning">PENDING</Badge>
                        )}
                      </TableCell>
                      <TableCell>{o.orderType}</TableCell>
                      <TableCell>
                        {o.createdAt ? new Date(o.createdAt).toLocaleString() : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent>
                            {canEditOrders ? (
                              <DropdownMenuItem
                                onClick={() => deleteOrder(o.id)}
                                className="text-destructive"
                              >
                                <Trash2 className="mr-2 h-4 w-4" /> Delete
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem disabled>View Only</DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  )
}
