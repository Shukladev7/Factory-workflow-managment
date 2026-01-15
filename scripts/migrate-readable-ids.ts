/**
 * scripts/migrate-readable-ids.ts
 *
 * Non-destructive Firestore migration to human-readable document IDs.
 * - Copies each document to a new doc with a readable ID (e.g., product_001)
 * - Updates cross-document references using an old→new mapping
 * - Optionally deletes old docs if APPLY_CHANGES=true && DELETE_OLD=true
 *
 * Usage (recommended dry run):
 *   SERVICE_ACCOUNT_PATH="/path/to/service-account.json" npx tsx scripts/migrate-readable-ids.ts
 *
 * Apply changes (create new docs):
 *   APPLY_CHANGES=true SERVICE_ACCOUNT_PATH="/path/to/service-account.json" npx tsx scripts/migrate-readable-ids.ts
 *
 * Apply and delete old docs (dangerous):
 *   APPLY_CHANGES=true DELETE_OLD=true SERVICE_ACCOUNT_PATH="/path/to/service-account.json" npx tsx scripts/migrate-readable-ids.ts
 */

import "dotenv/config";
import { initializeApp, cert, getApps, getApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";


const APPLY_CHANGES = process.env.APPLY_CHANGES === "true";
const DELETE_OLD = process.env.DELETE_OLD === "true";

function initAdmin() {
  if (admin.apps.length) return;

  if (
    !process.env.FIREBASE_PROJECT_ID ||
    !process.env.FIREBASE_CLIENT_EMAIL ||
    !process.env.FIREBASE_PRIVATE_KEY
  ) {
    console.error("Missing Firebase admin environment variables");
    process.exit(1);
  }

  const app = initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID!,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
      privateKey: process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, "\n"),
    }),
  });

  admin.initializeApp(app.options);
}


function pad(n: number, width = 3) {
  return String(n).padStart(width, "0");
}

function nextIdFor(prefix: string, existing: Set<string>) {
  let i = 1;
  while (existing.has(`${prefix}_${pad(i)}`)) i++;
  return `${prefix}_${pad(i)}`;
}

async function main() {
  initAdmin();
  const db = admin.firestore();

  const collections = {
    rawMaterials: { prefix: "material" },
    finalStock: { prefix: "product" },
    productGroups: { prefix: "group" },
    batches: { prefix: "batch" },
    orders: { prefix: "order" },
    restocks: { prefix: "restock" },
    activityLog: { prefix: "log" },
    // employees kept by UID
  } as const;

  // Load documents per collection
  const snapshots: Record<string, FirebaseFirestore.QuerySnapshot> = {};
  for (const name of Object.keys(collections)) {
    snapshots[name] = await db.collection(name).get();
  }

  // Build old→new id maps, skipping docs that already match the readable scheme
  const maps: Record<string, Record<string, string>> = {};
  for (const [name, cfg] of Object.entries(collections)) {
    const existingIds = new Set(snapshots[name].docs.map((d) => d.id));
    const map: Record<string, string> = {};
    for (const doc of snapshots[name].docs) {
      const id = doc.id;
      if (/^[a-z]+_\d{3,}$/.test(id)) continue; // already readable
      const newId = nextIdFor(cfg.prefix, existingIds);
      existingIds.add(newId);
      map[id] = newId;
    }
    maps[name] = map;
  }

  // Print mapping summary
  console.log("ID mappings (old → new):");
  for (const [name, map] of Object.entries(maps)) {
    const entries = Object.entries(map);
    if (entries.length === 0) {
      console.log(`- ${name}: no changes`);
      continue;
    }
    console.log(`- ${name}:`);
    for (const [oldId, newId] of entries) console.log(`  ${oldId} → ${newId}`);
  }

  if (!APPLY_CHANGES) {
    console.log("\nDry run complete. Set APPLY_CHANGES=true to perform migration.");
    return;
  }

  // Helpers to remap IDs in document data shapes
  const remapId = (id: any, map: Record<string, string>) => (typeof id === "string" && map[id]) || id;

  // Create new documents with transformed references
  for (const [name, cfg] of Object.entries(collections)) {
    const snap = snapshots[name];
    const map = maps[name];
    for (const doc of snap.docs) {
      const oldId = doc.id;
      const newId = map[oldId] || oldId; // keep same if already readable
      const data = doc.data();

      let transformed = { ...data } as any;

      if (name === "productGroups") {
        // productIds: string[] referencing finalStock ids
        if (Array.isArray(transformed.productIds)) {
          transformed.productIds = transformed.productIds.map((pid: string) => remapId(pid, maps.finalStock));
        }
        if (transformed.productQuantities) {
          const pq: Record<string, number> = {};
          for (const [pid, qty] of Object.entries(transformed.productQuantities)) {
            const mapped = remapId(pid, maps.finalStock);
            pq[mapped] = qty as number;
          }
          transformed.productQuantities = pq;
        }
      }

      if (name === "orders") {
        transformed.productId = remapId(transformed.productId, maps.finalStock);
      }

      if (name === "restocks") {
        transformed.productId = remapId(transformed.productId, maps.finalStock);
      }

      if (name === "batches") {
        // materials[].id can reference rawMaterials or finalStock
        if (Array.isArray(transformed.materials)) {
          transformed.materials = transformed.materials.map((m: any) => ({
            ...m,
            id: maps.rawMaterials[m.id] || maps.finalStock[m.id] || m.id,
          }));
        }
      }

      if (name === "finalStock") {
        if (typeof (transformed as any).mouldedMaterialId === "string") {
          (transformed as any).mouldedMaterialId =
            maps.rawMaterials[(transformed as any).mouldedMaterialId] ||
            (transformed as any).mouldedMaterialId;
        }

        if (typeof (transformed as any).machinedMaterialId === "string") {
          (transformed as any).machinedMaterialId =
            maps.rawMaterials[(transformed as any).machinedMaterialId] ||
            (transformed as any).machinedMaterialId;
        }

        if (typeof (transformed as any).assembledMaterialId === "string") {
          (transformed as any).assembledMaterialId =
            maps.rawMaterials[(transformed as any).assembledMaterialId] ||
            (transformed as any).assembledMaterialId;
        }

        if (Array.isArray((transformed as any).bom_per_piece)) {
          (transformed as any).bom_per_piece = (transformed as any).bom_per_piece.map(
            (row: any) => {
              const source = row.source as "raw" | "final" | undefined;
              const rawId = row.raw_material_id;

              let mappedId = rawId;
              if (typeof rawId === "string") {
                if (source === "final") {
                  mappedId = maps.finalStock[rawId] || rawId;
                } else {
                  mappedId =
                    maps.rawMaterials[rawId] ||
                    maps.finalStock[rawId] ||
                    rawId;
                }
              }

              return {
                ...row,
                raw_material_id: mappedId,
              };
            },
          );
        }
      }

      if (name === "activityLog") {
        // recordId depends on recordType
        const type = transformed.recordType as string;
        if (type === "RawMaterial") transformed.recordId = remapId(transformed.recordId, maps.rawMaterials);
        if (type === "FinalStock") transformed.recordId = remapId(transformed.recordId, maps.finalStock);
        if (type === "Batch") transformed.recordId = remapId(transformed.recordId, maps.batches);
      }

      // Write new doc
      if (newId !== oldId) {
        await db.collection(name).doc(newId).set(transformed, { merge: false });
        console.log(`[WRITE] ${name}/${newId}`);
        if (DELETE_OLD) {
          await db.collection(name).doc(oldId).delete();
          console.log(`[DELETE] ${name}/${oldId}`);
        }
      }
    }
  }

  console.log("\nMigration complete.");
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
