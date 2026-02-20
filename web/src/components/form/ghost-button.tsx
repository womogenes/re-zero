import { forwardRef, type ButtonHTMLAttributes } from "react";

type Variant = "rem" | "destructive" | "muted";

const variantStyles: Record<Variant, string> = {
  rem: "border-rem/30 text-rem/70 hover:bg-rem/10 hover:border-rem hover:text-rem",
  destructive:
    "border-destructive/30 text-destructive/70 hover:bg-destructive/10 hover:border-destructive hover:text-destructive",
  muted:
    "border-border text-muted-foreground/60 hover:bg-rem/10 hover:border-rem/40 hover:text-rem",
};

/** Build the className string for a ghost button. Useful when applying to a Link or other element. */
export function ghostButtonClass(variant: Variant = "rem", extra = "") {
  return `text-xs border ${variantStyles[variant]} px-2.5 py-1.5 transition-all duration-100 active:translate-y-px disabled:opacity-30 ${extra}`.trim();
}

export const GhostButton = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: Variant;
  }
>(({ variant = "rem", className = "", children, ...props }, ref) => {
  return (
    <button
      ref={ref}
      className={ghostButtonClass(variant, className)}
      {...props}
    >
      {children}
    </button>
  );
});
GhostButton.displayName = "GhostButton";
