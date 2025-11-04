import * as React from "react"
import { useState, useMemo } from "react"
import { Search, ChevronLeft, ChevronRight, Copy, Check } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"

export interface Column<T> {
  key: keyof T
  header: string
  render?: (value: any, item: T) => React.ReactNode
  sortable?: boolean
  searchable?: boolean
  width?: string
}

export interface DataTableProps<T> {
  data: T[]
  columns: Column<T>[]
  searchPlaceholder?: string
  pageSize?: number
  className?: string
  emptyMessage?: string
}

function TruncatedId({ id, maxLength = 12 }: { id: string; maxLength?: number }) {
  const [copied, setCopied] = useState(false)

  const truncatedId = id.length > maxLength ? `${id.slice(0, maxLength)}...` : id

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(id)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      console.error("Failed to copy:", error)
    }
  }

  return (
    <div className="flex items-center gap-2 max-w-[160px]">
      <code className="text-xs bg-muted px-2 py-1 rounded font-mono text-muted-foreground">
        {truncatedId}
      </code>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleCopy}
        className="h-6 w-6 p-0"
        title={copied ? "Copied!" : "Copy full ID"}
      >
        {copied ? (
          <Check className="h-3 w-3 text-green-600" />
        ) : (
          <Copy className="h-3 w-3" />
        )}
      </Button>
    </div>
  )
}

export function DataTable<T>({
  data,
  columns,
  searchPlaceholder = "Search...",
  pageSize = 10,
  className,
  emptyMessage = "No data available",
}: DataTableProps<T>) {
  const [searchTerm, setSearchTerm] = useState("")
  const [currentPage, setCurrentPage] = useState(1)
  const [sortConfig, setSortConfig] = useState<{
    key: keyof T | null
    direction: "asc" | "desc"
  }>({ key: null, direction: "asc" })

  // Filter and search data
  const filteredData = useMemo(() => {
    if (!searchTerm) return data

    return data.filter((item) =>
      columns.some((column) => {
        if (!column.searchable) return false
        const value = item[column.key]
        if (value == null) return false
        return String(value).toLowerCase().includes(searchTerm.toLowerCase())
      })
    )
  }, [data, searchTerm, columns])

  // Sort data
  const sortedData = useMemo(() => {
    if (!sortConfig.key) return filteredData

    return [...filteredData].sort((a, b) => {
      const aValue = a[sortConfig.key!]
      const bValue = b[sortConfig.key!]

      if (aValue < bValue) {
        return sortConfig.direction === "asc" ? -1 : 1
      }
      if (aValue > bValue) {
        return sortConfig.direction === "asc" ? 1 : -1
      }
      return 0
    })
  }, [filteredData, sortConfig])

  // Paginate data
  const paginatedData = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize
    return sortedData.slice(startIndex, startIndex + pageSize)
  }, [sortedData, currentPage, pageSize])

  const totalPages = Math.ceil(sortedData.length / pageSize)

  const handleSort = (key: keyof T) => {
    const column = columns.find((col) => col.key === key)
    if (!column?.sortable) return

    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc",
    }))
  }

  return (
    <div className={cn("space-y-4", className)}>
      {/* Search and Info Bar */}
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
          <Input
            placeholder={searchPlaceholder}
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value)
              setCurrentPage(1) // Reset to first page when searching
            }}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span>
            Showing {paginatedData.length} of {sortedData.length} results
          </span>
          <Select
            value={String(pageSize)}
            onValueChange={(value) => {
              setCurrentPage(1)
            }}
          >
            <SelectTrigger className="w-[100px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="10">10 rows</SelectItem>
              <SelectItem value="25">25 rows</SelectItem>
              <SelectItem value="50">50 rows</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table */}
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((column) => (
                <TableHead
                  key={String(column.key)}
                  style={{ width: column.width }}
                  className={
                    column.sortable
                      ? "cursor-pointer hover:bg-muted/50 select-none"
                      : ""
                  }
                  onClick={() => column.sortable && handleSort(column.key)}
                >
                  <div className="flex items-center gap-2">
                    {column.header}
                    {column.sortable && sortConfig.key === column.key && (
                      <span className="text-xs">
                        {sortConfig.direction === "asc" ? "↑" : "↓"}
                      </span>
                    )}
                  </div>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedData.length > 0 ? (
              paginatedData.map((item, index) => (
                <TableRow key={index}>
                  {columns.map((column) => (
                    <TableCell key={String(column.key)}>
                      {column.render ? (
                        column.render(item[column.key], item)
                      ) : column.key.toString().toLowerCase().includes("id") &&
                        typeof item[column.key] === "string" &&
                        String(item[column.key]).length > 12 ? (
                        <TruncatedId id={String(item[column.key])} maxLength={12} />
                      ) : /^\d{15,}$/.test(String(item[column.key])) ? (
                        <TruncatedId id={String(item[column.key])} maxLength={12} />
                      ) : (
                        <span className="break-all">
                          {typeof item[column.key] === "number"
                            ? Number(item[column.key]).toLocaleString()
                            : String(item[column.key] || "-")}
                        </span>
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="text-center py-8 text-muted-foreground"
                >
                  {emptyMessage}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Page {currentPage} of {totalPages}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setCurrentPage((prev) => Math.min(totalPages, prev + 1))
              }
              disabled={currentPage === totalPages}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export { TruncatedId }