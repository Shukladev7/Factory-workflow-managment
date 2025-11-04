/**
 * Utility functions for formatting long strings and IDs in the UI
 */

/**
 * Detects if a string is a long numeric ID that should be truncated
 * @param value - The string to check
 * @returns boolean indicating if it's a long numeric ID
 */
export function isLongNumericId(value: string | number): boolean {
  const str = String(value)
  // Check for long numeric strings (15+ digits) or very long alphanumeric IDs
  return /^\d{15,}$/.test(str) || (str.length > 20 && /^[a-zA-Z0-9]+$/.test(str))
}

/**
 * Formats a batch ID for display (truncates long IDs)
 * @param id - The batch ID to format
 * @param maxLength - Maximum length before truncation (default: 12)
 * @returns Formatted ID string
 */
export function formatBatchId(id: string, maxLength: number = 12): string {
  if (id.length <= maxLength) return id
  
  // For very long IDs, show start and end
  if (id.length > 20) {
    const start = Math.floor(maxLength / 2) - 1
    const end = Math.ceil(maxLength / 2) - 2
    return `${id.slice(0, start)}...${id.slice(-end)}`
  }
  
  // For moderately long IDs, just truncate with ellipsis
  return `${id.slice(0, maxLength - 3)}...`
}

/**
 * Formats any long string for display in tables or UI components
 * @param value - The value to format
 * @param maxLength - Maximum length before truncation (default: 20)
 * @returns Formatted string
 */
export function formatLongString(value: string | number, maxLength: number = 20): string {
  const str = String(value)
  
  if (str.length <= maxLength) return str
  
  // Check if it's a numeric ID that should be specially formatted
  if (isLongNumericId(str)) {
    return formatBatchId(str, Math.min(maxLength, 12))
  }
  
  // For other long strings, truncate with ellipsis
  return `${str.slice(0, maxLength - 3)}...`
}

/**
 * Safely converts a value to a localized number string
 * @param value - The value to format
 * @returns Formatted number string or original string if not a number
 */
export function formatNumber(value: unknown): string {
  if (typeof value === 'number') {
    return value.toLocaleString()
  }
  
  const parsed = Number(value)
  if (!isNaN(parsed)) {
    return parsed.toLocaleString()
  }
  
  return String(value || '-')
}