/**
 * sanitizer.js
 *
 * In-memory RegEx-based credential and secret redaction.
 * All sanitization happens locally BEFORE the diff is sent to any external API.
 * Nothing proprietary ever leaves the machine unfiltered.
 */

// ─── Sensitive Pattern Definitions ──────────────────────────────────────────
const SENSITIVE_PATTERNS = [
  // ── Generic KEY/SECRET/TOKEN assignments ──
  // Matches: API_KEY="abc123", SECRET_KEY = 'xyz', ACCESS_TOKEN=Bearer_abc
  {
    pattern: /\b(API[_-]?KEY|SECRET[_-]?KEY|ACCESS[_-]?KEY|PRIVATE[_-]?KEY)\s*[:=]\s*['"]?[\w\-./+]{8,}['"]?/gi,
    label: 'API/SECRET KEY',
  },

  // ── Password assignments ──
  // Matches: PASSWORD="hunter2", PASSWD=abc123, DB_PASS = 'root'
  {
    pattern: /\b(PASSWORD|PASSWD|DB_PASS|DB_PASSWORD|USER_PASS)\s*[:=]\s*['"]?[^\s'"]{4,}['"]?/gi,
    label: 'PASSWORD',
  },

  // ── Generic TOKEN assignments ──
  // Matches: TOKEN="xyz", AUTH_TOKEN=abc, BEARER_TOKEN = 'def'
  {
    pattern: /\b(AUTH[_-]?TOKEN|ACCESS[_-]?TOKEN|BEARER[_-]?TOKEN|REFRESH[_-]?TOKEN|TOKEN)\s*[:=]\s*['"]?[\w\-./+]{8,}['"]?/gi,
    label: 'TOKEN',
  },

  // ── Generic SECRET assignments ──
  // Matches: SECRET="abc", APP_SECRET=xyz, JWT_SECRET = 'foo'
  {
    pattern: /\b(SECRET|APP[_-]?SECRET|JWT[_-]?SECRET|CLIENT[_-]?SECRET|WEBHOOK[_-]?SECRET)\s*[:=]\s*['"]?[\w\-./+]{8,}['"]?/gi,
    label: 'SECRET',
  },

  // ── Database connection strings ──
  // Matches: mongodb://user:pass@host, postgresql://user:pass@host
  {
    pattern: /\b(mongodb(\+srv)?|postgresql|postgres|mysql|redis|mssql):\/\/[^\s"'`]+/gi,
    label: 'DB_CONNECTION_STRING',
  },

  // ── AWS credentials ──
  // Matches AWS access key IDs (AKIA...) and secret access keys
  {
    pattern: /\bAKIA[0-9A-Z]{16}\b/g,
    label: 'AWS_ACCESS_KEY_ID',
  },
  {
    pattern: /\b(AWS[_-]?SECRET|AWS_SECRET_ACCESS_KEY)\s*[:=]\s*['"]?[\w/+]{40}['"]?/gi,
    label: 'AWS_SECRET',
  },

  // ── Private key blocks (PEM format) ──
  {
    pattern: /-----BEGIN\s+(RSA\s+)?PRIVATE KEY-----[\s\S]*?-----END\s+(RSA\s+)?PRIVATE KEY-----/gi,
    label: 'PRIVATE_KEY_BLOCK',
  },

  // ── Common .env variable patterns ──
  // Specifically targets lines that look like: VARNAME=value_with_no_spaces
  // but only for known sensitive-sounding variable names
  {
    pattern: /\b(STRIPE[_-]?(SECRET|KEY|TOKEN)|TWILIO[_-]?(SID|TOKEN|AUTH)|SENDGRID[_-]?(API[_-]?KEY)|FIREBASE[_-]?(SECRET|KEY)|GCP[_-]?(KEY|SECRET)|GOOGLE[_-]?(API[_-]?KEY|SECRET)|GITHUB[_-]?(TOKEN|SECRET))\s*[:=]\s*['"]?[\w\-./+]{8,}['"]?/gi,
    label: 'SERVICE_CREDENTIAL',
  },

  // ── Generic high-entropy strings that look like secrets ──
  // Matches long hex/base64-ish strings (32+ chars) in assignment context
  {
    pattern: /[:=]\s*['"]([0-9a-f]{32,}|[A-Za-z0-9+/]{40,}={0,2})['"](?:\s|$|,|;)/g,
    label: 'HIGH_ENTROPY_STRING',
  },
];

/**
 * Sanitizes a raw git diff string by redacting all detected secrets
 * and credentials in-memory before any network transit.
 *
 * @param {string} rawDiff - Raw git diff/log output
 * @returns {{ sanitized: string, redactionCount: number, redactedLabels: string[] }}
 */
export function sanitize(rawDiff) {
  let sanitized = rawDiff;
  let redactionCount = 0;
  const redactedLabels = new Set();

  for (const { pattern, label } of SENSITIVE_PATTERNS) {
    // Reset lastIndex for global patterns
    pattern.lastIndex = 0;

    const before = sanitized;
    sanitized = sanitized.replace(pattern, (match) => {
      redactionCount++;
      redactedLabels.add(label);
      return `[REDACTED:${label}]`;
    });

    // Reset again after replace
    pattern.lastIndex = 0;
  }

  return {
    sanitized,
    redactionCount,
    redactedLabels: [...redactedLabels],
  };
}

/**
 * Quick check — returns true if the string contains anything that looks
 * like a secret. Used as a pre-flight check before sending to the API.
 *
 * @param {string} text
 * @returns {boolean}
 */
export function containsSensitiveData(text) {
  return SENSITIVE_PATTERNS.some(({ pattern }) => {
    pattern.lastIndex = 0;
    const result = pattern.test(text);
    pattern.lastIndex = 0;
    return result;
  });
}
