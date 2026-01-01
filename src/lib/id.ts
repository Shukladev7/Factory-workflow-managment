import { collection, getDocs } from "firebase/firestore";
import { db } from "./firebase/config";

/**
 * Generate a short, human-readable, sequential ID for a Firestore collection.
 * Example: prefix "batch" -> batch_001, batch_002, ...
 * - Ensures consistency and readability
 * - Scans existing doc IDs with the same prefix to find the next sequence
 * - Pads sequence to `pad` digits (default 3)
 */
export async function generateReadableId(
  collectionName: string,
  prefix: string,
  pad: number = 3,
): Promise<string> {
  const colRef = collection(db, collectionName);
  const snapshot = await getDocs(colRef);

  let maxSeq = 0;
  const prefixWithUnderscore = `${prefix}_`;

  snapshot.forEach((docSnap) => {
    const id = docSnap.id;
    if (id.startsWith(prefixWithUnderscore)) {
      const tail = id.substring(prefixWithUnderscore.length);
      const num = parseInt(tail, 10);
      if (!Number.isNaN(num) && num > maxSeq) {
        maxSeq = num;
      }
    }
  });

  const next = maxSeq + 1;
  const seq = String(next).padStart(pad, "0");
  return `${prefixWithUnderscore}${seq}`;
}
