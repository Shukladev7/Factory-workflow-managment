import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function durationBetween(startIso?: string, endIso?: string, nowMs: number = Date.now()): number {
  if (!startIso) return 0
  const start = Date.parse(startIso)
  const end = endIso ? Date.parse(endIso) : nowMs
  if (Number.isNaN(start) || Number.isNaN(end)) return 0
  return Math.max(0, end - start)
}

export function formatMsToHMS(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const hrs = Math.floor(totalSeconds / 3600)
    .toString()
    .padStart(2, "0")
  const mins = Math.floor((totalSeconds % 3600) / 60)
    .toString()
    .padStart(2, "0")
  const secs = (totalSeconds % 60).toString().padStart(2, "0")
  return `${hrs}:${mins}:${secs}`
}

export function formatNumber(num: number): string {
  return new Intl.NumberFormat('en-US').format(num)
}

/**
 * Get the global, immutable batch ID for a batch.
 * This is the single source of truth for batch identification across the system.
 * 
 * Priority: batchId > batchCode > id (Firestore document ID)
 * 
 * @param batch - Batch object with id, batchId (optional), and batchCode (optional)
 * @returns The global batch identifier
 */
export function getBatchId(batch: { id: string; batchId?: string; batchCode?: string }): string {
  return batch.batchId || batch.batchCode || batch.id
}
