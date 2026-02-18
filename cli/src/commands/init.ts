import { Command } from "commander";
import chalk from "chalk";
import { execSync } from "node:child_process";
import { readFile, writeFile, mkdir, access, stat } from "node:fs/promises";
import { join, basename } from "node:path";
import { getGitRoot } from "../lib/tarball.js";

// ── Arrow-key selection UI ──────────────────────────────────────────

interface Option {
  label: string;
  value: string;
}

function selectOption(question: string, options: Option[]): Promise<string> {
  return new Promise((resolve) => {
    let selected = 0;

    const render = () => {
      // Move cursor up to overwrite previous render (except first time)
      process.stderr.write(`\n  ${question}\n`);
      for (let i = 0; i < options.length; i++) {
        const prefix = i === selected ? chalk.cyan("> ") : "  ";
        const label = i === selected ? options[i]!.label : chalk.dim(options[i]!.label);
        process.stderr.write(`  ${prefix}${label}\n`);
      }
    };

    const clear = () => {
      // Move up and clear: question line + option lines
      const lines = options.length + 1;
      for (let i = 0; i < lines + 1; i++) {
        process.stderr.write("\x1b[A\x1b[2K");
      }
    };

    render();

    if (!process.stdin.isTTY) {
      // Non-interactive: pick first option
      resolve(options[0]!.value);
      return;
    }

    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf-8");

    const onData = (key: string) => {
      // Ctrl+C
      if (key === "\x03") {
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stderr.write("\n");
        process.exit(0);
      }

      // Enter
      if (key === "\r" || key === "\n") {
        process.stdin.removeListener("data", onData);
        process.stdin.setRawMode(false);
        process.stdin.pause();
        // Clear options, show final selection
        clear();
        process.stderr.write(`\n  ${question}\n`);
        process.stderr.write(`  ${chalk.cyan(">")} ${options[selected]!.label}\n`);
        resolve(options[selected]!.value);
        return;
      }

      // Arrow keys come as escape sequences: \x1b[A (up), \x1b[B (down)
      if (key === "\x1b[A" || key === "k") {
        selected = Math.max(0, selected - 1);
      } else if (key === "\x1b[B" || key === "j") {
        selected = Math.min(options.length - 1, selected + 1);
      }

      clear();
      render();
    };

    process.stdin.on("data", onData);
  });
}

// ── Stack detection ─────────────────────────────────────────────────

async function detectStack(repoPath: string): Promise<string[]> {
  const detected: string[] = [];

  // Check package.json
  try {
    const pkg = JSON.parse(await readFile(join(repoPath, "package.json"), "utf-8"));
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

    if (allDeps["next"]) {
      const ver = allDeps["next"].replace(/[\^~>=<]/g, "").split(".")[0];
      detected.push(`Next.js ${ver}`);
    } else if (allDeps["react"]) {
      detected.push("React");
    }
    if (allDeps["vue"]) detected.push("Vue");
    if (allDeps["svelte"] || allDeps["@sveltejs/kit"]) detected.push("Svelte");
    if (allDeps["express"]) detected.push("Express");
    if (allDeps["fastify"]) detected.push("Fastify");
    if (allDeps["hono"]) detected.push("Hono");
    if (allDeps["nuxt"]) detected.push("Nuxt");
  } catch { /* no package.json */ }

  // TypeScript
  try {
    await access(join(repoPath, "tsconfig.json"));
    detected.push("TypeScript");
  } catch { /* no tsconfig */ }

  // Python
  try {
    const reqs = await readFile(join(repoPath, "requirements.txt"), "utf-8");
    if (/django/i.test(reqs)) detected.push("Django");
    else if (/flask/i.test(reqs)) detected.push("Flask");
    else if (/fastapi/i.test(reqs)) detected.push("FastAPI");
    else detected.push("Python");
  } catch {
    try {
      const pyproject = await readFile(join(repoPath, "pyproject.toml"), "utf-8");
      if (/django/i.test(pyproject)) detected.push("Django");
      else if (/flask/i.test(pyproject)) detected.push("Flask");
      else if (/fastapi/i.test(pyproject)) detected.push("FastAPI");
      else detected.push("Python");
    } catch { /* no python */ }
  }

  // Rust
  try {
    const cargo = await readFile(join(repoPath, "Cargo.toml"), "utf-8");
    if (/actix/i.test(cargo)) detected.push("Actix");
    else if (/axum/i.test(cargo)) detected.push("Axum");
    else if (/rocket/i.test(cargo)) detected.push("Rocket");
    else detected.push("Rust");
  } catch { /* no cargo */ }

  // Go
  try {
    await access(join(repoPath, "go.mod"));
    detected.push("Go");
  } catch { /* no go */ }

  // Services / infrastructure
  try {
    await stat(join(repoPath, "convex"));
    detected.push("Convex");
  } catch { /* no convex */ }

  try {
    await stat(join(repoPath, "prisma"));
    detected.push("Prisma");
  } catch { /* no prisma */ }

  try {
    await access(join(repoPath, "supabase/config.toml"));
    detected.push("Supabase");
  } catch { /* no supabase */ }

  try {
    await access(join(repoPath, "Dockerfile"));
    detected.push("Docker");
  } catch { /* no docker */ }

  return detected;
}

// ── Git history analysis ────────────────────────────────────────────

function getDefaultBranch(repoPath: string): string {
  try {
    const ref = execSync("git symbolic-ref refs/remotes/origin/HEAD", {
      cwd: repoPath,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    return ref.replace("refs/remotes/origin/", "");
  } catch {
    // Try main, then master
    try {
      execSync("git rev-parse --verify main", {
        cwd: repoPath,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });
      return "main";
    } catch {
      return "master";
    }
  }
}

function estimateMergeRate(repoPath: string): { rate: number; isNew: boolean } {
  const branch = getDefaultBranch(repoPath);

  // Count total commits to check if it's a new repo
  try {
    const total = execSync(`git rev-list --count ${branch}`, {
      cwd: repoPath,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();

    if (parseInt(total) < 5) {
      return { rate: 0, isNew: true };
    }
  } catch {
    return { rate: 0, isNew: true };
  }

  // Count merges in last 90 days
  try {
    const merges = execSync(
      `git log --oneline --merges --since="90 days ago" ${branch}`,
      { cwd: repoPath, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
    ).trim();

    const count = merges ? merges.split("\n").length : 0;

    if (count > 0) {
      return { rate: Math.round((count / 3) * 10) / 10, isNew: false };
    }
  } catch { /* no merges */ }

  // Fallback: count all commits in 90 days
  try {
    const commits = execSync(
      `git log --oneline --since="90 days ago" ${branch}`,
      { cwd: repoPath, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
    ).trim();

    const count = commits ? commits.split("\n").length : 0;
    return { rate: Math.round((count / 3) * 10) / 10, isNew: count < 5 };
  } catch {
    return { rate: 0, isNew: true };
  }
}

// ── File generators ─────────────────────────────────────────────────

function generateRemYml(trigger: string, failOn: string, budget: string): string {
  const budgetLine = budget === "null" ? "  monthly_limit: null    # no limit" : `  monthly_limit: ${budget}         # USD, null for no limit`;

  return `ci:
  trigger: ${trigger}    # merge_to_main | every_pr | manual
  fail_on: [${failOn}]

budget:
${budgetLine}
`;
}

function generateWorkflow(trigger: string, failOn: string): string {
  let onBlock: string;
  if (trigger === "every_pr") {
    onBlock = `on: [push, pull_request]`;
  } else {
    onBlock = `on:\n  push:\n    branches: [main]`;
  }

  return `name: Rem Security Gate
${onBlock}

jobs:
  rem-gate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: Tetraslam/re-zero/action@main
        with:
          api-key: \${{ secrets.REM_API_KEY }}
          fail-on: ${failOn}
`;
}

function generateRemignore(): string {
  return `# Rem ignore — files excluded from scans
node_modules/
.git/
dist/
build/
.next/
*.min.js
*.min.css
*.lock
package-lock.json
yarn.lock
pnpm-lock.yaml
*.map
`;
}

// ── File writing with conflict detection ────────────────────────────

async function writeIfNew(filePath: string, content: string, label: string): Promise<boolean> {
  try {
    await access(filePath);
    process.stderr.write(chalk.dim(`  ${label} already exists, skipping\n`));
    return false;
  } catch {
    // Ensure parent directory exists
    const dir = filePath.substring(0, filePath.lastIndexOf("/"));
    await mkdir(dir, { recursive: true });
    await writeFile(filePath, content);
    process.stderr.write(`  Created ${chalk.cyan(label)}\n`);
    return true;
  }
}

// ── Command ─────────────────────────────────────────────────────────

export function initCommand(): Command {
  return new Command("init")
    .description("Set up Rem for your project")
    .action(async () => {
      // Find git root
      const repoPath = getGitRoot(process.cwd());
      if (!repoPath) {
        console.error(chalk.red("Not a git repository. Run rem init from a git project."));
        process.exit(1);
        return;
      }

      const repoName = basename(repoPath);
      process.stderr.write(`\n  Setting up Rem for ${chalk.bold(repoName)}...\n`);

      // Stack detection
      const stack = await detectStack(repoPath);
      if (stack.length > 0) {
        process.stderr.write(`\n  Detected: ${chalk.cyan(stack.join(", "))}\n`);
      }

      // Q1: Trigger
      const trigger = await selectOption("When should Rem check your code?", [
        { label: "On merge to main (Recommended)", value: "merge_to_main" },
        { label: "On every PR (~$0.10/PR)", value: "every_pr" },
        { label: "Manual only (rem scan)", value: "manual" },
      ]);

      // Q2: Severity policy
      const failOnChoice = await selectOption("What happens when vulnerabilities are found?", [
        { label: "Block on critical only (Recommended)", value: "critical" },
        { label: "Block on critical and high", value: "critical, high" },
        { label: "Warn only (never block deploys)", value: "warn" },
      ]);
      const failOn = failOnChoice === "warn" ? "critical" : failOnChoice;
      const warnOnly = failOnChoice === "warn";

      // Q3: Budget
      const budget = await selectOption("Monthly spending limit?", [
        { label: "$50/month (Recommended)", value: "50" },
        { label: "$100/month", value: "100" },
        { label: "No limit", value: "null" },
      ]);

      // Cost estimation
      if (trigger !== "manual") {
        const { rate, isNew } = estimateMergeRate(repoPath);
        process.stderr.write("\n");

        if (isNew) {
          process.stderr.write(chalk.dim("  This looks like a new project, so we can't measure from\n"));
          process.stderr.write(chalk.dim("  your history. For reference:\n"));
          process.stderr.write(chalk.dim("    20 merges/month = ~$2.00/month\n"));
          process.stderr.write(chalk.dim("    50 merges/month = ~$5.00/month\n"));
        } else {
          const cost = (rate * 0.10).toFixed(2);
          process.stderr.write(chalk.dim(`  Based on your git history (~${rate} merges to main/month):\n`));
          process.stderr.write(chalk.dim(`    Estimated CI cost: ~$${cost}/month\n`));
        }
      }

      process.stderr.write("\n");

      // Generate files
      await writeIfNew(
        join(repoPath, ".rem.yml"),
        generateRemYml(trigger, failOn, budget),
        ".rem.yml"
      );

      if (trigger !== "manual") {
        const workflowContent = warnOnly
          ? generateWorkflow(trigger, failOn).replace(
              /fail-on: .+/,
              "# fail-on not set — warn only, never blocks"
            )
          : generateWorkflow(trigger, failOn);
        await writeIfNew(
          join(repoPath, ".github/workflows/rem.yml"),
          workflowContent,
          ".github/workflows/rem.yml"
        );
      }

      await writeIfNew(
        join(repoPath, ".remignore"),
        generateRemignore(),
        ".remignore"
      );

      // Final message
      process.stderr.write(`\n  Run your first deep scan: ${chalk.cyan("rem scan")}\n`);

      if (trigger !== "manual") {
        process.stderr.write(chalk.dim(`\n  Don't forget to add REM_API_KEY to your GitHub repo secrets.\n`));
        process.stderr.write(chalk.dim(`  Get your key at ${chalk.underline("https://rezero.sh/settings")}\n`));
      }

      process.stderr.write("\n");
    });
}
