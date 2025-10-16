# Debug Guide: Document ID Mismatch Issue

## Problem Description

**Error:**
```
FirebaseError: No document to update: projects/studio-7721544033-1a07d/databases/(default)/documents/finalStock/prod-1760436676452
```

**Reality:**
- Actual Firestore document ID: `OjbpUJ971qko441vAcjj`
- Code trying to update: `prod-1760436676452`

## Root Cause Analysis

### Why This Happens

The ID mismatch occurs when:

1. **Client-side state is stale**
   - The `finalStock` array has outdated document IDs
   - Real-time listener hasn't updated yet
   - Code uses stale ID from the array

2. **Multiple documents exist**
   - Duplicate products with the same name
   - Query returns one, code uses another

3. **Timing issue**
   - Document created but not yet indexed
   - Query returns null, code proceeds with wrong ID

4. **Cache issue**
   - Browser/app has cached old document structure
   - New documents use different ID format

## Immediate Debugging Steps

### Step 1: Check Browser Console

Look for these log messages in order:

```
[BatchStageProcessor] Getting/creating product for: "ProductName"
[getOrCreateProduct] Found existing product: ID_HERE
OR
[getOrCreateProduct] Creating new product: "ProductName"
[getOrCreateProduct] Created product with ID: ID_HERE
[getOrCreateProduct] Verified product exists: ID_HERE
[addBatchToProduct] Adding batch B123 to product ID_HERE
[addBatchToProduct] Document verified exists: ID_HERE
```

**What to look for:**
- ✅ All IDs should be the same (Firestore format: random alphanumeric)
- ❌ If you see `prod-XXXXXXXXXX` format, that's the wrong ID
- ❌ If IDs change between steps, there's a race condition

### Step 2: Check Firestore Console

1. Open Firebase Console
2. Go to Firestore Database
3. Navigate to `finalStock` collection
4. Search for your product name (e.g., "iPhone 13")

**Check for:**
- How many documents have this name? (Should be 1)
- What's the document ID? (Should match logs)
- Does the document have a `batches` array?

### Step 3: Check for Duplicate Products

Run this query in Firestore Console:

```
Collection: finalStock
Where: name == "YOUR_PRODUCT_NAME"
```

**Expected:** 1 document  
**If multiple:** Delete duplicates, keep the one with batches

### Step 4: Inspect Document Structure

Click on the product document in Firestore:

```javascript
// Expected structure:
{
  id: "OjbpUJ971qko441vAcjj",  // Firestore generates this
  name: "iPhone 13",
  sku: "PROD-1234567890",
  batches: [
    {
      batchId: "B3736",
      quantity: 100,
      // ...
    }
  ]
}
```

**Check:**
- Is `batches` an array?
- Is the document ID format correct? (random alphanumeric, NOT `prod-XXXXX`)

## Step-by-Step Resolution

### Solution 1: Clear Stale Data

```typescript
// In browser console:
localStorage.clear();
sessionStorage.clear();
// Then refresh the page
```

### Solution 2: Delete Duplicate Products

1. Go to Firestore Console
2. Find all documents with the same product name
3. Keep the one with the most batches
4. Delete the others
5. Refresh your app

### Solution 3: Verify getOrCreateProduct Logic

Add this temporary debugging code:

```typescript
// In batch-stage-processor.tsx, replace the getOrCreateProduct call:

console.log('=== BEFORE getOrCreateProduct ===');
console.log('Product name:', batch.productName);

const product = await getOrCreateProduct(batch.productName, {
  imageUrl: "/placeholder.svg?height=100&width=100",
  imageHint: batch.productName,
});

console.log('=== AFTER getOrCreateProduct ===');
console.log('Returned product ID:', product.id);
console.log('Full product object:', JSON.stringify(product, null, 2));

// Verify by querying again
const { getProductByName } = await import("@/lib/firebase/firestore-operations");
const verifyProduct = await getProductByName(batch.productName);

console.log('=== VERIFICATION QUERY ===');
console.log('Verification product ID:', verifyProduct?.id);

if (product.id !== verifyProduct?.id) {
  console.error('❌ ID MISMATCH DETECTED!');
  console.error('getOrCreateProduct returned:', product.id);
  console.error('getProductByName returned:', verifyProduct?.id);
  throw new Error('Product ID mismatch - data inconsistency detected');
}

console.log('✅ Product ID verified consistent');
```

### Solution 4: Force Recreation of Product

If a product has wrong data:

```typescript
// In browser console or temporarily in code:
import { deleteFinalStock, getProductByName } from "@/lib/firebase/firestore-operations";

// 1. Find the bad product
const badProduct = await getProductByName("iPhone 13");
console.log('Found product with ID:', badProduct?.id);

// 2. Delete it
if (badProduct) {
  await deleteFinalStock(badProduct.id);
  console.log('Deleted bad product');
}

// 3. Next batch completion will create a fresh product
```

## Understanding the ID Formats

### Correct Format (Firestore-generated)
```
OjbpUJ971qko441vAcjj
abc123XYZ456
KqW8tE9fZx3nMpLo2Yh1
```
- Random alphanumeric
- Variable length (usually 20 chars)
- Generated by Firestore automatically

### Incorrect Format (Custom-generated)
```
prod-1760436676452
PROD-1234567890
```
- Predictable pattern
- Should ONLY be used for `sku` field
- NOT for document IDs

## Common Scenarios

### Scenario A: First Batch After Product Template Creation

**What happens:**
1. User creates product template manually
2. System generates ID: `prod-XXXXXXXXX` (wrong!)
3. Batch completes
4. Code tries to update `prod-XXXXXXXXX`
5. Error: Document doesn't exist

**Fix:**
- Don't use custom IDs for documents
- Let Firestore generate IDs automatically
- Use custom IDs only for `sku` field

### Scenario B: Multiple Products with Same Name

**What happens:**
1. Product "iPhone 13" exists with ID: `OjbpUJ971qko441vAcjj`
2. Duplicate created with ID: `prod-1760436676452`
3. Query returns one, code uses the other
4. Error: Document doesn't match

**Fix:**
- Delete duplicates
- Ensure `name` field is unique
- Consider adding unique constraint

### Scenario C: Race Condition

**What happens:**
1. Batch A creates product: `OjbpUJ971qko441vAcjj`
2. Batch B queries, gets null (indexing delay)
3. Batch B creates product: `prod-1760436676452`
4. Now there are 2 products
5. Updates fail randomly

**Fix:**
- Already handled by `getOrCreateProduct()`
- Verification query ensures consistency
- Retry logic handles timing issues

## Verification Checklist

After implementing the fix, verify:

- [ ] All console logs show consistent IDs
- [ ] No `prod-XXXXX` format IDs in logs
- [ ] Only one document per product name in Firestore
- [ ] Document IDs match Firestore's random format
- [ ] Batches successfully added without errors
- [ ] Real-time updates work correctly

## Monitoring

Add this to your code to monitor document IDs:

```typescript
// In getOrCreateProduct(), after returning:
if (product.id.startsWith('prod-')) {
  console.error('⚠️ WARNING: Custom ID format detected!');
  console.error('Product ID:', product.id);
  console.error('This should be a Firestore-generated ID');
  // Optional: Alert developer
  alert('DEV WARNING: Check console for ID format issue');
}
```

## Prevention

To prevent this issue in the future:

1. **Never use custom document IDs**
   ```typescript
   // ❌ Wrong:
   await setDoc(doc(db, 'finalStock', `prod-${Date.now()}`), data);
   
   // ✅ Correct:
   await addDoc(collection(db, 'finalStock'), data);
   ```

2. **Always query Firestore directly**
   ```typescript
   // ❌ Wrong: Use client state
   const product = finalStock.find(p => p.name === name);
   
   // ✅ Correct: Query Firestore
   const product = await getProductByName(name);
   ```

3. **Verify after creation**
   ```typescript
   const id = await addFinalStock(product);
   const verify = await getProductByName(product.name);
   if (verify?.id !== id) throw new Error('Verification failed');
   ```

4. **Add logging**
   ```typescript
   console.log('[Operation] Step description', { relevant: 'data' });
   ```

## Contact Points

If issue persists after following this guide:

1. **Export Firestore data**
   - Go to Firestore Console
   - Export `finalStock` collection
   - Save as JSON

2. **Capture console logs**
   - Open Developer Tools
   - Go to Console tab
   - Right-click > Save As...

3. **Note the pattern**
   - When does it happen? (always/sometimes)
   - Which products? (all/specific)
   - After which operation? (create/update/delete)

4. **Share information**
   - Console logs
   - Firestore export
   - Steps to reproduce

## Summary

The document ID mismatch issue is caused by:
- Using custom IDs instead of Firestore-generated IDs
- Stale client-side data
- Duplicate documents

The fix includes:
- ✅ Query Firestore directly
- ✅ Verify document exists before update
- ✅ Use Firestore-generated IDs only
- ✅ Add extensive logging
- ✅ Handle race conditions

With the current implementation, this should be resolved. If you still see errors, follow the debugging steps above to identify the specific cause in your case.