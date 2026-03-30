import * as React from "react"
import { cn } from "@/lib/utils"

const SidebarContext = React.createContext({ open: true, setOpen: () => {} })

function SidebarProvider({ children, defaultOpen = true }) {
  const [open, setOpen] = React.useState(defaultOpen)
  return <SidebarContext.Provider value={{ open, setOpen }}><div className="flex h-screen w-full">{children}</div></SidebarContext.Provider>
}

const Sidebar = React.forwardRef(({ className, children, ...props }, ref) => {
  const { open } = React.useContext(SidebarContext)
  return (
    <aside ref={ref} className={cn("flex flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border transition-all duration-300", open ? "w-64" : "w-14", className)} {...props}>
      {children}
    </aside>
  )
})
Sidebar.displayName = "Sidebar"

const SidebarInset = React.forwardRef(({ className, ...props }, ref) => (
  <main ref={ref} className={cn("flex flex-1 flex-col overflow-auto", className)} {...props} />
))
SidebarInset.displayName = "SidebarInset"

function SidebarTrigger({ className, ...props }) {
  const { open, setOpen } = React.useContext(SidebarContext)
  return (
    <button onClick={() => setOpen(!open)} className={cn("inline-flex h-7 w-7 items-center justify-center rounded-md text-sidebar-foreground hover:bg-sidebar-accent", className)} {...props}>
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    </button>
  )
}

const SidebarHeader = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("flex h-16 items-center border-b border-sidebar-border px-4", className)} {...props} />
))
SidebarHeader.displayName = "SidebarHeader"

const SidebarFooter = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("flex items-center border-t border-sidebar-border p-4 mt-auto", className)} {...props} />
))
SidebarFooter.displayName = "SidebarFooter"

const SidebarContent = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("flex flex-1 flex-col overflow-y-auto py-2", className)} {...props} />
))
SidebarContent.displayName = "SidebarContent"

const SidebarGroup = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("flex flex-col gap-1 px-2 py-1", className)} {...props} />
))
SidebarGroup.displayName = "SidebarGroup"

const SidebarGroupLabel = React.forwardRef(({ className, ...props }, ref) => {
  const { open } = React.useContext(SidebarContext)
  if (!open) return null
  return <div ref={ref} className={cn("px-2 py-1 text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider", className)} {...props} />
})
SidebarGroupLabel.displayName = "SidebarGroupLabel"

const SidebarGroupContent = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("flex flex-col gap-0.5", className)} {...props} />
))
SidebarGroupContent.displayName = "SidebarGroupContent"

const SidebarMenu = React.forwardRef(({ className, ...props }, ref) => (
  <ul ref={ref} className={cn("flex flex-col gap-0.5 list-none m-0 p-0", className)} {...props} />
))
SidebarMenu.displayName = "SidebarMenu"

const SidebarMenuItem = React.forwardRef(({ className, ...props }, ref) => (
  <li ref={ref} className={cn("", className)} {...props} />
))
SidebarMenuItem.displayName = "SidebarMenuItem"

const SidebarMenuButton = React.forwardRef(({ className, asChild, isActive, children, ...props }, ref) => {
  const { open } = React.useContext(SidebarContext)
  const Comp = asChild ? "span" : "button"
  const inner = asChild ? React.Children.only(children) : null
  if (asChild && inner) {
    return React.cloneElement(inner, {
      ref,
      className: cn("flex items-center gap-2 rounded-md px-2 py-2 text-sm transition-colors w-full", isActive ? "bg-sidebar-primary text-sidebar-primary-foreground" : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground", !open && "justify-center", className, inner.props.className),
    })
  }
  return (
    <Comp ref={ref} className={cn("flex items-center gap-2 rounded-md px-2 py-2 text-sm transition-colors w-full", isActive ? "bg-sidebar-primary text-sidebar-primary-foreground" : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground", !open && "justify-center", className)} {...props}>
      {children}
    </Comp>
  )
})
SidebarMenuButton.displayName = "SidebarMenuButton"

export {
  SidebarProvider, Sidebar, SidebarInset, SidebarTrigger,
  SidebarHeader, SidebarFooter, SidebarContent,
  SidebarGroup, SidebarGroupLabel, SidebarGroupContent,
  SidebarMenu, SidebarMenuItem, SidebarMenuButton
}
