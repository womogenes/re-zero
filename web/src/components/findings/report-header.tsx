import type { Finding } from "@/lib/types";
import { SEVERITY_ORDER } from "@/lib/scan-utils";
import { SeverityBar } from "./severity-bar";

export function ReportHeader({
  findings,
  children,
}: {
  findings: Finding[];
  children?: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-baseline gap-3 text-xs text-muted-foreground tabular-nums">
        <span>{findings.length} findings</span>
        {SEVERITY_ORDER.map((sev) => {
          const count = findings.filter((f) => f.severity === sev).length;
          if (count === 0) return null;
          return (
            <span
              key={sev}
              className={
                sev === "critical" || sev === "high" ? "text-destructive" : ""
              }
            >
              {count} {sev}
            </span>
          );
        })}
        {children}
      </div>
      <div className="mt-2">
        <SeverityBar findings={findings} />
      </div>
    </div>
  );
}
