import type { ButtonHTMLAttributes } from "react";

import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "default" | "sm";

interface ButtonClassNameOptions {
    variant?: ButtonVariant;
    size?: ButtonSize;
    fullWidth?: boolean;
    className?: string;
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: ButtonVariant;
    size?: ButtonSize;
    fullWidth?: boolean;
}

export function Button({
    className,
    variant = "primary",
    size = "default",
    fullWidth = false,
    type = "button",
    ...props
}: ButtonProps) {
    return (
        <button
            type={type}
            className={getButtonClassName({
                variant,
                size,
                fullWidth,
                className,
            })}
            {...props}
        />
    );
}

export function getButtonClassName({
    variant = "primary",
    size = "default",
    fullWidth = false,
    className,
}: ButtonClassNameOptions = {}) {
    return twMerge(
        clsx(
            "inline-flex items-center justify-center rounded-md border text-sm font-medium",
            "disabled:cursor-not-allowed disabled:opacity-60",
            "focus-visible:outline-none",
            {
                "w-full": fullWidth,
                "px-4 py-2.5": size === "default",
                "px-3 py-2": size === "sm",
                "border-[#efbcc5] bg-current-surface text-current-foreground hover:border-[#e59aa8] hover:bg-[#f4d8de]":
                    variant === "primary",
                "border-border bg-surface text-foreground hover:bg-surface-muted": variant === "secondary",
                "border-transparent bg-transparent text-muted-foreground hover:bg-surface-muted hover:text-foreground":
                    variant === "ghost",
                "border-[#d8b4ad] bg-surface text-[#7d2d28] hover:bg-[#f5ede7]": variant === "danger",
            },
            className,
        ),
    );
}
