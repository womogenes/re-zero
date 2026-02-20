"use client";

import { useParams } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../../../convex/_generated/api";
import { getScanLabel } from "@/lib/scan-tiers";
import { Id } from "../../../../../../../convex/_generated/dataModel";
import type { Action } from "@/lib/types";
import { computeStats } from "@/lib/scan-utils";
import { useMemo } from "react";
import Link from "next/link";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { useEffect, useState } from "react";
import { useMinLoading } from "@/hooks/use-min-loading";
import { LoadingState } from "@/components/loading-state";
import { Breadcrumb } from "@/components/breadcrumb";
import { StatusDot } from "@/components/scan/status-dot";
import { GhostButton } from "@/components/form/ghost-button";
import { TracePanel } from "@/components/trace/trace-panel";
import { ReportPanel } from "@/components/trace/report-panel";
import { ConfirmDialog } from "@/components/confirm-dialog";

export default function ScanPage() {
  const { id, scanId } = useParams<{ id: string; scanId: string }>();
  const projectId = id as Id<"projects">;
  const project = useQuery(api.projects.get, { projectId });
  const scan = useQuery(api.scans.get, {
    scanId: scanId as Id<"scans">,
  });
  const actions = useQuery(api.actions.listByScan, {
    scanId: scanId as Id<"scans">,
  });
  const report = useQuery(api.reports.getByScan, {
    scanId: scanId as Id<"scans">,
  });

  const generateShareToken = useMutation(api.scans.generateShareToken);
  const revokeShareToken = useMutation(api.scans.revokeShareToken);

  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [revokeOpen, setRevokeOpen] = useState(false);

  const handleShare = async () => {
    setSharing(true);
    const token = await generateShareToken({ scanId: scanId as Id<"scans"> });
    const url = `${window.location.origin}/share/${token}`;
    setShareUrl(url);
    await navigator.clipboard.writeText(url);
    setSharing(false);
  };

  const handleRevokeShare = async () => {
    await revokeShareToken({ scanId: scanId as Id<"scans"> });
    setShareUrl(null);
  };

  const minTime = useMinLoading();

  // Toggle body.scanning class for brand line pulse
  const isRunning = scan?.status === "running" || scan?.status === "queued";
  useEffect(() => {
    if (isRunning) {
      document.body.classList.add("scanning");
    } else {
      document.body.classList.remove("scanning");
    }
    return () => document.body.classList.remove("scanning");
  }, [isRunning]);

  const scanStats = useMemo(() => computeStats(actions as Action[] | undefined), [actions]);

  if (!scan || !minTime) {
    return <LoadingState message="rem is on her way..." />;
  }

  const hasReport = !!report;

  return (
    <div className="flex flex-col h-[calc(100vh-3.25rem)]">
      {/* Scan header with breadcrumbs */}
      <div className="flex items-center gap-5 px-8 py-3 border-b border-border shrink-0">
        <Breadcrumb segments={[
          { label: "projects", href: "/dashboard" },
          { label: project?.name ?? "...", href: `/projects/${projectId}` },
          { label: getScanLabel(scan) },
        ]} />
        <span className="text-xs flex items-center gap-2">
          {isRunning && <StatusDot />}
          <span className={isRunning ? "text-rem" : "text-muted-foreground"}>
            {scan.status}
          </span>
        </span>
        <div className="flex items-center gap-3 ml-auto">
          {shareUrl ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-rem/60">link copied</span>
              <GhostButton variant="destructive" onClick={() => setRevokeOpen(true)} className="px-2 py-1">
                revoke
              </GhostButton>
            </div>
          ) : scan.shareToken ? (
            <div className="flex items-center gap-2">
              <GhostButton
                onClick={() => {
                  const url = `${window.location.origin}/share/${scan.shareToken}`;
                  navigator.clipboard.writeText(url);
                  setShareUrl(url);
                }}
                className="px-2 py-1"
              >
                copy link
              </GhostButton>
              <GhostButton variant="destructive" onClick={() => setRevokeOpen(true)} className="px-2 py-1">
                revoke
              </GhostButton>
            </div>
          ) : (
            <GhostButton
              variant="muted"
              onClick={handleShare}
              disabled={sharing}
              className="px-2 py-1"
            >
              {sharing ? "sharing..." : "share"}
            </GhostButton>
          )}
          <ConfirmDialog
            open={revokeOpen}
            onOpenChange={setRevokeOpen}
            title="revoke share link"
            description="anyone with this link will lose access. you can generate a new link later."
            confirmLabel="revoke"
            onConfirm={() => { handleRevokeShare(); setRevokeOpen(false); }}
          />
          <span className="text-xs text-muted-foreground tabular-nums">
            {new Date(scan.startedAt).toLocaleString()}
          </span>
        </div>
      </div>

      {/* Content — full viewport width */}
      <div className="flex-1 min-h-0">
        {hasReport ? (
          <ResizablePanelGroup orientation="horizontal">
            <ResizablePanel defaultSize={42} minSize={20}>
              <TracePanel actions={actions as Action[] | undefined} isRunning={isRunning} />
            </ResizablePanel>
            <ResizableHandle />
            <ResizablePanel defaultSize={58} minSize={25}>
              <ReportPanel
                report={report}
                scanMeta={{ tier: scan.tier, model: scan.model, startedAt: scan.startedAt, finishedAt: scan.finishedAt }}
                stats={scanStats}
              />
            </ResizablePanel>
          </ResizablePanelGroup>
        ) : (
          <TracePanel actions={actions as Action[] | undefined} isRunning={isRunning} />
        )}
      </div>
    </div>
  );
}
