export function JsonBlock({ data }: { data: unknown }) {
  if (data === null || data === undefined) return null;
  const formatted =
    typeof data === "string" ? data : JSON.stringify(data, null, 2);
  return (
    <pre className="text-xs bg-muted/60 border border-rem/15 px-3 py-2 whitespace-pre-wrap overflow-x-auto text-foreground/60 leading-relaxed">
      {formatted}
    </pre>
  );
}
