# Employee Role-Based Access Control (RBAC) System

## Overview

This system implements a role-based access control mechanism for employees, where each employee is assigned one of five predefined roles that determine their access to different modules within the application.

## Roles and Permissions

**Note:** All roles can view all modules. Only edit permissions are restricted.

### 1. Admin
- **Can Edit**: Raw Materials, Store, Batches, Final Stock, Reports, Setup
- Full edit access to all modules

### 2. Store Manager
- **Can Edit**: Raw Materials, Store, Batches, Final Stock, Reports
- Manages inventory and stock-related operations

### 3. Moulding Manager
- **Can Edit**: Moulding
- Limited to moulding process operations

### 4. Machining Manager
- **Can Edit**: Machining
- Limited to machining process operations

### 5. Assembling Manager
- **Can Edit**: Assembling
- Limited to assembling process operations

### 6. Testing Manager
- **Can Edit**: Testing
- Limited to testing process operations

## Employee Data Structure

Each employee is stored in Firestore under the `employees` collection with the following structure:

```typescript
{
  uid: string;             // Firebase Auth user ID (also used as Firestore document ID)
  name: string;            // Employee's full name
  email: string;           // Employee's email address
  role: Role;              // One of: admin, storeManager, mouldingManager, machiningManager, assemblingManager, testingManager
  createdAt: string;       // ISO timestamp of when employee was created
}
```

## Implementation Files

### Core Files

1. **`src/lib/types.ts`**
   - Defines the `Employee` interface
   - Defines the `Role` type with all possible roles
   - Defines `AppModule` type for all system modules

2. **`src/lib/permissions.ts`**
   - `ROLE_PERMISSIONS`: Maps each role to their edit permissions
   - `ROLE_LABELS`: Human-readable labels for each role
   - `canViewModule(role, module)`: Always returns true (all roles can view)
   - `canEditModule(role, module)`: Check if role can edit a module
   - `getRolePermissions(role)`: Get all permissions for a role

3. **`src/lib/firebase/firestore-operations.ts`**
   - `addEmployee(employee)`: Create a new employee in Firestore
   - `updateEmployee(id, updates)`: Update an existing employee
   - `deleteEmployee(id)`: Delete an employee
   - `getEmployeeByEmail(email)`: Get employee by email
   - `getEmployeeByUid(uid)`: Get employee by Firebase Auth UID

4. **`src/hooks/use-employee.ts`**
   - React hook for managing employee CRUD operations
   - Automatically syncs with Firestore

5. **`src/hooks/use-permissions.ts`**
   - React hook for checking current user's permissions
   - Returns: `employee`, `canView(module)`, `canEdit(module)`, `hasRole(role)`, `isAdmin()`

6. **`src/components/employee-form.tsx`**
   - Form component for creating/editing employees
   - Role selector with visual permission display

7. **`src/app/setup/page.tsx`**
   - Employee management UI
   - Create, edit, and delete employees
   - Automatically creates Firebase Auth users

## Usage Examples

### Creating an Employee (Admin Only)

1. Navigate to Setup → Employee Management
2. Click "Add Employee"
3. Fill in:
   - Employee Name
   - Email
   - Role (select from dropdown)
4. Review the permissions displayed for the selected role
5. Click "Save Employee"

The system will:
- Create a Firebase Auth user
- Store employee data in Firestore
- Send a password setup email to the employee

### Checking Permissions in Components

```typescript
import { usePermissions } from '@/hooks/use-permissions';

function MyComponent() {
  const { canEdit, isAdmin, employee } = usePermissions();

  // All users can view, so no need to check canView
  // Just check if user can edit
  const canEditBatches = canEdit('Batches');

  // Check if user is admin
  if (isAdmin()) {
    // Show admin-only features
  }

  // Conditionally show edit button
  return (
    <div>
      <h1>{employee?.name}</h1>
      {canEditBatches && <button>Edit Batch</button>}
    </div>
  );
}
```

### Using Permission Utilities Directly

```typescript
import { canViewModule, canEditModule, ROLE_LABELS } from '@/lib/permissions';

const role = 'mouldingManager';

// Check permissions
const canView = canViewModule(role, 'Batches'); // true
const canEdit = canEditModule(role, 'Raw Materials'); // false

// Get role label
const label = ROLE_LABELS[role]; // "Moulding Manager"
```

## Authentication Flow

1. Admin creates employee in Setup page
2. System creates Firebase Auth user (without password)
3. Employee data saved to Firestore with Firebase UID
4. Password reset email sent to employee
5. Employee clicks link and sets their password
6. Employee can now log in
7. On login, system fetches employee data from Firestore by UID
8. Permissions are enforced based on employee's role

## API Endpoint

### POST `/api/auth/signup`

Creates or updates a Firebase Auth user.

**Request:**
```json
{
  "email": "employee@example.com",
  "fullName": "John Doe"
}
```

**Response:**
```json
{
  "ok": true,
  "uid": "firebase-auth-uid-here"
}
```

## Security Considerations

1. **Firestore Security Rules**: Ensure you have proper Firestore security rules:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /employees/{employeeId} {
      // Only authenticated users can read employee data
      allow read: if request.auth != null;
      
      // Only admins can write employee data
      allow write: if request.auth != null && 
        get(/databases/$(database)/documents/employees/$(request.auth.uid)).data.role == 'admin';
    }
  }
}
```

2. **Client-side permissions** are for UI/UX only. Always enforce permissions on the backend.

3. **Role changes** require re-authentication for the user to see updated permissions.

## Future Enhancements

- Custom roles beyond the five predefined ones
- Role hierarchies
- Fine-grained permissions (e.g., view vs create vs update vs delete)
- Audit logging for permission changes
- Multi-tenancy support
- Permission caching for better performance

## Troubleshooting

### Employee can't log in
- Verify employee exists in Firebase Authentication
- Check password reset email was sent
- Ensure employee set their password via the link

### Permissions not working
- Verify employee data exists in Firestore with correct `uid`
- Check employee's role is one of the five valid roles
- Clear browser cache and re-authenticate

### Employee not showing in list
- Check Firestore collection `employees` has the data
- Verify Firestore security rules allow reading

## Migration from Old System

If you had the old permission system (granular per-module permissions), you'll need to migrate existing employees:

1. Map old permission combinations to new roles
2. Update employee documents in Firestore
3. Remove `permissions` and `phone` fields
4. Add `role`, `uid`, and `createdAt` fields
