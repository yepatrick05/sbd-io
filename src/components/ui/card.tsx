import type { HTMLAttributes } from "react";

import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

type CardVariant = "default" | "muted";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
    variant?: CardVariant;
}

export function Card({ className, variant = "default", ...props }: CardProps) {
    return (
        <div
            className={twMerge(
                clsx("rounded-lg border border-border", {
                    "bg-surface": variant === "default",
                    "bg-surface-muted": variant === "muted",
                }),
                className,
            )}
            {...props}
        />
    );
}
