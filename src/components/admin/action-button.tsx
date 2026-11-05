"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "approve" | "danger" | "neutral" | "ghost";
type Size = "sm" | "md";

interface ActionButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
  fullWidth?: boolean;
}

/**
 * One button for the whole admin surface.
 *
 * Deliberate weight hierarchy: a single solid action (`primary`), a filled
 * affirmative (`approve`), an outlined destructive (`danger`) and two quiet
 * treatments. Nothing shares the primary's weight, so the eye always knows what
 * the safe next step is — and destructive actions never look inviting.
 */
const variants: Record<Variant, string> = {
  primary:
    "bg-emerald-500 text-[#04150c] font-bold hover:bg-emerald-400 active:bg-emerald-500 shadow-[0_10px_30px_-16px_rgba(16,185,129,0.9)]",
  approve: "bg-emerald-500/12 text-emerald-300 hover:bg-emerald-500/20 active:bg-emerald-500/25",
  danger: "bg-red-500/[0.06] text-red-300 ring-1 ring-inset ring-red-500/25 hover:bg-red-500/12 hover:ring-red-500/40",
  neutral: "bg-white/[0.06] text-gray-200 hover:bg-white/[0.1] active:bg-white/[0.12]",
  ghost: "text-gray-400 hover:text-white hover:bg-white/[0.06]",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-3 text-xs gap-1.5 rounded-lg",
  md: "h-11 px-4 text-sm gap-2 rounded-xl",
};

export default function ActionButton({
  variant = "neutral",
  size = "sm",
  loading,
  icon,
  fullWidth,
  className,
  children,
  disabled,
  ...rest
}: ActionButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap font-semibold",
        "transition-colors duration-150 outline-none",
        "focus-visible:ring-2 focus-visible:ring-emerald-300/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#04150c]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        variants[variant],
        sizes[size],
        fullWidth && "w-full",
        className
      )}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" /> : icon}
      {children}
    </button>
  );
}
