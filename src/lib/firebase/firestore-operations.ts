
import {
  collection,
  doc,
  updateDoc,
  deleteDoc,
  query,
  where,
  getDocs,
  getDoc,
  arrayUnion,
  setDoc,
  deleteField,
  runTransaction,
} from "firebase/firestore";
import { db } from "./config";

import type {
  Batch,
  RawMaterial,
  FinalStock,
  ActivityLog,
  Employee,
  UnitOfMeasure,
  ProductGroup,
  RestockRecord,
  Order,
  OrderType,
} from "@/lib/types";
import { generateReadableId } from "@/lib/id";

// Collection names
export const COLLECTIONS = {
  BATCHES: "batches",
  RAW_MATERIALS: "rawMaterials",
  FINAL_STOCK: "finalStock",
  ACTIVITY_LOG: "activityLog",
  EMPLOYEES: "employees",
  UNITS: "unitsOfMeasure",
  PRODUCT_GROUPS: "productGroups",
  RESTOCKS: "restocks",
  ORDERS: "orders",
  ORDER_TYPES: "orderTypes",
  COUNTERS: "counters",
} as const;

// Batch operations
export async function addBatch(batch: Omit<Batch, "id">) {
  const id = await generateReadableId(COLLECTIONS.BATCHES, "batch");
  const batchRef = doc(db, COLLECTIONS.BATCHES, id);
  await setDoc(batchRef, {
    ...batch,
    createdAt: batch.createdAt || new Date().toISOString(),
  });
  return id;
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
  const id = await generateReadableId(COLLECTIONS.RAW_MATERIALS, "material");
  const materialRef = doc(db, COLLECTIONS.RAW_MATERIALS, id);
  await setDoc(materialRef, material);
  return id;
}

export async function updateRawMaterial(
  id: string,
  updates: Partial<RawMaterial>,
) {
  const materialRef = doc(db, COLLECTIONS.RAW_MATERIALS, id);
  // Gracefully handle missing documents so callers (e.g. Final Stock edits
  // syncing thresholds) don't crash if a raw material was deleted earlier.
  const snapshot = await getDoc(materialRef);
  if (!snapshot.exists()) {
    console.warn(
      `[updateRawMaterial] Skipping update for non-existent raw material ${id}. It may have been deleted.`,
    );
    return;
  }

  await updateDoc(materialRef, updates);
}

export async function deleteRawMaterial(id: string) {
  const materialRef = doc(db, COLLECTIONS.RAW_MATERIALS, id);
  // Protect Store items (moulded / finished / assembled units) from deletion.
  // Only regular raw materials (used in the Raw Materials module) may be deleted.
  const snapshot = await getDoc(materialRef);
  if (snapshot.exists()) {
    const data = snapshot.data() as RawMaterial;
    if (data.isMoulded || data.isFinished || data.isAssembled) {
      throw new Error("Deletion of Store items is disabled. These records must remain permanent.");
    }
  }

  await deleteDoc(materialRef);
}

// Get moulded materials (from Store)
export async function getMouldedMaterials(): Promise<RawMaterial[]> {
  const materialsRef = collection(db, COLLECTIONS.RAW_MATERIALS);
  const q = query(materialsRef, where("isMoulded", "==", true));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({
    ...doc.data(),
    id: doc.id,
  })) as RawMaterial[];
}

// Get finished materials (from Store)
export async function getFinishedMaterials(): Promise<RawMaterial[]> {
  const materialsRef = collection(db, COLLECTIONS.RAW_MATERIALS);
  const q = query(materialsRef, where("isFinished", "==", true));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({
    ...doc.data(),
    id: doc.id,
  })) as RawMaterial[];
}

// Get regular (non-moulded, non-finished) raw materials
export async function getRegularRawMaterials(): Promise<RawMaterial[]> {
  const materialsRef = collection(db, COLLECTIONS.RAW_MATERIALS);
  const q = query(materialsRef, where("isMoulded", "!=", true));
  const snapshot = await getDocs(q);
  // Filter out finished materials as well
  const materials = snapshot.docs.map((doc) => ({
    ...doc.data(),
    id: doc.id,
  })) as RawMaterial[];
  return materials.filter((m) => !m.isFinished);
}

// Final Stock operations
function removeUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => removeUndefinedDeep(item)) as T;
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, removeUndefinedDeep(v)]);
    return Object.fromEntries(entries) as T;
  }

  return value;
}

function sanitizeFinalStockBOMRows(rows: FinalStock["bom_per_piece"]): FinalStock["bom_per_piece"] {
  if (!Array.isArray(rows)) return rows;

  return rows.map((row) => {
    const cleanedRow: NonNullable<FinalStock["bom_per_piece"]>[number] = {
      raw_material_id: row.raw_material_id,
      stage: row.stage,
      qty_per_piece: row.qty_per_piece,
      unit: row.unit,
    };

    if (row.source === "final" || row.source === "raw") {
      cleanedRow.source = row.source;
    }

    if (typeof row.notes === "string" && row.notes.length > 0) {
      cleanedRow.notes = row.notes;
    }

    return cleanedRow;
  });
}

export async function addFinalStock(product: Omit<FinalStock, "id">) {
  // Ensure id field is never saved to Firestore (only document ID matters)
  const { id: _ignored, ...productData } = product as any;

  const cleanedProductData = {
    ...productData,
    ...(Array.isArray(productData.bom_per_piece)
      ? { bom_per_piece: sanitizeFinalStockBOMRows(productData.bom_per_piece) }
      : {}),
  };
  const firestoreReadyProductData = removeUndefinedDeep(cleanedProductData);

  const newId = await generateReadableId(COLLECTIONS.FINAL_STOCK, "product");
  const stockRef = doc(db, COLLECTIONS.FINAL_STOCK, newId);
  await setDoc(stockRef, firestoreReadyProductData);
  console.log(
    "[addFinalStock] Created product:",
    firestoreReadyProductData.name,
    "with Firestore ID:",
    newId,
  );
  return newId;
}

export async function updateFinalStock(
  id: string,
  updates: Partial<FinalStock>,
) {
  const stockRef = doc(db, COLLECTIONS.FINAL_STOCK, id);

  const cleanedUpdates = Object.fromEntries(
    Object.entries(updates).map(([key, value]) => {
      if (value === undefined) {
        return [key, deleteField()];
      }

      if (key === "bom_per_piece" && Array.isArray(value)) {
        return [key, sanitizeFinalStockBOMRows(value as FinalStock["bom_per_piece"])];
      }

      return [key, removeUndefinedDeep(value)];
    }),
  );

  await updateDoc(stockRef, cleanedUpdates);
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
    ...doc.data(),
    id: doc.id,
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
    manufacturingStages: productData?.manufacturingStages || [],
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
  const id = await generateReadableId(COLLECTIONS.ACTIVITY_LOG, "log");
  const logRef = doc(db, COLLECTIONS.ACTIVITY_LOG, id);
  await setDoc(logRef, {
    ...log,
    timestamp: log.timestamp || new Date().toISOString(),
  });
  return id;
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
  const id = await generateReadableId(COLLECTIONS.UNITS, "unit");
  const unitRef = doc(db, COLLECTIONS.UNITS, id);
  await setDoc(unitRef, unit);
  return id;
}

export async function updateUnit(id: string, updates: Partial<UnitOfMeasure>) {
  const unitRef = doc(db, COLLECTIONS.UNITS, id);
  await updateDoc(unitRef, updates);
}

export async function deleteUnit(id: string) {
  const unitRef = doc(db, COLLECTIONS.UNITS, id);
  await deleteDoc(unitRef);
}

// Product Group operations
export async function addProductGroup(group: Omit<ProductGroup, "id">) {
	// Remove undefined fields so Firestore doesn't reject them (e.g. optional description)
	const cleanedGroup = Object.fromEntries(
		Object.entries({
			...group,
			createdAt: group.createdAt || new Date().toISOString(),
		}).filter(([_, value]) => value !== undefined),
	) as Omit<ProductGroup, "id">;

	const id = await generateReadableId(COLLECTIONS.PRODUCT_GROUPS, "group");
	const groupRef = doc(db, COLLECTIONS.PRODUCT_GROUPS, id);
	await setDoc(groupRef, cleanedGroup);
	return id;
}

export async function updateProductGroup(
	id: string,
	updates: Partial<ProductGroup>,
) {
	const groupRef = doc(db, COLLECTIONS.PRODUCT_GROUPS, id);

	// Remove undefined fields from updates
	const cleanedUpdates = Object.fromEntries(
		Object.entries(updates).filter(([_, value]) => value !== undefined),
	);

	await updateDoc(groupRef, cleanedUpdates);
}

export async function deleteProductGroup(id: string) {
	const groupRef = doc(db, COLLECTIONS.PRODUCT_GROUPS, id);
	await deleteDoc(groupRef);
}

// Restock records operations
export async function addRestockRecord(record: Omit<RestockRecord, "id">) {
	const id = await generateReadableId(COLLECTIONS.RESTOCKS, "restock");
	const restockRef = doc(db, COLLECTIONS.RESTOCKS, id);
	await setDoc(restockRef, {
		...record,
		createdAt: record.createdAt || new Date().toISOString(),
	});
	return id;
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
// Order Type operations
export async function addOrderType(type: Omit<OrderType, "id">) {
  const id = await generateReadableId(COLLECTIONS.ORDER_TYPES, "otype");
  const typeRef = doc(db, COLLECTIONS.ORDER_TYPES, id);

  const cleaned = Object.fromEntries(
    Object.entries({
      ...type,
      createdAt: type.createdAt || new Date().toISOString(),
    }).filter(([_, value]) => value !== undefined),
  );

  await setDoc(typeRef, cleaned);
  return id;
}

export async function updateOrderType(
  id: string,
  updates: Partial<OrderType>,
) {
  const typeRef = doc(db, COLLECTIONS.ORDER_TYPES, id);

  const cleanedUpdates = Object.fromEntries(
    Object.entries(updates).filter(([_, value]) => value !== undefined),
  );

  await updateDoc(typeRef, cleanedUpdates);
}

export async function deleteOrderType(id: string) {
  const typeRef = doc(db, COLLECTIONS.ORDER_TYPES, id);
  await deleteDoc(typeRef);
}
// Orders operations

function normalizeOrderStatus(
  status: Order["status"] | string | undefined,
): Order["status"] {
  const normalized = String(status || "").toUpperCase();
  if (normalized === "SOLD") return "SOLD";
  return "PENDING";
}

function formatOrderId(orderNumber: number): string {
  return `ORD-${orderNumber}`;
}

export async function reserveNextOrderId(): Promise<string> {
  const counterRef = doc(db, COLLECTIONS.COUNTERS, "orders");

  return runTransaction(db, async (tx) => {
    const counterSnap = await tx.get(counterRef);
    const current = counterSnap.exists()
      ? Number(counterSnap.data().lastOrderNumber || 0)
      : 0;

    const next = current + 1;
    const now = new Date().toISOString();

    tx.set(
      counterRef,
      {
        lastOrderNumber: next,
        updatedAt: now,
      },
      { merge: true },
    );

    return formatOrderId(next);
  });
}

function deductFromBatchesFIFO(
  batches: NonNullable<FinalStock["batches"]>,
  quantityToDeduct: number,
) {
  const sorted = batches
    .map((b) => ({ ...b }))
    .sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );

  let remaining = Number(quantityToDeduct);
  for (const batch of sorted) {
    if (remaining <= 0) break;
    const qty = Number(batch.quantity ?? 0);
    const take = Math.min(qty, remaining);
    batch.quantity = qty - take;
    remaining -= take;
  }

  if (remaining > 0) {
    throw new Error("Insufficient stock to mark order as SOLD.");
  }

  const updatedById = new Map(sorted.map((b) => [b.batchId, b]));
  return batches.map((b) => updatedById.get(b.batchId) || b);
}

export async function addOrder(order: Omit<Order, "id">) {
  const id = await generateReadableId(COLLECTIONS.ORDERS, "order");
  const orderRef = doc(db, COLLECTIONS.ORDERS, id);
  const now = new Date().toISOString();
  const ensuredOrderId =
    typeof order.orderId === "string" && order.orderId.trim().length > 0
      ? order.orderId.trim()
      : await reserveNextOrderId();

  const payload: Omit<Order, "id"> = {
    ...order,
    orderId: ensuredOrderId,
    dueDate: order.dueDate || now,
    remark: order.remark || "",
    status: normalizeOrderStatus(order.status),
    isStockDeducted: Boolean(order.isStockDeducted),
    createdAt: order.createdAt || now,
    updatedAt: now,
  };
  await setDoc(orderRef, payload);
  return id;
}

export async function updateOrder(id: string, updates: Partial<Order>) {
  const orderRef = doc(db, COLLECTIONS.ORDERS, id);
  if (updates.status) {
    const existingSnap = await getDoc(orderRef);
    if (!existingSnap.exists()) {
      throw new Error("Order not found.");
    }

    const existing = existingSnap.data() as Omit<Order, "id">;
    const currentStatus = normalizeOrderStatus(existing.status);
    const requestedStatus = normalizeOrderStatus(updates.status);
    if (currentStatus === "SOLD" && requestedStatus === "PENDING") {
      throw new Error("Sold orders cannot be changed back to PENDING.");
    }
  }

  const cleanedUpdates = Object.fromEntries(
    Object.entries({
      ...updates,
      ...(updates.status ? { status: normalizeOrderStatus(updates.status) } : {}),
      updatedAt: new Date().toISOString(),
    }).filter(([, value]) => value !== undefined),
  );
  await updateDoc(orderRef, cleanedUpdates);
}

export async function updateOrderStatus(
  id: string,
  status: Order["status"],
): Promise<{ stockDeducted: boolean; status: Order["status"] }> {
  const orderRef = doc(db, COLLECTIONS.ORDERS, id);
  const requestedStatus = normalizeOrderStatus(status);

  return runTransaction(db, async (tx) => {
    const orderSnap = await tx.get(orderRef);
    if (!orderSnap.exists()) {
      throw new Error("Order not found.");
    }

    const order = orderSnap.data() as Omit<Order, "id">;
    const currentStatus = normalizeOrderStatus(order.status);
    const isStockDeducted = Boolean(order.isStockDeducted);
    const now = new Date().toISOString();

    if (currentStatus === "SOLD" && requestedStatus === "PENDING") {
      throw new Error("Sold orders cannot be changed back to PENDING.");
    }

    if (currentStatus === requestedStatus) {
      return { stockDeducted: false, status: currentStatus };
    }

    const orderUpdates: Partial<Order> = {
      status: requestedStatus,
      updatedAt: now,
    };

    const shouldDeductStock = requestedStatus === "SOLD" && !isStockDeducted;

    if (shouldDeductStock) {
      const stockRef = doc(db, COLLECTIONS.FINAL_STOCK, order.productId);
      const stockSnap = await tx.get(stockRef);
      if (!stockSnap.exists()) {
        throw new Error(`Final stock product ${order.productId} not found.`);
      }

      const stockData = stockSnap.data() as FinalStock;
      const batches = [...(stockData.batches || [])];
      const updatedBatches = deductFromBatchesFIFO(batches, Number(order.quantity));

      tx.update(stockRef, { batches: updatedBatches });
      orderUpdates.isStockDeducted = true;
      orderUpdates.stockDeductedAt = now;
    }

    tx.update(orderRef, orderUpdates);

    return { stockDeducted: shouldDeductStock, status: requestedStatus };
  });
}

export async function deleteOrder(id: string) {
  const orderRef = doc(db, COLLECTIONS.ORDERS, id);
  await deleteDoc(orderRef);
}
