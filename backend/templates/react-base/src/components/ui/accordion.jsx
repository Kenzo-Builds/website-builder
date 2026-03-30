import * as React from "react"
import { cn } from "@/lib/utils"
import { ChevronDown } from "lucide-react"

const AccordionContext = React.createContext({ value: null, onValueChange: () => {} })

function Accordion({ type = "single", value, defaultValue, onValueChange, collapsible, children, className, ...props }) {
  const [internalValue, setInternalValue] = React.useState(defaultValue || null)
  const current = value !== undefined ? value : internalValue
  const handleChange = (v) => { const next = collapsible && current === v ? null : v; if (value === undefined) setInternalValue(next); onValueChange?.(next) }
  return <AccordionContext.Provider value={{ value: current, onValueChange: handleChange }}><div className={cn("", className)} {...props}>{children}</div></AccordionContext.Provider>
}

function AccordionItem({ className, value, children, ...props }) {
  return <div className={cn("border-b", className)} data-value={value} {...props}>{React.Children.map(children, c => React.cloneElement(c, { value }))}</div>
}

const AccordionTrigger = React.forwardRef(({ className, children, value, ...props }, ref) => {
  const ctx = React.useContext(AccordionContext)
  const isOpen = ctx.value === value
  return (
    <div className="flex">
      <button ref={ref} onClick={() => ctx.onValueChange(value)}
        className={cn("flex flex-1 items-center justify-between py-4 font-medium transition-all hover:underline", className)} {...props}>
        {children}<ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform duration-200", isOpen && "rotate-180")} />
      </button>
    </div>
  )
})
AccordionTrigger.displayName = "AccordionTrigger"

const AccordionContent = React.forwardRef(({ className, children, value, ...props }, ref) => {
  const { value: current } = React.useContext(AccordionContext)
  if (current !== value) return null
  return <div ref={ref} className={cn("overflow-hidden text-sm pb-4 pt-0", className)} {...props}>{children}</div>
})
AccordionContent.displayName = "AccordionContent"

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent }
