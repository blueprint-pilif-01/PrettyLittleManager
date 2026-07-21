import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

const buttonVariants = cva(
  "inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold outline-none transition-[background-color,color,border-color,box-shadow,transform] duration-150 focus-visible:ring-[3px] focus-visible:ring-[var(--focus-ring)] disabled:pointer-events-none disabled:opacity-50 active:translate-y-px motion-reduce:transition-none motion-reduce:active:transform-none",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--primary)] text-white shadow-[var(--shadow-control)] hover:bg-[var(--primary-hover)]",
        secondary:
          "border border-[var(--border-strong)] bg-[var(--surface)] text-[var(--text)] shadow-[var(--shadow-control)] hover:bg-[var(--surface-hover)]",
        ghost:
          "text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]",
        destructive:
          "bg-[var(--danger)] text-white hover:bg-[var(--danger-hover)]",
      },
      size: {
        default: "h-9 px-3.5",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 px-4",
        icon: "size-9 p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Component = asChild ? Slot : "button";
    return (
      <Component
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    );
  },
);

Button.displayName = "Button";
export { buttonVariants };
