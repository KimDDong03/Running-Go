import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

interface ErrorStateProps {
  title: string
  message?: string
  actionLabel?: string
  onAction?: () => void
  className?: string
}

function ErrorState({ title, message, actionLabel, onAction, className }: ErrorStateProps) {
  return (
    <div className={cn("text-center py-16 space-y-3", className)}>
      <p className="text-base font-semibold text-slate-900">{title}</p>
      {message && <p className="text-sm text-slate-600">{message}</p>}
      {actionLabel && onAction && (
        <div>
          <Button className="mt-2 rounded-full" onClick={onAction}>
            {actionLabel}
          </Button>
        </div>
      )}
    </div>
  )
}

export { ErrorState }
