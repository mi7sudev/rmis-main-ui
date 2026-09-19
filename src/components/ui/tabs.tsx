"use client"

import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"

import { cn } from "@/lib/utils"

// Accenture tabs: text-only triggers over a hairline rule; the active
// trigger is claimed by a solid 2px primary underline (colour signal,
// not background chrome).
function Tabs({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn("flex flex-col gap-3", className)}
      {...props}
    />
  )
}

function TabsList({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        "bg-transparent text-muted-foreground inline-flex h-11 w-fit items-center justify-start rounded-none border-b border-border p-0",
        className
      )}
      {...props}
    />
  )
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring text-muted-foreground hover:text-foreground data-[state=active]:text-foreground inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-none -mb-px border-b-2 border-transparent px-4 text-sm font-medium whitespace-nowrap transition-colors duration-150 focus-visible:outline-1 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:border-primary [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("flex-1 outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
