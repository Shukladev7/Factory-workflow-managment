import { db } from "./firebase/config";
import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  onSnapshot,
  orderBy,
  type Unsubscribe,
} from "firebase/firestore";
import type { Batch, ProcessingStageName, BatchStatus } from "./types";
import { generateReadableId } from "./id";

// Collection reference
const BATCHES_COLLECTION = "batches";

function getStageCode(stage: ProcessingStageName): string {
  switch (stage) {
    case "Molding":
      return "MLD";
    case "Machining":
      return "MCH";
    case "Assembling":
      return "ASM";
    case "Testing":
      return "TST";
    default:
      return "GEN";
  }
}

async function generateBatchCode(stage: ProcessingStageName, isFailedTesting?: boolean): Promise<string> {
  const batchesRef = collection(db, BATCHES_COLLECTION);
  
  // Use FT- prefix for auto-created assembly batches from testing rejects
  const prefix = isFailedTesting ? "FT-" : `BATCH-${getStageCode(stage)}-`;

  // Find all batches that already have a batchCode with this prefix
  const snapshot = await getDocs(batchesRef);

  let maxSeq = 0;
  snapshot.forEach((docSnap) => {
    const data: any = docSnap.data();
    const code: string | undefined = data.batchCode;
    if (code && code.startsWith(prefix)) {
      const tail = code.substring(prefix.length);
      const num = parseInt(tail, 10);
      if (!Number.isNaN(num) && num > maxSeq) {
        maxSeq = num;
      }
    }
  });

  const next = maxSeq + 1;
  const seq = String(next).padStart(3, "0");
  return `${prefix}${seq}`;
}

/**
 * Get all batches from Firestore
 */
export async function getAllBatches(): Promise<Batch[]> {
  const batchesRef = collection(db, BATCHES_COLLECTION);
  const snapshot = await getDocs(batchesRef);
  return snapshot.docs.map((doc) => {
    const data = doc.data() as any;
    // Ensure batchId exists for backward compatibility
    // If batchId is missing, use batchCode or id
    const batchId = data.batchId || data.batchCode || doc.id;
    return {
      id: doc.id,
      ...data,
      batchId: data.batchId || batchId, // Set batchId if missing
    } as Batch;
  });
}

/**
 * Get a single batch by ID
 */
export async function getBatchById(id: string): Promise<Batch | null> {
  const batchRef = doc(db, BATCHES_COLLECTION, id);
  const snapshot = await getDoc(batchRef);
  if (!snapshot.exists()) return null;
  const data = snapshot.data() as any;
  // Ensure batchId exists for backward compatibility
  const batchId = data.batchId || data.batchCode || snapshot.id;
  return { 
    id: snapshot.id, 
    ...data,
    batchId: data.batchId || batchId, // Set batchId if missing
  } as Batch;
}

/**
 * Get batches for a specific stage
 * A batch appears on a stage if:
 * 1. The stage is in the batch's selectedProcesses
 * 2. The previous stage (if any) is completed OR it's the first stage
 * 3. The current stage is not yet completed
 */
export async function getBatchesForStage(
  stage: ProcessingStageName,
): Promise<Batch[]> {
  const allBatches = await getAllBatches();
  // getAllBatches already ensures batchId is set, so we can use it directly

  return allBatches.filter((batch) => {
    // Check if this stage is in the selected processes
    if (!batch.selectedProcesses.includes(stage)) {
      return false;
    }

    // Check if current stage is already completed
    if (batch.processingStages[stage]?.completed) {
      return false;
    }

    // Find the index of current stage in the selected processes
    const currentStageIndex = batch.selectedProcesses.indexOf(stage);

    // If it's the first stage, show it
    if (currentStageIndex === 0) {
      return true;
    }

    // Check if previous stage is completed
    const previousStage = batch.selectedProcesses[currentStageIndex - 1];
    const previousStageCompleted = batch.processingStages[previousStage]?.completed === true;
    
    // Prevent automatic progression from Assembling to Testing
    if (stage === "Testing" && previousStage === "Assembling" && previousStageCompleted) {
      // Only show in Testing if the Testing stage has been explicitly started
      return batch.processingStages[stage]?.startedAt !== undefined;
    }
    
    return previousStageCompleted;
  });
}

/**
 * Subscribe to real-time updates for batches at a specific stage
 */
export function subscribeToBatchesForStage(
  stage: ProcessingStageName,
  callback: (batches: Batch[]) => void,
): Unsubscribe {
  const batchesRef = collection(db, BATCHES_COLLECTION);
  const q = query(batchesRef, orderBy("createdAt", "desc"));

  return onSnapshot(q, (snapshot) => {
    console.log(
      "[v0] Raw snapshot docs:",
      snapshot.docs.map((doc) => doc.id),
    );

    const allBatches = snapshot.docs.map((doc) => {
      const data = doc.data() as any;
      // Ensure batchId exists for backward compatibility
      const batchId = data.batchId || data.batchCode || doc.id;
      return {
        id: doc.id,
        ...data,
        batchId: data.batchId || batchId, // Set batchId if missing
      } as Batch;
    });

    console.log("[v0] All batches from Firestore:", allBatches.length);
    console.log(
      "[v0] Batch IDs:",
      allBatches.map((b) => b.id),
    );

    // Filter batches for this stage
    const filteredBatches = allBatches.filter((batch) => {
      // Check if this stage is in the selected processes
      if (!batch.selectedProcesses?.includes(stage)) {
        return false;
      }

      // Check if current stage is already completed
      if (batch.processingStages?.[stage]?.completed) {
        return false;
      }

      // Find the index of current stage in the selected processes
      const currentStageIndex = batch.selectedProcesses.indexOf(stage);

      // If it's the first stage, show it
      if (currentStageIndex === 0) {
        return true;
      }

      // Check if previous stage is completed
      const previousStage = batch.selectedProcesses[currentStageIndex - 1];
      const previousStageCompleted = batch.processingStages?.[previousStage]?.completed === true;
      
      // Prevent automatic progression from Assembling to Testing
      if (stage === "Testing" && previousStage === "Assembling" && previousStageCompleted) {
        // Only show in Testing if the Testing stage has been explicitly started
        return batch.processingStages?.[stage]?.startedAt !== undefined;
      }
      
      return previousStageCompleted;
    });

    console.log(
      "[v0] Filtered batches for",
      stage,
      ":",
      filteredBatches.length,
    );
    callback(filteredBatches);
  });
}

/**
 * Subscribe to all batches (for overview page)
 */
export function subscribeToAllBatches(
  callback: (batches: Batch[]) => void,
): Unsubscribe {
  const batchesRef = collection(db, BATCHES_COLLECTION);
  const q = query(batchesRef, orderBy("createdAt", "desc"));

  return onSnapshot(q, (snapshot) => {
    const batches = snapshot.docs.map((doc) => {
      const data = doc.data() as any;
      // Ensure batchId exists for backward compatibility
      const batchId = data.batchId || data.batchCode || doc.id;
      return {
        id: doc.id,
        ...data,
        batchId: data.batchId || batchId, // Set batchId if missing
      } as Batch;
    });
    callback(batches);
  });
}

/**
 * Create a new batch
 */
export async function createBatch(batch: Omit<Batch, "id" | "batchId">): Promise<string> {
  const batchesRef = collection(db, BATCHES_COLLECTION);
  const primaryStage: ProcessingStageName | undefined =
    Array.isArray(batch.selectedProcesses) && batch.selectedProcesses.length > 0
      ? batch.selectedProcesses[0]
      : undefined;

  let batchCode: string | undefined;
  if (primaryStage) {
    try {
      // Use FT- prefix for auto-created assembly batches from testing rejects
      const isFailedTesting = batch.autoCreatedFromTestingRejected === true && primaryStage === "Assembling";
      batchCode = await generateBatchCode(primaryStage, isFailedTesting);
    } catch (e) {
      // Fallback: do not block creation if code generation fails
      batchCode = undefined;
    }
  }

  // Validate that a productId (PID) is present and refers to an existing Final Stock product.
  // Batch.productId is treated as the external Product ID (FinalStock.productId),
  // with a fallback to the Firestore document ID for backwards compatibility.
  const requestedProductId = (batch as any).productId as string | undefined;

  if (!requestedProductId || requestedProductId.trim() === "") {
    throw new Error("[createBatch] productId (PID) is required to create a batch.");
  }

  let matchedProductDocId: string | null = null;

  // 1) Try to resolve by external PID stored in FinalStock.productId
  const finalStockRef = collection(db, "finalStock");
  const pidQuery = query(finalStockRef, where("productId", "==", requestedProductId));
  const pidSnapshot = await getDocs(pidQuery);

  if (!pidSnapshot.empty) {
    if (pidSnapshot.docs.length > 1) {
      console.warn(
        `[createBatch] Multiple FinalStock documents share PID ${requestedProductId}; using first: ${pidSnapshot.docs[0].id}`,
      );
    }
    matchedProductDocId = pidSnapshot.docs[0].id;
  } else {
    // 2) Fallback: treat requestedProductId as a Firestore document ID (legacy batches / callers)
    const productRef = doc(db, "finalStock", requestedProductId);
    const productSnapshot = await getDoc(productRef);

    if (productSnapshot.exists()) {
      matchedProductDocId = productSnapshot.id;
    }
  }

  if (!matchedProductDocId) {
    throw new Error(
      `[createBatch] Cannot create batch: no FinalStock product found for PID or ID "${requestedProductId}".`,
    );
  }

  const id = await generateReadableId(BATCHES_COLLECTION, "batch");
  const docRef = doc(db, BATCHES_COLLECTION, id);
  
  // Generate immutable batchId - single source of truth
  // Use batchCode if available (human-readable), otherwise use Firestore document ID
  const immutableBatchId = batchCode || id;
  
  const { id: _ignored, ...batchData } = batch as any;
  await setDoc(docRef, {
    ...batchData,
    id,
    batchId: immutableBatchId, // Set once at creation, never modified
    batchCode, // Keep for backward compatibility
    createdAt: batch.createdAt || new Date().toISOString(),
  });
  return id;
}

/**
 * Update a batch
 */
export async function updateBatch(
  id: string,
  updates: Partial<Batch>,
): Promise<void> {
  const batchRef = doc(db, BATCHES_COLLECTION, id);

  // Remove undefined values to avoid Firebase errors
  // Also remove batchId to prevent modification (it's immutable)
  const cleanUpdates = Object.entries(updates).reduce(
    (acc, [key, value]) => {
      if (value !== undefined && key !== "batchId") {
        acc[key] = value;
      }
      return acc;
    },
    {} as Record<string, any>,
  );

  await updateDoc(batchRef, cleanUpdates);
}

/**
 * Update stage data for a batch
 */
export async function updateBatchStage(
  id: string,
  stage: ProcessingStageName,
  stageData: {
    accepted?: number
    rejected?: number
    actualConsumption?: number
    completed?: boolean
    startedAt?: string
    finishedAt?: string
    materialConsumptions?: Record<string, number>
  },
): Promise<void> {
  console.log("[v0] updateBatchStage called with ID:", id, "stage:", stage);

  // First try to find by document ID
  let batchRef = doc(db, BATCHES_COLLECTION, id);
  let docSnapshot = await getDoc(batchRef);

  // If not found, try to find by batch ID field
  if (!docSnapshot.exists()) {
    console.log(
      "[v0] Document not found by ID, searching by batch ID field...",
    );
    const batchesRef = collection(db, BATCHES_COLLECTION);
    const q = query(batchesRef, where("id", "==", id));
    const querySnapshot = await getDocs(q);

    if (!querySnapshot.empty) {
      const doc = querySnapshot.docs[0];
      batchRef = doc.ref;
      docSnapshot = await getDoc(batchRef);
      console.log("[v0] Found batch by ID field:", doc.id);
    }
  }

  console.log("[v0] Document exists:", docSnapshot.exists());
  console.log("[v0] Document data:", docSnapshot.data());

  if (!docSnapshot.exists()) {
    throw new Error(`Batch ${id} not found`);
  }

  const updates: Record<string, any> = {};
  Object.entries(stageData).forEach(([key, value]) => {
    if (value !== undefined) {
      if (key === "materialConsumptions") {
        // Store materialConsumptions as a nested object
        updates[`processingStages.${stage}.materialConsumptions`] = value;
      } else {
        updates[`processingStages.${stage}.${key}`] = value;
      }
    }
  });

  console.log("[v0] Updating with:", updates);
  await updateDoc(batchRef, updates);
}

/**
 * Mark a stage as completed and move to next stage
 */
export async function completeStage(
  id: string,
  stage: ProcessingStageName,
): Promise<void> {
  console.log("[v0] completeStage called with ID:", id, "stage:", stage);

  // First try to find by document ID
  let batchRef = doc(db, BATCHES_COLLECTION, id);
  let docSnapshot = await getDoc(batchRef);
  let batch = docSnapshot.exists()
    ? ({ id: docSnapshot.id, ...docSnapshot.data() } as Batch)
    : null;

  // If not found, try to find by batch ID field
  if (!batch) {
    console.log(
      "[v0] Document not found by ID, searching by batch ID field...",
    );
    const batchesRef = collection(db, BATCHES_COLLECTION);
    const q = query(batchesRef, where("id", "==", id));
    const querySnapshot = await getDocs(q);

    if (!querySnapshot.empty) {
      const doc = querySnapshot.docs[0];
      batchRef = doc.ref;
      batch = { id: doc.id, ...doc.data() } as Batch;
      console.log("[v0] Found batch by ID field:", doc.id);
    }
  }

  console.log("[v0] completeStage found batch:", batch);

  if (!batch) {
    throw new Error(`Batch ${id} not found`);
  }

  const now = new Date().toISOString();

  // Mark current stage as completed
  const updates: Record<string, any> = {
    [`processingStages.${stage}.completed`]: true,
    [`processingStages.${stage}.finishedAt`]: now,
  };

  // Check if this is the last stage
  const currentStageIndex = batch.selectedProcesses.indexOf(stage);
  const isLastStage = currentStageIndex === batch.selectedProcesses.length - 1;

  // Update batch status
  if (isLastStage) {
    updates.status = "Completed";
  } else {
    updates.status = "In Progress";

    // Start the next stage, but skip automatic progression from Assembling to Testing
    const nextStage = batch.selectedProcesses[currentStageIndex + 1];
    if (stage === "Assembling" && nextStage === "Testing") {
      // Don't automatically start Testing stage after Assembly completes
      // Batches will need to be manually moved to Testing
    } else {
      updates[`processingStages.${nextStage}.startedAt`] = now;
    }
  }

  console.log("[v0] Completing stage with updates:", updates);
  await updateDoc(batchRef, updates);
}

/**
 * Start a stage (mark as in progress)
 */
export async function startStage(
  id: string,
  stage: ProcessingStageName,
): Promise<void> {
  const batchRef = doc(db, BATCHES_COLLECTION, id);
  const now = new Date().toISOString();

  console.log("[v0] Starting stage:", stage, "for batch:", id);

  await updateDoc(batchRef, {
    [`processingStages.${stage}.startedAt`]: now,
    status: "In Progress",
  });
}

/**
 * Delete a batch
 */
export async function deleteBatch(id: string): Promise<void> {
  console.log("[v0] deleteBatch called with ID:", id);

  // First try to find by document ID
  let batchRef = doc(db, BATCHES_COLLECTION, id);
  let docSnapshot = await getDoc(batchRef);

  // If not found, try to find by batch ID field
  if (!docSnapshot.exists()) {
    console.log(
      "[v0] Document not found by ID, searching by batch ID field...",
    );
    const batchesRef = collection(db, BATCHES_COLLECTION);
    const q = query(batchesRef, where("id", "==", id));
    const querySnapshot = await getDocs(q);

    if (!querySnapshot.empty) {
      const doc = querySnapshot.docs[0];
      batchRef = doc.ref;
      console.log("[v0] Found batch by ID field:", doc.id);
    }
  }

  console.log("[v0] Deleting document:", batchRef.id);
  await deleteDoc(batchRef);
}

/**
 * Get batches by status
 */
export async function getBatchesByStatus(
  status: BatchStatus,
): Promise<Batch[]> {
  const batchesRef = collection(db, BATCHES_COLLECTION);
  const q = query(batchesRef, where("status", "==", status));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as Batch[];
}

/**
 * Debug function to check database connection and data
 */
export async function debugDatabase(): Promise<void> {
  try {
    console.log("[DEBUG] Checking database connection...");
    const batchesRef = collection(db, BATCHES_COLLECTION);
    const snapshot = await getDocs(batchesRef);
    console.log(
      "[DEBUG] Total documents in batches collection:",
      snapshot.size,
    );
    snapshot.docs.forEach((doc) => {
      console.log("[DEBUG] Document ID:", doc.id, "Data:", doc.data());
    });
  } catch (error) {
    console.error("[DEBUG] Database error:", error);
  }
}
