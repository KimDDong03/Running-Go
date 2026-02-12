import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        "animate-pulse rounded-xl bg-gradient-to-r from-slate-200/85 via-slate-100 to-slate-200/85 dark:from-slate-700/40 dark:via-slate-600/30 dark:to-slate-700/40",
        className
      )}
      {...props}
    />
  )
}

export { Skeleton }
