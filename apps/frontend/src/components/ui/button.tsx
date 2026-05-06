import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-[transform,background-color,color,border-color,box-shadow,filter] duration-200 ease-out will-change-transform hover:-translate-y-px active:translate-y-0 active:scale-[0.98] motion-reduce:hover:translate-y-0 motion-reduce:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 disabled:hover:translate-y-0 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-[0_0_0_1px_oklch(0_0_0_/_0.35),0_8px_22px_-12px_oklch(0.55_0.22_258_/_0.55)] hover:bg-primary/90 hover:shadow-[0_0_0_1px_oklch(0_0_0_/_0.35),0_14px_30px_-14px_oklch(0.55_0.22_258_/_0.7),0_0_22px_-6px_oklch(0.72_0.16_258_/_0.45)] active:shadow-[0_0_0_1px_oklch(0_0_0_/_0.4),0_4px_12px_-8px_oklch(0.55_0.22_258_/_0.5)]",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90 hover:shadow-[0_10px_24px_-12px_oklch(0.55_0.22_25_/_0.55)]",
        outline:
          "border border-input bg-background hover:bg-accent hover:text-accent-foreground hover:border-[oklch(0.55_0.22_258_/_0.45)] hover:shadow-[0_8px_22px_-14px_oklch(0.55_0.22_258_/_0.45)]",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost:
          "hover:bg-accent hover:text-accent-foreground hover:[text-shadow:0_0_18px_oklch(0.72_0.16_258_/_0.5)]",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 px-4 py-2",
        sm: "h-11 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-11 w-11",
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
