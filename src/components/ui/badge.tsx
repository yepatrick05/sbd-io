import type { HTMLAttributes } from "react";

import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

type BadgeVariant = "neutral" | "current" | "completed" | "upcoming" | "warning" | "error";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
    variant?: BadgeVariant;
}

export function Badge({ className, variant = "neutral", ...props }: BadgeProps) {
    return (
        <span
            className={twMerge(
                clsx(
                    "inline-flex items-center rounded-md border px-2.5 py-1 text-[11px] font-medium tracking-[0.08em]",
                    "uppercase",
                    {
                        "border-border bg-surface-muted text-muted-foreground": variant === "neutral",
                        "border-[#efbcc5] bg-current-surface text-current-foreground": variant === "current",
                        "border-[#cad9c7] bg-success-surface text-success-foreground": variant === "completed",
                        "border-[#d7cec1] bg-upcoming-surface text-upcoming-foreground": variant === "upcoming",
                        "border-[#dccda8] bg-warning-surface text-warning-foreground": variant === "warning",
                        "border-[#e6b8b2] bg-danger-surface text-danger-foreground": variant === "error",
                    },
                ),
                className,
            )}
            {...props}
        />
    );
}
