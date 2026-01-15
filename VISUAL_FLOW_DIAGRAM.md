# Visual Flow Diagram: Nested Materials Table

## Table Structure Visualization

### Component Hierarchy

```
┌─────────────────────────────────────────────────────────────┐
│                    BatchStageProcessor                       │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                    <Form>                             │  │
│  │                                                        │  │
│  │  ┌────────────────────────────────────────────────┐  │  │
│  │  │              <Table>                            │  │  │
│  │  │                                                  │  │  │
│  │  │  ┌───────────────────────────────────────────┐  │  │  │
│  │  │  │        <TableHeader>                       │  │  │  │
│  │  │  │  Checkbox | Batch | Product | Date | ...  │  │  │  │
│  │  │  └───────────────────────────────────────────┘  │  │  │
│  │  │                                                  │  │  │
│  │  │  ┌───────────────────────────────────────────┐  │  │  │
│  │  │  │        <TableBody>                         │  │  │  │
│  │  │  │                                             │  │  │  │
│  │  │  │  For each batch {                          │  │  │  │
│  │  │  │    <>                                       │  │  │  │
│  │  │  │      <TableRow> Main Batch Info            │  │  │  │
│  │  │  │      {materials.map(                       │  │  │  │
│  │  │  │        <TableRow> Material Sub-Row         │  │  │  │
│  │  │  │      )}                                     │  │  │  │
│  │  │  │    </>                                      │  │  │  │
│  │  │  │  }                                          │  │  │  │
│  │  │  │                                             │  │  │  │
│  │  │  └───────────────────────────────────────────┘  │  │  │
│  │  │                                                  │  │  │
│  │  └────────────────────────────────────────────────┘  │  │
│  │                                                        │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Row Spanning Visualization

### Example: Batch with 3 Materials

```
Row 1  ┌──────┬──────┬──────┬──────┬──────┬──────┬──────┬──────┬──────┐
       │  ✓   │BATCH │ X100 │14-Oct│      │      │ [50] │ [100]│ [ 5] │
       │      ├──────┼──────┼──────┼──────┼──────┤      │      │      │
Row 2  │      │Chas. │      │      │      │10 pcs│      │      │      │
       │      ├──────┼──────┼──────┼──────┼──────┤      │      │      │
Row 3  │      │Back  │      │      │      │ 8 pcs│      │      │      │
       │      ├──────┼──────┼──────┼──────┼──────┤      │      │      │
Row 4  │      │Frame │      │      │      │12 pcs│      │      │      │
       └──────┴──────┴──────┴──────┴──────┴──────┴──────┴──────┴──────┘
       
       rowSpan=4  (No rowSpan)              rowSpan=4 for input fields
```

## Cell Types

### Type 1: Spanning Cells (rowSpan > 1)
```
┌──────────┐
│ Checkbox │ → Spans all rows
│          │
│          │
│          │
└──────────┘
```

### Type 2: Main Row Cells
```
┌──────────┐
│ BATCH-ID │ → Only in main row
└──────────┘
```

### Type 3: Sub-Row Cells
```
┌──────────┐
│ Material │ → One per material
└──────────┘
```

### Type 4: Empty Alignment Cells
```
┌──────────┐
│          │ → Empty for alignment
└──────────┘
```

## Data Flow Through Structure

```
┌─────────────────┐
│  Batch Object   │
│  {              │
│    id: "123"    │
│    materials: [ │
│      {...},     │
│      {...},     │
│      {...}      │
│    ]            │
│  }              │
└────────┬────────┘
         │
         ↓
┌─────────────────────────────┐
│ Filter Materials by Stage   │
│ materialsForStage = [M1,M2,M3]│
└────────┬────────────────────┘
         │
         ↓
┌─────────────────────────────┐
│ Calculate rowSpan           │
│ rowSpan = 3 + 1 = 4        │
└────────┬────────────────────┘
         │
         ├──────────────────────────┐
         │                          │
         ↓                          ↓
┌─────────────────────┐   ┌─────────────────────┐
│ Render Main Row     │   │ Render Material     │
│ with rowSpan=4      │   │ Sub-Rows (3 rows)   │
│ for spanned cells   │   │                     │
└─────────────────────┘   └─────────────────────┘
         │                          │
         └──────────┬───────────────┘
                    │
                    ↓
          ┌─────────────────┐
          │ Final Rendered  │
          │ Table Structure │
          └─────────────────┘
```

## State Management Flow

```
User Action
    │
    ↓
┌──────────────────┐
│ Checkbox Click   │
│ or Input Change  │
└─────┬────────────┘
      │
      ↓
┌──────────────────────┐
│ Update State         │
│ (selectedBatches or  │
│  form values)        │
└─────┬────────────────┘
      │
      ↓
┌──────────────────────┐
│ React Re-render      │
│ (Only affected rows) │
└──────────────────────┘
```

## Column Index Reference

```
Col 0: Checkbox (rowSpan)
Col 1: Batch ID
Col 2: Product Name
Col 3: Date Created
Col 4: Previous Stage Input (conditional)
Col 5: Raw Material Input
Col 6: Actual Consumption (rowSpan)
Col 7: Accepted Units (rowSpan)
Col 8: Rejected Units (rowSpan)
```

### Main Row Pattern
```
[✓] [ID] [Product] [Date] [PrevIn] [ ] [Input] [Input] [Input]
 ^    ^      ^       ^       ^      ^     ^       ^       ^
 Span NoSpan NoSpan NoSpan NoSpan Empty Span   Span   Span
```

### Material Row Pattern
```
[  ] [Material]  [ ]  [ ]  [ ] [Qty] [  ] [  ] [  ]
 ^       ^        ^    ^    ^    ^    ^    ^    ^
Skip   NoSpan  Empty Empty Empty Show Skip Skip Skip
```

## Rendering Logic Pseudocode

```
for each batch in batches:
  materialsForStage = filter(batch.materials, stage)
  rowSpan = materialsForStage.length + 1
  
  // Render main row
  <TableRow>
    <Cell rowSpan={rowSpan}>Checkbox</Cell>
    <Cell>Batch ID</Cell>
    <Cell>Product</Cell>
    <Cell>Date</Cell>
    [conditional prev stage cell]
    <Cell></Cell>  // Empty for materials
    <Cell rowSpan={rowSpan}>Consumption Input</Cell>
    <Cell rowSpan={rowSpan}>Accepted Input</Cell>
    <Cell rowSpan={rowSpan}>Rejected Input</Cell>
  </TableRow>
  
  // Render material rows
  for each material in materialsForStage:
    <TableRow>
      // Checkbox col is spanned, skip
      <Cell>{material.name}</Cell>
      <Cell></Cell>  // Empty
      <Cell></Cell>  // Empty
      [conditional empty cell]
      <Cell>{material.quantity} {material.unit}</Cell>
      // Input cols are spanned, skip
    </TableRow>
```

## Border Strategy

```
Main Row:         border-b-2 (thick)
Material Row 1:   border-b (thin)
Material Row 2:   border-b (thin)
Material Row N:   border-b-2 (thick) ← Last material
─────────────────────────────────────────────
Next Batch Main:  border-b-2 (thick)
...
```

Visual result:
```
═══════════════  ← Thick border after main
───────────────  ← Thin border between materials
───────────────
═══════════════  ← Thick border after last material
═══════════════  ← Next batch starts
```

## Responsive Behavior

### Desktop View
```
┌────────────────────────────────────────────────────────┐
│ Full table with all columns visible                    │
│ Materials indented with proper spacing                 │
└────────────────────────────────────────────────────────┘
```

### Tablet View
```
┌──────────────────────────────────────┐
│ Table scrolls horizontally           │
│ Structure remains intact             │
└──────────────────────────────────────┘
```

### Mobile View
```
┌─────────────────┐
│ Horizontal      │
│ scroll enabled  │
│ Nested structure│
│ preserved       │
└─────────────────┘
```

## Key Implementation Points

1. **React Fragment**: Wraps main + material rows as one group
2. **rowSpan Calculation**: Dynamic based on material count
3. **Conditional Rendering**: Handle zero materials case
4. **CSS Classes**: Different styles for main vs sub-rows
5. **Key Props**: Unique keys for React reconciliation
6. **Border Logic**: Thick borders for group separation

