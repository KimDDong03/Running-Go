import * as React from "react"

import { cn } from "@/lib/utils"

const cardToneClass = {
  default:
    "rg-map-pop-card border-[#102449]/20 bg-[linear-gradient(165deg,rgba(255,255,255,0.95),rgba(244,250,255,0.9))]",
  mapPop:
    "rg-map-pop-card border-[#102449]/20 bg-[linear-gradient(165deg,rgba(255,255,255,0.95),rgba(244,250,255,0.9))]",
} as const

type CardTone = keyof typeof cardToneClass

function Card({
  className,
  tone = "default",
  ...props
}: React.ComponentProps<"div"> & { tone?: CardTone }) {
  return (
    <div
      data-slot="card"
      data-tone={tone}
      className={cn(
        "text-card-foreground flex flex-col gap-6 rounded-[26px] border py-6 backdrop-blur-md",
        cardToneClass[tone],
        className
      )}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-2 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6",
        className
      )}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn("leading-none font-semibold", className)}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className
      )}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-6", className)}
      {...props}
    />
  )
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex items-center px-6 [.border-t]:pt-6", className)}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
}
