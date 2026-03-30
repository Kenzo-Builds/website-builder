import * as React from "react"
import { cn } from "@/lib/utils"
import { Check, ChevronRight, Circle } from "lucide-react"

const DropdownMenuContext = React.createContext({ open: false, setOpen: () => {} })

function DropdownMenu({ children }) {
  const [open, setOpen] = React.useState(false)
  React.useEffect(() => {
    if (!open) return
    const handler = () => setOpen(false)
    setTimeout(() => document.addEventListener('click', handler), 0)
    return () => document.removeEventListener('click', handler)
  }, [open])
  return <DropdownMenuContext.Provider value={{ open, setOpen }}><div className="relative inline-block">{children}</div></DropdownMenuContext.Provider>
}

function DropdownMenuTrigger({ children, asChild }) {
  const { setOpen } = React.useContext(DropdownMenuContext)
  const child = asChild ? React.Children.only(children) : <button>{children}</button>
  const el = asChild ? children : child
  return React.cloneElement(el, { onClick: (e) => { e.stopPropagation(); setOpen(v => !v); el.props.onClick?.(e) } })
}

const DropdownMenuContent = React.forwardRef(({ className, sideOffset = 4, align = "start", ...props }, ref) => {
  const { open } = React.useContext(DropdownMenuContext)
  if (!open) return null
  return (
    <div
      ref={ref}
      className={cn("z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md absolute top-full mt-1", align === "end" ? "right-0" : "left-0", className)}
      onClick={e => e.stopPropagation()}
      {...props}
    />
  )
})
DropdownMenuContent.displayName = "DropdownMenuContent"

const DropdownMenuItem = React.forwardRef(({ className, inset, onSelect, ...props }, ref) => {
  const { setOpen } = React.useContext(DropdownMenuContext)
  return (
    <div
      ref={ref}
      className={cn("relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50", inset && "pl-8", className)}
      onClick={() => { onSelect?.(); setOpen(false) }}
      {...props}
    />
  )
})
DropdownMenuItem.displayName = "DropdownMenuItem"

function DropdownMenuSeparator({ className, ...props }) {
  return <div className={cn("-mx-1 my-1 h-px bg-muted", className)} {...props} />
}
function DropdownMenuLabel({ className, inset, ...props }) {
  return <div className={cn("px-2 py-1.5 text-sm font-semibold", inset && "pl-8", className)} {...props} />
}
function DropdownMenuGroup({ ...props }) { return <div {...props} /> }
function DropdownMenuShortcut({ className, ...props }) {
  return <span className={cn("ml-auto text-xs tracking-widest opacity-60", className)} {...props} />
}

export { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel, DropdownMenuGroup, DropdownMenuShortcut }
