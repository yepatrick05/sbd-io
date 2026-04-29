import type { HTMLAttributes } from "react";

import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

type BadgeVariant = "neutral" | "accent" | "success" | "warning";

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
                        "border-accent bg-accent text-accent-foreground": variant === "accent",
                        "border-[#cad9c7] bg-success-surface text-success-foreground": variant === "success",
                        "border-[#dccda8] bg-warning-surface text-warning-foreground": variant === "warning",
                    },
                ),
                className,
            )}
            {...props}
        />
    );
}
