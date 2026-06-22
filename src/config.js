import fs from 'fs';
import path from 'path';
import os from 'os';

// Global config lives at ~/.devjournal.json
const CONFIG_PATH = path.join(os.homedir(), '.devjournal.json');

/**
 * Reads and parses the global config file.
 * Returns null if the file doesn't exist or is malformed.
 */
export function readConfig() {
  try {
    if (!fs.existsSync(CONFIG_PATH)) return null;
    const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Writes the config object to ~/.devjournal.json.
 */
export function writeConfig(config) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
}

/**
 * Returns true if a valid, complete config file exists.
 */
export function configExists() {
  const config = readConfig();
  return (
    config !== null &&
    typeof config.geminiApiKey === 'string' &&
    config.geminiApiKey.length > 0 &&
    Array.isArray(config.trackedProjects) &&
    config.trackedProjects.length > 0 &&
    typeof config.journalRepoPath === 'string' &&
    config.journalRepoPath.length > 0
  );
}

export { CONFIG_PATH };
