# AI Privacy Guard (Chrome MV3)

A Chrome-only extension that analyzes AI-related access on sites, assesses risk (Low/Medium/High) using a strict rubric, and gives plain-English guidance. Local-first: deterministic rules engine with optional Gemini cloud analysis (BYO API key, stored locally).

## Features
- CSP-safe MV3 build (no inline/remote scripts).
- Popup with risk summary, red flags, and recommendation.
- Local rules-engine fallback; final risk = max(model, rules).
- On-device vs Cloud badges.
- Options page: set/test Gemini API key; export/clear 7-day logs.
- Blocking modal on sensitive sites with Allow once/Ask/Block; background enforces cloud blocking unless Allow once is active.

## Build and load
```powershell
# From project folder
if (Test-Path dist) { Remove-Item dist -Recurse -Force }
npm install
npm run build
```
Load in Chrome: chrome://extensions → Developer Mode → Load unpacked → select `dist`.

Set the key: Extension Details → Extension options → paste key → Save → Test Key.

## Developer tools
For quick local checks (no MCP required):

```powershell
# Fetch a URL (status, headers, body length)
npm run -s tool:fetch -- https://example.com

# Extract main article text using Readability
npm run -s tool:readability -- https://example.com

# Talk to a local Ollama model (requires Ollama running)
$env:OLLAMA_HOST = '127.0.0.1:11434'; npm run -s tool:ollama -- --model llama3.2:3b --prompt "Say hi in one short sentence."
```

## Behavior matrix (summary)
- No AI on page + Cloud OFF: Local heuristics; says no active AI; Low risk.
- No AI on page + Cloud ON: Same as above; cloud not used.
- AI on page + Cloud OFF: Local heuristics + on-device Chrome AI (if available); Medium/High as needed.
- AI on page + Cloud ON: Same as above, then optionally enhances with Gemini (respecting sensitive-site allow-once).

## Notes
- No backend; all data stays local.
- Logs auto-purge after 7 days; export via Options.
