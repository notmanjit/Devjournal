import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { getLastSyncedCommit } from './state.js';

/**
 * Scans a single project directory for code changes.
 *
 * Behavior:
 * - If this project has NEVER been synced before → falls back to
 *   "git log --since=24 hours ago" (first-run behavior).
 * - If this project HAS been synced before → scans only commits made
 *   AFTER the last synced commit hash, using `<lastHash>..HEAD`.
 *   This guarantees no commit is ever summarized twice.
 *
 * @param {string} projectPath - Absolute path to the project directory
 * @returns {{ diff: string, projectName: string, commitCount: number, latestCommitHash: string } | null}
 */
export function scanProject(projectPath) {
  // Validate the directory exists
  if (!fs.existsSync(projectPath)) {
    throw new ScanError(`Directory not found: ${projectPath}`, 'NOT_FOUND');
  }

  if (!fs.statSync(projectPath).isDirectory()) {
    throw new ScanError(`Path is not a directory: ${projectPath}`, 'NOT_DIR');
  }

  // Verify it's a Git repository
  if (!fs.existsSync(path.join(projectPath, '.git'))) {
    throw new ScanError(`Not a Git repository: ${projectPath}`, 'NOT_GIT');
  }

  const projectName = path.basename(projectPath);
  const execOptions = {
    cwd: projectPath,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  };

  // Get the author's email from Git config inside this repo
  let authorEmail;
  try {
    authorEmail = execSync('git config user.email', execOptions).trim();
  } catch {
    throw new ScanError(`Could not read git user.email in: ${projectPath}`, 'GIT_CONFIG_ERROR');
  }

  if (!authorEmail) {
    throw new ScanError(`git user.email is not set in: ${projectPath}`, 'GIT_EMAIL_MISSING');
  }

  // Resolve the current HEAD commit hash — we'll record this as the new
  // "last synced" checkpoint if this scan succeeds and gets published.
  let currentHead;
  try {
    currentHead = execSync('git rev-parse HEAD', execOptions).trim();
  } catch {
    throw new ScanError(`Could not resolve HEAD in: ${projectPath}`, 'GIT_HEAD_ERROR');
  }

  // ── Determine the scan range ─────────────────────────────────────────────
  const lastSyncedCommit = getLastSyncedCommit(projectPath);

  let logCommand;
  let scanMode;

  if (lastSyncedCommit) {
    // We've synced this project before — only scan NEW commits since then.
    // Verify the last synced commit still exists (handles rebases/force-pushes)
    let commitStillExists = true;
    try {
      execSync(`git cat-file -e ${lastSyncedCommit}`, execOptions);
    } catch {
      commitStillExists = false;
    }

    if (commitStillExists) {
      logCommand = `git log ${lastSyncedCommit}..HEAD --patch --all-match --author="${authorEmail}"`;
      scanMode = 'incremental';
    } else {
      // History was rewritten (rebase/force-push) — fall back to time window
      logCommand = `git log --since="24 hours ago" --patch --all-match --author="${authorEmail}"`;
      scanMode = 'fallback-rewritten-history';
    }
  } else {
    // First time syncing this project — use the 24-hour window as the
    // initial baseline.
    logCommand = `git log --since="24 hours ago" --patch --all-match --author="${authorEmail}"`;
    scanMode = 'first-run';
  }

  let rawDiff;
  try {
    rawDiff = execSync(logCommand, {
      ...execOptions,
      // Allow up to 50MB of diff output
      maxBuffer: 50 * 1024 * 1024,
    });
  } catch (err) {
    // git log itself failed (not just empty output)
    if (err.status !== 0 && err.stderr && err.stderr.trim()) {
      throw new ScanError(`git log failed in ${projectPath}: ${err.stderr.trim()}`, 'GIT_LOG_ERROR');
    }
    rawDiff = '';
  }

  // Count commits from the diff output
  const commitCount = (rawDiff.match(/^commit [0-9a-f]{40}/gm) || []).length;

  return {
    diff: rawDiff,
    projectName,
    projectPath,
    authorEmail,
    commitCount,
    latestCommitHash: currentHead,
    scanMode,
  };
}

/**
 * Scans multiple projects and collects results, skipping failed ones gracefully.
 *
 * @param {string[]} projectPaths
 * @returns {{ results: ScanResult[], errors: ScanError[] }}
 */
export function scanAllProjects(projectPaths) {
  const results = [];
  const errors = [];

  for (const projectPath of projectPaths) {
    try {
      const result = scanProject(projectPath);

      if (result.commitCount === 0 || !result.diff.trim()) {
        // No new activity since last sync — skip silently (not an error)
        continue;
      }

      results.push(result);
    } catch (err) {
      if (err instanceof ScanError) {
        errors.push({ projectPath, message: err.message, code: err.code });
      } else {
        errors.push({ projectPath, message: err.message, code: 'UNKNOWN' });
      }
    }
  }

  return { results, errors };
}

/**
 * Combines multiple scan results into a single payload string for the LLM.
 *
 * @param {ScanResult[]} results
 * @returns {string}
 */
export function combineDiffs(results) {
  return results
    .map(({ projectName, diff, commitCount }) => {
      return [
        `${'='.repeat(60)}`,
        `PROJECT: ${projectName}  (${commitCount} new commit${commitCount !== 1 ? 's' : ''})`,
        `${'='.repeat(60)}`,
        diff.trim(),
      ].join('\n');
    })
    .join('\n\n');
}

// Custom error class for structured error handling
export class ScanError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'ScanError';
    this.code = code;
  }
}
