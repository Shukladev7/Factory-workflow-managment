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
import type { Order } from "@/lib/types"
import { useOrders } from "@/hooks/use-orders"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { useForm } from "react-hook-form"
import * as z from "zod"
import { zodResolver } from "@hookform/resolvers/zod"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useFinalStock } from "@/hooks/use-final-stock"

const formSchema = z.object({
  orderId: z.string().min(1, "Order ID is required"),
  productId: z.string().min(1, "Product is required"),
  quantity: z.coerce.number().min(0.0001, "Quantity must be greater than 0"),
  orderType: z.string().min(1, "Order Type is required"),
})

export default function OrdersPage() {
  const { orders, createOrder, deleteOrder } = useOrders()
  const { finalStock, updateFinalStock } = useFinalStock()
  const { toast } = useToast()
  const { canEdit } = usePermissions()
  const canEditOrders = canEdit("Orders")

  const [isClient, setIsClient] = useState(false)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [orderTypes] = useLocalStorage<string[]>("orderTypes", [])

  useEffect(() => setIsClient(true), [])

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { orderId: "", productId: "", quantity: 1, orderType: "" },
  })

  const filteredOrders = useMemo(() => {
    const q = searchQuery.toLowerCase()
    return orders.filter((o) =>
      o.orderId.toLowerCase().includes(q) ||
      (o.name?.toLowerCase() || "").includes(q) ||
      o.productName?.toLowerCase().includes(q) ||
      o.orderType.toLowerCase().includes(q) ||
      o.id.toLowerCase().includes(q)
    )
  }, [orders, searchQuery])

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    const product = finalStock.find(p => p.id === values.productId)
    if (!product) {
      toast({ variant: "destructive", title: "Error", description: "Selected product not found" })
      return
    }

    // Calculate available stock from batches
    const batches = [...(product.batches || [])]
    const totalAvailable = batches.reduce((sum, b) => sum + Number(b.quantity ?? 0), 0)

    if (values.quantity > totalAvailable) {
      toast({ variant: "destructive", title: "Insufficient Stock", description: `Available: ${totalAvailable}, Requested: ${values.quantity}` })
      return
    }

    // FIFO: subtract from oldest batches first
    const sorted = batches
      .map(b => ({ ...b }))
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())

    let remaining = Number(values.quantity)
    for (const b of sorted) {
      if (remaining <= 0) break
      const qty = Number(b.quantity ?? 0)
      const take = Math.min(qty, remaining)
      b.quantity = qty - take
      remaining -= take
    }

    // Persist updated batches back in original order (by batchId)
    const updatedById = new Map(sorted.map(b => [b.batchId, b]))
    const updatedBatches = (product.batches || []).map(b => updatedById.get(b.batchId) || b)

    const newOrder: Omit<Order, "id"> = {
      ...values,
      productName: product.name,
      createdAt: new Date().toISOString(),
    }

    try {
      await updateFinalStock(product.id, { batches: updatedBatches })
      await createOrder(newOrder)
      toast({ title: "Order Created", description: `Reserved ${values.quantity} from ${product.name}.` })
      setIsCreateOpen(false)
      form.reset({ orderId: "", productId: "", quantity: 1, orderType: "" })
    } catch (e) {
      toast({ variant: "destructive", title: "Error", description: "Failed to create order or update stock" })
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
            <DialogContent className="sm:max-w-[520px]">
              <DialogHeader>
                <DialogTitle>Create Order</DialogTitle>
                <DialogDescription>Enter order details.</DialogDescription>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-2">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField control={form.control} name="orderId" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Order ID</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., ORD-1001" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <FormField control={form.control} name="productId" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Product</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder={finalStock.length ? "Select product" : "Add products in Final Stock"} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {finalStock.length === 0 ? (
                              <div className="p-2 text-sm text-muted-foreground">No products in Final Stock.</div>
                            ) : (
                              finalStock.map((p) => (
                                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                              ))
                            )}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="quantity" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Quantity</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.0001" min="0" placeholder="1" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="orderType" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Order Type</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder={orderTypes.length ? "Select type" : "Define types in Setup"} />
                            </SelectTrigger>
                          </FormControl>
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
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                  <div className="flex justify-end">
                    <Button type="submit">Create</Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        )}
      </PageHeader>

      <div className="mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by Order ID, Name, Type, or System ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
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
              {filteredOrders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                    No orders found.
                  </TableCell>
                </TableRow>
              ) : (
                filteredOrders.map((o) => (
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
