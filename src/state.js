import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * state.js
 *
 * Tracks the last successfully synced commit hash PER PROJECT.
 * This is separate from user config (~/.devjournal.json) because it's
 * machine-generated state, not user-provided settings.
 *
 * Stored at ~/.devjournal-state.json
 *
 * Shape:
 * {
 *   "/Users/you/projects/my-saas-app": "a3f9c21...",
 *   "/Users/you/projects/side-hustle-api": "b88e102..."
 * }
 */

const STATE_PATH = path.join(os.homedir(), '.devjournal-state.json');

/**
 * Reads the full sync-state map. Returns {} if no state file exists yet.
 */
export function readState() {
  try {
    if (!fs.existsSync(STATE_PATH)) return {};
    const raw = fs.readFileSync(STATE_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch {
    // Corrupted state file — fail safe, treat as no prior state
    return {};
  }
}

/**
 * Writes the full sync-state map to disk.
 */
export function writeState(state) {
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), 'utf-8');
}

/**
 * Gets the last synced commit hash for a specific project.
 * Returns null if this project has never been synced before.
 */
export function getLastSyncedCommit(projectPath) {
  const state = readState();
  return state[projectPath] || null;
}

/**
 * Updates the last synced commit hash for a specific project
 * and persists it immediately.
 */
export function setLastSyncedCommit(projectPath, commitHash) {
  const state = readState();
  state[projectPath] = commitHash;
  writeState(state);
}

export { STATE_PATH };
