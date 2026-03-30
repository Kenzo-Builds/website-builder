import * as React from "react"
import { cn } from "@/lib/utils"

function TooltipProvider({ children }) { return children }

const TooltipContext = React.createContext({ open: false })

function Tooltip({ children }) {
  const [open, setOpen] = React.useState(false)
  return <TooltipContext.Provider value={{ open, setOpen }}><div className="relative inline-block">{children}</div></TooltipContext.Provider>
}

function TooltipTrigger({ children, asChild }) {
  const { setOpen } = React.useContext(TooltipContext)
  const el = asChild ? React.Children.only(children) : <span>{children}</span>
  return React.cloneElement(el, { onMouseEnter: () => setOpen(true), onMouseLeave: () => setOpen(false) })
}

const TooltipContent = React.forwardRef(({ className, sideOffset = 4, children, ...props }, ref) => {
  const { open } = React.useContext(TooltipContext)
  if (!open) return null
  return (
    <div ref={ref} className={cn("absolute bottom-full left-1/2 -translate-x-1/2 z-50 overflow-hidden rounded-md border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md mb-1 whitespace-nowrap", className)} {...props}>
      {children}
    </div>
  )
})
TooltipContent.displayName = "TooltipContent"

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
