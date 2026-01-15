import type { ProcessingStageName, FinalStock, Batch, BOMRow } from "./types"

/**
 * Validation utilities for manufacturing stages system
 */

/**
 * Validate that BOM entries only reference selected manufacturing stages
 */
export function validateBOMAgainstStages(
  bomRows: BOMRow[],
  selectedStages: ProcessingStageName[]
): { isValid: boolean; errors: string[] } {
  const errors: string[] = []
  
  if (selectedStages.length === 0) {
    errors.push("No manufacturing stages selected")
    return { isValid: false, errors }
  }

  const invalidEntries = bomRows.filter(
    row => row.stage && !selectedStages.includes(row.stage)
  )

  if (invalidEntries.length > 0) {
    const invalidStages = [...new Set(invalidEntries.map(row => row.stage))]
    errors.push(
      `BOM entries found for unselected stages: ${invalidStages.join(", ")}`
    )
  }

  return {
    isValid: errors.length === 0,
    errors
  }
}

/**
 * Validate that a batch can be processed at a specific stage
 */
export function validateBatchStageAccess(
  batch: Batch,
  requestedStage: ProcessingStageName
): { isValid: boolean; reason?: string } {
  // Check if the stage is in the batch's selected processes
  if (!batch.selectedProcesses.includes(requestedStage)) {
    return {
      isValid: false,
      reason: `Stage "${requestedStage}" is not included in this batch's manufacturing process`
    }
  }

  // Check if it's the correct stage in sequence
  const stageIndex = batch.selectedProcesses.indexOf(requestedStage)
  
  // If it's the first stage, it's always accessible
  if (stageIndex === 0) {
    return { isValid: true }
  }

  // Check if previous stage is completed
  const previousStage = batch.selectedProcesses[stageIndex - 1]
  const isPreviousCompleted = batch.processingStages[previousStage]?.completed

  if (!isPreviousCompleted) {
    return {
      isValid: false,
      reason: `Previous stage "${previousStage}" must be completed first`
    }
  }

  // Check if current stage is not already completed
  const isCurrentCompleted = batch.processingStages[requestedStage]?.completed
  if (isCurrentCompleted) {
    return {
      isValid: false,
      reason: `Stage "${requestedStage}" has already been completed`
    }
  }

  return { isValid: true }
}

/**
 * Get the next stage in the manufacturing process
 */
export function getNextStage(
  batch: Batch,
  currentStage: ProcessingStageName
): ProcessingStageName | null {
  const currentIndex = batch.selectedProcesses.indexOf(currentStage)
  
  if (currentIndex === -1 || currentIndex === batch.selectedProcesses.length - 1) {
    return null // No next stage
  }
  
  return batch.selectedProcesses[currentIndex + 1]
}

/**
 * Check if a stage is the last stage for a batch
 */
export function isLastStage(
  batch: Batch,
  stage: ProcessingStageName
): boolean {
  const stageIndex = batch.selectedProcesses.indexOf(stage)
  return stageIndex === batch.selectedProcesses.length - 1
}

/**
 * Get all available stages for a product
 */
export function getAvailableStagesForProduct(
  product: FinalStock
): ProcessingStageName[] {
  return product.manufacturingStages || []
}

/**
 * Validate product manufacturing stages configuration
 */
export function validateManufacturingStages(
  stages: ProcessingStageName[]
): { isValid: boolean; errors: string[] } {
  const errors: string[] = []
  
  if (stages.length === 0) {
    errors.push("At least one manufacturing stage must be selected")
  }

  // Check for invalid stage combinations based on business rules
  const hasMolding = stages.includes("Molding")
  const hasMachining = stages.includes("Machining")
  const hasAssembling = stages.includes("Assembling")
  const hasTesting = stages.includes("Testing")

  // Business rule: If only one stage is selected, it must be Molding or Machining
  if (stages.length === 1 && !hasMolding && !hasMachining) {
    errors.push("Single-stage products must use either Molding or Machining")
  }

  // Business rule: Assembling and Testing cannot be used without at least one of Molding/Machining
  if ((hasAssembling || hasTesting) && !hasMolding && !hasMachining) {
    errors.push("Assembling and Testing stages require either Molding or Machining to be selected")
  }

  return {
    isValid: errors.length === 0,
    errors
  }
}

/**
 * Get the expected final destination for a batch based on its stages
 */
export function getBatchFinalDestination(
  batch: Batch
): "Store" | "Final Stock" {
  const stages = batch.selectedProcesses
  
  // Any single-stage product should be treated as going directly to Final Stock
  if (stages.length === 1) {
    return "Final Stock"
  }

  // Special case: Only Molding and Machining -> Final Stock
  if (
    stages.length === 2 &&
    stages.includes("Molding") &&
    stages.includes("Machining")
  ) {
    return "Final Stock"
  }

  // All other combinations -> Final Stock (after last stage)
  return "Final Stock"
}

/**
 * Get user-friendly description of the manufacturing process flow
 */
export function getProcessFlowDescription(
  stages: ProcessingStageName[]
): string {
  if (stages.length === 0) {
    return "No manufacturing stages selected"
  }
  
  const stageNames = stages.join(" → ")
  const destination = getBatchFinalDestination({ selectedProcesses: stages } as Batch)
  
  return `${stageNames} → ${destination}`
}
