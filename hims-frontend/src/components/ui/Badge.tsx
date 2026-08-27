import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export type BadgeTone = "green" | "blue" | "red" | "yellow" | "gray" | "purple";

const toneClasses: Record<BadgeTone, string> = {
  green: "bg-emerald-100 text-emerald-800",
  blue: "bg-blue-100 text-blue-800",
  red: "bg-red-100 text-red-800",
  yellow: "bg-amber-100 text-amber-800",
  gray: "bg-slate-100 text-slate-700",
  purple: "bg-purple-100 text-purple-800",
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

export function Badge({ tone = "gray", className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        toneClasses[tone],
        className,
      )}
      {...props}
    />
  );
}
