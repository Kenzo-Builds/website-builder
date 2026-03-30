import * as React from "react"
import { cn } from "@/lib/utils"
import { Check } from "lucide-react"

const Checkbox = React.forwardRef(({ className, checked, defaultChecked, onCheckedChange, ...props }, ref) => {
  const [internalChecked, setInternalChecked] = React.useState(defaultChecked || false)
  const isChecked = checked !== undefined ? checked : internalChecked
  const toggle = () => { const next = !isChecked; if (checked === undefined) setInternalChecked(next); onCheckedChange?.(next) }
  return (
    <button
      ref={ref}
      type="button"
      role="checkbox"
      aria-checked={isChecked}
      onClick={toggle}
      className={cn("peer h-4 w-4 shrink-0 rounded-sm border border-primary ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        isChecked ? "bg-primary text-primary-foreground" : "bg-background",
        className)}
      {...props}
    >
      {isChecked && <Check className="h-3 w-3 m-auto" />}
    </button>
  )
})
Checkbox.displayName = "Checkbox"

export { Checkbox }
