import { readFile, writeFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { RemConfig } from "../types.js";

const CONFIG_DIR = join(homedir(), ".rem");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");
const DEFAULT_SERVER = "https://api.rezero.sh";

export async function loadConfig(): Promise<RemConfig> {
  try {
    const raw = await readFile(CONFIG_FILE, "utf-8");
    return JSON.parse(raw) as RemConfig;
  } catch {
    return {};
  }
}

export async function saveConfig(updates: Partial<RemConfig>): Promise<void> {
  const existing = await loadConfig();
  const merged = { ...existing, ...updates };
  await mkdir(CONFIG_DIR, { recursive: true });
  await writeFile(CONFIG_FILE, JSON.stringify(merged, null, 2) + "\n");
}

export function getApiKey(config: RemConfig): string | undefined {
  return process.env.REM_API_KEY || config.apiKey;
}

export function getServerUrl(config: RemConfig): string {
  return process.env.REM_SERVER_URL || config.serverUrl || DEFAULT_SERVER;
}
