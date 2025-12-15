"use client"

import { useMemo } from "react"
import PageHeader from "@/components/page-header"
import { BatchStageProcessor } from "@/components/batch-stage-processor"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useRawMaterials } from "@/hooks/use-raw-materials"
import { useFinalStock } from "@/hooks/use-final-stock"
import type { RawMaterial, FinalStock, Batch, ProcessingStageName } from "@/lib/types"
import { AlertTriangle, XCircle } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { createBatch } from "@/lib/firebase"

export default function AssemblingPage() {
  const { assembledMaterials, rawMaterials } = useRawMaterials()
  const { finalStock } = useFinalStock()
  const { toast } = useToast()

  const getProductForMaterial = (material: RawMaterial): FinalStock | null => {
    if (!finalStock || finalStock.length === 0) return null
    const byLink = finalStock.find((p) => p.assembledMaterialId === material.id)
    if (byLink) return byLink
    const viaBom = finalStock.find(
      (p) => Array.isArray(p.bom_per_piece) && p.bom_per_piece.some((row) => row.raw_material_id === material.id)
    )
    if (viaBom) return viaBom
    const baseName = (material.name || "").replace(/^Assembled\s+/i, "").trim()
    if (baseName) {
      const viaName = finalStock.find((p) => p.name === baseName)
      if (viaName) return viaName
    }
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

    const batch: Omit<Batch, "id"> = {
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

  const items = useMemo(() => {
    const enriched = assembledMaterials.map((m) => {
      const product = getProductForMaterial(m)
      const productThreshold = product?.assembledThreshold
      const threshold = (m.threshold && m.threshold > 0) ? m.threshold : (productThreshold ?? 0)
      const urgency = Number(m.quantity ?? 0) - Number(threshold ?? 0)
      return { material: m, threshold, urgency }
    })
    return enriched.sort((a, b) => a.urgency - b.urgency)
  }, [assembledMaterials, finalStock])

  const finalItems = useMemo(() => {
    if (!finalStock) return [] as Array<{ product: FinalStock; quantity: number; threshold: number; urgency: number }>
    const finalStage: ProcessingStageName = "Assembling"
    return finalStock
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
        return { product: p, quantity, threshold, urgency }
      })
      .sort((a, b) => a.urgency - b.urgency)
  }, [finalStock])

  const handleCreateBatch = async (material: RawMaterial) => {
    const product = getProductForMaterial(material)
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

    const batch: Omit<Batch, "id"> = {
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
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>System ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Quantity</TableHead>
                <TableHead>Min Threshold</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Create Batch</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map(({ material, threshold }) => (
                <TableRow key={material.id}>
                  <TableCell className="font-mono text-xs">{material.id}</TableCell>
                  <TableCell className="font-medium">{material.name}</TableCell>
                  <TableCell className="font-mono text-xs">{material.sku}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{material.quantity.toLocaleString()} {material.unit}</Badge>
                  </TableCell>
                  <TableCell>{threshold ?? 0}</TableCell>
                  <TableCell>{renderStatus(Number(material.quantity ?? 0), Number(threshold ?? 0))}</TableCell>
                  <TableCell>
                    <Button size="sm" onClick={() => handleCreateBatch(material)}>Create Batch</Button>
                  </TableCell>
                </TableRow>
              ))}
              {finalItems.map(({ product, quantity, threshold }) => (
                <TableRow key={`final-${product.id}`}>
                  <TableCell className="font-mono text-xs">{product.id}</TableCell>
                  <TableCell className="font-medium">{product.name}</TableCell>
                  <TableCell className="font-mono text-xs">{product.sku}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{Number(quantity).toLocaleString()} pcs</Badge>
                  </TableCell>
                  <TableCell>{threshold ?? 0}</TableCell>
                  <TableCell>{renderStatus(Number(quantity ?? 0), Number(threshold ?? 0))}</TableCell>
                  <TableCell>
                    <Button size="sm" onClick={() => handleCreateFinalBatch(product)}>Create Batch</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <BatchStageProcessor stage="Assembling" previousStage="Machining" />
    </>
  )
}
