import * as React from "react"
import { cn } from "@/lib/utils"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./tooltip"
import { Legend, ResponsiveContainer } from "recharts"

function ChartContainer({ config, className, children, ...props }) {
  return (
    <div className={cn("flex aspect-video justify-center text-xs", className)} {...props}>
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  )
}

function ChartTooltip({ content, ...props }) {
  return <Tooltip content={content} {...props} />
}

function ChartTooltipContent({ active, payload, label, hideLabel = false, className }) {
  if (!active || !payload?.length) return null
  return (
    <div className={cn("grid min-w-[8rem] items-start gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl", className)}>
      {!hideLabel && <div className="font-medium">{label}</div>}
      <div className="grid gap-1.5">
        {payload.map((item, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="h-2.5 w-2.5 shrink-0 rounded-[2px]" style={{ backgroundColor: item.color }} />
            <span className="text-muted-foreground">{item.name}</span>
            <span className="ml-auto font-mono font-medium tabular-nums text-foreground">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function ChartLegend({ content, ...props }) {
  return <Legend content={content} {...props} />
}

function ChartLegendContent({ payload }) {
  if (!payload?.length) return null
  return (
    <div className="flex items-center justify-center gap-4 pt-3">
      {payload.map((item, i) => (
        <div key={i} className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <div className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
          {item.value}
        </div>
      ))}
    </div>
  )
}

export { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent }
