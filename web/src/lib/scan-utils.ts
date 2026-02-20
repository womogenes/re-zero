import type { Action, Turn, ScanStats } from "./types";

/** Group a flat list of actions into turns (each reasoning block starts a new turn). */
export function groupIntoTurns(actions: Action[]): Turn[] {
  const turns: Turn[] = [];
  let current: Turn | null = null;

  for (const action of actions) {
    if (action.type === "reasoning") {
      if (current) turns.push(current);
      current = {
        index: turns.length + 1,
        reasoning:
          typeof action.payload === "string"
            ? action.payload
            : JSON.stringify(action.payload),
        actions: [],
        timestamp: action.timestamp,
      };
    } else {
      if (!current) {
        current = {
          index: 1,
          reasoning: "",
          actions: [],
          timestamp: action.timestamp,
        };
      }
      current.actions.push(action);
    }
  }
  if (current) turns.push(current);

  return turns;
}

/** Compute aggregate stats from a list of actions. */
export function computeStats(actions: Action[] | undefined): ScanStats | null {
  if (!actions || actions.length === 0) return null;

  let filesRead = 0;
  let searches = 0;
  let turns = 0;
  let screenshots = 0;
  let browserActions = 0;

  for (const a of actions) {
    if (a.type === "reasoning") turns++;
    if (a.type === "tool_call") {
      const payload = a.payload as Record<string, unknown>;
      const tool = payload?.tool as string;
      if (tool === "read_file") filesRead++;
      if (tool === "search_code") searches++;
      if (tool === "screenshot") screenshots++;
      if (
        tool === "navigate" ||
        tool === "act" ||
        tool === "observe" ||
        tool === "extract" ||
        tool === "execute_js" ||
        tool === "click" ||
        tool === "fill_field" ||
        tool === "get_page_content"
      )
        browserActions++;
    }
  }

  const first = actions[0].timestamp;
  const last = actions[actions.length - 1].timestamp;
  const durationMs = last - first;
  const durationStr =
    durationMs < 60000
      ? `${Math.round(durationMs / 1000)}s`
      : `${Math.floor(durationMs / 60000)}m ${Math.round((durationMs % 60000) / 1000)}s`;

  return {
    filesRead,
    searches,
    turns,
    screenshots,
    browserActions,
    duration: durationStr,
  };
}

/** Severity → left-border color class for finding cards. */
export const SEVERITY_BORDER: Record<string, string> = {
  critical: "border-l-destructive",
  high: "border-l-destructive/60",
  medium: "border-l-rem/50",
  low: "border-l-rem/25",
  info: "border-l-border",
};

/** Severity → bar segment background color. */
export const SEVERITY_BAR_COLORS: Record<string, string> = {
  critical: "bg-destructive",
  high: "bg-destructive/70",
  medium: "bg-rem/40",
  low: "bg-rem/20",
  info: "bg-border",
};

/** Severity display order (most severe first). */
export const SEVERITY_ORDER = [
  "critical",
  "high",
  "medium",
  "low",
  "info",
] as const;
