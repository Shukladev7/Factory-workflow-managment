/**
 * Migration script to backfill batchId for existing batches
 * 
 * This script ensures all existing batches have a batchId field set.
 * Priority: existing batchId > batchCode > id (Firestore document ID)
 * 
 * Run this script once to migrate existing data:
 * npx tsx scripts/migrate-batch-ids.ts
 */

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import * as path from "path";
import * as fs from "fs";

// Initialize Firebase Admin
function initAdmin() {
  if (getApps().length > 0) {
    return getFirestore();
  }

  const serviceAccountPath = path.join(process.cwd(), "serviceAccountKey.json");
  
  if (!fs.existsSync(serviceAccountPath)) {
    throw new Error(
      "serviceAccountKey.json not found. Please add your Firebase service account key."
    );
  }

  const serviceAccount = JSON.parse(
    fs.readFileSync(serviceAccountPath, "utf8")
  );

  initializeApp({
    credential: cert(serviceAccount),
  });

  return getFirestore();
}

async function main() {
  const db = initAdmin();
  const batchesRef = db.collection("batches");
  const snapshot = await batchesRef.get();

  console.log(`Found ${snapshot.size} batches to migrate...`);

  let updated = 0;
  let skipped = 0;

  for (const docSnap of snapshot.docs) {
    const data = docSnap.data();
    
    // Skip if batchId already exists
    if (data.batchId) {
      skipped++;
      continue;
    }

    // Determine batchId: use batchCode if available, otherwise use document ID
    const batchId = data.batchCode || docSnap.id;

    // Update the document with batchId
    await docSnap.ref.update({
      batchId: batchId,
    });

    console.log(`[UPDATE] ${docSnap.id} -> batchId: ${batchId}`);
    updated++;
  }

  console.log(`\nMigration complete:`);
  console.log(`  - Updated: ${updated}`);
  console.log(`  - Skipped (already had batchId): ${skipped}`);
  console.log(`  - Total: ${snapshot.size}`);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});

