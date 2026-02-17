import { Command } from "commander";
import chalk from "chalk";
import { createInterface } from "node:readline/promises";
import { saveConfig, loadConfig, getServerUrl } from "../lib/config.js";

export function loginCommand(): Command {
  return new Command("login")
    .description("Authenticate with your Re:Zero API key")
    .option("--key <key>", "API key (non-interactive)")
    .option("--server <url>", "Server URL override")
    .action(async (opts) => {
      let key: string;

      if (opts.key) {
        key = opts.key;
      } else {
        const rl = createInterface({
          input: process.stdin,
          output: process.stderr,
        });
        key = await rl.question("Paste your API key: ");
        rl.close();
      }

      key = key.trim();
      if (!key.startsWith("re0_")) {
        console.error(chalk.red("Invalid key format. Keys start with re0_"));
        process.exit(1);
      }

      // Save config
      const updates: Record<string, string> = { apiKey: key };
      if (opts.server) updates.serverUrl = opts.server;
      await saveConfig(updates);

      // Verify against server
      const config = await loadConfig();
      const serverUrl = getServerUrl(config);
      try {
        const res = await fetch(`${serverUrl}/scans/verify`, {
          method: "POST",
          headers: { "X-API-Key": key },
        });
        if (res.ok) {
          console.log(chalk.green("Authenticated successfully."));
          console.log(chalk.dim(`Key saved to ~/.rem/config.json`));
        } else {
          console.log(chalk.yellow("Key saved, but verification failed."));
          console.log(chalk.dim("The server may be unreachable. Your key is stored for later use."));
        }
      } catch {
        console.log(chalk.yellow("Key saved. Could not reach server to verify."));
        console.log(chalk.dim(`Server: ${serverUrl}`));
      }
    });
}
