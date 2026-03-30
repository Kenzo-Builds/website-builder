import * as React from "react"
import { cn } from "@/lib/utils"
import { X } from "lucide-react"

const SheetContext = React.createContext({ open: false, onOpenChange: () => {} })

function Sheet({ open, defaultOpen, onOpenChange, children }) {
  const [internalOpen, setInternalOpen] = React.useState(defaultOpen || false)
  const isOpen = open !== undefined ? open : internalOpen
  const handleChange = (v) => { if (open === undefined) setInternalOpen(v); onOpenChange?.(v) }
  return <SheetContext.Provider value={{ open: isOpen, onOpenChange: handleChange }}>{children}</SheetContext.Provider>
}

function SheetTrigger({ children, asChild }) {
  const { onOpenChange } = React.useContext(SheetContext)
  const el = asChild ? React.Children.only(children) : <button>{children}</button>
  return React.cloneElement(el, { onClick: () => onOpenChange(true) })
}

const SheetContent = React.forwardRef(({ className, children, side = "right", ...props }, ref) => {
  const { open, onOpenChange } = React.useContext(SheetContext)
  if (!open) return null
  const positions = { right: "inset-y-0 right-0 h-full w-3/4 sm:max-w-sm", left: "inset-y-0 left-0 h-full w-3/4 sm:max-w-sm", top: "inset-x-0 top-0 h-auto", bottom: "inset-x-0 bottom-0 h-auto" }
  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/80" onClick={() => onOpenChange(false)} />
      <div ref={ref} className={cn("fixed z-50 gap-4 bg-background p-6 shadow-lg transition ease-in-out", positions[side], className)} {...props}>
        {children}
        <button onClick={() => onOpenChange(false)} className="absolute right-4 top-4 rounded-sm opacity-70 hover:opacity-100">
          <X className="h-4 w-4" />
        </button>
      </div>
    </>
  )
})
SheetContent.displayName = "SheetContent"

function SheetHeader({ className, ...props }) { return <div className={cn("flex flex-col space-y-2 text-center sm:text-left", className)} {...props} /> }
function SheetFooter({ className, ...props }) { return <div className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)} {...props} /> }
const SheetTitle = React.forwardRef(({ className, ...props }, ref) => <h2 ref={ref} className={cn("text-lg font-semibold text-foreground", className)} {...props} />)
SheetTitle.displayName = "SheetTitle"
const SheetDescription = React.forwardRef(({ className, ...props }, ref) => <p ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />)
SheetDescription.displayName = "SheetDescription"

export { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetFooter, SheetTitle, SheetDescription }
