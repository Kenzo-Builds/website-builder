import * as React from "react"
import { cn } from "@/lib/utils"
import { X } from "lucide-react"

const DialogContext = React.createContext({ open: false, onOpenChange: () => {} })

function Dialog({ open, defaultOpen, onOpenChange, children }) {
  const [internalOpen, setInternalOpen] = React.useState(defaultOpen || false)
  const isOpen = open !== undefined ? open : internalOpen
  const handleChange = (v) => { if (open === undefined) setInternalOpen(v); onOpenChange?.(v) }
  return <DialogContext.Provider value={{ open: isOpen, onOpenChange: handleChange }}>{children}</DialogContext.Provider>
}

function DialogTrigger({ children, asChild }) {
  const { onOpenChange } = React.useContext(DialogContext)
  const child = asChild ? React.Children.only(children) : <button>{children}</button>
  return React.cloneElement(asChild ? children : child, { onClick: () => onOpenChange(true) })
}

function DialogPortal({ children }) { return children }

function DialogOverlay({ className, ...props }) {
  return <div className={cn("fixed inset-0 z-50 bg-black/80 animate-in fade-in-0", className)} {...props} />
}

const DialogContent = React.forwardRef(({ className, children, ...props }, ref) => {
  const { open, onOpenChange } = React.useContext(DialogContext)
  if (!open) return null
  return (
    <>
      <DialogOverlay onClick={() => onOpenChange(false)} />
      <div
        ref={ref}
        className={cn("fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 animate-in fade-in-0 zoom-in-95 slide-in-from-left-1/2 slide-in-from-top-[48%] sm:rounded-lg", className)}
        {...props}
      >
        {children}
        <button onClick={() => onOpenChange(false)} className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
          <X className="h-4 w-4" /><span className="sr-only">Close</span>
        </button>
      </div>
    </>
  )
})
DialogContent.displayName = "DialogContent"

function DialogHeader({ className, ...props }) {
  return <div className={cn("flex flex-col space-y-1.5 text-center sm:text-left", className)} {...props} />
}
function DialogFooter({ className, ...props }) {
  return <div className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)} {...props} />
}
const DialogTitle = React.forwardRef(({ className, ...props }, ref) => (
  <h2 ref={ref} className={cn("text-lg font-semibold leading-none tracking-tight", className)} {...props} />
))
DialogTitle.displayName = "DialogTitle"
const DialogDescription = React.forwardRef(({ className, ...props }, ref) => (
  <p ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
))
DialogDescription.displayName = "DialogDescription"

export { Dialog, DialogPortal, DialogOverlay, DialogTrigger, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription }
