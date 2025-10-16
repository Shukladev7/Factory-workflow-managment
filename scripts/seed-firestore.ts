import { initializeApp, cert } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"
import {
  initialBatchLogs,
  initialRawMaterials,
  initialFinalStock,
  initialEmployees,
  initialUnits,
} from "../src/lib/data"

// Initialize Firebase Admin
const app = initializeApp({
  credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID!,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n")!,
  }),
})

const db = getFirestore(app)

async function seedFirestore() {
  console.log("Starting Firestore seeding...")

  try {
    // Seed batches
    console.log("Seeding batches...")
    for (const batch of initialBatchLogs) {
      await db.collection("batches").doc(batch.id).set(batch)
    }
    console.log(`✓ Seeded ${initialBatchLogs.length} batches`)

    // Seed raw materials
    console.log("Seeding raw materials...")
    for (const material of initialRawMaterials) {
      await db.collection("rawMaterials").doc(material.id).set(material)
    }
    console.log(`✓ Seeded ${initialRawMaterials.length} raw materials`)

    // Seed final stock
    console.log("Seeding final stock...")
    for (const product of initialFinalStock) {
      await db.collection("finalStock").doc(product.id).set(product)
    }
    console.log(`✓ Seeded ${initialFinalStock.length} final stock items`)

    // Seed employees
    console.log("Seeding employees...")
    for (const employee of initialEmployees) {
      await db.collection("employees").doc(employee.id).set(employee)
    }
    console.log(`✓ Seeded ${initialEmployees.length} employees`)

    // Seed units of measure
    console.log("Seeding units of measure...")
    for (const unit of initialUnits) {
      await db.collection("unitsOfMeasure").doc(unit.id).set(unit)
    }
    console.log(`✓ Seeded ${initialUnits.length} units of measure`)

    // Activity log is empty initially
    console.log("Activity log initialized (empty)")

    console.log("\n✅ Firestore seeding completed successfully!")
  } catch (error) {
    console.error("❌ Error seeding Firestore:", error)
    throw error
  }
}

seedFirestore()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
