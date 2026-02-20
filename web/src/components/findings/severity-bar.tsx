import { SEVERITY_BAR_COLORS, SEVERITY_ORDER } from "@/lib/scan-utils";

export function SeverityBar({
  findings,
}: {
  findings: Array<{ severity: string }>;
}) {
  if (findings.length === 0) return null;

  const counts: Record<string, number> = {};
  for (const f of findings) counts[f.severity] = (counts[f.severity] || 0) + 1;

  return (
    <div className="flex h-[3px] w-full overflow-hidden">
      {SEVERITY_ORDER.map((sev) => {
        const count = counts[sev] || 0;
        if (count === 0) return null;
        return (
          <div
            key={sev}
            className={SEVERITY_BAR_COLORS[sev]}
            style={{ width: `${(count / findings.length) * 100}%` }}
          />
        );
      })}
    </div>
  );
}
