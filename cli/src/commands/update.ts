import { Command } from "commander";
import chalk from "chalk";
import { execSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

export function updateCommand(): Command {
  return new Command("update")
    .description("Update rem to the latest version")
    .action(async () => {
      // Get current version from package.json
      let current = "unknown";
      try {
        const pkgPath = join(dirname(fileURLToPath(import.meta.url)), "../../package.json");
        const pkg = JSON.parse(await readFile(pkgPath, "utf-8"));
        current = pkg.version;
      } catch { /* fall through */ }

      // Check latest on npm
      let latest: string;
      try {
        latest = execSync("npm view rem-scan version", {
          encoding: "utf-8",
          stdio: ["pipe", "pipe", "pipe"],
        }).trim();
      } catch {
        console.error(chalk.red("Could not check for updates."));
        process.exit(1);
        return;
      }

      if (current === latest) {
        console.log(`Already on the latest version (${chalk.cyan(current)}).`);
        return;
      }

      console.log(`Current: ${chalk.dim(current)}`);
      console.log(`Latest:  ${chalk.cyan(latest)}`);
      console.log();

      try {
        console.log(chalk.dim("Updating..."));
        execSync("npm install -g rem-scan@latest", {
          stdio: "inherit",
        });
        console.log(chalk.green(`Updated to ${latest}.`));
      } catch {
        console.error(chalk.red("Update failed. Try manually:"));
        console.error(chalk.dim("  npm install -g rem-scan@latest"));
      }
    });
}
