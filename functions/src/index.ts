import { onRequest } from "firebase-functions/v2/https"
import { defineSecret } from "firebase-functions/params"
import type { Request, Response } from "express"
import twilio from "twilio"
import { getApps, initializeApp } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"
import { getAuth } from "firebase-admin/auth"
import { getStorage } from "firebase-admin/storage"

// ---- Secrets & constants ----
const TWILIO_ACCOUNT_SID = defineSecret("TWILIO_ACCOUNT_SID")
const TWILIO_AUTH_TOKEN = defineSecret("TWILIO_AUTH_TOKEN")

// For now, keep fixed WhatsApp endpoints as in testWhatsApp.
// You can later externalize these to params/secrets if needed.
const WHATSAPP_FROM = "whatsapp:+14155238886"
const WHATSAPP_TO = "whatsapp:+917024474517"

// ---- Firebase Admin initialization ----
if (!getApps().length) {
  initializeApp()
}

const db = getFirestore()
const storage = getStorage()

// ---- Types & helpers ----
type ProcessingStageName = "Molding" | "Machining" | "Assembling" | "Testing"

interface BatchMaterial {
  id: string
  name: string
  quantity: number
  unit: string
  stage: ProcessingStageName
}

interface ProcessingStage {
  accepted: number
  rejected: number
  actualConsumption: number
  completed: boolean
  startedAt?: string
  finishedAt?: string
  materialConsumptions?: Record<string, number>
}

interface BatchDoc {
  id: string
  batchId: string
  productName: string
  quantityToBuild: number
  createdAt: string
  status: string
  materials: BatchMaterial[]
  processingStages: Record<ProcessingStageName, ProcessingStage>
}

function calculateRawMaterialWastage(batch: BatchDoc): Record<string, number> {
  const wastage: Record<string, number> = {}

  for (const material of batch.materials || []) {
    const stage = material.stage
    const stageData = batch.processingStages?.[stage]

    if (!stageData) {
      wastage[material.name] = 0
      continue
    }

    const materialConsumptions = (stageData as any)
      ?.materialConsumptions as Record<string, number> | undefined

    let actualConsumption = 0

    if (materialConsumptions && materialConsumptions[material.id]) {
      actualConsumption = Number(materialConsumptions[material.id]) || 0
    } else {
      const materialsInStage = (batch.materials || []).filter(
        (m) => m.stage === stage,
      )
      const totalPlannedForStage = materialsInStage.reduce(
        (sum, m) => sum + Number(m.quantity || 0),
        0,
      )

      if (totalPlannedForStage > 0) {
        const materialRatio =
          Number(material.quantity || 0) / totalPlannedForStage
        actualConsumption =
          (Number(stageData.actualConsumption) || 0) * materialRatio
      } else {
        actualConsumption = Number(stageData.actualConsumption) || 0
      }
    }

    const accepted = Number(stageData?.accepted || 0)
    const qtyToBuild = Number(batch.quantityToBuild || 0)
    const bomPerPiece =
      qtyToBuild > 0 ? Number(material.quantity || 0) / qtyToBuild : 0
    const rawInput = accepted * bomPerPiece
    const wastageAmount = Math.max(0, actualConsumption - rawInput)
    wastage[material.name] = Math.round(wastageAmount * 100) / 100
  }

  return wastage
}

function formatRawMaterialWastage(wastage: Record<string, number>): string {
  const entriesRaw = Object.entries(wastage)
  if (entriesRaw.length === 0) return "-"

  const entries = entriesRaw
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, value]) => `${name}=${Number(value || 0).toFixed(2)}`)

  return entries.join(" | ")
}

async function getTodayBatches(): Promise<BatchDoc[]> {
  const now = new Date()
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  const end = new Date(now)
  end.setHours(23, 59, 59, 999)

  const batchesRef = db.collection("batches")
  const snapshot = await batchesRef
    .where("createdAt", ">=", start.toISOString())
    .where("createdAt", "<=", end.toISOString())
    .get()

  const result: BatchDoc[] = []
  snapshot.forEach((docSnap) => {
    const data = docSnap.data() as any
    result.push({
      id: docSnap.id,
      batchId: data.batchId ?? docSnap.id,
      productName: data.productName ?? "Unknown product",
      quantityToBuild: Number(data.quantityToBuild || 0),
      createdAt: data.createdAt ?? "",
      status: data.status ?? "",
      materials: (data.materials || []) as BatchMaterial[],
      processingStages: (data.processingStages || {}) as Record<
        ProcessingStageName,
        ProcessingStage
      >,
    })
  })

  return result
}

function buildDailyReportMessage(batches: BatchDoc[]): string {
  const today = new Date()
  const y = today.getFullYear()
  const m = String(today.getMonth() + 1).padStart(2, "0")
  const d = String(today.getDate()).padStart(2, "0")
  const dateLabel = `${y}-${m}-${d}`

  if (batches.length === 0) {
    return `
📦 StockPilot – Today’s Production Report (${dateLabel})

No batches were created today.`.trim()
  }

  const totalPlanned = batches.reduce(
    (sum, b) => sum + Number(b.quantityToBuild || 0),
    0,
  )

  const lines: string[] = []
  lines.push(
    `📦 StockPilot – Today’s Production Report (${dateLabel})`,
    "",
    `Total batches: ${batches.length}`,
    `Total planned units: ${totalPlanned}`,
    "",
  )

  const maxBatches = 20
  batches.slice(0, maxBatches).forEach((b, index) => {
    const wastage = calculateRawMaterialWastage(b)
    const wastageStr = formatRawMaterialWastage(wastage)

    lines.push(
      `${index + 1}) ${b.batchId} – ${b.productName}`,
      `   Qty: ${b.quantityToBuild} | Status: ${b.status || "N/A"}`,
      
      "",
    )
   if(b.status!="Planned") lines.push(` Wastage: ${wastageStr}`)
  })

  if (batches.length > maxBatches) {
    lines.push(`…and ${batches.length - maxBatches} more batches today.`)
  }

  return lines.join("\n").trim()
}





async function verifyFirebaseUser(req: Request) {
  const authHeader = req.headers["authorization"] || req.headers["Authorization"]
  if (!authHeader || typeof authHeader !== "string") {
    throw new Error("Missing Authorization header")
  }

  const [scheme, token] = authHeader.split(" ")
  if (scheme !== "Bearer" || !token) {
    throw new Error("Invalid Authorization header format")
  }

  const decoded = await getAuth().verifyIdToken(token)
  return decoded
}

export const testWhatsApp = onRequest(
  {
    region: "asia-south1",
    secrets: [TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN],
  },
  async (req: Request, res: Response) => {
    try {
      const client = twilio(
        TWILIO_ACCOUNT_SID.value(),
        TWILIO_AUTH_TOKEN.value(),
      )

      const message = await client.messages.create({
        from: WHATSAPP_FROM,
        to: WHATSAPP_TO,
        body: "✅ WhatsApp test – Firebase Functions v2 working!",
      })

      res.status(200).json({ sid: message.sid })
    } catch (err: any) {
      console.error(err)
      res.status(500).json({ error: err.message })
    }
  },
)

function aggregateWastageByMaterial(
  batches: BatchDoc[],
): { labels: string[]; data: number[] } {
  const totals: Record<string, number> = {}

  for (const batch of batches) {
    const wastage = calculateRawMaterialWastage(batch)

    for (const [material, value] of Object.entries(wastage)) {
      totals[material] = (totals[material] || 0) + Number(value || 0)
    }
  }

  const entries = Object.entries(totals)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]) // highest wastage first

  return {
    labels: entries.map(([name]) => name),
    data: entries.map(([, value]) => Number(value.toFixed(2))),
  }
}


export const sendDailyBatchReport = onRequest(
  {
    region: "asia-south1",
    secrets: [TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN],
  },
  async (req: Request, res: Response) => {
    const origin = (req.headers.origin as string) || "*"

    // Basic CORS headers so dashboard (localhost:3000) can call this function
    res.setHeader("Access-Control-Allow-Origin", origin)
    res.setHeader("Vary", "Origin")
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS")
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type")
    res.setHeader("Access-Control-Max-Age", "3600")

    // Handle preflight
    if (req.method === "OPTIONS") {
      res.status(204).send("")
      return
    }

    try {
      if (req.method !== "POST") {
        res.set("Allow", "POST")
        res.status(405).json({ error: "Method Not Allowed" })
        return
      }

      // Verify Firebase Auth token so only authenticated dashboard users can call this.
      await verifyFirebaseUser(req)

      const batches = await getTodayBatches()
      const body = buildDailyReportMessage(batches)

      // Try to build a PNG chart (batch vs total wastage) and upload to Storage.
      // If anything fails here, we fall back to sending a text-only WhatsApp message.
      let mediaUrl: string | undefined
      try {
        // Aggregate total wastage per batch
       const { labels, data } = aggregateWastageByMaterial(batches)

if (labels.length > 0) {
  const today = new Date()
  const y = today.getFullYear()
  const m = String(today.getMonth() + 1).padStart(2, "0")
  const d = String(today.getDate()).padStart(2, "0")
  const dateLabel = `${y}-${m}-${d}`

  const chartConfig = {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Raw Material Wastage",
          data,
          backgroundColor: "rgba(220, 38, 38, 0.85)", // red = wastage
        },
      ],
    },
    options: {
      plugins: {
        title: {
          display: true,
          text: `Raw Material Wastage – ${dateLabel}`,
        },
        legend: { display: false },
      },
      scales: {
        y: {
          beginAtZero: true,
          title: { display: true, text: "Wastage (units)" },
        },
        x: {
          ticks: {
            autoSkip: false,
            maxRotation: 45,
            minRotation: 30,
          },
        },
      },
    },
  }

  const payload = {
    width: 900,
    height: 450,
    format: "png",
    backgroundColor: "white",
    chart: chartConfig,
  }

  const response = await fetch("https://quickchart.io/chart", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    throw new Error(`Chart render failed: ${response.status}`)
  }

  const arrayBuffer = await response.arrayBuffer()

  const bucket = storage.bucket()
  const filePath = `reports/raw-material-wastage-${dateLabel}-${Date.now()}.png`
  const file = bucket.file(filePath)

  await file.save(Buffer.from(arrayBuffer), {
    contentType: "image/png",
    resumable: false,
  })

  const [url] = await file.getSignedUrl({
    action: "read",
    expires: Date.now() + 60 * 60 * 1000,
  })

  mediaUrl = url
}

      } catch (chartError) {
        console.error("[sendDailyBatchReport] Failed to build PNG chart", chartError)
        mediaUrl = undefined
      }

      const client = twilio(
        TWILIO_ACCOUNT_SID.value(),
        TWILIO_AUTH_TOKEN.value(),
      )

      const messagePayload: any = {
        from: WHATSAPP_FROM,
        to: WHATSAPP_TO,
        body,
      }

      if (mediaUrl) {
        messagePayload.mediaUrl = [mediaUrl]
      }

      const message = await client.messages.create(messagePayload)

      res.status(200).json({
        ok: true,
        sid: message.sid,
        mediaUrl: mediaUrl ?? null,
        batchCount: batches.length,
      })
      return
    } catch (err: any) {
      console.error("[sendDailyBatchReport] Error:", err)
      const msg = err?.message || String(err)
      const status = msg.includes("Authorization") ? 401 : 500
      res.status(status).json({ error: msg })
      return
    }
  },
)
