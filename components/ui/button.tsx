import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-2xl text-sm font-semibold tracking-tight transition-all duration-300 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 disabled:active:scale-100 motion-reduce:transform-none [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default:
          "border-2 border-[#0f5fd7]/20 bg-[linear-gradient(135deg,#1d8fff_0%,#0f5fd7_100%)] text-white shadow-[0_18px_34px_-20px_rgba(15,95,215,0.55)] hover:-translate-y-0.5 hover:brightness-105",
        mapPop:
          "border-2 border-[#0f5fd7]/20 bg-[linear-gradient(135deg,#1d8fff_0%,#0f5fd7_100%)] text-white shadow-[0_18px_34px_-20px_rgba(15,95,215,0.55)] hover:-translate-y-0.5 hover:brightness-105",
        mapPopOutline:
          "border-2 border-[#102449]/18 bg-white/92 text-[#102449] shadow-[0_12px_24px_-18px_rgba(16,36,73,0.45)] hover:-translate-y-0.5 hover:bg-white",
        destructive:
          "bg-[linear-gradient(135deg,#ef4444_0%,#dc2626_100%)] text-white shadow-[0_16px_28px_-20px_rgba(220,38,38,0.9)] hover:-translate-y-0.5 hover:brightness-95 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40",
        outline:
          "border-2 border-[#102449]/18 bg-white/92 text-[#102449] shadow-[0_12px_24px_-18px_rgba(16,36,73,0.45)] hover:-translate-y-0.5 hover:bg-white",
        secondary:
          "border border-[#67c93a]/45 bg-[#67c93a] text-[#102449] shadow-[0_16px_28px_-20px_rgba(103,201,58,0.55)] hover:-translate-y-0.5 hover:brightness-95",
        ghost:
          "text-slate-600 hover:bg-[#1d8fff]/10 hover:text-[#0f5fd7]",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2 has-[>svg]:px-3",
        xs: "h-6 gap-1 rounded-md px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-9 rounded-xl gap-1.5 px-3.5 has-[>svg]:px-2.5",
        lg: "h-11 rounded-2xl px-6 has-[>svg]:px-4",
        icon: "size-9",
        "icon-xs": "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
