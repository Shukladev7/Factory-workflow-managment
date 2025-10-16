# Batch Table Raw Materials Fix

## ⚠️ CRITICAL: File Currently Corrupted

**The `src/components/batch-stage-processor.tsx` file is currently corrupted and will not build.**

You must first restore this file from:
1. Version control (git repository)
2. A backup copy made before recent edits
3. Or download a fresh copy from your project source

**DO NOT attempt to apply these fixes until you have a working version of the file.**

The corruption includes:
- Missing function declarations appearing outside component scope
- JSX code appearing directly after useEffect hooks
- Stray closing braces and artifacts from editing tool

Once you have restored a clean, working version of `batch-stage-processor.tsx`, then follow the instructions below.

---

## Issue Description

The batch table is missing child rows for individual raw materials under each batch. Additionally:
1. Raw material rows are shifting left (incorrect column alignment)
2. Missing "Actual Consumption" input fields for each raw material
3. Only showing aggregate values instead of per-material values

## Root Cause

The current implementation only renders one row per batch with aggregated raw material quantities. It needs to:
1. Render child rows for each raw material associated with the batch's current stage
2. Add proper column alignment with empty cells where needed
3. Include individual "Actual Consumption" input fields bound to form state

## Solution

### Step 1: Update Form Schema

Update the `formSchema` in `batch-stage-processor.tsx` (around line 39) to include materials array:

```typescript
const formSchema = z.object({
  batches: z.array(
    z.object({
      id: z.string(),
      accepted: z.coerce.number().min(0),
      rejected: z.coerce.number().min(0),
      actualConsumption: z.coerce.number().min(0),
      materials: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          quantity: z.number(),
          unit: z.string(),
          actualConsumption: z.coerce.number().min(0),
        }),
      ),
    }),
  ),
});
```

### Step 2: Update Form Default Values

Update both the `useForm` initialization and the `useEffect` that resets the form to include materials:

```typescript
const form = useForm<z.infer<typeof formSchema>>({
  resolver: zodResolver(formSchema),
  defaultValues: {
    batches: batches.map((b) => ({
      id: b.id,
      accepted: b.processingStages[stage]?.accepted || 0,
      rejected: b.processingStages[stage]?.rejected || 0,
      actualConsumption: b.processingStages[stage]?.actualConsumption || 0,
      materials: b.materials
        .filter((m) => m.stage === stage)
        .map((m) => ({
          id: m.id,
          name: m.name,
          quantity: m.quantity,
          unit: m.unit,
          actualConsumption: 0,
        })),
    })),
  },
});
```

And in the `useEffect`:

```typescript
useEffect(() => {
  form.reset({
    batches: batches.map((b) => ({
      id: b.id,
      accepted: b.processingStages[stage]?.accepted || 0,
      rejected: b.processingStages[stage]?.rejected || 0,
      actualConsumption: b.processingStages[stage]?.actualConsumption || 0,
      materials: b.materials
        .filter((m) => m.stage === stage)
        .map((m) => ({
          id: m.id,
          name: m.name,
          quantity: m.quantity,
          unit: m.unit,
          actualConsumption: 0,
        })),
    })),
  });
}, [batches, form, stage]);
```

### Step 3: Update Table Body Rendering

Replace the table body section (around line 970-1060) with this code:

```tsx
<TableBody>
  {fields.map((field, index) => {
    const batch = batches[index];
    if (!batch) return null;

    const rawMaterialInput = getRawMaterialForStage(batch);
    const fromPrevStageInput = getInputFromPreviousStage(batch);
    const materialsForStage = batch.materials.filter((m) => m.stage === stage);

    return (
      <>
        {/* Main Batch Row */}
        <TableRow key={field.id}>
          <TableCell>
            <Checkbox
              checked={selectedBatches.has(batch.id)}
              onCheckedChange={(checked) => {
                const newSelected = new Set(selectedBatches);
                if (checked) {
                  newSelected.add(batch.id);
                } else {
                  newSelected.delete(batch.id);
                }
                setSelectedBatches(newSelected);
              }}
            />
          </TableCell>
          <TableCell className="font-mono text-xs">{batch.id}</TableCell>
          <TableCell className="font-medium">{batch.productName}</TableCell>
          <TableCell>
            {format(new Date(batch.createdAt), "MM/dd/yyyy")}
          </TableCell>
          {labels.prevStage && (
            <TableCell>{fromPrevStageInput.toLocaleString()}</TableCell>
          )}
          <TableCell>{rawMaterialInput.toLocaleString()}</TableCell>
          <TableCell>
            <FormField
              control={form.control}
              name={`batches.${index}.actualConsumption`}
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Input type="number" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </TableCell>
          <TableCell>
            <FormField
              control={form.control}
              name={`batches.${index}.accepted`}
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Input type="number" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </TableCell>
          <TableCell>
            <FormField
              control={form.control}
              name={`batches.${index}.rejected`}
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Input type="number" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </TableCell>
        </TableRow>

        {/* Child Rows for Raw Materials */}
        {materialsForStage.map((material, materialIndex) => (
          <TableRow
            key={`${field.id}-material-${material.id}`}
            className="bg-muted/50"
          >
            {/* Empty cell for checkbox column */}
            <TableCell></TableCell>

            {/* Material name spans across Batch ID and Product columns */}
            <TableCell colSpan={2} className="pl-8 text-sm text-muted-foreground">
              ↳ {material.name}
            </TableCell>

            {/* Empty cell for Date Created column */}
            <TableCell></TableCell>

            {/* Empty cell for Previous Stage column (conditional) */}
            {labels.prevStage && <TableCell></TableCell>}

            {/* Material quantity in Input column */}
            <TableCell className="text-sm">
              {material.quantity.toLocaleString()} {material.unit}
            </TableCell>

            {/* Actual Consumption input for this material */}
            <TableCell>
              <FormField
                control={form.control}
                name={`batches.${index}.materials.${materialIndex}.actualConsumption`}
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Input
                        type="number"
                        {...field}
                        placeholder="0"
                        className="h-8"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </TableCell>

            {/* Empty cells for Accepted and Rejected columns */}
            <TableCell></TableCell>
            <TableCell></TableCell>
          </TableRow>
        ))}
      </>
    );
  })}
  {batches.length === 0 && (
    <TableRow>
      <TableCell colSpan={9} className="h-24 text-center">
        No batches are ready for the {stage} stage.
      </TableCell>
    </TableRow>
  )}
</TableBody>
```

## Column Alignment Explanation

The table has these columns (in order):
1. **Checkbox** - Empty for material rows
2. **Batch ID** - Material name uses colSpan={2} to cover both Batch ID and Product
3. **Product** - Covered by material name colSpan
4. **Date Created** - Empty for material rows
5. **Previous Stage** (conditional) - Empty for material rows
6. **Input** - Shows material quantity with unit
7. **Actual Consumption** - Input field for material consumption
8. **Accepted** - Empty for material rows (only on batch row)
9. **Rejected** - Empty for material rows (only on batch row)

## Key Features

1. **Visual Hierarchy**: Child rows use `bg-muted/50` class and `↳` prefix for visual indication
2. **Proper Alignment**: Empty `<TableCell>` elements ensure columns align correctly
3. **Form Binding**: Each material's actual consumption is bound to `batches.${index}.materials.${materialIndex}.actualConsumption`
4. **Conditional Columns**: Handles the conditional "Previous Stage" column properly
5. **Responsive Inputs**: Material consumption inputs use smaller height (`h-8`) for compact display

## Testing Checklist

- [ ] Material rows appear under their parent batch row
- [ ] All columns align properly (no shifting)
- [ ] Material names are indented and styled differently
- [ ] Actual Consumption inputs accept numeric values
- [ ] Form validation works for material consumption fields
- [ ] Data submits correctly with per-material consumption values
- [ ] Empty cells maintain proper spacing

## Notes

- The `React.Fragment` (`<>...</>`) wrapper is used to return multiple rows from the map function
- The `key` prop for material rows includes both the batch ID and material ID to ensure uniqueness
- Material quantities are displayed as read-only text with units
- Only the "Actual Consumption" column is editable for material rows

## Recovery Steps

If your file is corrupted (build errors, syntax errors):

1. **Check version control**: `git checkout src/components/batch-stage-processor.tsx`
2. **Use a backup**: Restore from your backup directory
3. **Rebuild from scratch**: Contact your development team for the original file
4. **Test build**: Run `npm run build` to ensure the file works before applying fixes

After recovery, verify the file structure includes:
- Proper imports at the top
- Form schema definition
- Interface declaration
- Component export with hooks (useState, useEffect)
- Helper functions (getRawMaterialForStage, getInputFromPreviousStage, etc.)
- Return statement with JSX (Form, Table, TableBody, etc.)
- Proper closing of all JSX elements and component

Only then apply the fixes documented above to add raw material child rows.