"use client";

import { useEffect, useState } from "react";
import {
  collection,
  onSnapshot,
  query,
  type QueryConstraint,
} from "firebase/firestore";
import { db } from "@/lib/firebase/config";

export function useFirestoreCollection<T>(
  collectionName: string,
  ...queryConstraints: QueryConstraint[]
) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    const collectionRef = collection(db, collectionName);
    const q =
      queryConstraints.length > 0
        ? query(collectionRef, ...queryConstraints)
        : collectionRef;

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const items = snapshot.docs.map((doc) => {
          // Spread doc.data() first, then overwrite id with Firestore doc.id
          // This ensures Firestore document ID is always used, even if data has an id field
          const data = doc.data();
          return {
            ...data,
            id: doc.id, // Firestore document ID (always correct)
          };
        }) as T[];

        console.log(
          `[useFirestoreCollection] Loaded ${items.length} items from ${collectionName}`,
        );
        setData(items);
        setLoading(false);
      },
      (err) => {
        console.error(`Error fetching ${collectionName}:`, err);
        setError(err as Error);
        setLoading(false);
      },
    );

    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collectionName]);

  return { data, loading, error };
}
