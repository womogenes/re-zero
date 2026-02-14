"use client";

import { useParams } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "../../../../../../../convex/_generated/api";
import { Id } from "../../../../../../../convex/_generated/dataModel";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useEffect, useRef, useState } from "react";

// --- JSON display ---
function JsonBlock({ data }: { data: unknown }) {
  if (data === null || data === undefined) return null;
  const formatted = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  return (
    <pre className="text-xs bg-muted/60 border border-border px-3 py-2 whitespace-pre-wrap overflow-x-auto text-foreground/60 leading-relaxed">
      {formatted}
    </pre>
  );
}

// --- Action rendering ---
type ActionPayload = string | Record<string, unknown>;

function ActionItem({
  action,
}: {
  action: {
    _id: string;
    type: string;
    payload: ActionPayload;
    timestamp: number;
  };
}) {
  const [expanded, setExpanded] = useState(false);
  const payload = action.payload;
  const isObject = typeof payload === "object" && payload !== null;

  const time = new Date(action.timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  // Reasoning: the agent's inner monologue
  if (action.type === "reasoning") {
    return (
      <div className="px-5 py-3 my-1">
        <div className="border-l-2 border-foreground/15 pl-4">
          <p className="text-sm text-foreground/80 whitespace-pre-wrap leading-relaxed">
            {typeof payload === "string" ? payload : JSON.stringify(payload)}
          </p>
          <span className="text-xs text-muted-foreground mt-2 block tabular-nums">
            {time}
          </span>
        </div>
      </div>
    );
  }

  // Observation: system messages
  if (action.type === "observation") {
    return (
      <div className="px-5 py-1.5 flex items-center gap-3">
        <span className="text-sm text-muted-foreground">
          {typeof payload === "string" ? payload : JSON.stringify(payload)}
        </span>
        <span className="text-xs text-muted-foreground/50 ml-auto shrink-0 tabular-nums">
          {time}
        </span>
      </div>
    );
  }

  // Tool call: expandable with input details
  if (action.type === "tool_call") {
    const tool = isObject ? String((payload as Record<string, unknown>).tool) : "?";
    const summary = isObject ? (payload as Record<string, unknown>).summary : null;
    const input = isObject ? (payload as Record<string, unknown>).input : null;

    return (
      <Collapsible open={expanded} onOpenChange={setExpanded}>
        <CollapsibleTrigger asChild>
          <button className="w-full text-left px-5 py-2 flex items-center gap-3 hover:bg-accent/40 transition-colors duration-100 cursor-pointer">
            <span className="text-xs text-muted-foreground/60 shrink-0 w-3 tabular-nums">
              {expanded ? "\u2212" : "+"}
            </span>
            <span className="text-xs text-muted-foreground border border-border px-1.5 py-px shrink-0">
              {tool}
            </span>
            <span className="text-sm text-foreground/70 truncate flex-1">
              {summary ? String(summary) : ""}
            </span>
            <span className="text-xs text-muted-foreground/50 shrink-0 tabular-nums">
              {time}
            </span>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="ml-12 mr-5 mb-3">
            {input != null && <JsonBlock data={input} />}
          </div>
        </CollapsibleContent>
      </Collapsible>
    );
  }

  // Tool result: compact inline
  if (action.type === "tool_result") {
    const summary = isObject ? (payload as Record<string, unknown>).summary : null;

    return (
      <div className="px-5 py-1 flex items-center gap-3">
        <span className="w-3" />
        <span className="text-sm text-muted-foreground/60 truncate">
          {summary
            ? String(summary)
            : typeof payload === "string"
              ? payload
              : JSON.stringify(payload)}
        </span>
        <span className="text-xs text-muted-foreground/40 ml-auto shrink-0 tabular-nums">
          {time}
        </span>
      </div>
    );
  }

  // Fallback
  return (
    <div className="px-5 py-2 flex items-center gap-3">
      <span className="text-sm text-foreground/70">
        {typeof payload === "string" ? payload : JSON.stringify(payload)}
      </span>
      <span className="text-xs text-muted-foreground/50 ml-auto shrink-0 tabular-nums">
        {time}
      </span>
    </div>
  );
}

// --- Report panel ---
function ReportPanel({
  report,
}: {
  report: {
    summary?: string;
    findings: Array<{
      title: string;
      severity: string;
      description: string;
      location?: string;
      recommendation?: string;
    }>;
  };
}) {
  const severityCounts = report.findings.reduce(
    (acc, f) => {
      acc[f.severity] = (acc[f.severity] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border shrink-0">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold">Report</h2>
          <div className="flex items-baseline gap-4 text-xs text-muted-foreground">
            <span>{report.findings.length} findings</span>
            {(["critical", "high", "medium", "low", "info"] as const).map((sev) => {
              const count = severityCounts[sev] || 0;
              if (count === 0) return null;
              return (
                <span
                  key={sev}
                  className={
                    sev === "critical" || sev === "high"
                      ? "text-destructive"
                      : ""
                  }
                >
                  {count} {sev}
                </span>
              );
            })}
          </div>
        </div>
      </div>

      {/* Content — reads like a document */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-6 py-5">
          {report.summary && (
            <p className="text-sm text-muted-foreground leading-relaxed mb-6 pb-6 border-b border-border">
              {report.summary}
            </p>
          )}

          {report.findings.map((finding, i) => (
            <div
              key={i}
              className="py-5 border-b border-border last:border-b-0"
            >
              {/* Severity + location metadata */}
              <div className="flex items-baseline gap-3 mb-2">
                <span
                  className={`text-xs font-medium ${
                    finding.severity === "critical" || finding.severity === "high"
                      ? "text-destructive"
                      : "text-muted-foreground"
                  }`}
                >
                  {finding.severity}
                </span>
                {finding.location && (
                  <>
                    <span className="text-xs text-muted-foreground/40">&middot;</span>
                    <span className="text-xs text-muted-foreground">
                      {finding.location}
                    </span>
                  </>
                )}
              </div>

              {/* Title */}
              <div className="text-sm font-medium mb-2">{finding.title}</div>

              {/* Description */}
              <p className="text-sm text-muted-foreground leading-relaxed">
                {finding.description}
              </p>

              {/* Recommendation */}
              {finding.recommendation && (
                <p className="text-sm text-muted-foreground mt-3 border-l-2 border-destructive/30 pl-3">
                  {finding.recommendation}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// --- Trace panel ---
function TracePanel({
  actions,
  isRunning,
}: {
  actions:
    | Array<{
        _id: string;
        type: string;
        payload: ActionPayload;
        timestamp: number;
      }>
    | undefined;
  isRunning: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [showScrollButton, setShowScrollButton] = useState(false);

  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  };

  useEffect(() => {
    if (autoScroll) {
      scrollToBottom();
    }
  }, [actions?.length, autoScroll]);

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 60;
    setAutoScroll(isAtBottom);
    setShowScrollButton(!isAtBottom);
  };

  return (
    <div className="h-full flex flex-col relative">
      <div className="px-6 py-4 border-b border-border shrink-0 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold">Trace</h2>
        <span className="text-xs text-muted-foreground">
          {actions?.length ?? 0} actions
        </span>
      </div>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto"
      >
        <div className="py-2">
          {(!actions || actions.length === 0) && (
            <div className="flex items-center justify-center py-20">
              <p className="text-sm text-muted-foreground">
                Waiting for agent...
              </p>
            </div>
          )}

          {actions?.map((action) => (
            <ActionItem key={action._id} action={action} />
          ))}

          {isRunning && actions && actions.length > 0 && (
            <div className="flex items-center gap-2.5 px-5 py-4 text-sm text-muted-foreground">
              <span className="inline-block w-1.5 h-1.5 bg-destructive/70 animate-pulse" />
              Agent is working...
            </div>
          )}
        </div>
      </div>

      {showScrollButton && (
        <button
          className="absolute bottom-4 right-4 text-xs border border-border bg-background px-2.5 py-1.5 text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors duration-100"
          onClick={() => {
            setAutoScroll(true);
            scrollToBottom();
          }}
        >
          scroll to bottom
        </button>
      )}
    </div>
  );
}

// --- Main page ---
export default function ScanPage() {
  const { id, scanId } = useParams<{ id: string; scanId: string }>();
  const scan = useQuery(api.scans.get, {
    scanId: scanId as Id<"scans">,
  });
  const actions = useQuery(api.actions.listByScan, {
    scanId: scanId as Id<"scans">,
  });
  const report = useQuery(api.reports.getByScan, {
    scanId: scanId as Id<"scans">,
  });

  if (!scan) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-8rem)]">
        <p className="text-sm text-muted-foreground">loading...</p>
      </div>
    );
  }

  const isRunning = scan.status === "running" || scan.status === "queued";
  const hasReport = !!report;

  return (
    <div className="flex flex-col h-[calc(100vh-3.25rem)]">
      {/* Scan header — full width, tight */}
      <div className="flex items-center gap-5 px-8 py-3 border-b border-border shrink-0">
        <h1 className="text-sm font-semibold">Scan</h1>
        <span className="text-xs text-muted-foreground">{scan.agent}</span>
        <span className="text-xs flex items-center gap-2">
          {isRunning && (
            <span className="inline-block w-1.5 h-1.5 bg-destructive/70 animate-pulse" />
          )}
          <span className={isRunning ? "text-destructive" : "text-muted-foreground"}>
            {scan.status}
          </span>
        </span>
        <span className="text-xs text-muted-foreground ml-auto tabular-nums">
          {new Date(scan.startedAt).toLocaleString()}
        </span>
      </div>

      {/* Content — full viewport width, no max-w constraint */}
      <div className="flex-1 min-h-0">
        {hasReport ? (
          <ResizablePanelGroup orientation="horizontal">
            <ResizablePanel defaultSize={42} minSize={20}>
              <TracePanel actions={actions} isRunning={isRunning} />
            </ResizablePanel>
            <ResizableHandle />
            <ResizablePanel defaultSize={58} minSize={25}>
              <ReportPanel report={report} />
            </ResizablePanel>
          </ResizablePanelGroup>
        ) : (
          <TracePanel actions={actions} isRunning={isRunning} />
        )}
      </div>
    </div>
  );
}
