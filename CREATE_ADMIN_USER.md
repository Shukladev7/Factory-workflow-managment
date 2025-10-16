# How to Create Admin User: gouravshukla337@gmail.com

Since the Firebase configuration requires setup, here are two approaches to create the admin user:

## Option 1: Through the Firebase Console (Recommended)

### Step 1: Create User in Firebase Auth
1. Go to your Firebase Console: https://console.firebase.google.com/
2. Select your project
3. Navigate to **Authentication** > **Users**
4. Click **Add user**
5. Enter:
   - Email: `gouravshukla337@gmail.com`
   - Password: `TempPassword123!` (user should change this immediately)
6. Click **Add user**
7. Copy the generated **UID** (you'll need this for step 2)

### Step 2: Create Employee Record in Firestore
1. In Firebase Console, navigate to **Firestore Database**
2. Go to the `employees` collection (create it if it doesn't exist)
3. Click **Add document**
4. Set **Document ID** to the UID from Step 1
5. Add the following fields:
   ```
   uid: [UID from Step 1] (string)
   name: "Gourav Shukla" (string)
   email: "gouravshukla337@gmail.com" (string)
   role: "admin" (string)
   createdAt: [current timestamp as ISO string] (string)
   ```
   Example createdAt: `2024-01-16T11:05:45.000Z`
6. Click **Save**

## Option 2: After Setting Up Firebase Config

If you have Firebase configured in your `.env.local` file, you can run:

```bash
npm run create-admin
```

This will automatically:
1. Create the user in Firebase Auth
2. Create the employee record in Firestore
3. Set up the admin role

## Verification

Once created, the admin user can:
1. Log in at `/auth/login` with the credentials
2. Access all modules in the application
3. Access the **Setup** page to manage other employees
4. Create additional users with different roles

## Security Notes

- ⚠️ The temporary password should be changed immediately after first login
- 🔒 Only admin users can access the Setup page to create/modify other employees
- 🛡️ The admin role has full access to all modules and permissions

## Next Steps

1. **First Login**: Use the credentials to log in
2. **Change Password**: Update to a secure password
3. **Create Other Users**: Use the Setup page to add employees with appropriate roles
4. **Test Permissions**: Verify that the role-based access control is working correctly

## Role Hierarchy

As admin, you can create users with these roles:
- `admin` - Full access to everything including Setup
- `storeManager` - Can edit: Raw Materials, Store, Batches, Final Stock, Reports
- `mouldingManager` - Can edit: Moulding stage only
- `machiningManager` - Can edit: Machining stage only
- `assemblingManager` - Can edit: Assembling stage only
- `testingManager` - Can edit: Testing stage only

All users can **view** all modules, but **edit** permissions are restricted by role.