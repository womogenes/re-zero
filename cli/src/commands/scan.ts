import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { resolve } from "node:path";
import { init, apiPost, apiGet } from "../lib/api.js";
import { getGitRemoteUrl, getRepoName } from "../lib/git.js";
import { renderAction, renderFindings, renderJson, renderCi } from "../lib/output.js";
import type { LaunchResponse, PollResponse, Finding } from "../types.js";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function scanCommand(): Command {
  return new Command("scan")
    .description("Scan a repository for security vulnerabilities")
    .argument("[path]", "Path to repository", ".")
    .option("--repo <url>", "Repository URL (overrides git remote detection)")
    .option("--agent <name>", "Agent to use", "opus")
    .option("--json", "Output raw JSON")
    .option("--ci", "CI mode: minimal output, exit code based on severity")
    .option("--timeout <seconds>", "Max poll time in seconds", "600")
    .action(async (path: string, opts) => {
      const isJson = opts.json;
      const isCi = opts.ci;
      const timeoutMs = parseInt(opts.timeout) * 1000;

      try {
        await init();
      } catch (e) {
        console.error(chalk.red((e as Error).message));
        process.exit(2);
      }

      // Resolve repo URL
      const absPath = resolve(path);
      let repoUrl = opts.repo;
      if (!repoUrl) {
        repoUrl = getGitRemoteUrl(absPath);
        if (!repoUrl) {
          console.error(chalk.red("No git remote found. Use --repo <url> to specify."));
          process.exit(2);
        }
      }

      const repoName = getRepoName(repoUrl);

      if (!isJson && !isCi) {
        console.log();
        console.log(chalk.dim("rem") + " — re:zero security scanner");
        console.log();
        console.log(`Scanning ${chalk.bold(repoName)}`);
        console.log(chalk.dim(repoUrl));
        console.log();
      }

      // Launch scan
      let scanId: string;
      let projectId: string;
      const startTime = Date.now();

      try {
        const res = await apiPost<LaunchResponse>("/scans/launch", {
          repo_url: repoUrl,
          target_type: "oss",
          agent: opts.agent,
        });
        scanId = res.scan_id;
        projectId = res.project_id;
      } catch (e) {
        console.error(chalk.red("Failed to start scan: " + (e as Error).message));
        process.exit(2);
      }

      // Poll loop
      const spinner = !isJson && !isCi ? ora({ text: "Rem is starting up...", color: "cyan" }).start() : null;
      let after = 0;
      const deadline = Date.now() + timeoutMs;
      let lastStatus = "queued";

      // Handle Ctrl+C gracefully
      process.on("SIGINT", () => {
        spinner?.stop();
        console.log();
        console.log(chalk.yellow("Scan interrupted. It continues running on the server."));
        console.log(chalk.dim(`Check results: rem status (scan_id: ${scanId})`));
        process.exit(0);
      });

      while (Date.now() < deadline) {
        await sleep(2000);

        let poll: PollResponse;
        try {
          poll = await apiGet<PollResponse>(`/scans/${scanId}/poll`, {
            after: String(after),
          });
        } catch {
          // Network error — retry
          continue;
        }

        lastStatus = poll.status;

        // Render new actions
        if (!isJson && !isCi && poll.actions.length > 0) {
          spinner?.stop();
          for (const action of poll.actions) {
            const line = renderAction(action);
            if (line) console.log(line);
            after = Math.max(after, action.timestamp);
          }
          // Restart spinner with latest reasoning
          const lastReasoning = [...poll.actions]
            .reverse()
            .find((a) => a.type === "reasoning");
          if (lastReasoning) {
            const text = typeof lastReasoning.payload === "string"
              ? lastReasoning.payload
              : (lastReasoning.payload as { text?: string })?.text || "";
            const short = text.length > 60 ? text.slice(0, 60) + "..." : text;
            spinner?.start(chalk.dim(`Rem: ${short}`));
          } else {
            spinner?.start("Rem is working...");
          }
        } else if (poll.actions.length > 0) {
          // Just track timestamp in json/ci mode
          for (const action of poll.actions) {
            after = Math.max(after, action.timestamp);
          }
        }

        // Check terminal states
        if (poll.status === "completed") {
          spinner?.stop();
          const durationMs = Date.now() - startTime;
          const findings: Finding[] = poll.report?.findings || [];

          if (isJson) {
            renderJson(scanId, projectId, durationMs, findings, poll.report?.summary);
            const hasCritical = findings.some((f) => f.severity === "critical" || f.severity === "high");
            process.exit(hasCritical ? 1 : 0);
          }

          if (isCi) {
            renderCi(findings);
            const hasCritical = findings.some((f) => f.severity === "critical" || f.severity === "high");
            process.exit(hasCritical ? 1 : 0);
          }

          // Default output
          const durationSec = Math.round(durationMs / 1000);
          const mins = Math.floor(durationSec / 60);
          const secs = durationSec % 60;
          console.log();
          console.log(
            `Scan complete. ${chalk.bold(String(findings.length))} findings in ${mins}m ${secs}s.`,
          );

          if (findings.length > 0) {
            renderFindings(findings);
          } else {
            console.log();
            console.log(chalk.green("No vulnerabilities found."));
          }

          console.log();
          console.log(chalk.dim(`View full report: https://rezero.sh/projects/${projectId}/scan/${scanId}`));
          process.exit(0);
        }

        if (poll.status === "failed") {
          spinner?.stop();
          console.error(chalk.red(`Scan failed: ${poll.error || "Unknown error"}`));
          process.exit(2);
        }
      }

      // Timeout
      spinner?.stop();
      console.log(chalk.yellow("Scan still running (timeout reached)."));
      console.log(chalk.dim(`Check results later: rem status (scan_id: ${scanId})`));
      process.exit(0);
    });
}
