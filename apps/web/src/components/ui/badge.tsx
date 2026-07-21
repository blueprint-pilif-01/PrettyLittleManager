import type { HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

const badgeVariants = cva(
  "inline-flex w-fit items-center gap-1 rounded-full border px-2 py-0.5 text-[0.6875rem] font-semibold leading-4",
  {
    variants: {
      tone: {
        neutral:
          "border-[var(--border)] bg-[var(--surface-subtle)] text-[var(--text-muted)]",
        success:
          "border-[var(--success-border)] bg-[var(--success-soft)] text-[var(--success-text)]",
        warning:
          "border-[var(--warning-border)] bg-[var(--warning-soft)] text-[var(--warning-text)]",
        danger:
          "border-[var(--danger-border)] bg-[var(--danger-soft)] text-[var(--danger-text)]",
        info: "border-[var(--info-border)] bg-[var(--info-soft)] text-[var(--info-text)]",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export function Badge({
  className,
  tone,
  ...props
}: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
