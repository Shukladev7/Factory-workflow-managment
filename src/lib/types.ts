export interface RawMaterial {
  id: string;
  name: string;
  sku: string;
  quantity: number;
  unit: string;
  threshold: number;
  isMoulded?: boolean;
  isFinished?: boolean;
  sourceBatchId?: string;
  createdAt?: string;
}

export interface BOMRow {
  raw_material_id: string;
  stage: ProcessingStageName;
  qty_per_piece: number;
  unit: string;
  notes?: string;
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
  name: string;
  sku: string;
  price: number;
  gstRate: number;
  imageUrl: string;
  imageHint: string;
  bom_per_piece?: BOMRow[];
  batches?: BatchEntry[]; // Array of batch entries for this product
  quantity?: number; // Accepted quantity from the last completed stage
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
}

export interface BatchMaterial {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  stage: ProcessingStageName;
}

export interface Batch {
  id: string;
  productId: string;
  productName: string;
  totalMaterialQuantity: number;
  materials: BatchMaterial[];
  createdAt: string;
  status: BatchStatus;
  processingStages: Record<ProcessingStageName, ProcessingStage>;
  selectedProcesses: ProcessingStageName[];
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
