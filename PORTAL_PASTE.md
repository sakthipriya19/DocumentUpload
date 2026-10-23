# Ajaia Docs: Full Stack Product Engineer submission (Sakthi Priya)

## Links
- Google Drive folder (all materials): **[PASTE DRIVE LINK]**
- Live app: **https://ajaia-docs-kqqm.onrender.com** (free tier: the first load may take ~30 s while the server wakes up; data resets on redeploy)
- Walkthrough video: **https://www.loom.com/share/0b254723c3d644c18edde4fe8586b337**

## Test accounts (seeded, no password; click one on the login page)
- alice@example.com (owner of the seeded "Welcome" doc)
- bob@example.com (already has **view-only** access to Alice's Welcome doc)
- carol@example.com

**Sharing demo:** sign in as Alice, open a doc, share with Carol as *Can edit*, click *Switch user*, sign in as Carol, and open it under *Shared with me*. Share as *View only* to see editing disabled (also enforced by the API with a 403).

## What I built
Angular 19 (standalone components + signals) with a Quill 2 editor, an Express API and SQLite (Node's built-in `node:sqlite`). One deployable: Express serves the built Angular bundle.

- **Documents:** create, rename, edit, debounced autosave with a saved/failed indicator, reopen after refresh
- **Formatting:** bold, italic, underline, H1-H3, bulleted and numbered lists, clear formatting
- **Upload:** `.txt`, `.md`, `.docx` (max 2 MB) becomes a new editable document. Supported types are stated in the UI and README and enforced on the server
- **Sharing:** owner shares by email as *Can edit* or *View only*, can change the role or revoke. Dashboard splits **My documents** (Owner badge) from **Shared with me** (Can edit / View only badge)
- **Persistence:** SQLite (`users`, `documents`, `shares`); content stored as sanitized HTML
- **Quality:** validation on client and server, consistent JSON errors, 404 (not 403) for non-members so ids don't leak, HTML sanitize allow-list, API tests (`npm test`) covering auth, owner/editor/viewer permissions, revoke, validation, sanitization and upload

## Run locally (Node 22.13+)
```
npm install
npm run build
npm start        # http://localhost:3000
npm test
```

## Prioritization and tradeoffs
I prioritized one complete vertical slice and server-side access logic over editor breadth. Auth is simulated with seeded users and an HMAC-signed token (allowed by the brief). Cut on purpose: real-time co-editing (last write wins), real authentication, version history, export, comments.

## Status
- **Working:** everything under "What I built"
- **Incomplete:** real-time collaboration, real auth, version history, export
- **Next 2-4 hours:** optimistic concurrency with a conflict message, Markdown/PDF export, presence indicator, Playwright test of the share flow

## AI-native workflow
- **Tools:** Claude (Claude Code in VS Code) for scaffolding, API, tests, docs and the install/build/test loop.
- **Where it sped me up:** Angular project setup, API and access-check logic, first draft of tests and written deliverables.
- **Changed or rejected:** used `node:sqlite` instead of a native driver (no compile step on free hosts); used Quill directly, not a wrapper; seeded users instead of full auth; tightened the sanitize allow-list to the toolbar's tags. Running the AI-drafted code exposed 4 bugs, which I fixed: the test script pointed at a directory, an Angular NG8002 build error (`aria-label` interpolation), vulnerable `multer@1` (upgraded to 2), and `.md` imports with a UTF-8 BOM losing their first heading (fixed, with a regression test).
- **Verification:** `npm test` 8/8 passing; `npm run build && npm start` smoke-tested with curl (SPA, deep links, login, create, import); manual browser walkthrough of create, format, refresh, import, share and view-only on the live URL.
