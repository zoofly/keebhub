import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "../../lib/cn";

// shadcn/ui-style button. Use `buttonVariants()` to style a <Link> as a button.
export const buttonVariants = cva(
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 py-2 font-semibold no-underline transition-colors disabled:pointer-events-none disabled:opacity-60",
  {
    variants: {
      variant: {
        primary: "bg-primary text-white hover:bg-primary-dark hover:text-white",
        outline:
          "border border-primary bg-surface text-primary hover:bg-primary-soft hover:text-primary-dark",
        danger:
          "border border-danger bg-surface text-danger hover:bg-danger-soft hover:text-danger",
        dangerSolid: "bg-danger text-white hover:bg-[#8f1e18] hover:text-white",
        ghost: "text-primary hover:bg-primary-soft hover:text-primary-dark",
      },
      size: {
        sm: "min-h-9 px-3 py-1.5 text-sm",
        md: "",
        lg: "min-h-12 px-5 text-lg",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export type ButtonProps = ComponentProps<"button"> & VariantProps<typeof buttonVariants>;

export function Button({ className, variant, size, type = "button", ...props }: ButtonProps) {
  return (
    <button type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  );
}
