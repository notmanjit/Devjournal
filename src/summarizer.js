import { GoogleGenerativeAI } from '@google/generative-ai';

// ─── System Prompt ────────────────────────────────────────────────────────────
// Rigid instructions to control Gemini's output format precisely.
const SYSTEM_PROMPT = `You are a senior software engineer writing concise daily engineering journal entries.

You will receive a sanitized Git diff representing one developer's code changes over the last 24 hours, potentially across multiple projects.

Your task is to synthesize these changes into a clean, professional journal entry.

STRICT OUTPUT RULES:
1. Return ONLY pure Markdown — no preamble, no explanation, no code fences around the entire response.
2. Write exactly 3 to 4 bullet points total. No more, no less.
3. Each bullet point must describe a distinct technical achievement, architectural decision, component built, or bug fixed.
4. Write in past tense, third-person voice (e.g., "Implemented...", "Refactored...", "Fixed...", "Integrated...").
5. Be highly technical and specific — mention actual function names, modules, patterns, or concepts when clearly visible in the diff.
6. Do NOT dump raw code, variable names, or file paths directly. Describe what was accomplished.
7. Do NOT use vague language like "made changes to" or "worked on". Every bullet must convey concrete engineering value.
8. If changes span multiple projects, you may mention the project name for context.

OUTPUT FORMAT (follow exactly):
- [Technical achievement sentence here]
- [Technical achievement sentence here]
- [Technical achievement sentence here]
- [Optional fourth bullet if genuinely distinct achievement]`;

/**
 * Sends a sanitized diff to Gemini and returns a markdown summary string.
 *
 * @param {string} sanitizedDiff - Pre-sanitized git diff content
 * @param {string} apiKey - Gemini API key from user config
 * @returns {Promise<string>} - Markdown bullet points
 */
export async function summarize(sanitizedDiff, apiKey) {
  if (!sanitizedDiff || sanitizedDiff.trim().length === 0) {
    throw new Error('Cannot summarize: diff payload is empty.');
  }

  const genAI = new GoogleGenerativeAI(apiKey);

  const model = genAI.getGenerativeModel({
    model: 'gemini-3.5-flash',
    systemInstruction: SYSTEM_PROMPT,
  });

  const userPrompt = buildUserPrompt(sanitizedDiff);

  let result;
  try {
    result = await model.generateContent(userPrompt);
  } catch (err) {
    // Surface a clear error for common API failures
    if (err.message?.includes('API_KEY_INVALID') || err.message?.includes('API key not valid')) {
      throw new Error(
        'Gemini API key is invalid. Run `devjournal setup` to update it.'
      );
    }
    if (err.message?.includes('quota') || err.message?.includes('RESOURCE_EXHAUSTED')) {
      throw new Error(
        'Gemini API quota exceeded. Try again later or check your Google AI Studio limits.'
      );
    }
    throw new Error(`Gemini API error: ${err.message}`);
  }

  const text = result.response.text().trim();

  if (!text) {
    throw new Error('Gemini returned an empty response. Please try again.');
  }

  return text;
}

/**
 * Builds the user-facing prompt by injecting the diff.
 * Trims the diff to stay within a safe token window.
 *
 * @param {string} sanitizedDiff
 * @returns {string}
 */
function buildUserPrompt(sanitizedDiff) {
  // Gemini 1.5 Flash supports up to ~1M tokens, but we cap at ~50k chars
  // for performance and cost efficiency (~12.5k tokens)
  const MAX_DIFF_CHARS = 50_000;
  const trimmedDiff =
    sanitizedDiff.length > MAX_DIFF_CHARS
      ? sanitizedDiff.slice(0, MAX_DIFF_CHARS) +
        '\n\n[...diff truncated for token efficiency...]'
      : sanitizedDiff;

  return `Here is today's sanitized Git diff. Please synthesize it into a journal entry following the rules above:\n\n${trimmedDiff}`;
}
