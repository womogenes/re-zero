export function FormLabel({
  htmlFor,
  children,
}: {
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="text-xs text-muted-foreground block mb-3"
    >
      {children}
    </label>
  );
}
