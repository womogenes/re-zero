#!/usr/bin/env node

import { Command } from "commander";
import chalk from "chalk";
import { scanCommand } from "./commands/scan.js";
import { loginCommand } from "./commands/login.js";
import { statusCommand } from "./commands/status.js";
import { initCommand } from "./commands/init.js";

const program = new Command();

program
  .name("rem")
  .description(chalk.dim("re:zero") + " security scanner")
  .version("0.1.0");

program.addCommand(initCommand());
program.addCommand(scanCommand());
program.addCommand(loginCommand());
program.addCommand(statusCommand());

program.parse();
