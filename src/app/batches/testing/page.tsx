"use client"

import PageHeader from "@/components/page-header"
import { BatchStageProcessor } from "@/components/batch-stage-processor"
import { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { FinalStock, ProcessingStageName, RawMaterial } from "@/lib/types"
import { ChevronDown, ChevronUp, Search } from "lucide-react"
import { useRawMaterials } from "@/hooks/use-raw-materials"
import { useFinalStock } from "@/hooks/use-final-stock"
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
import { useActivityLog } from "@/hooks/use-activity-log"
import { formatNameWithId } from "@/lib/format-utils"

export default function TestingPage() {
  const { mouldedMaterials, finishedMaterials, assembledMaterials } = useRawMaterials()
  const { finalStock } = useFinalStock()
  const { toast } = useToast()
  const { createActivityLog } = useActivityLog()
  const [isClient, setIsClient] = useState(false)
  const [isItemsExpanded, setIsItemsExpanded] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [testQuantities, setTestQuantities] = useState<Record<string, string>>({})

  useEffect(() => setIsClient(true), [])

  const getProductForMaterial = (material: RawMaterial, type: "moulded" | "machined" | "assembled"): FinalStock | null => {
    if (!finalStock || finalStock.length === 0) return null
    let product: FinalStock | undefined
    if (type === "moulded") {
      product = finalStock.find((p) => p.mouldedMaterialId === material.id)
    } else if (type === "machined") {
      product = finalStock.find((p) => p.machinedMaterialId === material.id)
    } else {
      product = finalStock.find((p) => p.assembledMaterialId === material.id)
    }
    if (product) return product
    const viaBom = finalStock.find((p) => Array.isArray(p.bom_per_piece) && p.bom_per_piece.some((row) => row.raw_material_id === material.id))
    if (viaBom) return viaBom
    return null
  }

  const getNextStageAfter = (product: FinalStock, baseStage: ProcessingStageName): ProcessingStageName | null => {
    const stages = Array.isArray(product.manufacturingStages) ? product.manufacturingStages : []
    if (stages.length === 0) return null
    const idx = stages.indexOf(baseStage)
    if (idx >= 0 && idx < stages.length - 1) return stages[idx + 1]
    if (idx >= 0) return stages[idx]
    return stages[0]
  }

  const testingCandidates = useMemo(() => {
    const rows: Array<{ material: RawMaterial; type: "moulded" | "machined" | "assembled"; product: FinalStock; urgency: number }> = []
    mouldedMaterials.forEach((m) => {
      const product = getProductForMaterial(m, "moulded")
      if (!product) return
      const next = getNextStageAfter(product, "Molding")
      if (next === "Testing") {
        const productThreshold = product.mouldedThreshold
        const threshold = (m.threshold && m.threshold > 0) ? m.threshold : (productThreshold ?? 0)
        const urgency = Number(m.quantity ?? 0) - Number(threshold ?? 0)
        rows.push({ material: m, type: "moulded", product, urgency })
      }
    })
    finishedMaterials.forEach((m) => {
      const product = getProductForMaterial(m, "machined")
      if (!product) return
      const next = getNextStageAfter(product, "Machining")
      if (next === "Testing") {
        const productThreshold = product.machinedThreshold
        const threshold = (m.threshold && m.threshold > 0) ? m.threshold : (productThreshold ?? 0)
        const urgency = Number(m.quantity ?? 0) - Number(threshold ?? 0)
        rows.push({ material: m, type: "machined", product, urgency })
      }
    })
    assembledMaterials.forEach((m) => {
      const product = getProductForMaterial(m, "assembled")
      if (!product) return
      const next = getNextStageAfter(product, "Assembling")
      if (next === "Testing") {
        const productThreshold = product.assembledThreshold
        const threshold = (m.threshold && m.threshold > 0) ? m.threshold : (productThreshold ?? 0)
        const urgency = Number(m.quantity ?? 0) - Number(threshold ?? 0)
        rows.push({ material: m, type: "assembled", product, urgency })
      }
    })
    return rows.sort((a, b) => a.urgency - b.urgency)
  }, [mouldedMaterials, finishedMaterials, assembledMaterials, finalStock])

  const filteredCandidates = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return testingCandidates

    return testingCandidates.filter(({ material, product }) => {
      const systemId = (material.id || "").toLowerCase()
      const pid = (product.productId || product.id || "").toLowerCase()
      const sku = (material.sku || "").toLowerCase()
      const name = (product.name || material.name || "").toLowerCase()
      return (
        systemId.includes(query) ||
        pid.includes(query) ||
        sku.includes(query) ||
        name.includes(query)
      )
    })
  }, [testingCandidates, searchQuery])

  const displayThresholdFor = (material: RawMaterial, product: FinalStock, type: "moulded" | "machined" | "assembled") => {
    const productThreshold = type === "moulded" ? product.mouldedThreshold : type === "machined" ? product.machinedThreshold : product.assembledThreshold
    if (material.threshold && material.threshold > 0) return material.threshold
    return productThreshold ?? 0
  }

  const handleTest = async (material: RawMaterial, product: FinalStock, usedQuantity: number) => {
    const availableQty = Math.floor(Number(material.quantity) || 0)
    if (availableQty < 1) {
      toast({ variant: "destructive", title: "Insufficient Quantity", description: "Cannot create Testing batch. Item quantity must be at least 1." })
      return
    }
    if (!Number.isInteger(usedQuantity) || usedQuantity < 1 || usedQuantity > availableQty) {
      toast({
        variant: "destructive",
        title: "Invalid Used Quantity",
        description: `Enter a whole number between 1 and ${availableQty}.`,
      })
      return
    }
    try {
      const processingStages: Record<ProcessingStageName, any> = {
        Molding: { accepted: 0, rejected: 0, actualConsumption: 0, completed: false },
        Machining: { accepted: 0, rejected: 0, actualConsumption: 0, completed: false },
        Assembling: { accepted: 0, rejected: 0, actualConsumption: 0, completed: false },
        Testing: { accepted: 0, rejected: 0, actualConsumption: 0, completed: false },
      }
      const docId = await createBatch({
        productId: product.productId || product.id,
        productName: product.name,
        quantityToBuild: usedQuantity,
        totalMaterialQuantity: usedQuantity,
        materials: [
          { id: material.id, name: material.name, quantity: usedQuantity, unit: material.unit, stage: "Testing" },
        ],
        createdAt: new Date().toISOString(),
        status: "Planned",
        processingStages,
        selectedProcesses: ["Testing"],
      })
      await createActivityLog({
        recordId: docId,
        recordType: "Batch",
        action: "Created",
        details: `Testing batch created from store item ${material.name} for product ${product.name} with used quantity ${usedQuantity}`,
        timestamp: new Date().toISOString(),
        user: "System",
      })
      toast({ title: "Batch Created", description: `Batch ${docId} created for Testing with quantity ${usedQuantity}.` })
    } catch (e) {
      toast({ variant: "destructive", title: "Error", description: "Failed to create Testing batch." })
    }
  }

  if (!isClient) return null

  return (
    <>
      <PageHeader
        title="Testing Stage"
        description="Process batches in the testing stage. Log accepted and rejected units."
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
                <TableHead>Name</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Quantity</TableHead>
                <TableHead>Min Threshold</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right w-[100px]">Test</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCandidates.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center">No store items ready for Testing</TableCell>
                </TableRow>
              ) : (
                filteredCandidates.map(({ material, product, type }) => {
                  const threshold = displayThresholdFor(material, product, type)
                  const status = material.quantity <= threshold ? "Low Stock" : "In Stock"
                  const availableQty = Math.floor(Number(material.quantity) || 0)
                  const rawUsedQty = testQuantities[material.id] ?? ""
                  const usedQty = rawUsedQty === "" ? 1 : Number(rawUsedQty)
                  const isUsedQtyValid =
                    Number.isInteger(usedQty) && usedQty >= 1 && usedQty <= availableQty
                  return (
                    <TableRow key={material.id}>
                      <TableCell className="font-mono text-xs">{material.id}</TableCell>
                      <TableCell className="font-medium">{formatNameWithId(material.name, material.id)}</TableCell>
                      <TableCell className="font-mono text-xs">{material.sku}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{material.quantity.toLocaleString()} {material.unit}</Badge>
                      </TableCell>
                      <TableCell>{threshold}</TableCell>
                      <TableCell>
                        <Badge variant={status === "Low Stock" ? "destructive" : "secondary"}>{status}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              size="sm"
                              disabled={(Number(material.quantity) || 0) < 1}
                            >
                              Test
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Create testing batch?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Create a Testing batch from {formatNameWithId(material.name, material.id)} for product {product.name}. Enter how many units were used/changed for testing.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <div className="space-y-2">
                              <label className="text-sm font-medium" htmlFor={`used-qty-${material.id}`}>
                                Used Quantity
                              </label>
                              <Input
                                id={`used-qty-${material.id}`}
                                type="number"
                                min={1}
                                max={availableQty}
                                step={1}
                                value={rawUsedQty}
                                onChange={(e) =>
                                  setTestQuantities((prev) => ({
                                    ...prev,
                                    [material.id]: e.target.value,
                                  }))
                                }
                                placeholder="1"
                              />
                              <p className="text-xs text-muted-foreground">
                                Available: {availableQty.toLocaleString()} {material.unit}. Enter a whole number from 1 to {availableQty}.
                              </p>
                            </div>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                disabled={!isUsedQtyValid}
                                onClick={() => handleTest(material, product, usedQty)}
                              >
                                Confirm
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
          </CardContent>
        )}
      </Card>

      <BatchStageProcessor stage="Testing" previousStage="Assembling" />
    </>
  )
}
