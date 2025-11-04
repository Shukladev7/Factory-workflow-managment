import type { Role, AppModule, ProcessingStageName } from "./types";

export interface RolePermissions {
  canEdit: AppModule[];
}

export const ROLE_PERMISSIONS: Record<Role, RolePermissions> = {
  admin: {
    canEdit: ["Raw Materials", "Store", "Batches", "Final Stock", "Orders", "Reports", "Setup", "Moulding", "Machining", "Assembling", "Testing"]
  },
  storeManager: {
    canEdit: ["Raw Materials", "Store", "Batches", "Final Stock", "Orders", "Reports", "Moulding", "Machining", "Assembling", "Testing"]
  },
  mouldingManager: {
    canEdit: ["Moulding"]
  },
  machiningManager: {
    canEdit: ["Machining"]
  },
  assemblingManager: {
    canEdit: ["Assembling"]
  },
  testingManager: {
    canEdit: ["Testing"]
  }
};

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  storeManager: "Store Manager",
  mouldingManager: "Moulding Manager",
  machiningManager: "Machining Manager",
  assemblingManager: "Assembling Manager",
  testingManager: "Testing Manager"
};

/**
 * Check if a role has permission to view a specific module
 * Note: All roles can view all modules, so this always returns true
 */
export function canViewModule(_role: Role, _module: AppModule): boolean {
  return true; // Everyone can view all modules
}

/**
 * Check if a role has permission to edit a specific module
 */
export function canEditModule(role: Role, module: AppModule): boolean {
  return ROLE_PERMISSIONS[role].canEdit.includes(module);
}

/**
 * Map ProcessingStageName to corresponding AppModule for permission checks
 */
export function mapProcessingStageToModule(stage: ProcessingStageName): AppModule {
  switch (stage) {
    case "Molding":
      return "Moulding";
    case "Machining":
      return "Machining";
    case "Assembling":
      return "Assembling";
    case "Testing":
      return "Testing";
  }
}

/**
 * Check if a role has permission to edit a specific processing stage
 */
export function canEditProcessingStage(role: Role, stage: ProcessingStageName): boolean {
  const appModule = mapProcessingStageToModule(stage);
  return canEditModule(role, appModule);
}

/**
 * Get all permissions for a role
 */
export function getRolePermissions(role: Role): RolePermissions {
  return ROLE_PERMISSIONS[role];
}
