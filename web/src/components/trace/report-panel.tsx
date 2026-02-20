"use client";

import { useState, type ReactNode } from "react";
import type { Report, ScanStats } from "@/lib/types";
import { FindingCard } from "@/components/findings/finding-card";
import { SeverityBar } from "@/components/findings/severity-bar";
import { SEVERITY_ORDER } from "@/lib/scan-utils";
import { GhostButton } from "@/components/form/ghost-button";

type TabId = "findings" | "stats" | "raw";

const TABS: { id: TabId; label: string }[] = [
  { id: "findings", label: "findings" },
  { id: "stats", label: "stats" },
  { id: "raw", label: "raw" },
];

export function ReportPanel({
  report,
  scanMeta,
  stats,
  title,
  headerExtra,
}: {
  report: Report;
  scanMeta?: { tier?: string; model?: string; startedAt: number; finishedAt?: number };
  stats?: ScanStats | null;
  title?: ReactNode;
  headerExtra?: ReactNode;
}) {
  const [activeTab, setActiveTab] = useState<TabId>("findings");
  const [copied, setCopied] = useState(false);

  const sevCounts = SEVERITY_ORDER.map((sev) => ({
    sev,
    count: report.findings.filter((f) => f.severity === sev).length,
  })).filter((s) => s.count > 0);

  const handleCopyRaw = () => {
    const raw = (report as any).raw ?? { summary: report.summary, findings: report.findings };
    navigator.clipboard.writeText(JSON.stringify(raw, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border shrink-0">
        <div className="flex items-baseline justify-between mb-3">
          {title ? (
            <div className="flex items-baseline gap-4">{title}</div>
          ) : (
            <h2 className="text-base font-semibold">report</h2>
          )}
          <div className="flex items-center gap-4">
            {headerExtra}
            <div className="flex items-baseline gap-4 text-xs text-muted-foreground">
              <span>{report.findings.length} findings</span>
              {sevCounts.map(({ sev, count }) => (
                <span
                  key={sev}
                  className={sev === "critical" || sev === "high" ? "text-destructive" : ""}
                >
                  {count} {sev}
                </span>
              ))}
            </div>
          </div>
        </div>
        <SeverityBar findings={report.findings} />

        {/* Tabs */}
        <div className="flex items-center gap-1 mt-4 -mb-px">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`text-xs px-3 py-1.5 border-b-2 transition-all duration-100 ${
                activeTab === tab.id
                  ? "border-b-foreground text-foreground"
                  : "border-b-transparent text-muted-foreground hover:text-foreground hover:bg-accent/50"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === "findings" && (
          <div className="px-6 py-5">
            {report.summary && (
              <p className="text-sm text-muted-foreground leading-relaxed text-justify mb-6 pb-6 border-b border-border">
                {report.summary}
              </p>
            )}
            {report.findings.map((finding, i) => (
              <FindingCard key={i} finding={finding} index={i} animate={true} />
            ))}
          </div>
        )}

        {activeTab === "stats" && (
          <div className="px-6 py-5 space-y-6">
            {/* Severity breakdown */}
            <div>
              <h3 className="text-xs text-muted-foreground mb-3">SEVERITY BREAKDOWN</h3>
              <div className="space-y-2">
                {SEVERITY_ORDER.map((sev) => {
                  const count = report.findings.filter((f) => f.severity === sev).length;
                  const pct = report.findings.length > 0 ? (count / report.findings.length) * 100 : 0;
                  return (
                    <div key={sev} className="flex items-center gap-3">
                      <span className={`text-xs w-14 ${
                        (sev === "critical" || sev === "high") && count > 0 ? "text-destructive" : "text-muted-foreground"
                      }`}>
                        {sev}
                      </span>
                      <div className="flex-1 h-1.5 bg-border/30">
                        <div
                          className={`h-full transition-all duration-300 ${
                            sev === "critical" ? "bg-destructive" :
                            sev === "high" ? "bg-destructive/70" :
                            sev === "medium" ? "bg-rem" :
                            sev === "low" ? "bg-rem/50" : "bg-muted-foreground/30"
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-xs tabular-nums text-muted-foreground w-8 text-right">
                        {count}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Scan metadata */}
            {(scanMeta || stats) && (
              <div>
                <h3 className="text-xs text-muted-foreground mb-3">SCAN INFO</h3>
                <div className="grid grid-cols-2 gap-y-2 gap-x-8 text-xs">
                  {scanMeta?.model && (
                    <>
                      <span className="text-muted-foreground">model</span>
                      <span>{scanMeta.model}</span>
                    </>
                  )}
                  {scanMeta?.tier && (
                    <>
                      <span className="text-muted-foreground">tier</span>
                      <span>{scanMeta.tier}</span>
                    </>
                  )}
                  {stats?.turns !== undefined && (
                    <>
                      <span className="text-muted-foreground">turns</span>
                      <span className="tabular-nums">{stats.turns}</span>
                    </>
                  )}
                  {stats && stats.filesRead > 0 && (
                    <>
                      <span className="text-muted-foreground">files read</span>
                      <span className="tabular-nums">{stats.filesRead}</span>
                    </>
                  )}
                  {stats && stats.searches > 0 && (
                    <>
                      <span className="text-muted-foreground">searches</span>
                      <span className="tabular-nums">{stats.searches}</span>
                    </>
                  )}
                  {stats && stats.browserActions > 0 && (
                    <>
                      <span className="text-muted-foreground">browser actions</span>
                      <span className="tabular-nums">{stats.browserActions}</span>
                    </>
                  )}
                  {stats && stats.screenshots > 0 && (
                    <>
                      <span className="text-muted-foreground">screenshots</span>
                      <span className="tabular-nums">{stats.screenshots}</span>
                    </>
                  )}
                  {stats?.duration && (
                    <>
                      <span className="text-muted-foreground">duration</span>
                      <span className="tabular-nums">{stats.duration}</span>
                    </>
                  )}
                  {scanMeta?.startedAt && (
                    <>
                      <span className="text-muted-foreground">started</span>
                      <span className="tabular-nums">{new Date(scanMeta.startedAt).toLocaleString()}</span>
                    </>
                  )}
                  {scanMeta?.finishedAt && (
                    <>
                      <span className="text-muted-foreground">finished</span>
                      <span className="tabular-nums">{new Date(scanMeta.finishedAt).toLocaleString()}</span>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Summary */}
            {report.summary && (
              <div>
                <h3 className="text-xs text-muted-foreground mb-3">SUMMARY</h3>
                <p className="text-sm text-muted-foreground leading-relaxed text-justify">
                  {report.summary}
                </p>
              </div>
            )}
          </div>
        )}

        {activeTab === "raw" && (
          <div className="px-6 py-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs text-muted-foreground">JSON OUTPUT</h3>
              <GhostButton variant="muted" onClick={handleCopyRaw} className="px-2 py-0.5">
                {copied ? "copied" : "copy"}
              </GhostButton>
            </div>
            <pre className="text-xs text-muted-foreground bg-card/50 border border-border p-4 overflow-x-auto whitespace-pre-wrap break-words leading-relaxed">
              {JSON.stringify(
                (report as any).raw ?? { summary: report.summary, findings: report.findings },
                null,
                2
              )}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
