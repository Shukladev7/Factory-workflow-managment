# Process Flow - Manufacturing Batch Management System

A comprehensive NextJS-based manufacturing management system for tracking raw materials, batch processing, and final stock across multiple production stages.

## Overview

Process Flow is a production management application designed to streamline manufacturing operations by tracking batches through various processing stages (Molding, Machining, Assembling, Testing) while managing raw material consumption and final stock inventory.

## Key Features

### 📦 Batch Management
- Create and track production batches through multiple stages
- Flexible process selection (choose which stages to include)
- Real-time batch status tracking
- Comprehensive batch history and reporting

### 🏭 Multi-Stage Processing
- **Molding**: Initial shaping with raw material tracking
- **Machining**: Secondary processing with material addition
- **Assembling**: Component assembly stage
- **Testing**: Quality control and final testing

### 📊 Raw Materials Management
- Track raw material inventory in real-time
- Automatic stock deduction based on batch consumption
- Low-stock threshold alerts
- Material categorization by processing stage

### 🎯 Final Stock Management
- Product-based inventory organization
- Batch traceability from production to final stock
- SKU and pricing management
- Automated stock updates from completed batches

### 📈 Dashboard & Analytics
- Real-time production metrics
- Stage-wise batch tracking
- Production output visualization
- Activity logging and audit trails

## Recent Updates

### ✨ Nested Raw Materials Table Structure (Latest)

We've implemented a new hierarchical table structure for batch processing stages that provides better organization and clarity when working with multiple raw materials per batch.

**Visual Structure:**
```
┌────────────────────────────────────────────────────────┐
│ ✓  BATCH-123  Product X  Oct 14           [inputs...]  │
│     └─ Chassis         10 pcs                          │
│     └─ Back Cover       8 pcs                          │
│     └─ Frame           12 pcs                          │
├────────────────────────────────────────────────────────┤
│ ✓  BATCH-124  Product Y  Oct 15           [inputs...]  │
│     └─ Component A     15 pcs                          │
└────────────────────────────────────────────────────────┘
```

**Benefits:**
- Clear batch grouping with hierarchical display
- Single set of input fields per batch (no redundancy)
- Better visual organization and readability
- Industry-standard nested table format

**Documentation:**
- Full details: [NESTED_RAW_MATERIALS_STRUCTURE.md](./NESTED_RAW_MATERIALS_STRUCTURE.md)
- Examples: [TABLE_STRUCTURE_EXAMPLE.md](./TABLE_STRUCTURE_EXAMPLE.md)
- Quick Reference: [NESTED_TABLE_QUICK_REFERENCE.md](./NESTED_TABLE_QUICK_REFERENCE.md)
- Implementation: [IMPLEMENTATION_NESTED_MATERIALS.md](./IMPLEMENTATION_NESTED_MATERIALS.md)

## Tech Stack

- **Framework**: Next.js 14 with App Router
- **Language**: TypeScript
- **Database**: Firebase Firestore
- **Authentication**: Firebase Auth (ready for implementation)
- **UI Components**: shadcn/ui + Radix UI
- **Styling**: Tailwind CSS
- **Forms**: React Hook Form + Zod validation
- **Charts**: Recharts
- **Date Handling**: date-fns

## Project Structure

```
processsflow-main/
├── src/
│   ├── app/                    # Next.js App Router pages
│   │   ├── page.tsx           # Dashboard
│   │   ├── batches/           # Batch management
│   │   │   ├── overview/      # Batch list and overview
│   │   │   ├── molding/       # Molding stage
│   │   │   ├── machining/     # Machining stage
│   │   │   ├── assembling/    # Assembling stage
│   │   │   └── testing/       # Testing stage
│   │   ├── raw-materials/     # Raw materials management
│   │   ├── final-stock/       # Final stock/products
│   │   ├── reports/           # Reports and analytics
│   │   └── setup/             # Configuration
│   ├── components/            # React components
│   │   ├── ui/               # shadcn/ui components
│   │   ├── batch-stage-processor.tsx  # Main batch processing
│   │   ├── batch-details-dialog.tsx   # Batch details view
│   │   └── app-sidebar.tsx   # Navigation sidebar
│   ├── lib/                   # Utilities and helpers
│   │   ├── firebase/         # Firebase configuration
│   │   ├── types.ts          # TypeScript type definitions
│   │   └── utils.ts          # Utility functions
│   └── hooks/                 # Custom React hooks
├── public/                    # Static assets
└── docs/                      # Additional documentation
```

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Firebase project (with Firestore enabled)
- Firebase configuration credentials

### Installation

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd processsflow-main
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure Firebase:**
   - Create a `.env.local` file in the root directory
   - Add your Firebase configuration:
     ```env
     NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
     NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_auth_domain
     NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
     NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_storage_bucket
     NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
     NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
     ```

4. **Run the development server:**
   ```bash
   npm run dev
   ```

5. **Open your browser:**
   Navigate to [http://localhost:3000](http://localhost:3000)

## Data Model

### Core Entities

#### Batch
```typescript
interface Batch {
  id: string;
  productId: string;
  productName: string;
  materials: BatchMaterial[];
  selectedProcesses: ProcessingStageName[];
  processingStages: Record<ProcessingStageName, ProcessingStage>;
  status: "Completed" | "In Progress" | "On Hold" | "Planned";
  createdAt: string;
}
```

#### BatchMaterial
```typescript
interface BatchMaterial {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  stage: ProcessingStageName;  // Which stage uses this material
}
```

#### RawMaterial
```typescript
interface RawMaterial {
  id: string;
  name: string;
  sku: string;
  quantity: number;
  unit: string;
  threshold: number;
  isMoulded?: boolean;
  isFinished?: boolean;
}
```

#### FinalStock (Product)
```typescript
interface FinalStock {
  id: string;
  name: string;
  sku: string;
  price: number;
  gstRate: number;
  batches: BatchEntry[];
  bom_per_piece?: BOMRow[];
}
```

## Features in Detail

### Batch Processing Workflow

1. **Create Batch**
   - Select product
   - Choose processing stages
   - Assign raw materials to specific stages
   - Generate batch ID

2. **Process Through Stages**
   - Start with first selected stage
   - Input accepted/rejected units
   - Track actual material consumption
   - Automatic raw material deduction
   - Move to next stage or complete

3. **Completion Options**
   - **Finish Batch**: Complete all stages, add to final stock
   - **End Cycle**: Stop at current stage

### Material Flow

```
Raw Materials Store
    ↓
Batch Creation (assign materials to stages)
    ↓
Stage Processing (consumption tracking)
    ↓
Automatic Stock Deduction
    ↓
Final Stock (completed products)
```

### Activity Logging

All major actions are logged for audit purposes:
- Raw material additions/updates/deletions
- Batch creation and processing
- Stock adjustments
- Stage completions

## API & Firebase Integration

### Firestore Collections
- `batches` - Production batches
- `rawMaterials` - Raw material inventory
- `finalStock` - Products/finished goods
- `activityLogs` - Audit trail

### Key Firebase Operations
- Real-time subscriptions for live updates
- Batch updates with transactions
- Automatic ID generation
- Query filtering by stage and status

## Deployment

### Firebase Hosting

```bash
npm run build
firebase deploy
```

### Vercel

```bash
vercel deploy
```

## Environment Variables

Required environment variables:
- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`

## Troubleshooting

See [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for common issues and solutions.

## Documentation

- [Batch Data Model](./BATCHES_DATA_MODEL.md)
- [Nested Materials Structure](./NESTED_RAW_MATERIALS_STRUCTURE.md)
- [Table Structure Examples](./TABLE_STRUCTURE_EXAMPLE.md)
- [Quick Reference Guide](./NESTED_TABLE_QUICK_REFERENCE.md)
- [Implementation Details](./IMPLEMENTATION_NESTED_MATERIALS.md)

## Contributing

1. Create a feature branch
2. Make your changes
3. Test thoroughly
4. Submit a pull request

## License

[Specify your license here]

## Support

For questions or issues, please [open an issue](https://github.com/your-repo/issues) or contact the development team.

---

**Version**: 2.0  
**Last Updated**: 2024  
**Status**: Active Development