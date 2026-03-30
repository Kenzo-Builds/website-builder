import * as React from "react"
import { cn } from "@/lib/utils"
import { X } from "lucide-react"

const ToastContext = React.createContext({ toasts: [], addToast: () => {}, removeToast: () => {} })

function ToastProvider({ children }) {
  const [toasts, setToasts] = React.useState([])
  const addToast = (toast) => {
    const id = Date.now()
    setToasts(t => [...t, { ...toast, id }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), toast.duration || 5000)
  }
  const removeToast = (id) => setToasts(t => t.filter(x => x.id !== id))
  return <ToastContext.Provider value={{ toasts, addToast, removeToast }}>{children}</ToastContext.Provider>
}

function Toaster() {
  const { toasts, removeToast } = React.useContext(ToastContext)
  return (
    <div className="fixed bottom-0 right-0 z-50 flex flex-col gap-2 p-4 max-w-sm w-full">
      {toasts.map(t => (
        <div key={t.id} className={cn("group pointer-events-auto relative flex w-full items-center justify-between space-x-4 overflow-hidden rounded-md border p-6 pr-8 shadow-lg transition-all bg-background text-foreground border-border")}>
          <div className="grid gap-1">{t.title && <div className="text-sm font-semibold">{t.title}</div>}{t.description && <div className="text-sm opacity-90">{t.description}</div>}</div>
          <button onClick={() => removeToast(t.id)} className="absolute right-2 top-2 rounded-md p-1 opacity-0 transition-opacity group-hover:opacity-100"><X className="h-4 w-4" /></button>
        </div>
      ))}
    </div>
  )
}

function useToast() {
  const ctx = React.useContext(ToastContext)
  return { toast: ctx.addToast, toasts: ctx.toasts, dismiss: ctx.removeToast }
}

export { ToastProvider, Toaster, useToast }
