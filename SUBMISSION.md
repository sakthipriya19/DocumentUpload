# Submission contents

## Links
- Live app: **https://ajaia-docs-kqqm.onrender.com** (free tier: the first load may take ~30 s while the server wakes up)
- Walkthrough video: **(https://www.loom.com/share/0b254723c3d644c18edde4fe8586b337)** 
## Test accounts (no passwords)
alice@example.com, bob@example.com, carol@example.com. Bob already has view-only access to Alice's "Welcome" document.

## Files
| Path | Purpose |
|---|---|
| `server/` | Express API, SQLite schema/seed, access logic, upload handling |
| `src/` | Angular app (login, document list, editor, share panel) |
| `test/api.test.js` | Automated API tests (`npm test`) |
| `scripts/dev.js` | `npm run dev`: starts API + Angular dev server together |
| `README.md` | Setup, run, test, demo accounts, supported file types |
| `ARCHITECTURE.md` | Priorities, decisions, cuts, next steps |
| `AI_WORKFLOW.md` | AI tools and verification note |
| `Dockerfile`, `render.yaml` | Deployment |
| `VIDEO_URL.txt` | Walkthrough video link |

## Status
**Working:** create, rename, edit with rich text, autosave, reopen, persistence; .txt/.md/.docx import; share as editor or viewer, revoke, owned vs shared views; server-enforced permissions; validation and error messages.

**Incomplete / not built:** real-time collaboration (last write wins), real authentication, version history, export, comments.

**Next with 2-4 more hours:** optimistic concurrency, export to Markdown/PDF, presence indicators, Playwright share-flow test.
