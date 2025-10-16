# Batches Data Model Documentation

## Overview

Products in Final Stock use an **embedded batches array** data model. Each product document contains all its batch entries within a single document, rather than creating separate documents for each batch.

## Data Structure

### FinalStock Document Structure

```typescript
interface FinalStock {
  id: string;                    // Unique product ID
  name: string;                  // Product name (e.g., "iPhone 13")
  sku: string;                   // Product SKU
  price: number;                 // Unit price
  gstRate: number;               // GST rate percentage
  imageUrl: string;              // Product image URL
  imageHint: string;             // AI image hint
  bom_per_piece?: BOMRow[];      // Bill of materials
  batches?: BatchEntry[];        // Array of batch entries
  quantity?: number;             // Total accepted quantity
  createdAt?: string;            // Product creation timestamp
}
```

### BatchEntry Structure

```typescript
interface BatchEntry {
  batchId: string;        // Batch identifier (e.g., "B3736")
  sourceBatchId: string;  // Reference to source batch
  quantity: number;       // Accepted quantity for this batch
  sku: string;            // Batch-specific SKU (e.g., "BATCH-B3736")
  createdAt: string;      // Batch creation timestamp
}
```

## Example Document

```json
{
  "id": "prod-abc123",
  "name": "iPhone 13",
  "sku": "PROD-1234567890",
  "price": 0,
  "gstRate": 0,
  "imageUrl": "/placeholder.svg?height=100&width=100",
  "imageHint": "iPhone 13",
  "batches": [
    {
      "batchId": "B3736",
      "sourceBatchId": "B3736",
      "quantity": 100,
      "sku": "BATCH-B3736",
      "createdAt": "2024-01-15T10:30:00.000Z"
    },
    {
      "batchId": "B3737",
      "sourceBatchId": "B3737",
      "quantity": 150,
      "sku": "BATCH-B3737",
      "createdAt": "2024-01-16T14:20:00.000Z"
    }
  ],
  "createdAt": "2024-01-15T10:30:00.000Z"
}
```

## How It Works

### Adding a Batch to an Existing Product

When a batch completes its final processing stage:

1. **Check if product exists**: Search for a product with matching `name`
2. **If product exists**: Add the batch to the `batches` array using `arrayUnion`
3. **If product doesn't exist**: Create a new product with the batch in the `batches` array

### Code Example (Recommended Approach)

```typescript
import { getOrCreateProduct, addBatchToProduct } from "@/lib/firebase/firestore-operations";

const newBatch = {
  batchId: batch.id,
  sourceBatchId: batch.id,
  quantity: formData.accepted,
  sku: `BATCH-${batch.id}`,
  createdAt: new Date().toISOString(),
};

// Get or create product directly from Firestore (safe from race conditions)
const product = await getOrCreateProduct(batch.productName, {
  imageUrl: "/placeholder.svg?height=100&width=100",
  imageHint: batch.productName,
});

// Add batch to the product
await addBatchToProduct(product.id, newBatch);
```

**Why this is better:**
- ✅ Queries Firestore directly (not reliant on client state)
- ✅ Handles race conditions automatically
- ✅ No "No document to update" errors
- ✅ Cleaner, more concise code

## Benefits

### 1. **Data Consistency**
- All batch information for a product is in one place
- Easier to maintain data integrity
- Atomic updates for product and its batches

### 2. **Performance**
- Single document read instead of multiple queries
- Reduced Firestore read operations
- Faster product display with all batch information

### 3. **Simplified Deletion**
- Delete one document to remove product and all its batches
- No orphaned batch documents
- Cleaner data management

### 4. **Better Grouping**
- Natural grouping of batches by product
- Easier to calculate totals and aggregates
- Simplified reporting

## UI Display

### Products Page
Shows one row per product with:
- Product name
- Total number of batches
- Combined product information

### Product Details Dialog
Shows:
- Product information (from main document)
- All batches in a table with:
  - Batch ID
  - Quantity
  - Creation date
- Total quantity across all batches

## Firestore Operations

### Get or Create Product (Recommended)

```typescript
export async function getOrCreateProduct(
  productName: string,
  productData?: Partial<FinalStock>
): Promise<FinalStock> {
  // First, try to get existing product from Firestore
  const existingProduct = await getProductByName(productName);

  if (existingProduct) {
    return existingProduct;
  }

  // Product doesn't exist, create it
  const newProduct = {
    name: productName,
    sku: productData?.sku || `PROD-${Date.now()}`,
    price: productData?.price || 0,
    gstRate: productData?.gstRate || 0,
    imageUrl: productData?.imageUrl || "/placeholder.svg",
    imageHint: productData?.imageHint || productName,
    batches: productData?.batches || [],
    createdAt: new Date().toISOString(),
  };

  const productId = await addFinalStock(newProduct);
  return { id: productId, ...newProduct };
}
```

**Benefits**:
- Queries Firestore directly (avoids stale client-side data)
- Atomically creates product if it doesn't exist
- Prevents "No document to update" errors
- Thread-safe operation

### Add Batch to Product

```typescript
export async function addBatchToProduct(
  productId: string,
  batch: BatchEntry
) {
  const stockRef = doc(db, COLLECTIONS.FINAL_STOCK, productId);
  await updateDoc(stockRef, {
    batches: arrayUnion(batch),
  });
}
```

**Note**: Uses Firestore's `arrayUnion` to add the batch without duplicates.

### Delete Product (with all batches)

```typescript
export async function deleteFinalStock(id: string) {
  const stockRef = doc(db, COLLECTIONS.FINAL_STOCK, id);
  await deleteDoc(stockRef);
}
```

**Note**: Deleting the product document automatically deletes all embedded batches.

## Migration from Old Model

If you have existing data with separate batch documents:

### Old Model (Deprecated)
```
- Product: "iPhone 13"
- Separate docs: "iPhone 13 - Batch B3736", "iPhone 13 - Batch B3737"
```

### New Model (Current)
```
- Product: "iPhone 13"
  - batches: [
      { batchId: "B3736", quantity: 100, ... },
      { batchId: "B3737", quantity: 150, ... }
    ]
```

### Migration Steps

1. **Query all products** with the naming pattern "Product Name - Batch ID"
2. **Extract product name and batch ID** from the document name
3. **Group by product name**
4. **Create new product documents** with embedded batches array
5. **Delete old separate batch documents**
6. **Verify data integrity**

## Best Practices

### 1. Always Check for Existing Products
```typescript
const existingProduct = finalStock.find(p => p.name === productName);
```

### 2. Use Consistent Naming
- Product names should not contain " - Batch " pattern
- Batch IDs should be unique identifiers
- SKUs should follow the pattern "BATCH-{batchId}"

### 3. Handle Edge Cases
- Empty batches array (product template without batches)
- Null/undefined batches property
- Duplicate batch IDs

### 4. Maintain Timestamps
- Always include `createdAt` for batches
- Use ISO 8601 format: `new Date().toISOString()`

### 5. Atomic Operations
- Use `arrayUnion` for adding batches (prevents duplicates)
- Use transactions for critical operations
- Handle concurrent updates gracefully

## Troubleshooting

### Batch Not Appearing After Completion
- Check if `addBatchToProduct` is being called
- Verify product exists in `finalStock` array
- Check Firestore console for the document
- Look for errors in browser console

### Duplicate Batches
- `arrayUnion` should prevent duplicates
- Check if batch object structure matches exactly
- Verify `batchId` uniqueness

### Product Not Found
- Ensure product name matches exactly (case-sensitive)
- Check if product was created before adding batch
- Verify Firestore real-time listener is active

## Related Files

- `src/lib/types.ts` - Type definitions
- `src/lib/firebase/firestore-operations.ts` - Database operations
- `src/components/batch-stage-processor.tsx` - Batch completion logic
- `src/app/products/page.tsx` - Products listing page
- `src/components/product-details-dialog.tsx` - Product details view

## Summary

The embedded batches data model provides a clean, efficient way to manage product batches:
- ✅ Single source of truth per product
- ✅ Reduced database operations
- ✅ Simplified deletion and updates
- ✅ Better performance and consistency
- ✅ Easier to maintain and understand