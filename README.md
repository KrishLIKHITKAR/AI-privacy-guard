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

## Notes
- No backend; all data stays local.
- Logs auto-purge after 7 days; export via Options.
