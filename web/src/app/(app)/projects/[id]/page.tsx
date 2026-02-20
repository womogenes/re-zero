"use client";

import { useParams } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import Link from "next/link";
import { useMemo, useState, useEffect } from "react";
import { useMinLoading } from "@/hooks/use-min-loading";
import { useApiKey } from "@/hooks/use-api-key";
import { useCustomer } from "autumn-js/react";
import { useCurrentUser } from "@/hooks/use-current-user";
import { TIER_CONFIG, DEFAULT_TIER, getScanLabel, getScanShort, getScanModelLabel, formatRelativeTime, formatDuration, type Tier } from "@/lib/scan-tiers";
import { LoadingState } from "@/components/loading-state";
import { SeverityBar } from "@/components/findings/severity-bar";
import { StatusDot } from "@/components/scan/status-dot";
import { TextInput } from "@/components/form/text-input";
import { GhostButton, ghostButtonClass } from "@/components/form/ghost-button";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ReportPanel } from "@/components/trace/report-panel";

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const projectId = id as Id<"projects">;

  const project = useQuery(api.projects.get, { projectId });
  const scans = useQuery(api.scans.listByProject, { projectId });
  const reports = useQuery(api.reports.listByProject, { projectId });
  const createScan = useMutation(api.scans.create);
  const updateTargetConfig = useMutation(api.projects.updateTargetConfig);
  const apiKey = useApiKey();

  const { customer } = useCustomer();
  const { user: currentUser } = useCurrentUser();
  const [starting, setStarting] = useState(false);
  const [tierInitialized, setTierInitialized] = useState(false);
  const [selectedTier, setSelectedTier] = useState<Tier>(DEFAULT_TIER);
  const [selectedModel, setSelectedModel] = useState<string>(TIER_CONFIG[DEFAULT_TIER].defaultModel);
  const [deployOpen, setDeployOpen] = useState(false);
  const [selectedScanId, setSelectedScanId] = useState<string | null>(null);

  // Prepaid scan balance from Autumn
  const maidBalance = (customer?.features as any)?.standard_scan?.balance ?? 0;

  // Initialize tier from user preference (once)
  useEffect(() => {
    if (!tierInitialized && currentUser?.defaultTier) {
      const t = currentUser.defaultTier as Tier;
      setSelectedTier(t);
      setSelectedModel(TIER_CONFIG[t].defaultModel);
      setTierInitialized(true);
    } else if (!tierInitialized && currentUser) {
      setTierInitialized(true);
    }
  }, [currentUser, tierInitialized]);

  const [showCreds, setShowCreds] = useState(false);
  const [credUsername, setCredUsername] = useState("");
  const [credPassword, setCredPassword] = useState("");
  const [credContext, setCredContext] = useState("");
  const [savingCreds, setSavingCreds] = useState(false);
  const [clearCredsOpen, setClearCredsOpen] = useState(false);
  const minTime = useMinLoading();

  // Sync local cred state when project loads
  useEffect(() => {
    if (project?.targetType === "web") {
      if (project.targetConfig?.testAccount) {
        setCredUsername(project.targetConfig.testAccount.username || "");
        setCredPassword(project.targetConfig.testAccount.password || "");
      }
      setCredContext(project.targetConfig?.context || "");
    }
  }, [project?.targetConfig?.testAccount, project?.targetConfig?.context, project?.targetType]);

  const handleSaveCreds = async () => {
    if (!project) return;
    setSavingCreds(true);
    const newConfig = { ...project.targetConfig };
    if (credUsername.trim()) {
      newConfig.testAccount = { username: credUsername.trim(), password: credPassword };
    } else {
      delete newConfig.testAccount;
    }
    if (credContext.trim()) {
      newConfig.context = credContext.trim();
    } else {
      delete newConfig.context;
    }
    await updateTargetConfig({ projectId, targetConfig: newConfig });
    setSavingCreds(false);
    setShowCreds(false);
  };

  const handleRemoveCreds = async () => {
    if (!project) return;
    setSavingCreds(true);
    const newConfig = { ...project.targetConfig };
    delete newConfig.testAccount;
    delete newConfig.context;
    await updateTargetConfig({ projectId, targetConfig: newConfig });
    setCredUsername("");
    setCredPassword("");
    setCredContext("");
    setSavingCreds(false);
    setShowCreds(false);
  };

  const reportByScan = useMemo(() => {
    const map = new Map<string, NonNullable<typeof reports>[number]>();
    if (reports) {
      for (const r of reports) map.set(r.scanId, r);
    }
    return map;
  }, [reports]);

  // Auto-select the first scan with a report if nothing is selected
  const effectiveSelectedId = useMemo(() => {
    if (selectedScanId) return selectedScanId;
    if (scans && scans.length > 0) {
      const withReport = scans.find((s) => reportByScan.has(s._id));
      if (withReport) return withReport._id;
      const running = scans.find((s) => s.status === "running" || s.status === "queued");
      if (running) return running._id;
      return scans[0]._id;
    }
    return null;
  }, [selectedScanId, scans, reportByScan]);

  const handleStartScan = async () => {
    if (!project || !apiKey) return;
    setStarting(true);
    setDeployOpen(false);
    const tier = selectedTier;
    const model = selectedModel;
    const scanId = await createScan({ projectId, tier, model });
    try {
      await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/scans/start`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": apiKey,
        },
        body: JSON.stringify({
          scan_id: scanId,
          project_id: projectId,
          target_type: project.targetType,
          target_config: project.targetConfig,
          tier,
          model,
        }),
      });
    } catch (err) {
      console.error("Failed to start scan:", err);
    }
    setStarting(false);
  };

  if (!project || !minTime) {
    return <LoadingState message="loading project..." />;
  }

  const hasScans = scans && scans.length > 0;
  const selectedScan = scans?.find((s) => s._id === effectiveSelectedId);
  const selectedReport = effectiveSelectedId ? reportByScan.get(effectiveSelectedId) : null;

  return (
    <div className="flex flex-col h-[calc(100vh-3.25rem)]">
      {/* Top bar: project info + deploy buttons */}
      <div className={`px-6 py-3 border-b border-border shrink-0 flex items-center justify-between gap-6 relative ${
        selectedTier === "oni" ? "border-b-rem/30" : ""
      }`}>
        {/* Oni ambient shimmer */}
        {selectedTier === "oni" && (
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute inset-0 animate-oni-shimmer" />
          </div>
        )}
        <div className="flex items-baseline gap-2 min-w-0">
          <Link href="/dashboard" className="text-sm text-muted-foreground hover:text-rem transition-colors duration-150 shrink-0">
            projects
          </Link>
          <span className="text-xs text-muted-foreground/30 shrink-0">/</span>
          <h1 className="text-sm font-semibold shrink-0">{project.name}</h1>
          <span className="text-xs text-muted-foreground/30 shrink-0">&middot;</span>
          <span className="text-xs text-muted-foreground shrink-0">{project.targetType}</span>
          {project.targetType === "oss" && project.targetConfig?.repoUrl && (
            <a href={project.targetConfig.repoUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-muted-foreground hover:text-rem transition-colors duration-150 truncate">
              {project.targetConfig.repoUrl}
            </a>
          )}
          {project.targetType === "web" && project.targetConfig?.url && (
            <a href={project.targetConfig.url} target="_blank" rel="noopener noreferrer" className="text-xs text-muted-foreground hover:text-rem transition-colors duration-150 truncate">
              {project.targetConfig.url}
            </a>
          )}
          {project.targetType === "web" && (
            <>
              <span className="text-xs text-muted-foreground/30 shrink-0">&middot;</span>
              <button
                onClick={() => setShowCreds(!showCreds)}
                className={`text-xs transition-colors duration-150 shrink-0 ${
                  project.targetConfig?.testAccount || project.targetConfig?.context
                    ? "text-rem/70 hover:text-rem"
                    : "text-muted-foreground/50 hover:text-rem"
                }`}
              >
                {project.targetConfig?.testAccount || project.targetConfig?.context ? "config" : "+ config"}
              </button>
            </>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {maidBalance > 0 && (
            <span className="text-xs tabular-nums text-muted-foreground/40">
              {maidBalance} {maidBalance === 1 ? "scan" : "scans"} remaining
            </span>
          )}
          {/* Mode indicator */}
          <Tooltip>
            <TooltipTrigger asChild>
              <span className={`text-[10px] tracking-wider px-1.5 py-0.5 select-none transition-all duration-300 ${
                selectedTier === "oni"
                  ? "bg-rem text-white animate-oni-badge"
                  : "border border-rem/20 text-rem/50"
              }`}>
                {TIER_CONFIG[selectedTier].label.toUpperCase()}
              </span>
            </TooltipTrigger>
            <TooltipContent>${TIER_CONFIG[selectedTier].price}/scan</TooltipContent>
          </Tooltip>
          <Popover open={deployOpen} onOpenChange={setDeployOpen}>
            <div className={`flex items-stretch transition-all duration-300 ${
              selectedTier === "oni" ? "animate-oni-glow" : ""
            }`}>
              <button
                onClick={handleStartScan}
                disabled={starting}
                className={`text-xs px-2.5 flex items-center transition-all duration-200 disabled:opacity-30 active:translate-y-px ${
                  selectedTier === "oni"
                    ? "border border-rem bg-rem text-white hover:bg-rem/90"
                    : "border border-rem/30 text-rem/70 hover:bg-rem/10 hover:border-rem hover:text-rem"
                }`}
                style={{ paddingTop: 6, paddingBottom: 6 }}
              >
                + deploy rem
              </button>
              <PopoverTrigger asChild>
                <button
                  className={`text-xs flex items-center justify-center transition-all duration-200 active:translate-y-px -ml-px ${
                    selectedTier === "oni"
                      ? deployOpen
                        ? "border border-rem bg-white/20 text-white"
                        : "border border-rem bg-rem text-white hover:bg-rem/90"
                      : deployOpen
                        ? "border border-rem bg-rem/10 text-rem"
                        : "border border-rem/30 text-rem/70 hover:bg-rem/10 hover:border-rem hover:text-rem"
                  }`}
                  style={{ paddingTop: 6, paddingBottom: 6, paddingLeft: 6, paddingRight: 6 }}
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                    <path d={deployOpen ? "M2 6.5L5 3.5L8 6.5" : "M2 3.5L5 6.5L8 3.5"} />
                  </svg>
                </button>
              </PopoverTrigger>
            </div>
            <PopoverContent align="end" className="w-[220px] p-0 border-border bg-background shadow-sm rounded-none">
              {(Object.keys(TIER_CONFIG) as Tier[]).map((t) => {
                const isTierActive = selectedTier === t;
                return (
                  <div key={t}>
                    <div className={`px-3 py-1.5 text-[10px] tracking-wider border-b transition-all duration-150 ${
                      isTierActive
                        ? t === "oni"
                          ? "text-white bg-rem border-rem/50 font-medium"
                          : "text-rem/70 bg-rem/5 border-border/50"
                        : "text-muted-foreground/50 border-border/50"
                    }`}>
                      {TIER_CONFIG[t].label.toUpperCase()}
                      <span className={`ml-2 ${isTierActive && t === "oni" ? "text-white/50" : "text-muted-foreground/30"}`}>
                        ${TIER_CONFIG[t].price}
                      </span>
                    </div>
                    {Object.entries(TIER_CONFIG[t].models).map(([key, m]) => {
                      const isSelected = selectedTier === t && selectedModel === key;
                      return (
                        <button
                          key={key}
                          onClick={() => {
                            setSelectedTier(t);
                            setSelectedModel(key);
                            setDeployOpen(false);
                          }}
                          className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 transition-all duration-100 ${
                            isSelected
                              ? "text-rem bg-rem/8"
                              : "text-foreground/80 hover:bg-card/80 hover:text-foreground"
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                            isSelected ? "bg-rem" : "bg-border"
                          }`} />
                          {(m as { label: string }).label}
                          {key === TIER_CONFIG[t].defaultModel && (
                            <span className="text-muted-foreground/30 ml-auto text-[10px]">default</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Scan config panel */}
      {showCreds && project.targetType === "web" && (
        <div className="px-6 py-3 border-b border-border shrink-0 bg-card/30 space-y-3">
          <div className="flex items-center gap-3">
            <label className="text-xs text-muted-foreground shrink-0">test account</label>
            <TextInput
              value={credUsername}
              onChange={(e) => setCredUsername(e.target.value)}
              placeholder="username or email"
              inputSize="sm"
              className="w-48"
            />
            <TextInput
              type="password"
              value={credPassword}
              onChange={(e) => setCredPassword(e.target.value)}
              placeholder="password"
              inputSize="sm"
              className="w-48"
            />
          </div>
          <div className="flex items-start gap-3">
            <label className="text-xs text-muted-foreground shrink-0 pt-1.5">context</label>
            <textarea
              value={credContext}
              onChange={(e) => setCredContext(e.target.value)}
              placeholder={"hidden routes, tech stack details, areas of concern, how to use the test account..."}
              rows={2}
              className="flex-1 text-xs bg-transparent border border-border px-2.5 py-1.5 placeholder:text-muted-foreground/40 focus:outline-none focus:border-rem transition-colors duration-150 resize-y"
            />
          </div>
          <div className="flex items-center gap-3">
            <GhostButton
              onClick={handleSaveCreds}
              disabled={savingCreds}
            >
              {savingCreds ? "saving..." : "save"}
            </GhostButton>
            {(project.targetConfig?.testAccount || project.targetConfig?.context) && (
              <GhostButton
                variant="destructive"
                onClick={() => setClearCredsOpen(true)}
                disabled={savingCreds}
              >
                clear all
              </GhostButton>
            )}
            <ConfirmDialog
              open={clearCredsOpen}
              onOpenChange={setClearCredsOpen}
              title="clear scan config"
              description="this will remove the test account credentials and context from this project. future scans won't have this information."
              confirmLabel="clear"
              onConfirm={() => { handleRemoveCreds(); setClearCredsOpen(false); }}
            />
            <p className="text-xs text-muted-foreground/40 ml-auto">
              context and credentials are injected into rem&apos;s system prompt for each scan
            </p>
          </div>
        </div>
      )}

      {/* Main area: scan sidebar + report */}
      <div className="flex-1 flex min-h-0">
        {/* Scan sidebar */}
        <div className="w-80 shrink-0 border-r border-border flex flex-col">
          <div className="px-4 py-3 text-xs text-muted-foreground border-b border-border shrink-0">
            {scans?.length ?? 0} scans
          </div>
          <div className="flex-1 overflow-y-auto">
            {!hasScans && (
              <div className="px-4 py-8 text-center">
                <img src="/rem-running.gif" alt="rem" className="w-10 h-10 mx-auto mb-2 object-contain opacity-50" />
                <p className="text-xs text-muted-foreground">no scans yet.</p>
              </div>
            )}

            {scans?.map((scan) => {
              const scanReport = reportByScan.get(scan._id);
              const isRunning = scan.status === "running" || scan.status === "queued";
              const isFailed = scan.status === "failed";
              const isSelected = effectiveSelectedId === scan._id;
              const findingCount = scanReport?.findings.length ?? 0;
              const critHigh = scanReport?.findings.filter(
                (f) => f.severity === "critical" || f.severity === "high"
              ).length ?? 0;

              return (
                <button
                  key={scan._id}
                  onClick={() => setSelectedScanId(scan._id)}
                  className={`w-full text-left px-4 py-3 border-b border-border transition-all duration-100 ${
                    isSelected
                      ? "bg-rem/8 border-l-2 border-l-rem"
                      : "border-l-2 border-l-transparent hover:bg-accent/40 hover:border-l-rem/50"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5">
                      {isRunning && <StatusDot />}
                      <span className="text-muted-foreground text-sm">{getScanShort(scan)}</span>
                      <span className="text-muted-foreground/30 text-sm">·</span>
                      <span className={`text-sm ${isSelected ? "text-rem" : "text-foreground"}`}>
                        {getScanModelLabel(scan)}
                      </span>
                    </div>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {formatRelativeTime(scan.startedAt)}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>{new Date(scan.startedAt).toLocaleString()}</TooltipContent>
                    </Tooltip>
                  </div>
                  <div className="flex items-baseline justify-between text-xs text-muted-foreground">
                    <div className="flex items-baseline gap-3">
                      {isRunning && <span className="text-rem">running</span>}
                      {isFailed && <span className="text-destructive">failed</span>}
                      {!isRunning && !isFailed && findingCount > 0 && (
                        <>
                          <span>{findingCount} findings</span>
                          {critHigh > 0 && (
                            <span className="text-destructive">{critHigh} crit/high</span>
                          )}
                        </>
                      )}
                      {!isRunning && !isFailed && findingCount === 0 && (
                        <span>clean</span>
                      )}
                    </div>
                    {scan.finishedAt && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="tabular-nums">
                            {formatDuration(scan.startedAt, scan.finishedAt)}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>scan duration</TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                  {scanReport && findingCount > 0 && (
                    <div className="mt-2">
                      <SeverityBar findings={scanReport.findings} />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Report detail panel */}
        <div className="flex-1 flex flex-col min-w-0">
          {!selectedScan && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <img src="/rem-running.gif" alt="rem" className="w-16 h-16 mx-auto mb-3 object-contain opacity-60" />
                <p className="text-sm text-foreground mb-1">rem is waiting for orders.</p>
                <p className="text-xs text-muted-foreground">deploy a scan to get started.</p>
              </div>
            </div>
          )}

          {selectedScan && !selectedReport && (selectedScan.status === "running" || selectedScan.status === "queued") && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <img src="/rem-running.gif" alt="rem" className="w-20 h-20 mx-auto mb-3 object-contain" />
                <p className={`text-sm mb-1 ${selectedScan.tier === "oni" ? "text-rem font-medium" : "text-rem"}`}>
                  {selectedScan.tier === "oni"
                    ? `rem (${getScanShort(selectedScan)}) is tearing through the code...`
                    : `rem (${getScanShort(selectedScan)}) is investigating...`
                  }
                </p>
                <Link
                  href={`/projects/${projectId}/scan/${selectedScan._id}`}
                  className={ghostButtonClass("rem", "mt-2 inline-block")}
                >
                  watch live &rarr;
                </Link>
              </div>
            </div>
          )}

          {selectedScan && !selectedReport && selectedScan.status === "failed" && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <p className="text-sm text-destructive mb-1">scan failed</p>
                <p className="text-xs text-muted-foreground">
                  {selectedScan.error || "something went wrong. try deploying again."}
                </p>
              </div>
            </div>
          )}

          {selectedScan && !selectedReport && selectedScan.status === "completed" && (
            <div className="flex items-center justify-center h-full">
              <p className="text-sm text-muted-foreground">no report generated for this scan.</p>
            </div>
          )}

          {/* Report view */}
          {selectedReport && (
            <ReportPanel
              report={selectedReport}
              scanMeta={selectedScan ? {
                tier: selectedScan.tier,
                model: selectedScan.model,
                startedAt: selectedScan.startedAt,
                finishedAt: selectedScan.finishedAt,
              } : undefined}
              title={
                <>
                  <h2 className="text-sm font-semibold">
                    {selectedScan ? getScanLabel(selectedScan) : "report"}
                  </h2>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {new Date(selectedReport.createdAt).toLocaleString()}
                  </span>
                </>
              }
              headerExtra={
                <Link
                  href={`/projects/${projectId}/scan/${effectiveSelectedId}`}
                  className={ghostButtonClass("rem", "py-1")}
                >
                  trace &rarr;
                </Link>
              }
            />
          )}
        </div>
      </div>
    </div>
  );
}
