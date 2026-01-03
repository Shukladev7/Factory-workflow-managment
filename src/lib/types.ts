export interface RawMaterial {
  id: string;
  name: string;
  sku: string;
  quantity: number;
  unit: string;
  threshold: number;
  isMoulded?: boolean;
  isFinished?: boolean;
  isAssembled?: boolean;
  sourceBatchId?: string;
  createdAt?: string;
}

export interface BOMRow {
  raw_material_id: string;
  stage: ProcessingStageName;
  qty_per_piece: number;
  unit: string;
  notes?: string;
  // Source of input: default 'raw' (raw/materials store), or 'final' (Final Stock items used as input)
  source?: "raw" | "final";
}

export interface BatchEntry {
  batchId: string;
  sourceBatchId: string;
  quantity: number;
  sku: string;
  createdAt: string;
}

export interface FinalStock {
  id: string;
  productId?: string; // User-defined product ID (distinct from Firestore document ID)
  name: string;
  sku: string;
  price: number;
  gstRate: number;
  imageUrl: string;
  imageHint: string;
  manufacturingStages: ProcessingStageName[]; // Selected manufacturing stages for this product
  mouldedMaterialId?: string;
  machinedMaterialId?: string;
  assembledMaterialId?: string;
  // Per-unit low stock thresholds
  mouldedThreshold?: number;
  machinedThreshold?: number;
  assembledThreshold?: number;
  bom_per_piece?: BOMRow[];
  batches?: BatchEntry[]; // Array of batch entries for this product
  quantity?: number; // Accepted quantity from the last completed stage
  threshold?: number; // Low stock threshold for finished products
  measurementSketch?: string; // URL of the product's measurement sketch image
  createdAt?: string; // Date when batch was accepted into Final Stock
}

export type BatchStatus = "Completed" | "In Progress" | "On Hold" | "Planned";

export interface ProcessDefinition {
  name: ProcessingStageName;
  label: string;
  order: number;
}

export type ProcessingStageName =
  | "Molding"
  | "Machining"
  | "Assembling"
  | "Testing";

export interface ProcessingStage {
  accepted: number;
  rejected: number;
  actualConsumption: number;
  completed: boolean;
  startedAt?: string;
  finishedAt?: string;
  materialConsumptions?: Record<string, number>; // Material consumption per material ID
}

export interface BatchMaterial {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  stage: ProcessingStageName;
}

export interface Batch {
  id: string; // Firestore document ID (internal)
  batchId: string; // Global, immutable batch identifier - single source of truth (human-readable, e.g., BATCH-MLD-001 or FT-001)
  batchCode?: string; // Deprecated: use batchId instead. Kept for backward compatibility
  productId: string;
  productName: string;
  quantityToBuild: number;
  totalMaterialQuantity: number;
  materials: BatchMaterial[];
  createdAt: string;
  status: BatchStatus;
  processingStages: Record<ProcessingStageName, ProcessingStage>;
  selectedProcesses: ProcessingStageName[];
  autoCreatedFromTestingRejected?: boolean;
}

export interface UnitOfMeasure {
  id: string;
  name: string;
}

export type Permission = {
  view: boolean;
  edit: boolean;
  delete: boolean;
};

export type AppModule =
  | "Dashboard"
  | "Raw Materials"
  | "Store"
  | "Batches"
  | "Final Stock"
  | "Orders"
  | "Reports"
  | "Setup"
  | "Moulding"
  | "Machining"
  | "Assembling"
  | "Testing";

export type Role =
  | "admin"
  | "storeManager"
  | "mouldingManager"
  | "machiningManager"
  | "assemblingManager"
  | "testingManager";

export interface Employee {
  uid: string;
  name: string;
  email: string;
  role: Role;
  createdAt: string; // Will be stored as ISO string in Firestore, but represents a Timestamp
}

export type LogAction =
  | "Created"
  | "Updated"
  | "Deleted"
  | "Restocked"
  | "Stock Adjustment (Batch)"
  | "Stock Adjustment (Manual)";

export interface ActivityLog {
  id: string;
  recordId: string;
  recordType: "RawMaterial" | "Batch" | "FinalStock";
  timestamp: string;
  action: LogAction;
  details: string;
  user: string; // For now, we can hardcode a user like "System"
}

export interface ProductGroup {
  id: string; // Firestore document ID
  name: string;
  description?: string;
  productIds: string[]; // References to FinalStock.id
  productQuantities?: Record<string, number>; // Default quantity per productId for orders
  createdAt?: string;
}

export interface RestockRecord {
  id: string; // Firestore document ID
  productId: string; // FinalStock.id
  productName: string;
  quantityAdded: number;
  companyName: string;
  restockDate: string; // ISO string
  previousStock: number;
  updatedStock: number;
  createdAt: string; // ISO string when record was created
}

export interface Order {
  id: string; // Firestore document ID
  orderId: string; // Manual order identifier
  name?: string; // Customer or requester name (optional)
  productId: string; // Reference to FinalStock.id
  productName: string; // Denormalized for convenience
  quantity: number;
  orderType: string; // Selected from Setup
  createdAt: string;
}
