# Ajaia Docs

A lightweight collaborative document editor: **Angular 19** (standalone components, signals) + **Quill 2** rich-text editor, **Express** API, **SQLite** (Node's built-in `node:sqlite`).

## Features
- Create, rename, edit, auto-save and reopen documents
- Rich text: bold, italic, underline, headings (H1-H3), bulleted and numbered lists
- File import: **.txt, .md, .docx** (max 2 MB) becomes a new editable document
- Sharing: owner can share by email as **Can edit** or **View only**, change the role, or revoke
- Dashboard separates **My documents** (Owner) from **Shared with me** (Can edit / View only)
- Persistence in SQLite; formatting is stored as sanitized HTML
- Validation + error handling on client and server; automated API tests

## Requirements
Node.js **22.13 or newer** (uses the built-in `node:sqlite`, so no native modules to compile).

## Run locally
```bash
npm install
npm run build        # builds the Angular app into dist/web/browser
npm start            # http://localhost:3000  (API + built frontend)
```

Hot-reload development:
```bash
npm run dev          # API on :3000 + Angular dev server on :4200 (proxies /api to :3000)
```
`ng serve` alone only starts the UI; without the API on :3000, every request fails. Use `npm run dev`, or run `npm run server` and `npm run web` in two terminals.

Data is stored in `./data/app.db` (override with `DB_PATH`). Set `SESSION_SECRET` in any shared environment.

## Test
```bash
npm test
```
Covers auth, owner/editor/viewer permissions, revoke, validation, HTML sanitization and file import.

## Demo accounts (seeded, no passwords)
| User | Email |
|---|---|
| Alice (owns the seeded welcome doc) | alice@example.com |
| Bob (viewer on the welcome doc) | bob@example.com |
| Carol | carol@example.com |

**Sharing demo:** sign in as Alice, open a document, share it with Carol as *Can edit*. Use *Switch user*, sign in as Carol, and open it from *Shared with me*. Try *View only* to see editing disabled.

## Supported upload types
`.txt`, `.md`, `.docx` only. The UI states this and the server enforces it. `.docx` import keeps headings, bold/italic and lists; images and complex layout are dropped.

## API summary
| Method | Path | Notes |
|---|---|---|
| POST | /api/login | `{email}` returns a signed bearer token |
| GET/POST | /api/documents | list (owned + shared) / create |
| GET/PUT/DELETE | /api/documents/:id | PUT needs owner or editor; DELETE owner only |
| POST | /api/documents/import | multipart field `file` |
| POST/DELETE | /api/documents/:id/shares[/:userId] | owner only |

## Deploy
A `Dockerfile` and `render.yaml` are included (Render free tier, Docker runtime). Free tier storage is ephemeral, so documents reset on redeploy; seeded users are recreated automatically. Attach a disk and set `DB_PATH=/data/app.db` for durable storage.
