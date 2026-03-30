import * as React from "react"
import { cn } from "@/lib/utils"

const PopoverContext = React.createContext({ open: false, setOpen: () => {} })

function Popover({ children }) {
  const [open, setOpen] = React.useState(false)
  React.useEffect(() => {
    if (!open) return
    const handler = () => setOpen(false)
    setTimeout(() => document.addEventListener('click', handler), 0)
    return () => document.removeEventListener('click', handler)
  }, [open])
  return <PopoverContext.Provider value={{ open, setOpen }}><div className="relative inline-block">{children}</div></PopoverContext.Provider>
}

function PopoverTrigger({ children, asChild }) {
  const { setOpen } = React.useContext(PopoverContext)
  const el = asChild ? React.Children.only(children) : <button>{children}</button>
  return React.cloneElement(el, { onClick: (e) => { e.stopPropagation(); setOpen(v => !v) } })
}

const PopoverContent = React.forwardRef(({ className, align = "center", sideOffset = 4, children, ...props }, ref) => {
  const { open } = React.useContext(PopoverContext)
  if (!open) return null
  return (
    <div ref={ref} className={cn("absolute z-50 w-72 rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-none top-full mt-1", align === "end" ? "right-0" : align === "center" ? "left-1/2 -translate-x-1/2" : "left-0", className)} onClick={e => e.stopPropagation()} {...props}>
      {children}
    </div>
  )
})
PopoverContent.displayName = "PopoverContent"

export { Popover, PopoverTrigger, PopoverContent }
