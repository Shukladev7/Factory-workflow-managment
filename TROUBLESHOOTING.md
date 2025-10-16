# Troubleshooting Guide: Product Creation & Deletion

## Overview

This guide helps debug common issues with product creation and deletion in the Final Stock management system.

---

## Issue 1: Products Don't Appear in Batch Creation

### Symptoms
- Create a product using "Add Product" form
- Product doesn't show in batch creation dropdown
- No error messages displayed

### Debug Steps

#### Step 1: Check Console Logs

Open browser Developer Tools (F12) → Console tab and look for:

```
[ProductsPage] Creating product: iPhone 13
[ProductsPage] Product data: { ... }
[ProductsPage] ✓ Product created with ID: OjbpUJ971qko441vAcjj
[ProductsPage] ✓ Activity log created
[ProductsPage] Current finalStock count: 5
```

**What to check:**
- ✅ Product created successfully with Firestore ID (random alphanumeric)
- ❌ If you see errors, read the error message
- ❌ If ID looks like `prod-XXXXX`, that's wrong (should be Firestore-generated)

#### Step 2: Check Firestore Console

1. Go to Firebase Console → Firestore Database
2. Navigate to `finalStock` collection
3. Look for your product by name

**Expected:**
- Document exists with Firestore-generated ID (e.g., `OjbpUJ971qko441vAcjj`)
- Document has all fields: `name`, `sku`, `price`, `gstRate`, `batches` (array)

**If missing:**
- Product creation failed (check console for errors)
- Check Firebase rules allow write access
- Verify internet connection

#### Step 3: Check Batch Creation Form Logs

When you open the batch creation dialog:

```
[CreateBatchForm] Total finalStock items: 5
[CreateBatchForm] finalStock IDs: [{ name: "iPhone 13", id: "OjbpUJ971qko441vAcjj" }, ...]
[CreateBatchForm] Valid products with IDs: 5
[CreateBatchForm] Product options for dropdown: [{ label: "iPhone 13", value: "OjbpUJ971qko441vAcjj" }, ...]
```

**What to check:**
- Total items matches Firestore count
- All products have valid IDs (not empty strings)
- Product options array contains your product

#### Step 4: Force Refresh

If product exists in Firestore but not in UI:

1. **Soft refresh:** Close and reopen the batch creation dialog
2. **Hard refresh:** Refresh the entire page (F5 or Cmd+R)
3. **Clear cache:** Shift+F5 or Cmd+Shift+R

### Common Causes & Solutions

| Cause | Symptom | Solution |
|-------|---------|----------|
| **Real-time listener delay** | Product appears after 1-2 seconds | Normal - wait or refresh |
| **Empty ID in product** | Product created but ID is "" | Refresh page - Firestore should update |
| **Custom ID format** | ID looks like `prod-123` | Delete product, recreate with fixed form |
| **Firestore rules** | Permission denied error | Check Firebase rules allow write |
| **Network issue** | Creation hangs/fails | Check internet connection |

### Solution Checklist

- [ ] Product appears in Firestore with valid ID
- [ ] Console shows successful creation log
- [ ] Refresh page and check batch creation again
- [ ] Product count in console matches Firestore
- [ ] No permission errors in console

---

## Issue 2: Delete Product Not Working

### Symptoms
- Click "Delete Product" button
- Dialog closes but product still appears
- No error message or error in console

### Debug Steps

#### Step 1: Check Console Logs

```
[ProductDetailsDialog] Starting deletion for product: iPhone 13
[ProductDetailsDialog] Product template ID: OjbpUJ971qko441vAcjj
[ProductDetailsDialog] Number of embedded batches: 2
[ProductDetailsDialog] Calling onProductDelete with ID: OjbpUJ971qko441vAcjj
[ProductsPage] ========== DELETE STARTED ==========
[ProductsPage] handleProductDeleted called with ID: OjbpUJ971qko441vAcjj
[ProductsPage] Product to delete: { id: "...", name: "...", batches: 2 }
[ProductsPage] Calling deleteFinalStock...
[ProductsPage] ✓ deleteFinalStock completed successfully
[ProductsPage] ✓ Activity log created
[ProductDetailsDialog] ✓ Product and all batches deleted successfully
[ProductsPage] ========== DELETE COMPLETED ==========
```

**What to check:**
- ✅ All steps complete without errors
- ❌ If "Product not found" → Product already deleted or wrong ID
- ❌ If permission error → Check Firestore rules
- ❌ If stops at any step → Note where it fails

#### Step 2: Check Firestore Console

1. Go to Firebase Console → Firestore Database
2. Navigate to `finalStock` collection
3. Search for the product you deleted

**Expected:**
- Document should NOT exist
- No documents with that product name

**If still exists:**
- Deletion failed (check console for errors)
- Check Firebase rules allow delete
- Try deleting manually from Firestore console

#### Step 3: Check Dialog Behavior

**Normal behavior:**
1. Click "Delete Product"
2. Confirmation dialog appears
3. Click "Delete All"
4. Dialog closes
5. Product disappears from list
6. Toast notification shows success

**Abnormal behavior:**
- Dialog stays open → Check console for error
- Dialog closes but product remains → Deletion failed
- Multiple clicks needed → Race condition (check logs)

### Common Causes & Solutions

| Cause | Symptom | Solution |
|-------|---------|----------|
| **Product not found** | "Product not found" in console | Already deleted - refresh page |
| **No product template** | "No product template found" | Product has no template (only batches) |
| **Permission denied** | Firestore permission error | Check Firebase rules |
| **Stale dialog data** | Wrong product being deleted | Close and reopen dialog |
| **Network issue** | Operation times out | Check internet connection |

### Solution Checklist

- [ ] Console shows complete deletion sequence
- [ ] No errors in console
- [ ] Product removed from Firestore
- [ ] Page refresh shows product gone
- [ ] Toast notification appeared
- [ ] Dialog closed automatically

---

## Common Issues Across Both Operations

### Issue: Firestore Permission Denied

**Error:**
```
FirebaseError: Missing or insufficient permissions
```

**Solution:**
1. Go to Firebase Console → Firestore Database → Rules
2. Check rules allow read/write/delete on `finalStock` collection
3. For development, you can use (⚠️ Not for production):
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

### Issue: Real-time Listener Not Updating

**Symptoms:**
- Changes in Firestore don't appear in UI
- Need to refresh page to see updates

**Debug:**
```javascript
// Check in console:
[useFirestoreCollection] Total items: 5
```

**Solution:**
1. Check internet connection
2. Refresh page (F5)
3. Check Firestore rules allow read access
4. Check browser console for WebSocket errors

### Issue: Custom IDs Still Being Generated

**Symptoms:**
- Products have IDs like `prod-1760439807884`
- "Document does not exist" errors

**Solution:**
1. Delete all products with custom IDs from Firestore
2. Clear browser cache
3. Refresh page
4. Recreate products - should get Firestore IDs

**Verify:**
```javascript
// In console, check:
[ProductsPage] Product created with ID: OjbpUJ971qko441vAcjj
// ✅ Good: Random alphanumeric ID
// ❌ Bad: prod-1760439807884
```

---

## Step-by-Step Complete Test

### Test Product Creation

1. **Open Products Page**
   - Open browser console (F12)
   - Go to Final Stock page

2. **Create Product**
   - Click "Add Product"
   - Fill in form:
     - Name: "Test Product 123"
     - SKU: "TEST-123"
     - Price: 100
     - GST Rate: 18
   - Click "Add Product"

3. **Check Console Logs**
   ```
   [ProductsPage] Creating product: Test Product 123
   [ProductsPage] ✓ Product created with ID: [FIRESTORE_ID]
   ```

4. **Check Firestore**
   - Open Firebase Console
   - Find document in `finalStock`
   - Verify ID matches console log

5. **Check Batch Creation**
   - Go to Batches → Create New Batch
   - Check console for:
   ```
   [CreateBatchForm] Product options: [{ label: "Test Product 123", value: "[FIRESTORE_ID]" }]
   ```
   - Verify product appears in dropdown

### Test Product Deletion

1. **Open Product Details**
   - Find your test product
   - Click "View Details"

2. **Delete Product**
   - Click "Delete Product"
   - Confirm deletion
   - Watch console logs

3. **Verify Deletion**
   - Check console shows all deletion steps
   - Product disappears from list
   - Check Firestore - document should be gone

4. **Verify in Batch Creation**
   - Open batch creation
   - Product should NOT appear in dropdown

---

## Emergency Fixes

### Fix 1: Clear All Products and Start Fresh

**⚠️ Warning: This deletes ALL products!**

1. Go to Firebase Console → Firestore
2. Delete all documents in `finalStock` collection
3. Refresh your app
4. Recreate products

### Fix 2: Reset Browser State

```javascript
// In browser console:
localStorage.clear();
sessionStorage.clear();
// Then refresh page
```

### Fix 3: Verify Firestore Operations

Test in browser console:

```javascript
// Test reading products
const { collection, getDocs } = require('firebase/firestore');
const snapshot = await getDocs(collection(db, 'finalStock'));
console.log('Products:', snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
```

---

## Getting Help

If issues persist after following this guide:

### Information to Collect

1. **Console Logs**
   - Open Developer Tools → Console
   - Copy all relevant logs (especially errors)
   - Include timestamps

2. **Firestore Screenshots**
   - Screenshot of `finalStock` collection
   - Show document IDs and structure

3. **Steps to Reproduce**
   - Exact sequence of actions
   - What you expected to happen
   - What actually happened

4. **Browser Info**
   - Browser name and version
   - Operating system
   - Any browser extensions

### Check These First

- [ ] All console logs reviewed
- [ ] Firestore console checked
- [ ] Page refreshed multiple times
- [ ] Browser cache cleared
- [ ] No network/internet issues
- [ ] Firebase rules allow operations
- [ ] Product IDs are Firestore-generated (not custom)

---

## Summary of Fixes Applied

### Product Creation
- ✅ Remove empty `id` field before sending to Firestore
- ✅ Return and log Firestore-generated ID
- ✅ Add comprehensive error handling
- ✅ Wait for async operations to complete

### Batch Creation Dropdown
- ✅ Filter out products without valid IDs
- ✅ Add debug logging to show product count
- ✅ Only show products with Firestore-generated IDs

### Product Deletion
- ✅ Don't close dialog before deletion completes
- ✅ Add error handling and user feedback
- ✅ Verify product template exists
- ✅ Log all deletion steps

### General
- ✅ Use Firestore-generated IDs only
- ✅ Remove all custom ID generation
- ✅ Add extensive logging
- ✅ Better error messages

---

## Quick Reference

### Good Product ID
```
OjbpUJ971qko441vAcjj
KqW8tE9fZx3nMpLo2Yh1
abc123XYZ456
```
✅ Random alphanumeric, Firestore-generated

### Bad Product ID
```
prod-1760439807884
PROD-1234567890
""
undefined
```
❌ Custom format or empty

### Expected Console Flow

**Product Creation:**
```
[ProductsPage] Creating product: [NAME]
[ProductsPage] ✓ Product created with ID: [FIRESTORE_ID]
[ProductsPage] ✓ Activity log created
```

**Product Deletion:**
```
[ProductDetailsDialog] Starting deletion for product: [NAME]
[ProductsPage] ========== DELETE STARTED ==========
[ProductsPage] ✓ deleteFinalStock completed successfully
[ProductDetailsDialog] ✓ Product and all batches deleted successfully
[ProductsPage] ========== DELETE COMPLETED ==========
```

**Batch Creation:**
```
[CreateBatchForm] Total finalStock items: [COUNT]
[CreateBatchForm] Valid products with IDs: [COUNT]
[CreateBatchForm] Product options for dropdown: [ARRAY]
```
