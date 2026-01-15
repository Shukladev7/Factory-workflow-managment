import * as React from "react"
import { LucideIcon, TrendingUp, TrendingDown, Minus } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

export interface KPICardProps {
  title: string
  value: number | string
  icon?: LucideIcon
  description?: string
  trend?: {
    value: number
    label: string
    direction: "up" | "down" | "neutral"
  }
  format?: "number" | "percentage" | "currency" | "custom"
  className?: string
  priority?: "high" | "medium" | "low"
  status?: "success" | "warning" | "error" | "neutral"
}

function formatValue(value: number | string, format?: KPICardProps["format"]) {
  if (typeof value === "string") return value
  
  // Handle NaN, null, undefined, or invalid numbers
  const numValue = Number(value)
  if (isNaN(numValue) || !isFinite(numValue)) {
    return "0"
  }
  
  switch (format) {
    case "percentage":
      return `${numValue.toFixed(1)}%`
    case "currency":
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 0,
      }).format(numValue)
    case "number":
    default:
      return numValue.toLocaleString()
  }
}

function getTrendIcon(direction: "up" | "down" | "neutral") {
  switch (direction) {
    case "up":
      return TrendingUp
    case "down":
      return TrendingDown
    case "neutral":
    default:
      return Minus
  }
}

function getTrendColor(direction: "up" | "down" | "neutral") {
  switch (direction) {
    case "up":
      return "text-green-600"
    case "down":
      return "text-red-600"
    case "neutral":
    default:
      return "text-muted-foreground"
  }
}

function getStatusColor(status?: KPICardProps["status"]) {
  switch (status) {
    case "success":
      return "border-green-200 bg-green-50/50"
    case "warning":
      return "border-yellow-200 bg-yellow-50/50"
    case "error":
      return "border-red-200 bg-red-50/50"
    case "neutral":
    default:
      return ""
  }
}

function getPriorityBadgeVariant(priority?: KPICardProps["priority"]) {
  switch (priority) {
    case "high":
      return "destructive"
    case "medium":
      return "secondary"
    case "low":
      return "outline"
    default:
      return "outline"
  }
}

export function KPICard({
  title,
  value,
  icon: Icon,
  description,
  trend,
  format = "number",
  className,
  priority,
  status,
}: KPICardProps) {
  const TrendIcon = trend ? getTrendIcon(trend.direction) : null
  const trendColor = trend ? getTrendColor(trend.direction) : ""
  
  return (
    <Card className={cn("transition-all hover:shadow-md", getStatusColor(status), className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="flex items-center gap-2">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
          {priority && priority !== "low" && (
            <Badge variant={getPriorityBadgeVariant(priority)} className="text-xs">
              {priority}
            </Badge>
          )}
        </div>
        {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <div className="text-2xl font-bold tracking-tight">
            {formatValue(value, format)}
          </div>
          
          {trend && (
            <div className={cn("flex items-center gap-1 text-xs", trendColor)}>
              {TrendIcon && <TrendIcon className="h-3 w-3" />}
              <span className="font-medium">
                {trend.direction === "up" ? "+" : trend.direction === "down" ? "-" : ""}{Math.abs(trend.value)}%
              </span>
              <span className="text-muted-foreground">{trend.label}</span>
            </div>
          )}
          
          {description && (
            <p className="text-xs text-muted-foreground leading-relaxed">
              {description}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export function KPIGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("grid gap-4 md:grid-cols-2 lg:grid-cols-4", className)}>
      {children}
    </div>
  )
}