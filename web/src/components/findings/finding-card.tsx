import type { Finding } from "@/lib/types";
import { SEVERITY_BORDER } from "@/lib/scan-utils";
import { SeverityBadge } from "./severity-badge";
import { CodeSnippet } from "./code-snippet";
import { RemediationBox } from "./remediation-box";

export function FindingCard({
  finding,
  index,
  animate = true,
}: {
  finding: Finding;
  index: number;
  animate?: boolean;
}) {
  const sevBorder = SEVERITY_BORDER[finding.severity] ?? "border-l-border";

  return (
    <div
      className={`py-5 px-5 mb-3 border border-border border-l-[3px] ${sevBorder} bg-card/30 ${animate ? "animate-fade-slide-in" : ""}`}
      style={animate ? { animationDelay: `${index * 30}ms` } : undefined}
    >
      {/* ID + Severity + Location */}
      <div className="flex items-baseline gap-3 mb-2">
        {finding.id && (
          <span className="text-xs text-muted-foreground/50 tabular-nums tracking-wider">
            {finding.id}
          </span>
        )}
        <SeverityBadge severity={finding.severity} />
        {finding.location && !finding.codeSnippet && (
          <>
            <span className="text-xs text-muted-foreground/30">&middot;</span>
            <span className="text-xs text-muted-foreground">
              {finding.location}
            </span>
          </>
        )}
      </div>

      {/* Title */}
      <div className="text-sm font-medium mb-2">{finding.title}</div>

      {/* Description */}
      <p className="text-sm text-muted-foreground leading-relaxed text-justify">
        {finding.description}
      </p>

      {/* Code snippet */}
      {finding.codeSnippet && (
        <CodeSnippet code={finding.codeSnippet} location={finding.location} />
      )}

      {/* Remediation */}
      {finding.recommendation && (
        <RemediationBox text={finding.recommendation} />
      )}
    </div>
  );
}
