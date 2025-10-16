import type { Role, AppModule } from "./types";

export interface RolePermissions {
  canEdit: AppModule[];
}

export const ROLE_PERMISSIONS: Record<Role, RolePermissions> = {
  admin: {
    canEdit: ["Raw Materials", "Store", "Batches", "Final Stock", "Reports", "Setup"]
  },
  storeManager: {
    canEdit: ["Raw Materials", "Store", "Batches", "Final Stock", "Reports"]
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
 * Get all permissions for a role
 */
export function getRolePermissions(role: Role): RolePermissions {
  return ROLE_PERMISSIONS[role];
}
