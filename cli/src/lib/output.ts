import chalk from "chalk";
import type { Finding, Action } from "../types.js";

const SEVERITY_ORDER = ["critical", "high", "medium", "low", "info"] as const;

const SEVERITY_STYLE: Record<string, (s: string) => string> = {
  critical: (s) => chalk.bgRed.white.bold(` ${s} `),
  high: (s) => chalk.red.bold(s),
  medium: (s) => chalk.yellow(s),
  low: (s) => chalk.blue(s),
  info: (s) => chalk.dim(s),
};

export function renderAction(action: Action): string | null {
  if (action.type === "reasoning") {
    const text = typeof action.payload === "string"
      ? action.payload
      : (action.payload as { text?: string })?.text || "";
    if (!text) return null;
    const truncated = text.length > 120 ? text.slice(0, 120) + "..." : text;
    return chalk.dim(`| ${truncated}`);
  }

  if (action.type === "tool_call") {
    const payload = action.payload as { name?: string; tool?: string; input?: unknown };
    const name = payload.name || payload.tool || "unknown";
    const input = payload.input;
    let argsSummary = "";
    if (typeof input === "object" && input !== null) {
      const entries = Object.entries(input as Record<string, unknown>);
      if (entries.length > 0) {
        argsSummary = entries
          .slice(0, 2)
          .map(([, v]) => {
            const s = typeof v === "string" ? v : JSON.stringify(v);
            return s.length > 40 ? s.slice(0, 40) + "..." : s;
          })
          .join(", ");
      }
    }
    return chalk.cyan(`  > ${name}(${argsSummary})`);
  }

  return null;
}

export function renderFindings(findings: Finding[]): void {
  const grouped = new Map<string, Finding[]>();
  for (const sev of SEVERITY_ORDER) {
    const items = findings.filter((f) => f.severity === sev);
    if (items.length > 0) grouped.set(sev, items);
  }

  for (const [sev, items] of grouped) {
    console.log();
    console.log(SEVERITY_STYLE[sev]!(`${sev.toUpperCase()} (${items.length})`));
    for (const f of items) {
      const id = f.id ? chalk.bold(f.id) + "  " : "  ";
      console.log(`  ${id}${f.title}`);
      if (f.location) {
        console.log(`          ${chalk.cyan(f.location)}`);
      }
      console.log(`          ${chalk.dim(f.description)}`);
      if (f.recommendation) {
        console.log(`          ${chalk.dim("FIX: " + f.recommendation)}`);
      }
    }
  }

  // Summary bar
  console.log();
  console.log("----");
  const parts = SEVERITY_ORDER.map((sev) => {
    const count = findings.filter((f) => f.severity === sev).length;
    if (count === 0) return null;
    return SEVERITY_STYLE[sev]!(`${sev.toUpperCase()} ${count}`);
  }).filter(Boolean);
  console.log(` ${parts.join("  ")}`);
  console.log("----");
}

export function renderJson(
  scanId: string,
  projectId: string,
  durationMs: number,
  findings: Finding[],
  summary?: string,
): void {
  console.log(
    JSON.stringify(
      {
        scan_id: scanId,
        project_id: projectId,
        status: "completed",
        duration_ms: durationMs,
        findings,
        summary,
      },
      null,
      2,
    ),
  );
}

export function renderCi(findings: Finding[]): void {
  const counts: Record<string, number> = {};
  for (const sev of SEVERITY_ORDER) {
    counts[sev] = findings.filter((f) => f.severity === sev).length;
  }
  const parts = SEVERITY_ORDER.filter((s) => counts[s]! > 0).map(
    (s) => `${counts[s]} ${s}`,
  );
  console.log(
    `rem scan: ${findings.length} findings (${parts.join(", ")})`,
  );
}
