# Nested Raw Materials Table Structure

## Overview

This document describes the implementation of a nested table structure for displaying batch processing information with raw materials. When multiple raw materials are selected for a stage (e.g., Molding, Machining), the system now displays one main entry per batch with each raw material listed as a separate row underneath.

## Visual Structure

### Before (Old Structure)
Each combination of batch and material would be shown as a separate full row, making it difficult to group information by batch.

### After (New Structure)
```
┌────┬──────────┬─────────┬──────────┬──────────┬──────────┬────────────┐
│ ☑  │ Batch 123│ X100    │ 14-Oct   │          │          │  Accepted  │
├────┼──────────┼─────────┼──────────┼──────────┼──────────┼────────────┤
│    │  Chasis  │         │          │    4     │          │            │
├────┼──────────┼─────────┼──────────┼──────────┼──────────┼────────────┤
│    │  Back    │         │          │    2     │          │            │
╞════╪══════════╪═════════╪══════════╪══════════╪══════════╪════════════╡
│ ☑  │ Batch 124│ Y200    │ 15-Oct   │          │          │  Accepted  │
├────┼──────────┼─────────┼──────────┼──────────┼──────────┼────────────┤
│    │  Frame   │         │          │    3     │          │            │
└────┴──────────┴─────────┴──────────┴──────────┴──────────┴────────────┘
```

## Structure Details

### Main Batch Row
Contains:
- **Checkbox** (spans all material rows)
- **Batch ID** (bold, mono font)
- **Product Name** (bold)
- **Date Created** (bold)
- **Input from Previous Stage** (if applicable)
- **Raw Material Input** (empty for main row)
- **Actual Consumption** (input field, spans all material rows)
- **Accepted Units** (input field, spans all material rows)
- **Rejected Units** (input field, spans all material rows)

### Raw Material Sub-Rows
Each raw material for that batch is displayed as a separate row showing:
- **Raw Material Name** (indented, italic text)
- **Raw Material Quantity** (with unit)
- Empty cells for other columns to maintain alignment

## Technical Implementation

### Key Changes in `batch-stage-processor.tsx`

1. **Row Spanning**: Used `rowSpan` attribute to make certain cells span across multiple rows:
   - Checkbox column
   - Actual Consumption input
   - Accepted Units input
   - Rejected Units input

2. **Material Filtering**: Filter materials by stage before rendering:
   ```typescript
   const materialsForStage = batch.materials.filter(
     (m) => m.stage === stage,
   );
   ```

3. **Dynamic Row Span Calculation**:
   ```typescript
   rowSpan={
     materialsForStage.length > 0
       ? materialsForStage.length + 1
       : 1
   }
   ```

4. **Visual Separation**: 
   - Main batch rows have thicker bottom borders (`border-b-2 border-gray-300`)
   - Material names are indented (`pl-8`) and italicized
   - Last material row in each group has a thicker border for clear separation

### React Fragment Structure
```tsx
<>
  {/* Main batch row */}
  <TableRow key={field.id} className="border-b-2 border-gray-300">
    <TableCell rowSpan={...}>Checkbox</TableCell>
    <TableCell>Batch ID</TableCell>
    <TableCell>Product</TableCell>
    <TableCell>Date</TableCell>
    <TableCell></TableCell> {/* Empty for input column */}
    <TableCell rowSpan={...}>Consumption Input</TableCell>
    <TableCell rowSpan={...}>Accepted Input</TableCell>
    <TableCell rowSpan={...}>Rejected Input</TableCell>
  </TableRow>

  {/* Raw material rows */}
  {materialsForStage.map((material, matIndex) => (
    <TableRow key={`${field.id}-material-${matIndex}`}>
      <TableCell>{material.name}</TableCell>
      <TableCell></TableCell>
      <TableCell></TableCell>
      <TableCell>{material.quantity} {material.unit}</TableCell>
    </TableRow>
  ))}
</>
```

## Benefits

1. **Better Organization**: Batch information is clearly grouped together
2. **Improved Readability**: Easy to see which materials belong to which batch
3. **Space Efficient**: Reduces redundant information repetition
4. **Clear Hierarchy**: Visual indentation and styling make the relationship obvious
5. **Maintainability**: Input fields are associated with the batch, not individual materials
6. **Consistency**: Matches common accounting and inventory management patterns

## User Experience

### Data Entry
- Users can see all materials for a batch at a glance
- Input fields (Actual Consumption, Accepted, Rejected) apply to the entire batch
- Checkbox selection includes all materials for that batch

### Visual Feedback
- Bold text for main batch information
- Italic, indented text for material details
- Thicker borders separate different batches
- Empty cells maintain proper alignment

## Stage Applicability

This structure is applied to all processing stages:
- **Molding**: Shows raw materials with their input quantities
- **Machining**: Shows materials (if any) plus input from Molding
- **Assembling**: Shows materials (if any) plus input from Machining
- **Testing**: Shows materials (if any) plus input from Assembling

## Column Headers

The table headers are:
1. Checkbox (bulk selection)
2. Batch ID
3. Product
4. Date Created
5. [Previous Stage Input] (conditional, e.g., "From Molding")
6. [Stage] Raw Mat. Input (e.g., "Molding Raw Mat. Input")
7. Actual Consumption
8. [Stage-specific Accepted label] (e.g., "Accepted Molded")
9. [Stage-specific Rejected label] (e.g., "Rejected Molded")

## Edge Cases Handled

1. **No Materials**: If a batch has no materials for the current stage, only the main row is shown with `rowSpan={1}`
2. **Single Material**: Works seamlessly with one material row
3. **Multiple Materials**: Automatically adjusts row spans based on material count
4. **Empty State**: Shows appropriate message when no batches are available

## Future Enhancements

Potential improvements:
- Collapsible material rows for large batches
- Per-material consumption tracking (if needed)
- Color coding for low-stock materials
- Tooltips showing additional material information
- Export functionality preserving the grouped structure

## Related Files

- `/src/components/batch-stage-processor.tsx` - Main implementation
- `/src/lib/types.ts` - Data type definitions (`Batch`, `BatchMaterial`)
- `/src/app/batches/molding/page.tsx` - Molding stage page
- `/src/app/batches/machining/page.tsx` - Machining stage page
- `/src/app/batches/assembling/page.tsx` - Assembling stage page
- `/src/app/batches/testing/page.tsx` - Testing stage page