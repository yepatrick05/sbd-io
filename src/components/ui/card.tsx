import { forwardRef, type HTMLAttributes } from "react";

import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

type CardVariant = "default" | "muted";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
    variant?: CardVariant;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
    { className, variant = "default", ...props },
    ref,
) {
    return (
        <div
            ref={ref}
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
});
