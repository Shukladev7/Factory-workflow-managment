# Nested Table Quick Reference

## Overview
This guide provides a quick reference for understanding and maintaining the nested raw materials table structure in batch processing stages.

## Visual Pattern

```
Main Row:    [✓] | BATCH-001 | Product X | Oct 14 | [empty] | [input] | [input] | [input]
Material 1:      |  Material A                    | 10 pcs  |
Material 2:      |  Material B                    |  5 kg   |
Material 3:      |  Material C                    |  8 pcs  |
─────────────────────────────────────────────────────────────────────────────────────────
Main Row:    [✓] | BATCH-002 | Product Y | Oct 15 | [empty] | [input] | [input] | [input]
Material 1:      |  Material D                    | 20 pcs  |
```

## Key Components

### 1. Row Structure
- **Main Batch Row**: Contains batch info and input fields
- **Material Sub-Rows**: One per raw material, showing name and quantity
- **Visual Separator**: Thicker border (`border-b-2`) after last material

### 2. Column Spanning (`rowSpan`)
The following columns span ALL rows in a batch group:
- ✅ Checkbox
- ✅ Actual Consumption input
- ✅ Accepted Units input
- ✅ Rejected Units input

**Calculation**:
```typescript
rowSpan = materialsForStage.length > 0 
  ? materialsForStage.length + 1  // +1 for main row
  : 1                              // No materials
```

### 3. Material Filtering
```typescript
const materialsForStage = batch.materials.filter(
  (m) => m.stage === stage
);
```

## Code Pattern

```tsx
<>
  {/* Main Batch Row */}
  <TableRow className="border-b-2 border-gray-300">
    <TableCell rowSpan={rowSpanValue}>
      <Checkbox />
    </TableCell>
    <TableCell className="font-bold">{batch.id}</TableCell>
    <TableCell className="font-bold">{batch.productName}</TableCell>
    <TableCell className="font-bold">{date}</TableCell>
    <TableCell></TableCell> {/* Empty for materials column */}
    <TableCell rowSpan={rowSpanValue}>
      <Input name="actualConsumption" />
    </TableCell>
    <TableCell rowSpan={rowSpanValue}>
      <Input name="accepted" />
    </TableCell>
    <TableCell rowSpan={rowSpanValue}>
      <Input name="rejected" />
    </TableCell>
  </TableRow>

  {/* Material Sub-Rows */}
  {materialsForStage.map((material, index) => (
    <TableRow 
      className={index === last ? "border-b-2 border-gray-300" : ""}
    >
      <TableCell className="pl-8 italic">
        {material.name}
      </TableCell>
      <TableCell></TableCell>
      <TableCell></TableCell>
      <TableCell>
        {material.quantity} {material.unit}
      </TableCell>
    </TableRow>
  ))}
</>
```

## Styling Guide

### Main Row Elements
| Element | Classes | Purpose |
|---------|---------|---------|
| Batch ID | `font-mono text-xs font-bold` | Monospace, bold for emphasis |
| Product | `font-bold` | Bold for hierarchy |
| Date | `font-bold` | Bold for hierarchy |
| Row | `border-b-2 border-gray-300` | Visual separation |

### Material Row Elements
| Element | Classes | Purpose |
|---------|---------|---------|
| Material Name | `pl-8 italic text-sm` | Indented, italic for hierarchy |
| Quantity | `font-medium` | Emphasized value |
| Last Row | `border-b-2 border-gray-300` | Group separation |

## Empty States

### No Materials for Stage
```tsx
rowSpan={1}
// Only main row displayed, no sub-rows
```

### No Batches Available
```tsx
<TableRow>
  <TableCell colSpan={9} className="h-24 text-center">
    No batches are ready for the {stage} stage.
  </TableCell>
</TableRow>
```

## Testing Checklist

- [ ] Single material per batch displays correctly
- [ ] Multiple materials per batch group properly
- [ ] Empty material array shows only main row
- [ ] rowSpan calculates correctly for all cases
- [ ] Input fields work for spanned cells
- [ ] Checkbox selection includes entire batch
- [ ] Visual borders separate batches clearly
- [ ] Material names are indented and italicized
- [ ] Responsive design works on different screens

## Common Issues & Solutions

### Issue: Input fields not aligned
**Solution**: Ensure `rowSpan` includes ALL rows (main + materials)

### Issue: Borders don't line up
**Solution**: Apply `border-b-2` to main row AND last material row

### Issue: Materials from wrong stage showing
**Solution**: Filter by `material.stage === currentStage`

### Issue: Checkbox selects only main row
**Solution**: Selection logic should work at batch level, not row level

## Stage-Specific Labels

```typescript
const stageLabels = {
  Molding: {
    input: "Molding Raw Mat. Input",
    accepted: "Accepted Molded",
    rejected: "Rejected Molded"
  },
  Machining: {
    input: "Machining Raw Mat. Input",
    accepted: "Accepted Machined",
    rejected: "Rejected Machined"
  },
  // ... etc
};
```

## Data Flow

```
Batch Data (Firestore)
    ↓
Filter Materials by Stage
    ↓
Calculate rowSpan (materials.length + 1)
    ↓
Render Main Row with rowSpan cells
    ↓
Render Material Sub-Rows
    ↓
Apply border to last material row
```

## Performance Tips

1. **Memoization**: Consider memoizing material filtering
   ```typescript
   const materialsForStage = useMemo(
     () => batch.materials.filter(m => m.stage === stage),
     [batch.materials, stage]
   );
   ```

2. **Key Props**: Use stable keys for material rows
   ```typescript
   key={`${batch.id}-material-${material.id}`}
   ```

3. **Conditional Rendering**: Skip empty material arrays early
   ```typescript
   if (materialsForStage.length === 0) {
     // Render simplified structure
   }
   ```

## File Locations

- Implementation: `/src/components/batch-stage-processor.tsx`
- Types: `/src/lib/types.ts` (Batch, BatchMaterial interfaces)
- Pages: `/src/app/batches/[stage]/page.tsx`

## Related Documentation

- Full docs: `NESTED_RAW_MATERIALS_STRUCTURE.md`
- Examples: `TABLE_STRUCTURE_EXAMPLE.md`
- Types: See `BatchMaterial` interface in types.ts

---

**Last Updated**: After implementing nested table structure  
**Maintained By**: Engineering Team