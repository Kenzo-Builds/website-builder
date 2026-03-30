import * as React from "react"
import { cn } from "@/lib/utils"
import { ChevronDown } from "lucide-react"

const SelectContext = React.createContext({ value: "", onValueChange: () => {}, open: false, setOpen: () => {} })

function Select({ value, defaultValue, onValueChange, children }) {
  const [internalValue, setInternalValue] = React.useState(defaultValue || "")
  const [open, setOpen] = React.useState(false)
  const current = value !== undefined ? value : internalValue
  const handleChange = (v) => { if (value === undefined) setInternalValue(v); onValueChange?.(v); setOpen(false) }
  React.useEffect(() => {
    if (!open) return
    const handler = () => setOpen(false)
    setTimeout(() => document.addEventListener('click', handler), 0)
    return () => document.removeEventListener('click', handler)
  }, [open])
  return <SelectContext.Provider value={{ value: current, onValueChange: handleChange, open, setOpen }}><div className="relative">{children}</div></SelectContext.Provider>
}

const SelectTrigger = React.forwardRef(({ className, children, ...props }, ref) => {
  const { open, setOpen } = React.useContext(SelectContext)
  return (
    <button ref={ref} onClick={(e) => { e.stopPropagation(); setOpen(v => !v) }}
      className={cn("flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50", className)} {...props}>
      {children}<ChevronDown className="h-4 w-4 opacity-50" />
    </button>
  )
})
SelectTrigger.displayName = "SelectTrigger"

function SelectValue({ placeholder }) {
  const { value } = React.useContext(SelectContext)
  return <span>{value || placeholder}</span>
}

const SelectContent = React.forwardRef(({ className, children, ...props }, ref) => {
  const { open } = React.useContext(SelectContext)
  if (!open) return null
  return (
    <div ref={ref} className={cn("absolute z-50 min-w-[8rem] w-full overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md top-full mt-1", className)} onClick={e => e.stopPropagation()} {...props}>
      <div className="p-1">{children}</div>
    </div>
  )
})
SelectContent.displayName = "SelectContent"

const SelectItem = React.forwardRef(({ className, value, children, ...props }, ref) => {
  const ctx = React.useContext(SelectContext)
  return (
    <div ref={ref} onClick={() => ctx.onValueChange(value)}
      className={cn("relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground", ctx.value === value && "bg-accent", className)} {...props}>
      {ctx.value === value && <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">✓</span>}
      {children}
    </div>
  )
})
SelectItem.displayName = "SelectItem"

function SelectGroup({ ...props }) { return <div {...props} /> }
function SelectLabel({ className, ...props }) { return <div className={cn("py-1.5 pl-8 pr-2 text-sm font-semibold", className)} {...props} /> }
function SelectSeparator({ className, ...props }) { return <div className={cn("-mx-1 my-1 h-px bg-muted", className)} {...props} /> }

export { Select, SelectGroup, SelectValue, SelectTrigger, SelectContent, SelectLabel, SelectItem, SelectSeparator }
