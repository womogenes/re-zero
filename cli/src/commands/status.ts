import { Command } from "commander";
import chalk from "chalk";
import { loadConfig, getApiKey, getServerUrl } from "../lib/config.js";

export function statusCommand(): Command {
  return new Command("status")
    .description("Show authentication status")
    .action(async () => {
      const config = await loadConfig();
      const key = getApiKey(config);
      const serverUrl = getServerUrl(config);

      if (!key) {
        console.log(chalk.yellow("Not authenticated."));
        console.log(chalk.dim("Run: rem login"));
        return;
      }

      const prefix = key.slice(0, 8) + "...";
      console.log(`Key:    ${prefix}`);
      console.log(`Server: ${serverUrl}`);

      // Try to verify
      try {
        const res = await fetch(`${serverUrl}/scans/verify`, {
          method: "POST",
          headers: { "X-API-Key": key },
        });
        if (res.ok) {
          console.log(`Status: ${chalk.green("valid")}`);
        } else {
          console.log(`Status: ${chalk.red("invalid or expired")}`);
        }
      } catch {
        console.log(`Status: ${chalk.yellow("server unreachable")}`);
      }
    });
}
