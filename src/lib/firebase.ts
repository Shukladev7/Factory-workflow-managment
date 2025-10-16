import { db } from "./firebase/config";
import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  onSnapshot,
  orderBy,
  type Unsubscribe,
} from "firebase/firestore";
import type { Batch, ProcessingStageName, BatchStatus } from "./types";

// Collection reference
const BATCHES_COLLECTION = "batches";

/**
 * Get all batches from Firestore
 */
export async function getAllBatches(): Promise<Batch[]> {
  const batchesRef = collection(db, BATCHES_COLLECTION);
  const snapshot = await getDocs(batchesRef);
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as Batch[];
}

/**
 * Get a single batch by ID
 */
export async function getBatchById(id: string): Promise<Batch | null> {
  const batchRef = doc(db, BATCHES_COLLECTION, id);
  const snapshot = await getDoc(batchRef);
  if (!snapshot.exists()) return null;
  return { id: snapshot.id, ...snapshot.data() } as Batch;
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
    return batch.processingStages[previousStage]?.completed === true;
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

    const allBatches = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as Batch[];

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
      return batch.processingStages?.[previousStage]?.completed === true;
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
    const batches = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as Batch[];
    callback(batches);
  });
}

/**
 * Create a new batch
 */
export async function createBatch(batch: Omit<Batch, "id">): Promise<string> {
  const batchesRef = collection(db, BATCHES_COLLECTION);
  const docRef = await addDoc(batchesRef, {
    ...batch,
    createdAt: batch.createdAt || new Date().toISOString(),
  });
  return docRef.id;
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
  const cleanUpdates = Object.entries(updates).reduce(
    (acc, [key, value]) => {
      if (value !== undefined) {
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
      updates[`processingStages.${stage}.${key}`] = value;
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

    // Start the next stage
    const nextStage = batch.selectedProcesses[currentStageIndex + 1];
    updates[`processingStages.${nextStage}.startedAt`] = now;
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
