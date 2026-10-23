# Architecture note

## What I prioritized
1. **A complete vertical slice** (create, edit, save, reopen, import, share) over breadth of editor features.
2. **Access logic on the server.** Every document route resolves the caller's access (`owner` / `editor` / `viewer`) in one function, `loadDoc`. The UI hides controls, but the API is the source of truth (a viewer's PUT returns 403).
3. **Safe, portable persistence.** Content is stored as sanitized HTML.

## Stack and why
- **Angular 19, standalone components + signals**: no NgModules, small surface, strict TypeScript and strict templates. Functional interceptor (adds the token, handles 401) and functional route guard.
- **Quill 2**: mature rich-text editor with exactly the toolbar required; avoids hand-rolling `contenteditable`.
- **Express + `node:sqlite`**: zero native build steps, so the same code runs locally, in Docker and on free hosts. Three tables: `users`, `documents`, `shares(doc_id, user_id, role)`.
- **One deployable**: Express serves the built Angular bundle, so there is a single URL and no CORS.

## Key decisions
- **Auth is simulated**: seeded users and an HMAC-signed bearer token. The brief allows mocked auth; real auth would be the first thing to replace.
- **404 instead of 403 for non-members**, so document ids do not leak existence.
- **Sharing is an upsert** on `(doc, user)`: re-sharing changes the role. Only the owner can share, revoke or delete. Editors can edit and rename.
- **Sanitize on write** (`sanitize-html` allow-list that mirrors the toolbar). Quill output and imported Markdown/DOCX both pass through it, which limits stored XSS.
- **Import pipeline**: `.txt` is escaped into paragraphs, `.md` uses `marked`, `.docx` uses `mammoth`; all then sanitized and saved as a new document owned by the importer.
- **Autosave** is debounced (800 ms) and flushed on navigation away; the status line shows saving/saved/failed.

## Deliberately deprioritized
- Real-time co-editing (last write wins; two editors can overwrite each other)
- Real authentication, password reset, invitations to non-existing users
- Version history, comments, export
- Image support in editor/import, pagination, search

## What I would build next (2-4 hours)
1. Optimistic concurrency (`updated_at` / version check, conflict message)
2. Version history or Markdown/PDF export
3. Presence indicator via SSE or WebSocket
4. Angular component tests and a Playwright smoke test for the share flow
