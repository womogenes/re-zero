import type { ButtonHTMLAttributes } from "react";

export function SelectionCard({
  active,
  className = "",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  active: boolean;
}) {
  return (
    <button
      className={`border text-left p-4 transition-all duration-100 ${
        active
          ? "border-rem bg-rem/8"
          : "border-border hover:border-rem/40 hover:bg-accent/40"
      } ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
