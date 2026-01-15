"use client"

import { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { Upload, X, Image as ImageIcon, Loader2 } from "lucide-react"
import { uploadImage, deleteImage } from "@/lib/firebase/storage"
import { useToast } from "@/hooks/use-toast"

interface ImageUploadProps {
  value?: string
  onChange: (url: string | null) => void
  folder?: string
  disabled?: boolean
  className?: string
  placeholder?: string
}

export function ImageUpload({
  value,
  onChange,
  folder = "images",
  disabled = false,
  className = "",
  placeholder = "Upload an image"
}: ImageUploadProps) {
  const [isUploading, setIsUploading] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { toast } = useToast()

  const handleFileSelect = async (file: File) => {
    if (disabled) return

    setIsUploading(true)
    try {
      // Delete existing image if there is one
      if (value) {
        try {
          await deleteImage(value)
        } catch (error) {
          console.warn("Failed to delete existing image:", error)
        }
      }

      // Upload new image
      const imageUrl = await uploadImage(file, folder)
      onChange(imageUrl)
      
      toast({
        title: "Image Uploaded",
        description: "Your image has been uploaded successfully.",
      })
    } catch (error) {
      console.error("Image upload failed:", error)
      toast({
        variant: "destructive",
        title: "Upload Failed",
        description: error instanceof Error ? error.message : "Failed to upload image",
      })
    } finally {
      setIsUploading(false)
    }
  }

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      handleFileSelect(file)
    }
  }

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDragActive(false)
    
    if (disabled) return

    const file = event.dataTransfer.files?.[0]
    if (file && file.type.startsWith('image/')) {
      handleFileSelect(file)
    } else {
      toast({
        variant: "destructive",
        title: "Invalid File",
        description: "Please select an image file.",
      })
    }
  }

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    if (!disabled) {
      setDragActive(true)
    }
  }

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDragActive(false)
  }

  const handleRemove = async () => {
    if (disabled || !value) return

    try {
      // deleteImage now handles non-Firebase URLs gracefully and won't throw errors
      await deleteImage(value)
      onChange(null)
      
      toast({
        title: "Image Removed",
        description: "The image has been removed successfully.",
      })
    } catch (error) {
      // This should rarely happen now since deleteImage handles errors gracefully
      console.error("Failed to delete image:", error)
      // Still remove from form even if deletion failed
      onChange(null)
      toast({
        title: "Image Removed",
        description: "Image removed from form (deletion from storage may have failed).",
      })
    }
  }

  const openFileDialog = () => {
    if (!disabled) {
      fileInputRef.current?.click()
    }
  }

  return (
    <div className={`space-y-4 ${className}`}>
      <Label>Product Image</Label>
      
      {value ? (
        <Card>
          <CardContent className="p-4">
            <div className="relative group">
              <img
                src={value}
                alt="Uploaded image"
                className="w-full h-48 object-cover rounded-lg"
              />
              <div className="absolute inset-0 bg-black bg-opacity-50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={handleRemove}
                  disabled={disabled || isUploading}
                >
                  <X className="h-4 w-4 mr-2" />
                  Remove
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card
          className={`border-2 border-dashed transition-colors cursor-pointer ${
            dragActive 
              ? "border-primary bg-primary/5" 
              : "border-muted-foreground/25 hover:border-primary/50"
          } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
          onClick={openFileDialog}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          <CardContent className="p-8">
            <div className="flex flex-col items-center justify-center space-y-4 text-center">
              {isUploading ? (
                <>
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">Uploading image...</p>
                </>
              ) : (
                <>
                  <div className="p-4 bg-primary/10 rounded-full">
                    <ImageIcon className="h-8 w-8 text-primary" />
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-medium">{placeholder}</p>
                    <p className="text-xs text-muted-foreground">
                      Drag and drop an image here, or click to browse
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Supports: JPG, PNG, GIF (max 5MB)
                    </p>
                  </div>
                  <Button type="button" variant="outline" size="sm" disabled={disabled}>
                    <Upload className="h-4 w-4 mr-2" />
                    Choose Image
                  </Button>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
        disabled={disabled}
      />
    </div>
  )
}
