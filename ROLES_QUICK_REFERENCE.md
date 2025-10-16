# Roles & Permissions - Quick Reference Card

**Note:** All roles can view all modules. Only edit permissions are restricted.

## 6 Predefined Roles

### 👑 Admin
**Full system access**
- ✅ Can Edit: Raw Materials, Store, Batches, Final Stock, Reports, Setup

### 📦 Store Manager
**Inventory & Stock Management**
- ✅ Can Edit: Raw Materials, Store, Batches, Final Stock, Reports
- ❌ Cannot: Access Setup

### 🏭 Moulding Manager
**Moulding Operations**
- ✅ Can Edit: Moulding stage only
- ❌ Cannot: Edit other stages, manage raw materials/stock

### ⚙️ Machining Manager
**Machining Operations**
- ✅ Can Edit: Machining stage only
- ❌ Cannot: Edit other stages, manage raw materials/stock

### 🔧 Assembling Manager
**Assembling Operations**
- ✅ Can Edit: Assembling stage only
- ❌ Cannot: Edit other stages, manage raw materials/stock

### ✓ Testing Manager
**Testing Operations**
- ✅ Can Edit: Testing stage only
- ❌ Cannot: Edit other stages, manage raw materials/stock

---

## Usage in Code

### Check Permissions in Components
```typescript
import { usePermissions } from '@/hooks/use-permissions';

function MyComponent() {
  const { canEdit, employee, isAdmin } = usePermissions();

  // All users can view all modules
  // Only check edit permission
  const showEditButton = canEdit('Batches');

  // Admin check
  if (isAdmin()) {
    // Show admin features
  }

  return (
    <div>
      <h1>Welcome {employee?.name}</h1>
      {showEditButton && <button>Edit</button>}
    </div>
  );
}
```

### Use Permission Functions Directly
```typescript
import { canViewModule, canEditModule } from '@/lib/permissions';

const role = employee.role;

// Check specific permissions
const canViewBatches = canViewModule(role, 'Batches');
const canEditStore = canEditModule(role, 'Store');
```

---

## Employee Data Structure
```typescript
{
  uid: "firebase-auth-uid",            // Firebase Auth user ID (also Firestore document ID)
  name: "John Doe",                    // Employee name
  email: "john@example.com",           // Email address
  role: "storeManager",                // One of the 6 roles
  createdAt: "2025-10-15T19:47:03Z"   // ISO timestamp
}
```

---

## Permission Matrix

**Note:** All roles can view all modules. Only edit permissions differ.

| Module         | Admin | Store Mgr | Moulding | Machining | Assembling | Testing |
|----------------|-------|-----------|----------|-----------|------------|---------|
| **Raw Materials** | ✅ | ✅        | ❌       | ❌        | ❌         | ❌      |
| **Store**      | ✅    | ✅        | ❌       | ❌        | ❌         | ❌      |
| **Batches**    | ✅    | ✅        | ❌       | ❌        | ❌         | ❌      |
| **Final Stock** | ✅   | ✅        | ❌       | ❌        | ❌         | ❌      |
| **Reports**    | ✅    | ✅        | ❌       | ❌        | ❌         | ❌      |
| **Setup**      | ✅    | ❌        | ❌       | ❌        | ❌         | ❌      |
| **Moulding**   | ✅    | ❌        | ✅       | ❌        | ❌         | ❌      |
| **Machining**  | ✅    | ❌        | ❌       | ✅        | ❌         | ❌      |
| **Assembling** | ✅    | ❌        | ❌       | ❌        | ✅         | ❌      |
| **Testing**    | ✅    | ❌        | ❌       | ❌        | ❌         | ✅      |

---

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/permissions.ts` | Role definitions & permission checks |
| `src/hooks/use-permissions.ts` | React hook for permissions |
| `src/components/employee-form.tsx` | Employee creation/edit form |
| `src/app/setup/page.tsx` | Employee management UI |
| `EMPLOYEE_RBAC_GUIDE.md` | Full documentation |

---

## Common Tasks

### Create New Employee
1. Go to Setup → Employee Management
2. Click "Add Employee"
3. Enter name, email, select role
4. Click "Save Employee"
5. Employee receives password setup email

### Check User's Role
```typescript
const { employee } = usePermissions();
console.log(employee?.role); // "admin", "storeManager", etc.
```

### Conditionally Render UI
```typescript
const { canEdit } = usePermissions();

// All users can view, only some can edit
{canEdit('Raw Materials') && (
  <button>Edit Material</button>
)}
```

---

## Security Notes

⚠️ **Important**: 
- Client-side checks are for UI/UX only
- **Always enforce permissions on backend**
- Implement Firestore Security Rules
- Validate permissions in API routes

---

**For detailed information, see `EMPLOYEE_RBAC_GUIDE.md`**
