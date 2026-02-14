"use client";

import { useParams } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import Link from "next/link";
import { useState } from "react";

const AGENTS = ["opus", "glm47v", "nemotron"] as const;
const AGENT_LABELS: Record<string, string> = {
  opus: "Opus 4.6",
  glm47v: "GLM-4.7V",
  nemotron: "Nemotron",
};

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const projectId = id as Id<"projects">;

  const project = useQuery(api.projects.get, { projectId });
  const scans = useQuery(api.scans.listByProject, { projectId });
  const reports = useQuery(api.reports.listByProject, { projectId });
  const createScan = useMutation(api.scans.create);

  const [starting, setStarting] = useState(false);

  const handleStartScan = async (agent: "opus" | "glm47v" | "nemotron") => {
    if (!project) return;
    setStarting(true);

    const scanId = await createScan({ projectId, agent });

    try {
      await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/scans/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scan_id: scanId,
          project_id: projectId,
          target_type: project.targetType,
          target_config: project.targetConfig,
          agent,
        }),
      });
    } catch (err) {
      console.error("Failed to start scan:", err);
    }

    setStarting(false);
  };

  if (!project) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-8rem)]">
        <p className="text-sm text-muted-foreground">loading...</p>
      </div>
    );
  }

  // Aggregate findings from all reports
  const allFindings = reports?.flatMap((r) => r.findings) ?? [];
  const severityCounts = allFindings.reduce(
    (acc, f) => {
      acc[f.severity] = (acc[f.severity] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const runningScans = scans?.filter((s) => s.status === "running") ?? [];
  const completedScans = scans?.filter((s) => s.status !== "running") ?? [];

  return (
    <div className="px-8 py-8 max-w-4xl mx-auto">
      {/* Project header */}
      <div className="mb-12">
        <h1 className="text-base font-semibold">{project.name}</h1>
        <div className="flex items-baseline gap-3 mt-2 text-sm text-muted-foreground">
          <span>{project.targetType}</span>
          <span>&middot;</span>
          <span className="truncate max-w-sm">
            {project.targetType === "oss" && project.targetConfig?.repoUrl}
            {project.targetType === "web" && project.targetConfig?.url}
            {project.targetType === "hardware" && project.targetConfig?.device}
            {project.targetType === "fpga" && "fpga target"}
          </span>
          <span>&middot;</span>
          <span className="tabular-nums">
            {new Date(project.createdAt).toLocaleDateString()}
          </span>
        </div>

        {/* Findings summary — only if there are findings */}
        {allFindings.length > 0 && (
          <div className="flex items-baseline gap-4 mt-4 text-sm">
            <span className="text-muted-foreground">{allFindings.length} findings</span>
            {(["critical", "high", "medium", "low", "info"] as const).map((sev) => {
              const count = severityCounts[sev] || 0;
              if (count === 0) return null;
              return (
                <span
                  key={sev}
                  className={sev === "critical" || sev === "high" ? "text-destructive" : "text-muted-foreground"}
                >
                  {count} {sev}
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* Start new scan */}
      <div className="mb-12">
        <h2 className="text-xs text-muted-foreground mb-4">Scan with</h2>
        <div className="flex gap-3">
          {AGENTS.map((agent) => (
            <button
              key={agent}
              onClick={() => handleStartScan(agent)}
              disabled={starting}
              className="text-sm border border-border px-4 py-2 hover:bg-accent hover:border-foreground/20 transition-colors duration-100 disabled:opacity-30 active:translate-y-px"
            >
              {AGENT_LABELS[agent]}
            </button>
          ))}
        </div>
      </div>

      {/* Scans */}
      <div className="mb-12">
        <h2 className="text-xs text-muted-foreground mb-4">Scans</h2>

        {scans && scans.length === 0 && (
          <p className="text-sm text-muted-foreground py-10 text-center border border-dashed border-border">
            No scans yet. Choose an agent above to start.
          </p>
        )}

        {scans && scans.length > 0 && (
          <div>
            <div className="flex items-baseline gap-4 pb-3 border-b border-border text-xs text-muted-foreground">
              <span className="w-20">status</span>
              <span className="flex-1">agent</span>
              <span className="w-40 text-right">started</span>
            </div>

            {/* Running scans first */}
            {runningScans.map((scan) => (
              <Link
                key={scan._id}
                href={`/projects/${projectId}/scan/${scan._id}`}
                className="group flex items-center gap-4 py-3 border-b border-border hover:bg-accent/40 transition-colors duration-100 -mx-3 px-3"
              >
                <span className="w-20 text-sm text-destructive flex items-center gap-2">
                  <span className="inline-block w-1.5 h-1.5 bg-destructive animate-pulse" />
                  running
                </span>
                <span className="flex-1 text-sm group-hover:underline">
                  {AGENT_LABELS[scan.agent]}
                </span>
                <span className="w-40 text-xs text-muted-foreground text-right tabular-nums">
                  {new Date(scan.startedAt).toLocaleString()}
                </span>
              </Link>
            ))}

            {/* Other scans */}
            {completedScans.map((scan) => (
              <Link
                key={scan._id}
                href={`/projects/${projectId}/scan/${scan._id}`}
                className="group flex items-center gap-4 py-3 border-b border-border hover:bg-accent/40 transition-colors duration-100 -mx-3 px-3"
              >
                <span className="w-20 text-sm text-muted-foreground">
                  {scan.status}
                </span>
                <span className="flex-1 text-sm group-hover:underline">
                  {AGENT_LABELS[scan.agent]}
                </span>
                <span className="w-40 text-xs text-muted-foreground text-right tabular-nums">
                  {new Date(scan.startedAt).toLocaleString()}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Reports — detailed findings */}
      {reports && reports.length > 0 && (
        <div>
          <h2 className="text-xs text-muted-foreground mb-6">Findings</h2>

          {reports.map((report) => (
            <div key={report._id} className="mb-10">
              {report.summary && (
                <p className="text-sm text-muted-foreground leading-relaxed mb-6 max-w-xl">
                  {report.summary}
                </p>
              )}

              <div>
                {report.findings.map((finding, i) => (
                  <div key={i} className="py-4 border-t border-border">
                    {/* Metadata line */}
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
                          <span className="text-xs text-muted-foreground">&middot;</span>
                          <span className="text-xs text-muted-foreground">
                            {finding.location}
                          </span>
                        </>
                      )}
                    </div>

                    {/* Title */}
                    <div className="text-sm font-medium mb-1.5">{finding.title}</div>

                    {/* Description */}
                    <p className="text-sm text-muted-foreground leading-relaxed max-w-xl">
                      {finding.description}
                    </p>

                    {/* Recommendation */}
                    {finding.recommendation && (
                      <p className="text-sm text-muted-foreground mt-3 border-l-2 border-border pl-3 max-w-xl">
                        {finding.recommendation}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
