import * as React from "react"
import { cn } from "@/lib/utils"

const ScrollArea = React.forwardRef(({ className, children, ...props }, ref) => (
  <div ref={ref} className={cn("relative overflow-hidden", className)} {...props}>
    <div className="h-full w-full overflow-auto">{children}</div>
  </div>
))
ScrollArea.displayName = "ScrollArea"

const ScrollBar = React.forwardRef(({ className, orientation = "vertical", ...props }, ref) => (
  <div ref={ref} className={cn("flex touch-none select-none transition-colors", orientation === "vertical" ? "h-full w-2.5 border-l border-l-transparent p-[1px]" : "h-2.5 flex-col border-t border-t-transparent p-[1px]", className)} {...props}>
    <div className="relative flex-1 rounded-full bg-border" />
  </div>
))
ScrollBar.displayName = "ScrollBar"

export { ScrollArea, ScrollBar }
