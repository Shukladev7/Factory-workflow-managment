import { storage } from "./config"
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage"

/**
 * Generate a unique ID for file naming
 */
function generateUniqueId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2)
}

/**
 * Upload an image file to Firebase Storage
 * @param file - The image file to upload
 * @param folder - The folder path in storage (e.g., 'products', 'materials')
 * @returns Promise<string> - The download URL of the uploaded image
 */
export async function uploadImage(file: File, folder: string = 'images'): Promise<string> {
  try {
    // Validate file type
    if (!file.type.startsWith('image/')) {
      throw new Error('File must be an image')
    }

    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024 // 5MB
    if (file.size > maxSize) {
      throw new Error('Image size must be less than 5MB')
    }

    // Generate unique filename
    const fileExtension = file.name.split('.').pop()
    const fileName = `${generateUniqueId()}.${fileExtension}`
    const filePath = `${folder}/${fileName}`

    // Create storage reference
    const storageRef = ref(storage, filePath)

    // Upload file
    console.log(`[uploadImage] Uploading ${file.name} to ${filePath}`)
    const snapshot = await uploadBytes(storageRef, file)
    
    // Get download URL
    const downloadURL = await getDownloadURL(snapshot.ref)
    console.log(`[uploadImage] Upload successful. URL: ${downloadURL}`)
    
    return downloadURL
  } catch (error) {
    console.error('[uploadImage] Upload failed:', error)
    throw error
  }
}

/**
 * Delete an image from Firebase Storage using its URL
 * @param imageUrl - The download URL of the image to delete
 */
export async function deleteImage(imageUrl: string): Promise<void> {
  try {
    // Check if this is a Firebase Storage URL
    if (!imageUrl.includes('firebasestorage.googleapis.com') && !imageUrl.includes('firebasestorage.app')) {
      console.log(`[deleteImage] Skipping deletion of non-Firebase Storage URL: ${imageUrl}`)
      return // Don't try to delete external URLs (like placeholder images)
    }

    // Extract the file path from the Firebase Storage URL
    const url = new URL(imageUrl)
    const pathMatch = url.pathname.match(/\/o\/(.+)\?/)
    
    if (!pathMatch) {
      console.warn(`[deleteImage] Could not extract file path from URL: ${imageUrl}`)
      return // Don't throw error, just skip deletion
    }
    
    const filePath = decodeURIComponent(pathMatch[1])
    const storageRef = ref(storage, filePath)
    
    console.log(`[deleteImage] Deleting image at ${filePath}`)
    await deleteObject(storageRef)
    console.log(`[deleteImage] Image deleted successfully`)
  } catch (error) {
    console.error('[deleteImage] Delete failed:', error)
    // Don't throw the error to prevent UI crashes - just log it
    console.warn('[deleteImage] Continuing without deletion')
  }
}

/**
 * Upload multiple images
 * @param files - Array of image files to upload
 * @param folder - The folder path in storage
 * @returns Promise<string[]> - Array of download URLs
 */
export async function uploadMultipleImages(files: File[], folder: string = 'images'): Promise<string[]> {
  try {
    const uploadPromises = files.map(file => uploadImage(file, folder))
    return await Promise.all(uploadPromises)
  } catch (error) {
    console.error('[uploadMultipleImages] Upload failed:', error)
    throw error
  }
}

/**
 * Get optimized image URL with size parameters
 * @param imageUrl - The original image URL
 * @param width - Desired width
 * @param height - Desired height
 * @returns string - Optimized image URL
 */
export function getOptimizedImageUrl(imageUrl: string, width?: number, height?: number): string {
  // For Firebase Storage, we can add transformation parameters
  // This is a basic implementation - you might want to use a service like Cloudinary for advanced transformations
  if (width || height) {
    const url = new URL(imageUrl)
    if (width) url.searchParams.set('w', width.toString())
    if (height) url.searchParams.set('h', height.toString())
    return url.toString()
  }
  return imageUrl
}
