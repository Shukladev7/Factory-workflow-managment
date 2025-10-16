# Table Structure Example

## Example 1: Molding Stage with Multiple Raw Materials

### Batch with 3 Raw Materials

| ☑ | Batch ID | Product | Date      | Molding Raw Mat. Input | Actual Consumption | Accepted Molded | Rejected Molded |
|---|----------|---------|-----------|------------------------|--------------------|--------------------|------------------|
| ☑ | **BATCH-123** | **Product X100** | **14-Oct-2024** | | [  50  ] | [  100  ] | [  5  ] |
|   | *Chassis* |  |  | **10 pcs** |  |  |  |
|   | *Back Cover* |  |  | **8 pcs** |  |  |  |
|   | *Internal Frame* |  |  | **12 pcs** |  |  |  |
| ☑ | **BATCH-124** | **Product Y200** | **15-Oct-2024** | | [  40  ] | [  80  ] | [  3  ] |
|   | *Main Body* |  |  | **15 pcs** |  |  |  |
|   | *Cover Plate* |  |  | **6 pcs** |  |  |  |

**Note**: The checkbox, Actual Consumption, Accepted, and Rejected columns span all material rows for each batch.

---

## Example 2: Machining Stage with Previous Stage Input

| ☑ | Batch ID | Product | Date | From Molding | Machining Raw Mat. Input | Actual Consumption | Accepted Machined | Rejected Machined |
|---|----------|---------|------|--------------|--------------------------|--------------------|--------------------|-------------------|
| ☑ | **BATCH-123** | **Product X100** | **14-Oct-2024** | 100 | | [  20  ] | [  95  ] | [  5  ] |
|   | *Screws* |  |  |  | **50 pcs** |  |  |  |
|   | *Bolts* |  |  |  | **30 pcs** |  |  |  |
| ☑ | **BATCH-125** | **Product Z300** | **16-Oct-2024** | 150 | | [  30  ] | [  140  ] | [  10  ] |
|   | *Fasteners* |  |  |  | **75 pcs** |  |  |  |

---

## Example 3: Batch with No Raw Materials (Direct Processing)

| ☑ | Batch ID | Product | Date | From Molding | Machining Raw Mat. Input | Actual Consumption | Accepted Machined | Rejected Machined |
|---|----------|---------|------|--------------|--------------------------|--------------------|--------------------|-------------------|
| ☑ | **BATCH-126** | **Product A400** | **17-Oct-2024** | 200 | 0 | [  0  ] | [  190  ] | [  10  ] |

**Note**: When no materials are used in this stage, only the main row is displayed.

---

## Visual Styling Details

### Main Batch Row Styling
- **Batch ID**: Bold, monospace font (`font-mono font-bold`)
- **Product Name**: Bold (`font-bold`)
- **Date**: Bold (`font-bold`)
- **Border**: Thicker bottom border (2px) for visual separation

### Material Sub-Row Styling
- **Material Name**: 
  - Indented with left padding (`pl-8`)
  - Italic text (`italic`)
  - Regular font size but smaller than main row
- **Quantity**: Shows value with unit (e.g., "10 pcs", "5 kg")
- **Border**: Last material row in group has thicker border (2px)

### Input Fields
- Span across all material rows
- Standard number input fields
- Associated with the entire batch, not individual materials
- Value applies to the cumulative processing of all materials

---

## Data Flow Example

### Input Data Structure
```json
{
  "id": "BATCH-123",
  "productName": "Product X100",
  "createdAt": "2024-10-14T10:30:00Z",
  "materials": [
    {
      "id": "mat-001",
      "name": "Chassis",
      "quantity": 10,
      "unit": "pcs",
      "stage": "Molding"
    },
    {
      "id": "mat-002",
      "name": "Back Cover",
      "quantity": 8,
      "unit": "pcs",
      "stage": "Molding"
    },
    {
      "id": "mat-003",
      "name": "Internal Frame",
      "quantity": 12,
      "unit": "pcs",
      "stage": "Molding"
    }
  ],
  "processingStages": {
    "Molding": {
      "accepted": 100,
      "rejected": 5,
      "actualConsumption": 50,
      "completed": false
    }
  }
}
```

### Rendered Output
The system automatically:
1. Groups materials by batch
2. Creates one main row with batch details
3. Creates sub-rows for each material
4. Calculates rowSpan dynamically (3 materials + 1 main row = 4 total rows)
5. Applies appropriate styling for hierarchy

---

## Comparison: Before vs After

### BEFORE (Each material as full row)
```
☑ | BATCH-123 | Product X100 | 14-Oct | Chassis      | 10 pcs | [50] | [100] | [5]
☑ | BATCH-123 | Product X100 | 14-Oct | Back Cover   |  8 pcs | [50] | [100] | [5]
☑ | BATCH-123 | Product X100 | 14-Oct | Internal     | 12 pcs | [50] | [100] | [5]
```
**Issues**: 
- Redundant batch information repeated
- Confusing which material belongs to which batch
- Input fields repeated unnecessarily

### AFTER (Nested structure)
```
☑ | BATCH-123 | Product X100 | 14-Oct |            |      | [50] | [100] | [5]
  |  Chassis  |              |        | 10 pcs     |      |      |       |
  |  Back     |              |        |  8 pcs     |      |      |       |
  |  Internal |              |        | 12 pcs     |      |      |       |
```
**Benefits**:
- Clear batch grouping
- No redundant information
- Easy to understand relationships
- Professional appearance
- Matches industry standards

