import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold touch-manipulation ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 shadow-md [&_svg]:pointer-events-none [&_svg]:h-5 [&_svg]:w-5 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // Primary action button
        default:
          "bg-slate-800 hover:bg-slate-700 text-white border-2 border-slate-800",
        // Destructive / danger actions
        destructive:
          "bg-red-600 hover:bg-red-700 text-white border-2 border-red-600",
        // Secondary button on light background
        outline:
          "bg-white hover:bg-slate-50 text-slate-700 border-2 border-slate-200 hover:border-slate-300",
        // Subtle secondary (used sparingly)
        secondary:
          "bg-slate-100 hover:bg-slate-200 text-slate-800 border-2 border-slate-200",
        // Ghost / icon-only or minimal buttons
        ghost:
          "bg-transparent hover:bg-slate-100 text-slate-700",
        // Text link-style button
        link: "text-slate-800 underline-offset-4 hover:underline",
      },
      size: {
        default: "h-12 px-6",
        sm: "h-10 px-4 text-sm",
        lg: "h-14 px-7 text-base",
        icon: "h-12 w-12 rounded-lg",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
