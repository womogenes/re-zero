export const TIER_CONFIG = {
  maid: {
    label: "maid",
    price: 25,
    defaultModel: "claude-sonnet-4.6",
    models: {
      "claude-sonnet-4.6": { label: "Sonnet 4.6" },
      "glm-5": { label: "GLM-5" },
    },
  },
  oni: {
    label: "oni",
    price: 45,
    defaultModel: "claude-opus-4.6",
    models: {
      "claude-opus-4.6": { label: "Opus 4.6" },
      "kimi-k2.5": { label: "Kimi K2.5" },
    },
  },
} as const;

export type Tier = keyof typeof TIER_CONFIG;
export const DEFAULT_TIER: Tier = "maid";

export function getScanLabel(scan: {
  tier?: string;
  model?: string;
}): string {
  const cfg = TIER_CONFIG[scan.tier as Tier];
  if (!cfg) return "rem";
  const modelLabel = scan.model
    ? (cfg.models as Record<string, { label: string }>)[scan.model]?.label
    : null;
  return `rem (${cfg.label}${modelLabel ? ` \u00b7 ${modelLabel}` : ""})`;
}

export function getScanShort(scan: {
  tier?: string;
}): string {
  const cfg = TIER_CONFIG[scan.tier as Tier];
  return cfg?.label ?? "?";
}

export function getScanModelLabel(scan: {
  tier?: string;
  model?: string;
}): string {
  const cfg = TIER_CONFIG[scan.tier as Tier];
  if (!cfg) return scan.model || "?";
  if (scan.model) {
    const m = (cfg.models as Record<string, { label: string }>)[scan.model];
    if (m) return m.label;
  }
  // Fallback to default model label
  const def = (cfg.models as Record<string, { label: string }>)[cfg.defaultModel];
  return def?.label ?? scan.model ?? "?";
}

export function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

export function formatDuration(startedAt: number, finishedAt: number): string {
  const diff = finishedAt - startedAt;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${remainingSeconds.toString().padStart(2, "0")}s`;
}
