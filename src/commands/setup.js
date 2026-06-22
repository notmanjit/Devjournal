import * as p from '@clack/prompts';
import fs from 'fs';
import path from 'path';
import { writeConfig, readConfig, CONFIG_PATH } from '../config.js';

export async function setupCommand() {
  console.log();
  p.intro('  devjournal setup  ');

  // Check if config already exists and warn the user
  const existing = readConfig();
  if (existing) {
    const overwrite = await p.confirm({
      message: 'A config already exists at ~/.devjournal.json. Overwrite it?',
      initialValue: false,
    });

    if (p.isCancel(overwrite) || !overwrite) {
      p.cancel('Setup cancelled. Your existing config was not changed.');
      process.exit(0);
    }
  }

  // ── Step 1: Gemini API Key ───────────────────────────────────────────────
  const geminiApiKey = await p.password({
    message: 'Enter your Google Gemini API key',
    validate(value) {
      if (!value || value.trim().length === 0) return 'API key cannot be empty.';
      if (value.trim().length < 10) return 'That doesn\'t look like a valid API key.';
    },
  });

  if (p.isCancel(geminiApiKey)) {
    p.cancel('Setup cancelled.');
    process.exit(0);
  }

  // ── Step 2: Tracked Projects ─────────────────────────────────────────────
  p.note(
    'Add the absolute paths to your local project directories.\nThese are the repos devjournal will scan for daily code changes.',
    'Tracked Projects'
  );

  const trackedProjects = [];

  // Collect the first project path
  const firstProject = await p.text({
    message: 'Path to your first project directory',
    placeholder: '/Users/you/projects/my-app',
    validate(value) {
      if (!value || value.trim().length === 0) return 'Path cannot be empty.';
      const resolved = path.resolve(value.trim());
      if (!fs.existsSync(resolved)) return `Directory not found: ${resolved}`;
      if (!fs.statSync(resolved).isDirectory()) return 'Path must point to a directory.';
    },
  });

  if (p.isCancel(firstProject)) {
    p.cancel('Setup cancelled.');
    process.exit(0);
  }

  trackedProjects.push(path.resolve(firstProject.trim()));

  // Loop to add more projects
  while (true) {
    const addMore = await p.confirm({
      message: `Add another project? (${trackedProjects.length} added so far)`,
      initialValue: false,
    });

    if (p.isCancel(addMore) || !addMore) break;

    const nextProject = await p.text({
      message: 'Path to next project directory',
      placeholder: '/Users/you/projects/another-app',
      validate(value) {
        if (!value || value.trim().length === 0) return 'Path cannot be empty.';
        const resolved = path.resolve(value.trim());
        if (!fs.existsSync(resolved)) return `Directory not found: ${resolved}`;
        if (!fs.statSync(resolved).isDirectory()) return 'Path must point to a directory.';
        if (trackedProjects.includes(resolved)) return 'This project is already added.';
      },
    });

    if (p.isCancel(nextProject)) break;
    trackedProjects.push(path.resolve(nextProject.trim()));
  }

  // ── Step 3: Journal Repo Path ────────────────────────────────────────────
  p.note(
    'This is the local path to your cloned journal repository.\ndevjournal will write and push journal entries to this repo.',
    'Journal Repository'
  );

  const journalRepoPath = await p.text({
    message: 'Path to your local repository to record summarized updates',
    placeholder: '/Users/you/projects/daily-learnings',
    validate(value) {
      if (!value || value.trim().length === 0) return 'Path cannot be empty.';
      const resolved = path.resolve(value.trim());
      if (!fs.existsSync(resolved)) return `Directory not found: ${resolved}`;
      if (!fs.statSync(resolved).isDirectory()) return 'Path must point to a directory.';
      // Check it's a git repo
      if (!fs.existsSync(path.join(resolved, '.git'))) {
        return 'This directory does not appear to be a Git repository.';
      }
    },
  });

  if (p.isCancel(journalRepoPath)) {
    p.cancel('Setup cancelled.');
    process.exit(0);
  }

  // ── Save Config ──────────────────────────────────────────────────────────
  const config = {
    geminiApiKey: geminiApiKey.trim(),
    trackedProjects,
    journalRepoPath: path.resolve(journalRepoPath.trim()),
    createdAt: new Date().toISOString(),
  };

  writeConfig(config);

  p.note(
    `Config saved to: ${CONFIG_PATH}\n\nTracked projects: ${trackedProjects.length}\nJournal repo: ${config.journalRepoPath}`,
    'Configuration Saved'
  );

  p.outro("You're all set! Run `devjournal sync` at the end of your workday.");
}
