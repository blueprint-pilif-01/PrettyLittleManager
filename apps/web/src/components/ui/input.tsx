import * as React from "react";
import { cn } from "../../lib/utils";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, type, ...props }, ref) => (
  <input
    ref={ref}
    type={type}
    className={cn(
      "h-9 w-full rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-sm text-[var(--text)] shadow-[var(--shadow-control)] outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-[var(--text-subtle)] focus:border-[var(--primary)] focus:ring-[3px] focus:ring-[var(--focus-ring)] disabled:cursor-not-allowed disabled:bg-[var(--surface-subtle)] disabled:opacity-70 motion-reduce:transition-none",
      className,
    )}
    {...props}
  />
));

Input.displayName = "Input";
