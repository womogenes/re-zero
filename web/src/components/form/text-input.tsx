import { forwardRef, type InputHTMLAttributes } from "react";

export const TextInput = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & {
    inputSize?: "sm" | "md";
  }
>(({ inputSize = "md", className = "", ...props }, ref) => {
  const sizeClass = inputSize === "sm" ? "text-xs px-2.5 py-1.5" : "text-sm px-3 py-2.5";
  return (
    <input
      ref={ref}
      className={`bg-transparent border border-border ${sizeClass} placeholder:text-muted-foreground/40 focus:outline-none focus:border-rem transition-colors duration-150 ${className}`}
      {...props}
    />
  );
});
TextInput.displayName = "TextInput";
