"use client"

import type React from "react"

import { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Upload, FileText, AlertCircle, CheckCircle } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface CSVImportDialogProps<T> {
  title: string
  description: string
  expectedColumns: string[]
  onImport: (data: T[]) => void
  validateRow: (row: any, index: number) => { isValid: boolean; errors: string[] }
  transformRow: (row: any) => T
  children: React.ReactNode
}

export function CSVImportDialog<T>({
  title,
  description,
  expectedColumns,
  onImport,
  validateRow,
  transformRow,
  children,
}: CSVImportDialogProps<T>) {
  const [isOpen, setIsOpen] = useState(false)
  const [csvData, setCsvData] = useState<any[]>([])
  const [csvHeaders, setCsvHeaders] = useState<string[]>([])
  const [errors, setErrors] = useState<string[]>([])
  const [isValidating, setIsValidating] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { toast } = useToast()

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (!file.name.toLowerCase().endsWith(".csv")) {
      setErrors(["Please select a CSV file."])
      return
    }

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string
        const lines = text.split("\n").filter((line) => line.trim())

        if (lines.length < 2) {
          setErrors(["CSV file must contain at least a header row and one data row."])
          return
        }

        const headers = lines[0].split(",").map((h) => h.trim().replace(/"/g, ""))
        const data = lines.slice(1).map((line) => {
          const values = line.split(",").map((v) => v.trim().replace(/"/g, ""))
          const row: any = {}
          headers.forEach((header, index) => {
            row[header] = values[index] || ""
          })
          return row
        })

        setCsvHeaders(headers)
        setCsvData(data)
        setErrors([])
        validateData(headers, data)
      } catch (error) {
        setErrors(["Error parsing CSV file. Please check the file format."])
      }
    }
    reader.readAsText(file)
  }

  const validateData = (headers: string[], data: any[]) => {
    setIsValidating(true)
    const validationErrors: string[] = []

    // Check if all expected columns are present
    const missingColumns = expectedColumns.filter((col) => !headers.includes(col))
    if (missingColumns.length > 0) {
      validationErrors.push(`Missing required columns: ${missingColumns.join(", ")}`)
    }

    // Validate each row
    data.forEach((row, index) => {
      const { isValid, errors: rowErrors } = validateRow(row, index + 1)
      if (!isValid) {
        validationErrors.push(`Row ${index + 2}: ${rowErrors.join(", ")}`)
      }
    })

    setErrors(validationErrors)
    setIsValidating(false)
  }

  const handleImport = () => {
    if (errors.length > 0) {
      toast({
        title: "Import Failed",
        description: "Please fix the validation errors before importing.",
        variant: "destructive",
      })
      return
    }

    try {
      const transformedData = csvData.map(transformRow)
      onImport(transformedData)
      toast({
        title: "Import Successful",
        description: `Successfully imported ${transformedData.length} records.`,
      })
      setIsOpen(false)
      resetState()
    } catch (error) {
      toast({
        title: "Import Failed",
        description: "An error occurred while importing the data.",
        variant: "destructive",
      })
    }
  }

  const resetState = () => {
    setCsvData([])
    setCsvHeaders([])
    setErrors([])
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open)
    if (!open) {
      resetState()
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-[800px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="csv-file">Select CSV File</Label>
            <Input
              id="csv-file"
              type="file"
              accept=".csv"
              ref={fileInputRef}
              onChange={handleFileUpload}
              className="mt-1"
            />
          </div>

          {expectedColumns.length > 0 && (
            <Alert>
              <FileText className="h-4 w-4" />
              <AlertDescription>
                <strong>Expected columns:</strong> {expectedColumns.join(", ")}
              </AlertDescription>
            </Alert>
          )}

          {errors.length > 0 && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <div className="space-y-1">
                  <strong>Validation Errors:</strong>
                  <ul className="list-disc list-inside space-y-1">
                    {errors.map((error, index) => (
                      <li key={index} className="text-sm">
                        {error}
                      </li>
                    ))}
                  </ul>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {csvData.length > 0 && errors.length === 0 && (
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                <strong>Ready to import:</strong> {csvData.length} records validated successfully.
              </AlertDescription>
            </Alert>
          )}

          {csvData.length > 0 && (
            <div>
              <h4 className="font-medium mb-2">Preview (first 5 rows):</h4>
              <div className="border rounded-md max-h-60 overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {csvHeaders.map((header, index) => (
                        <TableHead key={index} className="text-xs">
                          {header}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {csvData.slice(0, 5).map((row, index) => (
                      <TableRow key={index}>
                        {csvHeaders.map((header, cellIndex) => (
                          <TableCell key={cellIndex} className="text-xs">
                            {row[header]}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          <div className="flex justify-end space-x-2">
            <Button variant="outline" onClick={() => setIsOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleImport} disabled={csvData.length === 0 || errors.length > 0 || isValidating}>
              <Upload className="mr-2 h-4 w-4" />
              Import Data
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
