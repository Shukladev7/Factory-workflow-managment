import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center px-3 py-1.5 rounded-md border-2 text-xs font-semibold uppercase tracking-wide transition-colors",
  {
    variants: {
      variant: {
        default:
          "bg-slate-800 text-white border-slate-800",
        secondary:
          "bg-slate-100 text-slate-700 border-slate-200",
        destructive:
          "bg-red-100 text-red-700 border-red-200",
        outline: "bg-transparent text-slate-800 border-slate-300",
        success:
          "bg-emerald-100 text-emerald-700 border-emerald-200",
        warning:
          "bg-amber-100 text-amber-700 border-amber-200",
        error:
          "bg-red-100 text-red-700 border-red-200",
        info:
          "bg-blue-100 text-blue-700 border-blue-200",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
