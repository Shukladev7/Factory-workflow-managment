import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  getDocs,
  getDoc,
  arrayUnion,
  setDoc,
} from "firebase/firestore";
import { db } from "./config";
import type {
  Batch,
  RawMaterial,
  FinalStock,
  ActivityLog,
  Employee,
  UnitOfMeasure,
} from "@/lib/types";

// Collection names
export const COLLECTIONS = {
  BATCHES: "batches",
  RAW_MATERIALS: "rawMaterials",
  FINAL_STOCK: "finalStock",
  ACTIVITY_LOG: "activityLog",
  EMPLOYEES: "employees",
  UNITS: "unitsOfMeasure",
} as const;

// Batch operations
export async function addBatch(batch: Omit<Batch, "id">) {
  const batchesRef = collection(db, COLLECTIONS.BATCHES);
  const docRef = await addDoc(batchesRef, {
    ...batch,
    createdAt: batch.createdAt || new Date().toISOString(),
  });
  return docRef.id;
}

export async function updateBatch(id: string, updates: Partial<Batch>) {
  const batchRef = doc(db, COLLECTIONS.BATCHES, id);
  await updateDoc(batchRef, updates);
}

export async function deleteBatch(id: string) {
  const batchRef = doc(db, COLLECTIONS.BATCHES, id);
  await deleteDoc(batchRef);
}

// Raw Material operations
export async function addRawMaterial(material: Omit<RawMaterial, "id">) {
  const materialsRef = collection(db, COLLECTIONS.RAW_MATERIALS);
  const docRef = await addDoc(materialsRef, material);
  return docRef.id;
}

export async function updateRawMaterial(
  id: string,
  updates: Partial<RawMaterial>,
) {
  const materialRef = doc(db, COLLECTIONS.RAW_MATERIALS, id);
  await updateDoc(materialRef, updates);
}

export async function deleteRawMaterial(id: string) {
  const materialRef = doc(db, COLLECTIONS.RAW_MATERIALS, id);
  await deleteDoc(materialRef);
}

// Get moulded materials (from Store)
export async function getMouldedMaterials(): Promise<RawMaterial[]> {
  const materialsRef = collection(db, COLLECTIONS.RAW_MATERIALS);
  const q = query(materialsRef, where("isMoulded", "==", true));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as RawMaterial[];
}

// Get finished materials (from Store)
export async function getFinishedMaterials(): Promise<RawMaterial[]> {
  const materialsRef = collection(db, COLLECTIONS.RAW_MATERIALS);
  const q = query(materialsRef, where("isFinished", "==", true));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as RawMaterial[];
}

// Get regular (non-moulded, non-finished) raw materials
export async function getRegularRawMaterials(): Promise<RawMaterial[]> {
  const materialsRef = collection(db, COLLECTIONS.RAW_MATERIALS);
  const q = query(materialsRef, where("isMoulded", "!=", true));
  const snapshot = await getDocs(q);
  // Filter out finished materials as well
  const materials = snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as RawMaterial[];
  return materials.filter((m) => !m.isFinished);
}

// Final Stock operations
export async function addFinalStock(product: Omit<FinalStock, "id">) {
  const stockRef = collection(db, COLLECTIONS.FINAL_STOCK);

  // Ensure id field is never saved to Firestore (only document ID matters)
  const { id, ...productData } = product as any;

  if (id !== undefined) {
    console.warn(
      "[addFinalStock] Removed id field from product data:",
      id,
      "Product:",
      productData.name,
    );
  }

  const docRef = await addDoc(stockRef, productData);
  console.log(
    "[addFinalStock] Created product:",
    productData.name,
    "with Firestore ID:",
    docRef.id,
  );
  return docRef.id;
}

export async function updateFinalStock(
  id: string,
  updates: Partial<FinalStock>,
) {
  const stockRef = doc(db, COLLECTIONS.FINAL_STOCK, id);
  await updateDoc(stockRef, updates);
}

export async function deleteFinalStock(id: string) {
  const stockRef = doc(db, COLLECTIONS.FINAL_STOCK, id);
  await deleteDoc(stockRef);
}

export async function getProductByName(
  productName: string,
): Promise<FinalStock | null> {
  const stockRef = collection(db, COLLECTIONS.FINAL_STOCK);
  const q = query(stockRef, where("name", "==", productName));
  const snapshot = await getDocs(q);

  if (snapshot.empty) {
    return null;
  }

  const doc = snapshot.docs[0];
  return {
    id: doc.id,
    ...doc.data(),
  } as FinalStock;
}

export async function getOrCreateProduct(
  productName: string,
  productData?: Partial<FinalStock>,
): Promise<FinalStock> {
  // First, try to get existing product
  const existingProduct = await getProductByName(productName);

  if (existingProduct) {
    console.log(
      `[getOrCreateProduct] Found existing product: ${existingProduct.id} for "${productName}"`,
    );
    return existingProduct;
  }

  console.log(`[getOrCreateProduct] Creating new product: "${productName}"`);

  // Product doesn't exist, create it
  const newProduct: Omit<FinalStock, "id"> = {
    name: productName,
    sku: productData?.sku || `PROD-${Date.now()}`,
    price: productData?.price || 0,
    gstRate: productData?.gstRate || 0,
    imageUrl: productData?.imageUrl || "/placeholder.svg?height=100&width=100",
    imageHint: productData?.imageHint || productName,
    batches: productData?.batches || [],
    createdAt: new Date().toISOString(),
  };

  const productId = await addFinalStock(newProduct);
  console.log(`[getOrCreateProduct] Created product with ID: ${productId}`);

  // Verify the document was created by fetching it back
  const createdProduct = await getProductByName(productName);

  if (createdProduct) {
    console.log(
      `[getOrCreateProduct] Verified product exists: ${createdProduct.id}`,
    );
    return createdProduct;
  }

  // Fallback: return constructed product (should rarely happen)
  console.warn(
    `[getOrCreateProduct] Could not verify product, returning constructed object`,
  );
  return {
    id: productId,
    ...newProduct,
  };
}

export async function addBatchToProduct(
  productId: string,
  batch: {
    batchId: string;
    sourceBatchId: string;
    quantity: number;
    sku: string;
    createdAt: string;
  },
) {
  console.log(
    `[addBatchToProduct] Adding batch ${batch.batchId} to product ${productId}`,
  );

  const stockRef = doc(db, COLLECTIONS.FINAL_STOCK, productId);

  // First verify the document exists
  const docSnapshot = await getDoc(stockRef);

  if (!docSnapshot.exists()) {
    console.error(
      `[addBatchToProduct] Document ${productId} does not exist in Firestore!`,
    );
    throw new Error(
      `Cannot add batch to product ${productId}: document does not exist`,
    );
  }

  console.log(`[addBatchToProduct] Document verified exists: ${productId}`);

  try {
    await updateDoc(stockRef, {
      batches: arrayUnion(batch),
    });
    console.log(
      `[addBatchToProduct] Successfully added batch ${batch.batchId}`,
    );
  } catch (error) {
    console.error(
      `[addBatchToProduct] Failed to add batch to product ${productId}:`,
      error,
    );
    console.error(`[addBatchToProduct] Batch details:`, batch);
    throw error;
  }
}

// Activity Log operations
export async function addActivityLog(log: Omit<ActivityLog, "id">) {
  const logsRef = collection(db, COLLECTIONS.ACTIVITY_LOG);
  const docRef = await addDoc(logsRef, {
    ...log,
    timestamp: log.timestamp || new Date().toISOString(),
  });
  return docRef.id;
}

// Employee operations
export async function addEmployee(employee: Employee) {
  const employeeData = {
    ...employee,
    createdAt: employee.createdAt || new Date().toISOString(),
  };
  // Use uid as the document ID in Firestore
  const docRef = doc(db, COLLECTIONS.EMPLOYEES, employee.uid);
  await setDoc(docRef, employeeData);
  return employee.uid;
}

export async function updateEmployee(uid: string, updates: Partial<Employee>) {
  const employeeRef = doc(db, COLLECTIONS.EMPLOYEES, uid);
  await updateDoc(employeeRef, updates);
}

export async function deleteEmployee(uid: string) {
  const employeeRef = doc(db, COLLECTIONS.EMPLOYEES, uid);
  await deleteDoc(employeeRef);
}

export async function getEmployeeByEmail(email: string): Promise<Employee | null> {
  const employeesRef = collection(db, COLLECTIONS.EMPLOYEES);
  const q = query(employeesRef, where("email", "==", email));
  const snapshot = await getDocs(q);
  
  if (snapshot.empty) {
    return null;
  }
  
  return snapshot.docs[0].data() as Employee;
}

export async function getEmployeeByUid(uid: string): Promise<Employee | null> {
  try {
    const employeeRef = doc(db, COLLECTIONS.EMPLOYEES, uid);
    const docSnapshot = await getDoc(employeeRef);
    
    if (!docSnapshot.exists()) {
      return null;
    }
    
    return docSnapshot.data() as Employee;
  } catch (error) {
    console.error("Error fetching employee by UID:", error);
    return null;
  }
}

// Unit of Measure operations
export async function addUnit(unit: Omit<UnitOfMeasure, "id">) {
  const unitsRef = collection(db, COLLECTIONS.UNITS);
  const docRef = await addDoc(unitsRef, unit);
  return docRef.id;
}

export async function updateUnit(id: string, updates: Partial<UnitOfMeasure>) {
  const unitRef = doc(db, COLLECTIONS.UNITS, id);
  await updateDoc(unitRef, updates);
}

export async function deleteUnit(id: string) {
  const unitRef = doc(db, COLLECTIONS.UNITS, id);
  await deleteDoc(unitRef);
}

// Batch operations for multiple updates
export async function batchUpdateRawMaterials(
  updates: Array<{ id: string; updates: Partial<RawMaterial> }>,
) {
  const promises = updates.map(({ id, updates: data }) =>
    updateRawMaterial(id, data),
  );
  await Promise.all(promises);
}
