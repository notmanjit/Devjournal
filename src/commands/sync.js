import * as p from '@clack/prompts';
import { readConfig, configExists } from '../config.js';
import { scanAllProjects, combineDiffs } from '../scanner.js';
import { sanitize } from '../sanitizer.js';
import { summarize } from '../summarizer.js';
import { publishJournal } from '../publisher.js';
import { setLastSyncedCommit } from '../state.js';

export async function syncCommand() {
  console.log();
  p.intro('  devjournal sync  ');

  // ── 0. Check config ──────────────────────────────────────────────────────
  if (!configExists()) {
    p.log.error('No configuration found.');
    p.outro('Run `devjournal setup` first to configure your projects and API key.');
    process.exit(1);
  }

  const config = readConfig();
  const { geminiApiKey, trackedProjects, journalRepoPath } = config;

  p.log.info(`Scanning ${trackedProjects.length} project(s) for new changes...`);
  console.log();

  // ── 1. EXTRACTION (incremental — only NEW commits since last sync) ───────
  const scanSpinner = p.spinner();
  scanSpinner.start('Scanning Git history...');

  let scanResults, scanErrors;

  try {
    const outcome = scanAllProjects(trackedProjects);
    scanResults = outcome.results;
    scanErrors = outcome.errors;
  } catch (err) {
    scanSpinner.stop('Scan failed.');
    p.log.error(`Unexpected scan error: ${err.message}`);
    process.exit(1);
  }

  // Report any projects that were skipped due to errors
  if (scanErrors.length > 0) {
    scanSpinner.stop(`Scan complete — ${scanErrors.length} project(s) skipped.`);
    console.log();
    for (const err of scanErrors) {
      p.log.warn(`Skipped: ${err.projectPath}`);
      p.log.warn(`  Reason: ${err.message}`);
    }
    console.log();
  } else {
    scanSpinner.stop('Scan complete.');
  }

  // Exit gracefully if no NEW commits were found since the last sync
  if (scanResults.length === 0) {
    p.log.info('No new commits since your last sync. Everything is already up to date.');
    p.outro('Nothing new to journal. Go write some code!');
    process.exit(0);
  }

  // Log what was found
  const totalCommits = scanResults.reduce((sum, r) => sum + r.commitCount, 0);
  p.log.success(
    `Found ${totalCommits} new commit(s) across ${scanResults.length} project(s): ` +
    scanResults.map(r => `${r.projectName} (${r.commitCount})`).join(', ')
  );

  // ── 2. SANITIZATION ───────────────────────────────────────────────────────
  const sanitizeSpinner = p.spinner();
  sanitizeSpinner.start('Running privacy shield — redacting credentials...');

  const rawCombinedDiff = combineDiffs(scanResults);
  const { sanitized, redactionCount, redactedLabels } = sanitize(rawCombinedDiff);

  if (redactionCount > 0) {
    sanitizeSpinner.stop(
      `Sanitization complete — ${redactionCount} sensitive string(s) redacted: ${redactedLabels.join(', ')}`
    );
  } else {
    sanitizeSpinner.stop('Sanitization complete — no sensitive strings detected.');
  }

  // ── 3. AI INFERENCE ───────────────────────────────────────────────────────
  const aiSpinner = p.spinner();
  aiSpinner.start('Sending sanitized diff to Gemini for synthesis...');

  let markdownSummary;

  try {
    markdownSummary = await summarize(sanitized, geminiApiKey);
    aiSpinner.stop('AI synthesis complete.');
  } catch (err) {
    aiSpinner.stop('AI synthesis failed.');
    p.log.error(err.message);

    // Offer to retry with a new API key if it looks like an auth issue
    if (err.message.includes('API key')) {
      p.outro('Run `devjournal setup` to update your Gemini API key.');
    }

    // IMPORTANT: do NOT update sync state here — the commits were never
    // actually journaled, so they must remain eligible for the next sync.
    process.exit(1);
  }

  // Preview the AI-generated summary
  console.log();
  p.note(markdownSummary, "Today's Journal Entry (Preview)");
  console.log();

  // ── 4. LOCAL UPDATE + REMOTE SYNC ─────────────────────────────────────────
  const publishSpinner = p.spinner();
  publishSpinner.start('Writing journal entry and pushing to GitHub...');

  let publishResult;

  try {
    publishResult = publishJournal(journalRepoPath, markdownSummary);
  } catch (err) {
    publishSpinner.stop('Publish failed.');
    p.log.error(`Git pipeline error: ${err.message}`);

    if (err.code === 'GIT_PUSH') {
      p.log.warn('Push failed. Your journal entry was written locally but not pushed.');
      p.log.warn('Check your remote configuration and internet connection, then push manually.');
    }

    // IMPORTANT: do NOT update sync state here either — if publishing
    // failed, these commits have NOT been journaled yet. They must be
    // picked up again on the next sync attempt.
    process.exit(1);
  }

  if (publishResult.commitHash === 'nothing-to-commit') {
    publishSpinner.stop('Journal already up to date — no new changes to push.');
  } else {
    publishSpinner.stop(`Published! Commit ${publishResult.commitHash} pushed to GitHub.`);
  }

  // ── 5. RECORD SYNC STATE (only after a confirmed successful publish) ─────
  // This is what prevents the same commits from being re-summarized on
  // the next `devjournal sync` run.
  for (const result of scanResults) {
    setLastSyncedCommit(result.projectPath, result.latestCommitHash);
  }

  // ── 6. DONE ───────────────────────────────────────────────────────────────
  console.log();
  p.log.success(
    publishResult.isNewFile
      ? `Created new journal entry: ${publishResult.filePath}`
      : `Updated existing journal entry: ${publishResult.filePath}`
  );

  p.outro("Daily journal synced.");
}
