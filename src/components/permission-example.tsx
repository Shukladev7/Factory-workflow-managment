"use client"

/**
 * Example component demonstrating how to use the permission system
 * This file is for reference only and shows different ways to check permissions
 */

import { usePermissions } from "@/hooks/use-permissions"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Shield, ShieldCheck, ShieldX } from "lucide-react"

export function PermissionExample() {
  const { employee, loading, canEdit, isAdmin } = usePermissions()

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-gray-700" />
      </div>
    )
  }

  if (!employee) {
    return (
      <Alert variant="destructive">
        <ShieldX className="h-4 w-4" />
        <AlertDescription>No employee data found. Please log in.</AlertDescription>
      </Alert>
    )
  }

  // Note: All users can view all modules
  // Only check edit permissions
  const canEditMaterials = canEdit("Raw Materials")
  const isAdminUser = isAdmin()
  const canEditBatches = canEdit("Batches")

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Current User Permissions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <p>
              <strong>Name:</strong> {employee.name}
            </p>
            <p>
              <strong>Email:</strong> {employee.email}
            </p>
            <p>
              <strong>Role:</strong>{" "}
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                {employee.role}
              </span>
            </p>
            <p>
              <strong>Admin:</strong> {isAdminUser ? "Yes" : "No"}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Example: All users can view, check edit permission */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-blue-600" />
            Raw Materials Module
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4">
            All employees can view this module. 
            {canEditMaterials ? "You can also edit." : "You have view-only access."}
          </p>
          
          {/* Show edit button only if user can edit */}
          {canEditMaterials && (
            <Button>Edit Materials</Button>
          )}
          
          {!canEditMaterials && (
            <p className="text-sm text-muted-foreground">
              View-only access. Contact admin for edit permissions.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Example: Admin-only section */}
      {isAdminUser && (
        <Card className="border-2 border-orange-500">
          <CardHeader>
            <CardTitle>Admin Controls</CardTitle>
          </CardHeader>
          <CardContent>
            <p>This section is only visible to administrators.</p>
            <div className="mt-4 space-x-2">
              <Button variant="outline">Manage Users</Button>
              <Button variant="outline">System Settings</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Example: Check edit permissions for different modules */}
      <Card>
        <CardHeader>
          <CardTitle>Edit Permissions Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">
            Note: All employees can view all modules.
          </p>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              {canEdit("Raw Materials") ? (
                <ShieldCheck className="h-4 w-4 text-green-600" />
              ) : (
                <ShieldX className="h-4 w-4 text-gray-400" />
              )}
              <span>Edit Raw Materials</span>
            </div>
            <div className="flex items-center gap-2">
              {canEdit("Store") ? (
                <ShieldCheck className="h-4 w-4 text-green-600" />
              ) : (
                <ShieldX className="h-4 w-4 text-gray-400" />
              )}
              <span>Edit Store</span>
            </div>
            <div className="flex items-center gap-2">
              {canEditBatches ? (
                <ShieldCheck className="h-4 w-4 text-green-600" />
              ) : (
                <ShieldX className="h-4 w-4 text-gray-400" />
              )}
              <span>Edit Batches</span>
            </div>
            <div className="flex items-center gap-2">
              {canEdit("Moulding") ? (
                <ShieldCheck className="h-4 w-4 text-green-600" />
              ) : (
                <ShieldX className="h-4 w-4 text-gray-400" />
              )}
              <span>Edit Moulding</span>
            </div>
            <div className="flex items-center gap-2">
              {canEdit("Machining") ? (
                <ShieldCheck className="h-4 w-4 text-green-600" />
              ) : (
                <ShieldX className="h-4 w-4 text-gray-400" />
              )}
              <span>Edit Machining</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
