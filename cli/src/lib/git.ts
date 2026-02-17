import { execSync } from "node:child_process";

export function getGitRemoteUrl(path: string): string | null {
  try {
    const raw = execSync("git remote get-url origin", {
      cwd: path,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    return normalizeGitUrl(raw);
  } catch {
    return null;
  }
}

export function normalizeGitUrl(url: string): string {
  let normalized = url.replace(/\.git$/, "");
  const sshMatch = normalized.match(/^git@([^:]+):(.+)$/);
  if (sshMatch) {
    normalized = `https://${sshMatch[1]}/${sshMatch[2]}`;
  }
  return normalized;
}

export function getRepoName(url: string): string {
  const parts = url.split("/");
  return parts.slice(-2).join("/");
}
