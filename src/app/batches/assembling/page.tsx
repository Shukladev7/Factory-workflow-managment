"use client"

import { useMemo, useState } from "react"
import PageHeader from "@/components/page-header"
import { BatchStageProcessor } from "@/components/batch-stage-processor"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useRawMaterials } from "@/hooks/use-raw-materials"
import { useFinalStock } from "@/hooks/use-final-stock"
import type { RawMaterial, FinalStock, Batch, ProcessingStageName } from "@/lib/types"
import { AlertTriangle, XCircle, ChevronDown, ChevronUp, Search } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { createBatch } from "@/lib/firebase"
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

export default function AssemblingPage() {
  const { assembledMaterials, rawMaterials } = useRawMaterials()
  const { finalStock } = useFinalStock()
  const { toast } = useToast()
  const [isItemsExpanded, setIsItemsExpanded] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")

  const getProductForMaterial = (material: RawMaterial): FinalStock | null => {
    if (!finalStock || finalStock.length === 0) return null
    const byLink = finalStock.find((p) => p.assembledMaterialId === material.id)
    if (byLink) return byLink
    const viaBom = finalStock.find(
      (p) => Array.isArray(p.bom_per_piece) && p.bom_per_piece.some((row) => row.raw_material_id === material.id)
    )
    if (viaBom) return viaBom
    return null
  }

  const handleCreateFinalBatch = async (product: FinalStock) => {
    const stage: ProcessingStageName = "Assembling"
    if (
      Array.isArray(product.manufacturingStages) &&
      product.manufacturingStages.length > 0 &&
      !product.manufacturingStages.includes(stage)
    ) {
      toast({
        variant: "destructive",
        title: "Stage Not Allowed",
        description: `${stage} is not in this product's manufacturing stages.`,
      })
      return
    }

    const quantityToBuild = 1
    const bom = (product.bom_per_piece || []).filter((row) => row.stage === stage)

    const shortages = bom
      .map((row) => {
        const rm = rawMaterials.find((r) => r.id === row.raw_material_id)
        const required = (Number(row.qty_per_piece) || 0) * quantityToBuild
        const available = Number(rm?.quantity || 0)
        if (rm && required > available) {
          return `${rm.name}: need ${required} ${rm.unit}, have ${available} ${rm.unit}`
        }
        return null
      })
      .filter(Boolean) as string[]

    if (shortages.length > 0) {
      toast({
        variant: "destructive",
        title: "Insufficient Raw Material",
        description: `Cannot create batch. Shortages -> ${shortages.join("; ")}`,
      })
      return
    }

    const batchMaterials = bom.map((row) => {
      const rm = rawMaterials.find((r) => r.id === row.raw_material_id)
      const fin = finalStock.find((p) => p.id === row.raw_material_id)
      return {
        id: row.raw_material_id,
        name: rm?.name || fin?.name || row.raw_material_id,
        quantity: (row.qty_per_piece || 0) * quantityToBuild,
        unit: rm?.unit || (fin ? "pcs" : (row.unit || "")),
        stage,
      }
    })
    const totalMaterialQuantity = batchMaterials.reduce((s, m) => s + (m.quantity || 0), 0)

    const processingStages: Batch["processingStages"] = {
      Molding: { accepted: 0, rejected: 0, actualConsumption: 0, completed: false },
      Machining: { accepted: 0, rejected: 0, actualConsumption: 0, completed: false },
      Assembling: { accepted: 0, rejected: 0, actualConsumption: 0, completed: false },
      Testing: { accepted: 0, rejected: 0, actualConsumption: 0, completed: false },
    }

    const batch: Omit<Batch, "id" | "batchId"> = {
      productId: product.productId || product.id,
      productName: product.name,
      quantityToBuild,
      totalMaterialQuantity,
      materials: batchMaterials,
      createdAt: new Date().toISOString(),
      status: "Planned",
      processingStages,
      selectedProcesses: [stage],
    }

    try {
      const newId = await createBatch(batch)
      toast({ title: "Batch Created", description: `Created batch ${newId} for ${product.name} (${stage}).` })
    } catch (e) {
      toast({ variant: "destructive", title: "Failed to Create", description: "Could not create batch. Try again." })
    }
  }

  const allItems = useMemo(() => {
    // Process material items
    const materialItems = assembledMaterials.map((m) => {
      const product = getProductForMaterial(m)
      const productThreshold = product?.assembledThreshold
      const threshold = (m.threshold && m.threshold > 0) ? m.threshold : (productThreshold ?? 0)
      const urgency = Number(m.quantity ?? 0) - Number(threshold ?? 0)
      return { type: "material" as const, material: m, product, threshold, urgency }
    })

    // Process final stock items
    const finalStage: ProcessingStageName = "Assembling"
    const finalStockItems = finalStock
      ? finalStock
          .filter(
            (p) =>
              Array.isArray(p.manufacturingStages) &&
              p.manufacturingStages.length > 0 &&
              p.manufacturingStages[p.manufacturingStages.length - 1] === finalStage
          )
          .map((p) => {
            const batchesQty = (p.batches || []).reduce((s, b) => s + Number(b.quantity || 0), 0)
            const quantity = (p.batches && p.batches.length > 0) ? batchesQty : Number(p.quantity || 0)
            const stageThreshold = p.assembledThreshold
            const threshold = (stageThreshold && stageThreshold > 0) ? stageThreshold : (p.threshold ?? 0)
            const urgency = Number(quantity) - Number(threshold ?? 0)
            return { type: "final" as const, product: p, quantity, threshold, urgency }
          })
      : []

    // Combine and sort by urgency
    return [...materialItems, ...finalStockItems].sort((a, b) => a.urgency - b.urgency)
  }, [assembledMaterials, finalStock])

  const filteredItems = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return allItems

    return allItems.filter((item) => {
      if (item.type === "material") {
        const { material, product } = item
        const pid = (product ? (product.productId || product.id) : "").toLowerCase()
        const name = (product?.name || material.name || "").toLowerCase()
        const sku = (material.sku || "").toLowerCase()
        const systemId = (material.id || "").toLowerCase()
        return (
          systemId.includes(query) ||
          pid.includes(query) ||
          sku.includes(query) ||
          name.includes(query)
        )
      } else {
        const { product } = item
        const systemId = (product.id || "").toLowerCase()
        const pid = (product.productId || product.id || "").toLowerCase()
        const name = (product.name || "").toLowerCase()
        const sku = (product.sku || "").toLowerCase()
        return (
          systemId.includes(query) ||
          pid.includes(query) ||
          sku.includes(query) ||
          name.includes(query)
        )
      }
    })
  }, [allItems, searchQuery])

  const handleCreateBatch = async (material: RawMaterial, product: FinalStock | null) => {
    if (!product) {
      toast({ variant: "destructive", title: "No Linked Product", description: "Could not determine the product for this assembled material." })
      return
    }
    const stage: ProcessingStageName = "Assembling"
    if (Array.isArray(product.manufacturingStages) && product.manufacturingStages.length > 0 && !product.manufacturingStages.includes(stage)) {
      toast({ variant: "destructive", title: "Stage Not Allowed", description: `${stage} is not in this product's manufacturing stages.` })
      return
    }

    const quantityToBuild = 1
    const bom = (product.bom_per_piece || []).filter((row) => row.stage === stage)

    // Stock check: ensure raw material stock covers required quantity
    const shortages = bom
      .map((row) => {
        const rm = rawMaterials.find((r) => r.id === row.raw_material_id)
        const required = (Number(row.qty_per_piece) || 0) * quantityToBuild
        const available = Number(rm?.quantity || 0)
        if (rm && required > available) {
          return `${rm.name}: need ${required} ${rm.unit}, have ${available} ${rm.unit}`
        }
        return null
      })
      .filter(Boolean) as string[]

    if (shortages.length > 0) {
      toast({
        variant: "destructive",
        title: "Insufficient Raw Material",
        description: `Cannot create batch. Shortages -> ${shortages.join("; ")}`,
      })
      return
    }
    const batchMaterials = bom.map((row) => {
      const rm = rawMaterials.find((r) => r.id === row.raw_material_id)
      const fin = finalStock.find((p) => p.id === row.raw_material_id)
      return {
        id: row.raw_material_id,
        name: rm?.name || fin?.name || row.raw_material_id,
        quantity: (row.qty_per_piece || 0) * quantityToBuild,
        unit: rm?.unit || (fin ? "pcs" : (row.unit || "")),
        stage,
      }
    })
    const totalMaterialQuantity = batchMaterials.reduce((s, m) => s + (m.quantity || 0), 0)

    const processingStages: Batch["processingStages"] = {
      Molding: { accepted: 0, rejected: 0, actualConsumption: 0, completed: false },
      Machining: { accepted: 0, rejected: 0, actualConsumption: 0, completed: false },
      Assembling: { accepted: 0, rejected: 0, actualConsumption: 0, completed: false },
      Testing: { accepted: 0, rejected: 0, actualConsumption: 0, completed: false },
    }

    const batch: Omit<Batch, "id" | "batchId"> = {
      productId: product.id,
      productName: product.name,
      quantityToBuild,
      totalMaterialQuantity,
      materials: batchMaterials,
      createdAt: new Date().toISOString(),
      status: "Planned",
      processingStages,
      selectedProcesses: [stage],
    }

    try {
      const newId = await createBatch(batch)
      toast({ title: "Batch Created", description: `Created batch ${newId} for ${product.name} (${stage}).` })
    } catch (e) {
      toast({ variant: "destructive", title: "Failed to Create", description: "Could not create batch. Try again." })
    }
  }

  const renderStatus = (qty: number, threshold: number) => {
    if (qty <= 0) {
      return (
        <Badge variant="destructive" className="flex items-center gap-1 w-fit">
          <XCircle className="h-3 w-3" /> Out of Stock
        </Badge>
      )
    }
    if (threshold > 0 && qty < threshold) {
      return (
        <Badge variant="destructive" className="flex items-center gap-1 w-fit">
          <AlertTriangle className="h-3 w-3" /> Low Stock
        </Badge>
      )
    }
    return <Badge variant="secondary">In Stock</Badge>
  }

  return (
    <>
      <PageHeader
        title="Assembling Stage"
        description="Process batches in the assembling stage. Log accepted units."
      />
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle>Items List</CardTitle>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by ID, Product ID, SKU, or Name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 w-64"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsItemsExpanded(!isItemsExpanded)}
            >
              {isItemsExpanded ? (
                <>
                  <ChevronUp className="h-4 w-4 mr-2" />
                  Collapse
                </>
              ) : (
                <>
                  <ChevronDown className="h-4 w-4 mr-2" />
                  Expand
                </>
              )}
            </Button>
          </div>
        </CardHeader>
        {isItemsExpanded && (
          <CardContent className="pt-6">
            <Table>
            <TableHeader>
              <TableRow>
                <TableHead>System ID</TableHead>
                <TableHead>Product ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Quantity</TableHead>
                <TableHead>Min Threshold</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Create Batch</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredItems.map((item) => {
                if (item.type === "material") {
                  const { material, product, threshold } = item
                  return (
                    <TableRow key={material.id}>
                      <TableCell className="font-mono text-xs">{material.id}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {product ? (product.productId || product.id) : "—"}
                      </TableCell>
                      <TableCell className="font-medium">{material.name}</TableCell>
                      <TableCell className="font-mono text-xs">{material.sku}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{material.quantity.toLocaleString()} {material.unit}</Badge>
                      </TableCell>
                      <TableCell>{threshold ?? 0}</TableCell>
                      <TableCell>{renderStatus(Number(material.quantity ?? 0), Number(threshold ?? 0))}</TableCell>
                      <TableCell>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="sm">Create Batch</Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Create batch?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to create a batch for {product ? product.name : material.name} in the Assembling stage?
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleCreateBatch(material, product || null)}>
                                Confirm
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </TableCell>
                    </TableRow>
                  )
                } else {
                  const { product, quantity, threshold } = item
                  return (
                    <TableRow key={`final-${product.id}`}>
                      <TableCell className="font-mono text-xs">{product.id}</TableCell>
                      <TableCell className="font-mono text-xs">{product.productId || product.id}</TableCell>
                      <TableCell className="font-medium">{product.name}</TableCell>
                      <TableCell className="font-mono text-xs">{product.sku}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{Number(quantity).toLocaleString()} pcs</Badge>
                      </TableCell>
                      <TableCell>{threshold ?? 0}</TableCell>
                      <TableCell>{renderStatus(Number(quantity ?? 0), Number(threshold ?? 0))}</TableCell>
                      <TableCell>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="sm">Create Batch</Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Create batch?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to create a batch for {product.name} in the Assembling stage?
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleCreateFinalBatch(product)}>
                                Confirm
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </TableCell>
                    </TableRow>
                  )
                }
              })}
            </TableBody>
          </Table>
          </CardContent>
        )}
      </Card>
      <BatchStageProcessor stage="Assembling" previousStage="Machining" />
    </>
  )
}
