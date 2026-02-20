"use client";

import { useParams } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { getScanLabel } from "@/lib/scan-tiers";
import type { Action } from "@/lib/types";
import { computeStats } from "@/lib/scan-utils";
import Link from "next/link";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { useMemo } from "react";
import { StatusDot } from "@/components/scan/status-dot";
import { TracePanel } from "@/components/trace/trace-panel";
import { ReportPanel } from "@/components/trace/report-panel";

export default function SharedScanPage() {
  const { token } = useParams<{ token: string }>();

  const scan = useQuery(api.scans.getByShareToken, { token: token ?? "" });
  const scanId = scan?._id;
  const actions = useQuery(
    api.actions.listByScan,
    scanId ? { scanId } : "skip",
  );
  const report = useQuery(
    api.reports.getByScan,
    scanId ? { scanId } : "skip",
  );

  const isRunning = scan?.status === "running" || scan?.status === "queued";
  const stats = useMemo(() => computeStats(actions as Action[] | undefined), [actions]);

  // Not found
  if (scan === null) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-base font-semibold mb-2">link expired or invalid</h1>
          <p className="text-sm text-muted-foreground mb-4">this shared trace is no longer available.</p>
          <Link href="/" className="text-xs text-rem hover:underline">go to re:zero</Link>
        </div>
      </div>
    );
  }

  // Loading
  if (scan === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <img src="/rem-running.gif" alt="rem" className="w-16 h-16 mx-auto mb-3 object-contain" />
          <p className="text-sm text-muted-foreground">loading shared trace...</p>
        </div>
      </div>
    );
  }

  const hasReport = !!report;

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <header className="border-b border-border px-8 h-11 flex items-center justify-between shrink-0 mt-[2px]">
        <div className="flex items-center gap-8 text-sm">
          <Link href="/" className="tracking-tight hover:opacity-70 transition-opacity duration-150">
            <span className="font-semibold">re</span>
            <span className="text-destructive font-semibold">:</span>
            <span className="font-semibold">zero</span>
          </Link>
        </div>
        <span className="text-xs text-muted-foreground/50">shared trace</span>
      </header>

      {/* Scan info bar */}
      <div className="flex items-center gap-5 px-8 py-3 border-b border-border shrink-0">
        <span className="text-sm font-semibold">
          {getScanLabel(scan)}
        </span>
        <span className="text-xs flex items-center gap-2">
          {isRunning && <StatusDot />}
          <span className={isRunning ? "text-rem" : "text-muted-foreground"}>
            {scan.status}
          </span>
        </span>
        <div className="flex items-baseline gap-4 text-xs text-muted-foreground tabular-nums ml-auto">
          {stats && (
            <>
              <span>{stats.turns} turns</span>
              {stats.filesRead > 0 && <span>{stats.filesRead} files</span>}
              {stats.searches > 0 && <span>{stats.searches} searches</span>}
              {stats.browserActions > 0 && <span>{stats.browserActions} actions</span>}
              {stats.screenshots > 0 && <span>{stats.screenshots} screenshots</span>}
              <span>{stats.duration}</span>
            </>
          )}
        </div>
        <span className="text-xs text-muted-foreground tabular-nums">
          {new Date(scan.startedAt).toLocaleString()}
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0">
        {hasReport ? (
          <ResizablePanelGroup orientation="horizontal">
            <ResizablePanel defaultSize={42} minSize={20}>
              <TracePanel actions={actions as Action[] | undefined} isRunning={isRunning} readOnly />
            </ResizablePanel>
            <ResizableHandle />
            <ResizablePanel defaultSize={58} minSize={25}>
              <ReportPanel
                report={report}
                scanMeta={{ tier: scan.tier, model: scan.model, startedAt: scan.startedAt, finishedAt: scan.finishedAt }}
                stats={stats}
              />
            </ResizablePanel>
          </ResizablePanelGroup>
        ) : (
          <TracePanel actions={actions as Action[] | undefined} isRunning={isRunning} readOnly />
        )}
      </div>
    </div>
  );
}
