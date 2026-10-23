# AI workflow note

## Tools used
- **Claude (Claude Code in VS Code)**: scaffolding, API and access logic, tests, docs, and the local install/build/test verification loop.

## Where AI materially sped things up
- Scaffolding the Angular 19 standalone project (angular.json, tsconfig, routes, interceptor, guard) without the CLI generator
- Drafting the REST API, SQLite schema and the owner/editor/viewer access checks
- Writing the first version of the API tests and the written deliverables

## What I changed or rejected
- **Storage driver:** chose Node's built-in `node:sqlite` over a native SQLite driver (`better-sqlite3`) so free hosts don't need to compile native modules.
- **Editor integration:** used Quill 2 directly instead of a wrapper library (`ngx-quill`), which means one fewer dependency to keep in step with Angular versions.
- **Auth scope:** cut a full signup/password system and used seeded users with an HMAC-signed token, which the brief allows.
- **Sanitizer:** tightened the HTML allow-list to only the tags the toolbar can produce.
- **Bugs found when I actually ran the AI-drafted code:**
  - `npm test` failed: the script passed a directory (`node --test test/`), which Node 22 treats as a module path. Fixed it to name the test file.
  - `npm run build` failed with NG8002: an interpolated `aria-label` on a button. Changed it to `[attr.aria-label]`.
  - `multer@1.x` (with known vulnerabilities) was flagged on install. Upgraded to `multer@2`; the API is unchanged and the tests still pass.
  - A manual import smoke test showed that a `.md` file saved with a UTF-8 BOM (common on Windows) lost its first heading. Now strip the BOM and added a regression test.

## How I verified correctness, UX and reliability
- `npm test`: **8/8 passing**. Covers auth, owner/editor/viewer permissions, revoke, validation, HTML sanitization, .txt and .md import (including the BOM case), rejection of unsupported types, and seed data.
- Production build (`npm run build`) and `npm start`: served the SPA plus deep links, then ran login, create and import against the running server with curl.
- Manual browser walkthrough on the deployed URL: create, format, rename, refresh, import, share as editor and viewer, switch user, confirm the view-only toolbar is hidden and the API returns 403.

## Honest limitations
- Concurrent edits are last-write-wins; version checks (optimistic concurrency) would come next.
- On the Render free tier, data resets on redeploy or restart (no persistent disk).
