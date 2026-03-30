import * as React from "react"
import { cn } from "@/lib/utils"

const Avatar = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full", className)} {...props} />
))
Avatar.displayName = "Avatar"

const AvatarImage = React.forwardRef(({ className, src, alt, onError, ...props }, ref) => {
  const [error, setError] = React.useState(false)
  if (error || !src) return null
  return <img ref={ref} src={src} alt={alt} className={cn("aspect-square h-full w-full", className)} onError={() => setError(true)} {...props} />
})
AvatarImage.displayName = "AvatarImage"

const AvatarFallback = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("flex h-full w-full items-center justify-center rounded-full bg-muted", className)} {...props} />
))
AvatarFallback.displayName = "AvatarFallback"

export { Avatar, AvatarImage, AvatarFallback }
