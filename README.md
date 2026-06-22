# devjournal

> Automated AI-powered developer journaling CLI that preserves your GitHub contribution graph.

`devjournal` is a local CLI tool that automatically turns your daily Git activity into a clean, human-readable engineering journal — and pushes it to a public GitHub repository to keep your contribution graph active.

---

## How It Works

Run `devjournal sync` at the end of your workday. The tool:

1. **Scans** your tracked project directories for every commit you made in the current session
2. **Sanitizes** the raw diff locally — strips API keys, secrets, and credentials before any network call
3. **Summarizes** the cleaned diff using Google Gemini into 3–4 concise technical bullet points
4. **Publishes** the entry to your public journal repo example: `daily-learnings` via an automated `git push` — creating a real commit and a real green square

## Installation

```bash
npm install -g @notmanjit/devjournal
```

## Prerequisites

- Node.js 18 or higher
- Git installed and configured (`git config user.email` must be set)
- A cloned public GitHub repo to serve as your journal
- A free [Google Gemini API key](https://aistudio.google.com)

## Quick Start

**1. Create your journal repository**

On GitHub, create a new public repo to record summarized updates. Clone it locally:

```bash
git clone https://github.com/your-username/daily-learnings.git
```

**2. Run setup** (one time only):
```bash
devjournal setup
```

An interactive wizard will ask for:
- Your Gemini API key
- Paths to the local project directories you want to track
- Path to your local journal repo clone

**3. Sync at the end of each day:**
```bash
devjournal sync
```

That's it. Your journal entry is written, committed, and pushed.

---

## Commands

| Command | Description |
|---|---|
| `devjournal setup` | First-time configuration wizard |
| `devjournal sync` | Run the full pipeline — scan, summarize, publish |
| `devjournal status` | Show the last synced commit for each tracked project |
| `devjournal config` | Display your current configuration |
| `devjournal reset` | Clear sync state — next run re-scans from the last 24 hours |
| `devjournal --help` | Show help menu |
| `devjournal --version` | Show version |

---

## How Syncing Works

`devjournal` tracks the last commit it successfully synced per project. Each run only picks up commits made **after that checkpoint** — so running `sync` twice in a row never duplicates an entry.

On the very first sync, it scans the last 24 hours as a baseline. Every sync after that uses the exact commit hash from the previous successful sync as the starting point — regardless of how much time has passed.

If you miss a day, it still works. The next sync picks up everything since the last checkpoint, across however many days.

---

## Privacy & Security

- All sanitization happens **in-memory, locally**, before any network call
- Only the cleaned, redacted diff reaches the Gemini API
- Your `~/.devjournal.json` config file (including your API key) is **never committed or shared**
- Redacted patterns include: API keys, passwords, tokens, secrets, database connection strings, AWS credentials, and PEM private keys

---

## Configuration File

Config is stored at `~/.devjournal.json`:

```json
{
  "geminiApiKey": "your-api-key",
  "trackedProjects": [
    "/Users/you/projects/my-app",
    "/Users/you/projects/another-project"
  ],
  "journalRepoPath": "/Users/you/projects/daily-learnings",
  "createdAt": "2024-01-01T00:00:00.000Z"
}
```

Sync state (last checkpointed commit per project) is stored separately at `~/.devjournal-state.json` and is managed automatically.
