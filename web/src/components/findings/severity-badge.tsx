export function SeverityBadge({ severity }: { severity: string }) {
  return (
    <span
      className={`text-xs font-medium ${
        severity === "critical" || severity === "high"
          ? "text-destructive"
          : "text-muted-foreground"
      }`}
    >
      {severity}
    </span>
  );
}
