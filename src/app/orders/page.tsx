"use client"

import { useEffect, useMemo, useState } from "react"
import PageHeader from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { PlusCircle, MoreHorizontal, Search, Trash2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { useToast } from "@/hooks/use-toast"
import { usePermissions } from "@/hooks/use-permissions"
import { useLocalStorage } from "@/hooks/use-local-storage"
import type { Order, ProductGroup } from "@/lib/types"
import { useOrders } from "@/hooks/use-orders"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { useForm } from "react-hook-form"
import * as z from "zod"
import { zodResolver } from "@hookform/resolvers/zod"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useFinalStock } from "@/hooks/use-final-stock"
import { useProductGroups } from "@/hooks/use-product-groups"
import { SortControls, sortArray, type SortDirection } from "@/components/sort-controls"

const formSchema = z.object({
  orderId: z.string().min(1, "Order ID is required"),
  orderType: z.string().min(1, "Order Type is required"),
})

export default function OrdersPage() {
  const { orders, createOrder, deleteOrder } = useOrders()
  const { finalStock, updateFinalStock } = useFinalStock()
  const { productGroups, loading: productGroupsLoading } = useProductGroups()
  const { toast } = useToast()
  const { canEdit } = usePermissions()
  const canEditOrders = canEdit("Orders")

  const [isClient, setIsClient] = useState(false)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [sortDirection, setSortDirection] = useState<SortDirection>("none")
  const [orderTypes] = useLocalStorage<string[]>("orderTypes", [])
  const [selectedGroupId, setSelectedGroupId] = useState("")
  const [lineItems, setLineItems] = useState<
    { productId: string; quantity: number }
  >([])
  const [newLineProductId, setNewLineProductId] = useState("")
  const [newLineQuantity, setNewLineQuantity] = useState<string>("1")

  useEffect(() => setIsClient(true), [])

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { orderId: "", orderType: "" },
  })

  const finalStockMap = useMemo(() => {
    return new Map(finalStock.map((p) => [p.id, p]))
  }, [finalStock])

  const filteredAndSortedOrders = useMemo(() => {
    const q = searchQuery.toLowerCase()
    const filtered = orders.filter((o) =>
      o.orderId.toLowerCase().includes(q) ||
      (o.name?.toLowerCase() || "").includes(q) ||
      o.productName?.toLowerCase().includes(q) ||
      o.orderType.toLowerCase().includes(q) ||
      o.id.toLowerCase().includes(q)
    )

    return sortArray(filtered, sortDirection, (order) => order.orderId)
  }, [orders, searchQuery, sortDirection])

  const handleSelectGroup = (groupId: string) => {
    setSelectedGroupId(groupId)
    const group = (productGroups as ProductGroup[] | undefined)?.find((g) => g.id === groupId)
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
      toast({ variant: "destructive", title: "Error", description: "Select a product to add." })
      return
    }
    const quantityNumber = Number(newLineQuantity)
    if (!Number.isFinite(quantityNumber) || quantityNumber <= 0) {
      toast({ variant: "destructive", title: "Error", description: "Quantity must be greater than 0." })
      return
    }
    if (lineItems.some((li) => li.productId === newLineProductId)) {
      toast({ variant: "destructive", title: "Error", description: "Product is already in the list." })
      return
    }
    setLineItems((prev) => [...prev, { productId: newLineProductId, quantity: quantityNumber }])
    setNewLineProductId("")
    setNewLineQuantity("1")
  }

  const handleUpdateLineQuantity = (productId: string, value: string) => {
    const quantityNumber = Number(value)
    setLineItems((prev) =>
      prev.map((li) =>
        li.productId === productId
          ? { ...li, quantity: Number.isFinite(quantityNumber) && quantityNumber > 0 ? quantityNumber : li.quantity }
          : li,
      ),
    )
  }

  const handleRemoveLine = (productId: string) => {
    setLineItems((prev) => prev.filter((li) => li.productId !== productId))
  }

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    if (lineItems.length === 0) {
      toast({ variant: "destructive", title: "Error", description: "Add at least one product to the order." })
      return
    }

    // Validate stock for all line items first
    for (const item of lineItems) {
      const product = finalStockMap.get(item.productId)
      if (!product) {
        toast({ variant: "destructive", title: "Error", description: "One of the selected products was not found." })
        return
      }
      const batches = [...(product.batches || [])]
      const totalAvailable = batches.reduce((sum, b) => sum + Number(b.quantity ?? 0), 0)
      if (item.quantity > totalAvailable) {
        toast({
          variant: "destructive",
          title: "Insufficient Stock",
          description: `${product.name}: Available ${totalAvailable}, Requested ${item.quantity}`,
        })
        return
      }
    }

    // All good, compute updated batches per product and create orders
    const updatedBatchesByProduct = new Map<string, any[]>()

    for (const item of lineItems) {
      const product = finalStockMap.get(item.productId)!
      const originalBatches = [...(product.batches || [])]
      const sorted = originalBatches
        .map((b) => ({ ...b }))
        .sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        )
      let remaining = Number(item.quantity)
      for (const b of sorted) {
        if (remaining <= 0) break
        const qty = Number(b.quantity ?? 0)
        const take = Math.min(qty, remaining)
        b.quantity = qty - take
        remaining -= take
      }
      const updatedById = new Map(sorted.map((b) => [b.batchId, b]))
      const updatedBatches = (product.batches || []).map(
        (b) => updatedById.get(b.batchId) || b,
      )
      updatedBatchesByProduct.set(product.id, updatedBatches)
    }

    const now = new Date().toISOString()
    try {
      // Update stock for all affected products
      for (const [productId, batches] of updatedBatchesByProduct.entries()) {
        await updateFinalStock(productId, { batches })
      }

      // Create one order per line item, sharing the same orderId and orderType
      for (const item of lineItems) {
        const product = finalStockMap.get(item.productId)!
        const newOrder: Omit<Order, "id"> = {
          orderId: values.orderId,
          orderType: values.orderType,
          productId: product.id,
          productName: product.name,
          quantity: item.quantity,
          createdAt: now,
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
      form.reset({ orderId: "", orderType: "" })
      setSelectedGroupId("")
      setLineItems([])
      setNewLineProductId("")
      setNewLineQuantity("1")
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to create order or update stock",
      })
    }
  }

  if (!isClient) return null

  return (
    <>
      <PageHeader title="Orders" description="Track customer or internal orders.">
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
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-2">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <FormField control={form.control} name="orderId" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Order ID</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., ORD-1001" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="orderType" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Order Type</FormLabel>
                        <FormControl>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <SelectTrigger>
                              <SelectValue placeholder={orderTypes.length ? "Select type" : "Define types in Setup"} />
                            </SelectTrigger>
                            <SelectContent>
                              {orderTypes.length === 0 ? (
                                <div className="p-2 text-sm text-muted-foreground">No order types defined in Setup.</div>
                              ) : (
                                orderTypes.map((t) => (
                                  <SelectItem key={t} value={t}>{t}</SelectItem>
                                ))
                              )}
                            </SelectContent>
                          </Select>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <div className="space-y-1">
                      <p className="text-sm font-medium">Product Group (optional)</p>
                      <Select
                        value={selectedGroupId}
                        onValueChange={handleSelectGroup}
                        disabled={productGroupsLoading}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={productGroupsLoading ? "Loading groups..." : "Select group (optional)"} />
                        </SelectTrigger>
                        <SelectContent>
                          {!productGroupsLoading && (!productGroups || productGroups.length === 0) ? (
                            <div className="p-2 text-sm text-muted-foreground">No product groups defined.</div>
                          ) : (
                            (productGroups as ProductGroup[] | undefined)?.map((g) => (
                              <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Selecting a group will pre-fill the product list below. You can still add or remove
                        products before creating the order.
                      </p>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-end gap-2">
                      <div className="flex-1">
                        <p className="text-sm font-medium mb-1">Add Product</p>
                        <Select value={newLineProductId} onValueChange={setNewLineProductId}>
                          <SelectTrigger>
                            <SelectValue placeholder={finalStock.length ? "Select product" : "Add products in Final Stock"} />
                          </SelectTrigger>
                          <SelectContent>
                            {finalStock.length === 0 ? (
                              <div className="p-2 text-sm text-muted-foreground">No products in Final Stock.</div>
                            ) : (
                              finalStock
                                .filter((p) => !lineItems.some((li) => li.productId === p.id))
                                .map((p) => (
                                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                                ))
                            )}
                          </SelectContent>
                        </Select>
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
                              <TableCell colSpan={4} className="h-16 text-center text-muted-foreground text-sm">
                                No products added. Select a group or add products above.
                              </TableCell>
                            </TableRow>
                          ) : (
                            lineItems.map((item) => {
                              const product = finalStockMap.get(item.productId)
                              const batches = [...(product?.batches || [])]
                              const totalAvailable = batches.reduce((sum, b) => sum + Number(b.quantity ?? 0), 0)
                              return (
                                <TableRow key={item.productId}>
                                  <TableCell>{product?.name || "Unknown product"}</TableCell>
                                  <TableCell>
                                    <Input
                                      type="number"
                                      step="0.0001"
                                      min="0"
                                      value={item.quantity}
                                      onChange={(e) => handleUpdateLineQuantity(item.productId, e.target.value)}
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
                    <Button type="submit">Create</Button>
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
                <TableHead>Product</TableHead>
                <TableHead>Quantity</TableHead>
                <TableHead>Order Type</TableHead>
                <TableHead>Created At</TableHead>
                <TableHead className="text-right w-[60px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAndSortedOrders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                    No orders found.
                  </TableCell>
                </TableRow>
              ) : (
                filteredAndSortedOrders.map((o: Order) => (
                  <TableRow key={o.id}>
                    <TableCell className="font-mono text-xs">{o.orderId}</TableCell>
                    <TableCell>{o.productName}</TableCell>
                    <TableCell>{o.quantity}</TableCell>
                    <TableCell>{o.orderType}</TableCell>
                    <TableCell>{o.createdAt ? new Date(o.createdAt).toLocaleString() : "—"}</TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          {canEditOrders ? (
                            <DropdownMenuItem onClick={() => deleteOrder(o.id)} className="text-destructive">
                              <Trash2 className="mr-2 h-4 w-4" /> Delete
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem disabled>View Only</DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  )
}
