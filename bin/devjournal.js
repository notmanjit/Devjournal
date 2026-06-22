#!/usr/bin/env node

import { program } from "commander";
import { setupCommand } from "../src/commands/setup.js";
import { syncCommand } from "../src/commands/sync.js";
import { readConfig } from "../src/config.js";
import { readState, writeState, STATE_PATH } from "../src/state.js";
import fs from "fs";

program
  .name("devjournal")
  .description("Automated AI-powered developer journaling CLI")
  .version("1.0.0");

program
  .command("setup")
  .description(
    "Configure devjournal — set your Gemini API key and tracked projects",
  )
  .action(setupCommand);

program
  .command("sync")
  .description(
    "Scan changes, summarize with AI, and publish your daily journal entry",
  )
  .action(syncCommand);

program
  .command("config")
  .description("Display your current devjournal configuration")
  .action(() => {
    const config = readConfig();
    if (!config) {
      console.log(
        "\n  No configuration found. Run `devjournal setup` to get started.\n",
      );
      process.exit(0);
    }
    console.log("\n  Current Configuration:\n");
    console.log(
      `  Gemini API Key : ${"*".repeat(20)}${config.geminiApiKey.slice(-4)}`,
    );
    console.log(`  Journal Repo   : ${config.journalRepoPath}`);
    console.log(`  Tracked Projects (${config.trackedProjects.length}):`);
    config.trackedProjects.forEach((p, i) => {
      console.log(`    ${i + 1}. ${p}`);
    });
    console.log();
  });

program
  .command("status")
  .description("Show the last synced commit for each tracked project")
  .action(() => {
    const config = readConfig();
    if (!config) {
      console.log(
        "\n  No configuration found. Run `devjournal setup` to get started.\n",
      );
      process.exit(0);
    }

    const state = readState();
    console.log("\n  Sync Status:\n");

    config.trackedProjects.forEach((projectPath) => {
      const lastCommit = state[projectPath];
      const shortHash = lastCommit ? lastCommit.slice(0, 7) : null;
      console.log(`  ${projectPath}`);
      console.log(
        `    Last synced commit: ${shortHash ? shortHash : "never synced — next run uses 24h window"}`,
      );
    });
    console.log();
  });

program
  .command("reset")
  .description(
    "Clear sync state — the next sync will re-scan using the 24-hour window",
  )
  .action(() => {
    if (fs.existsSync(STATE_PATH)) {
      fs.unlinkSync(STATE_PATH);
      console.log(
        "\n  Sync state cleared. Next `devjournal sync` will use the 24-hour window.\n",
      );
    } else {
      console.log("\n  No sync state found — nothing to reset.\n");
    }
  });

// Show help if no command is provided
if (process.argv.length === 2) {
  program.help();
}

program.parse(process.argv);
