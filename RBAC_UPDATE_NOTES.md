# RBAC System Update - January 2025

## Changes Made

This document outlines the updates made to the Role-Based Access Control system based on the latest requirements.

### 1. Added Machining Manager Role

**New Role:**
- `machiningManager` - Can edit Machining operations only

**Updated Files:**
- `src/lib/types.ts` - Added `machiningManager` to Role type
- `src/lib/permissions.ts` - Added machiningManager permissions
- `src/components/employee-form.tsx` - Added to role selector
- All documentation files

### 2. Simplified Permission Model

**Old Model:**
- Each role had both `canView` and `canEdit` arrays
- Different roles had different view permissions

**New Model:**
- All roles can view all modules (universal view access)
- Only edit permissions are role-specific
- `ROLE_PERMISSIONS` now only contains `canEdit` arrays
- `canViewModule()` always returns `true`

**Benefits:**
- Simpler permission logic
- Easier to understand and maintain
- All employees can see all data (read access)
- Edit permissions control who can modify data

### 3. Updated Employee Data Structure

**Changes:**
- Removed separate `id` field
- Using `uid` (Firebase Auth UID) as the primary identifier
- `uid` is also used as the Firestore document ID
- Simplified structure matches Firestore best practices

**Old Structure:**
```typescript
{
  id: string,              // Firestore-generated ID
  uid: string,             // Firebase Auth UID
  name: string,
  email: string,
  role: Role,
  createdAt: string
}
```

**New Structure:**
```typescript
{
  uid: string,             // Firebase Auth UID (also Firestore doc ID)
  name: string,
  email: string,
  role: Role,
  createdAt: string
}
```

### 4. Updated Firestore Operations

**Changes:**
- `addEmployee()` now uses `uid` as document ID via `setDoc()`
- `updateEmployee()` and `deleteEmployee()` use `uid` parameter
- `getEmployeeByUid()` directly fetches by document ID (more efficient)

**Benefits:**
- Faster lookups (direct document access instead of query)
- No duplicate ID fields
- Follows Firebase best practices

## Current Role Permissions

### Admin
- **Can Edit:** Raw Materials, Store, Batches, Final Stock, Reports, Setup
- **Access Level:** Full system control

### Store Manager
- **Can Edit:** Raw Materials, Store, Batches, Final Stock, Reports
- **Access Level:** All inventory and stock management

### Moulding Manager
- **Can Edit:** Moulding
- **Access Level:** Moulding operations only

### Machining Manager (NEW)
- **Can Edit:** Machining
- **Access Level:** Machining operations only

### Assembling Manager
- **Can Edit:** Assembling
- **Access Level:** Assembling operations only

### Testing Manager
- **Can Edit:** Testing
- **Access Level:** Testing operations only

**Note:** All roles can view all modules.

## Migration Guide

If you have existing employees in Firestore:

### Option 1: Manual Update (Recommended)
1. Go to Firebase Console → Firestore
2. For each employee document in the `employees` collection:
   - The document ID should be the Firebase Auth UID
   - If it's not, rename the document to use the UID
   - Ensure document has: `uid`, `name`, `email`, `role`, `createdAt`
   - Remove any `id` field if it exists

### Option 2: Keep Existing Setup
If you prefer to keep the old structure:
1. Revert `src/lib/types.ts` to use both `id` and `uid` fields
2. Revert `src/lib/firebase/firestore-operations.ts` to use `addDoc()` instead of `setDoc()`
3. Update `src/hooks/use-employee.ts` accordingly

However, the new structure is recommended for better performance.

## Code Examples

### Creating an Employee
```typescript
// Admin creates employee in Setup page
const newEmployee: Employee = {
  uid: firebaseAuthUid,  // From Firebase Auth
  name: "John Doe",
  email: "john@example.com",
  role: "machiningManager",
  createdAt: new Date().toISOString()
};

await addEmployee(newEmployee);
```

### Checking Permissions
```typescript
import { usePermissions } from '@/hooks/use-permissions';

function MyComponent() {
  const { canEdit, employee } = usePermissions();
  
  // All users can view - no need to check
  // Just check edit permission
  if (canEdit('Machining')) {
    return <button>Edit Machining</button>;
  }
  
  return <div>View Only</div>;
}
```

### Using Permission Functions
```typescript
import { canEditModule } from '@/lib/permissions';

const role: Role = "machiningManager";

// Check edit permission
const canEditMachining = canEditModule(role, "Machining");    // true
const canEditMoulding = canEditModule(role, "Moulding");      // false
const canEditStore = canEditModule(role, "Store");            // false
```

## Files Modified

### Core Files
1. `src/lib/types.ts` - Employee interface, Role type, AppModule type
2. `src/lib/permissions.ts` - Permission configuration
3. `src/lib/firebase/firestore-operations.ts` - Employee CRUD operations
4. `src/hooks/use-employee.ts` - Employee management hook
5. `src/hooks/use-permissions.ts` - Permission checking hook

### Components
1. `src/components/employee-form.tsx` - Employee creation/edit form
2. `src/components/permission-example.tsx` - Example usage component
3. `src/app/setup/page.tsx` - Employee management UI

### Documentation
1. `EMPLOYEE_RBAC_GUIDE.md` - Complete usage guide
2. `ROLES_QUICK_REFERENCE.md` - Quick reference card
3. `RBAC_IMPLEMENTATION_SUMMARY.md` - Implementation details
4. `RBAC_UPDATE_NOTES.md` - This file

## Testing Checklist

- [ ] Create employee with each role
- [ ] Verify machiningManager role works
- [ ] Test that all employees can view all modules
- [ ] Test edit permissions are correct for each role
- [ ] Verify employee created with UID as document ID
- [ ] Test employee update functionality
- [ ] Test employee deletion
- [ ] Verify password setup email sent
- [ ] Test permissions in actual components
- [ ] Check Firestore document structure

## Breaking Changes

⚠️ **Important:** This update contains breaking changes:

1. **Employee Structure Changed:**
   - No longer uses separate `id` field
   - Uses `uid` as both identifier and Firestore document ID
   - Existing code using `employee.id` must change to `employee.uid`

2. **Permission Model Changed:**
   - Removed `canView` arrays from role permissions
   - All roles can now view all modules
   - Only `canEdit` permissions are role-specific
   - Code checking `canView()` will always get `true`

3. **Firestore Document IDs:**
   - Employee documents now use Firebase Auth UID as document ID
   - Old documents with auto-generated IDs need migration

## Support

For issues or questions:
1. Check `EMPLOYEE_RBAC_GUIDE.md` for detailed documentation
2. Check `ROLES_QUICK_REFERENCE.md` for quick reference
3. Review code examples in `src/components/permission-example.tsx`

## Summary

✅ Added machiningManager role  
✅ Simplified to universal view access  
✅ Updated to UID-based employee storage  
✅ Improved Firestore performance  
✅ Updated all documentation  
✅ Maintained backward compatibility where possible  

The system now has **6 predefined roles** with simplified, clear permissions where **everyone can view** and **only admins and managers can edit** their respective domains.
