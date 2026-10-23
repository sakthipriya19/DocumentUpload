'use strict';
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const express = require('express');
const multer = require('multer');
const sanitizeHtml = require('sanitize-html');
const mammoth = require('mammoth');
const { marked } = require('marked');
const { openDb } = require('./db');

const MAX_TITLE = 200;
const MAX_CONTENT = 500_000; // characters of HTML
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
const ALLOWED_EXT = ['.txt', '.md', '.docx'];

// Only the formatting the editor can produce is allowed to be stored/rendered.
const SANITIZE = {
  allowedTags: ['p', 'br', 'h1', 'h2', 'h3', 'strong', 'em', 'u', 's', 'ul', 'ol', 'li', 'a', 'blockquote'],
  allowedAttributes: { a: ['href'] },
  allowedSchemes: ['http', 'https', 'mailto'],
};
const clean = (html) => sanitizeHtml(html, SANITIZE);

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const escapeHtml = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function textToHtml(text) {
  return text
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

// Strip a UTF-8 BOM (common from Windows editors) so a leading "# Heading" still parses.
const readText = (buffer) => buffer.toString('utf8').replace(/^﻿/, '');

async function fileToHtml(file) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ext === '.txt') return textToHtml(readText(file.buffer));
  if (ext === '.md') return clean(marked.parse(readText(file.buffer), { async: false }));
  if (ext === '.docx') {
    try {
      const { value } = await mammoth.convertToHtml({ buffer: file.buffer });
      return clean(value);
    } catch {
      throw new HttpError(422, 'Could not read this .docx file. Is it a valid Word document?');
    }
  }
  throw new HttpError(400, `Unsupported file type. Allowed: ${ALLOWED_EXT.join(', ')}`);
}

function createApp({ dbPath = ':memory:', secret = 'dev-secret-change-me', staticDir } = {}) {
  const db = openDb(dbPath);
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  // ---- lightweight auth: seeded users, signed bearer token ----
  const sign = (userId) =>
    `${userId}.${crypto.createHmac('sha256', secret).update(String(userId)).digest('hex')}`;

  function verify(token) {
    const [id, mac] = String(token || '').split('.');
    if (!id || !mac) return null;
    const expected = crypto.createHmac('sha256', secret).update(id).digest('hex');
    const a = Buffer.from(mac);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    return db.prepare('SELECT id, email, name FROM users WHERE id = ?').get(Number(id)) || null;
  }

  function requireAuth(req, _res, next) {
    const header = req.get('authorization') || '';
    const user = verify(header.startsWith('Bearer ') ? header.slice(7) : '');
    if (!user) return next(new HttpError(401, 'Please sign in.'));
    req.user = user;
    next();
  }

  const asyncH = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

  function parseId(raw) {
    const id = Number(raw);
    if (!Number.isInteger(id) || id < 1) throw new HttpError(400, 'Invalid document id.');
    return id;
  }

  // Returns the doc plus the caller's access level. Non-members get a 404 so
  // document existence is not leaked.
  function loadDoc(id, userId) {
    const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(id);
    if (!doc) throw new HttpError(404, 'Document not found.');
    if (doc.owner_id === userId) return { doc, access: 'owner' };
    const share = db.prepare('SELECT role FROM shares WHERE doc_id = ? AND user_id = ?').get(id, userId);
    if (!share) throw new HttpError(404, 'Document not found.');
    return { doc, access: share.role };
  }

  function listShares(docId) {
    return db
      .prepare(
        `SELECT u.id AS userId, u.email, u.name, s.role
           FROM shares s JOIN users u ON u.id = s.user_id
          WHERE s.doc_id = ? ORDER BY u.name`
      )
      .all(docId)
      .map((r) => ({ ...r }));
  }

  function serialize(doc, access) {
    const owner = db.prepare('SELECT name, email FROM users WHERE id = ?').get(doc.owner_id);
    return {
      id: doc.id,
      title: doc.title,
      content: doc.content,
      updatedAt: doc.updated_at,
      access,
      ownerName: owner.name,
      ownerEmail: owner.email,
      shares: access === 'owner' ? listShares(doc.id) : [],
    };
  }

  function validateTitle(title) {
    if (typeof title !== 'string' || !title.trim()) throw new HttpError(400, 'Title cannot be empty.');
    if (title.trim().length > MAX_TITLE) throw new HttpError(400, `Title must be at most ${MAX_TITLE} characters.`);
    return title.trim();
  }

  function insertDoc(ownerId, title, content) {
    const now = new Date().toISOString();
    const info = db
      .prepare('INSERT INTO documents (owner_id, title, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run(ownerId, title, content, now, now);
    return Number(info.lastInsertRowid);
  }

  // ---------------- routes ----------------
  app.get('/api/health', (_req, res) => res.json({ ok: true }));

  // Demo only: lets the login screen show the seeded accounts.
  app.get('/api/users', (_req, res) => {
    res.json(db.prepare('SELECT id, email, name FROM users ORDER BY id').all().map((u) => ({ ...u })));
  });

  app.post('/api/login', (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const user = db.prepare('SELECT id, email, name FROM users WHERE email = ?').get(email);
    if (!user) throw new HttpError(401, 'Unknown user. Use one of the seeded demo accounts.');
    res.json({ token: sign(user.id), user: { ...user } });
  });

  app.get('/api/me', requireAuth, (req, res) => res.json(req.user));

  app.get('/api/documents', requireAuth, (req, res) => {
    const rows = db
      .prepare(
        `SELECT d.id, d.title, d.updated_at AS updatedAt, u.name AS ownerName, u.email AS ownerEmail, 'owner' AS access
           FROM documents d JOIN users u ON u.id = d.owner_id WHERE d.owner_id = ?
         UNION ALL
         SELECT d.id, d.title, d.updated_at AS updatedAt, u.name AS ownerName, u.email AS ownerEmail, s.role AS access
           FROM documents d JOIN users u ON u.id = d.owner_id
           JOIN shares s ON s.doc_id = d.id WHERE s.user_id = ?
         ORDER BY updatedAt DESC`
      )
      .all(req.user.id, req.user.id);
    res.json(rows.map((r) => ({ ...r })));
  });

  app.post('/api/documents', requireAuth, (req, res) => {
    const title = req.body?.title === undefined ? 'Untitled document' : validateTitle(req.body.title);
    const id = insertDoc(req.user.id, title, '');
    const { doc, access } = loadDoc(id, req.user.id);
    res.status(201).json(serialize(doc, access));
  });

  app.get('/api/documents/:id', requireAuth, (req, res) => {
    const { doc, access } = loadDoc(parseId(req.params.id), req.user.id);
    res.json(serialize(doc, access));
  });

  app.put('/api/documents/:id', requireAuth, (req, res) => {
    const { doc, access } = loadDoc(parseId(req.params.id), req.user.id);
    if (access === 'viewer') throw new HttpError(403, 'You have view-only access to this document.');
    const body = req.body || {};
    let title = doc.title;
    let content = doc.content;
    if (body.title !== undefined) title = validateTitle(body.title);
    if (body.content !== undefined) {
      if (typeof body.content !== 'string') throw new HttpError(400, 'Content must be a string.');
      if (body.content.length > MAX_CONTENT) throw new HttpError(413, 'Document is too large.');
      content = clean(body.content);
    }
    const now = new Date().toISOString();
    db.prepare('UPDATE documents SET title = ?, content = ?, updated_at = ? WHERE id = ?').run(title, content, now, doc.id);
    res.json(serialize(loadDoc(doc.id, req.user.id).doc, access));
  });

  app.delete('/api/documents/:id', requireAuth, (req, res) => {
    const { doc, access } = loadDoc(parseId(req.params.id), req.user.id);
    if (access !== 'owner') throw new HttpError(403, 'Only the owner can delete a document.');
    db.prepare('DELETE FROM documents WHERE id = ?').run(doc.id);
    res.status(204).end();
  });

  // ---- sharing (owner only) ----
  app.post('/api/documents/:id/shares', requireAuth, (req, res) => {
    const { doc, access } = loadDoc(parseId(req.params.id), req.user.id);
    if (access !== 'owner') throw new HttpError(403, 'Only the owner can share this document.');
    const email = String(req.body?.email || '').trim().toLowerCase();
    const role = req.body?.role;
    if (!email) throw new HttpError(400, 'Enter an email to share with.');
    if (!['editor', 'viewer'].includes(role)) throw new HttpError(400, 'Role must be "editor" or "viewer".');
    const target = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (!target) throw new HttpError(404, 'No user with that email. Try alice@, bob@ or carol@example.com.');
    if (target.id === doc.owner_id) throw new HttpError(400, 'You already own this document.');
    db.prepare(
      `INSERT INTO shares (doc_id, user_id, role) VALUES (?, ?, ?)
       ON CONFLICT(doc_id, user_id) DO UPDATE SET role = excluded.role`
    ).run(doc.id, target.id, role);
    res.status(201).json(listShares(doc.id));
  });

  app.delete('/api/documents/:id/shares/:userId', requireAuth, (req, res) => {
    const { doc, access } = loadDoc(parseId(req.params.id), req.user.id);
    if (access !== 'owner') throw new HttpError(403, 'Only the owner can change sharing.');
    db.prepare('DELETE FROM shares WHERE doc_id = ? AND user_id = ?').run(doc.id, Number(req.params.userId));
    res.json(listShares(doc.id));
  });

  // ---- file upload: .txt / .md / .docx -> new editable document ----
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
    fileFilter: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      if (!ALLOWED_EXT.includes(ext)) {
        return cb(new HttpError(400, `Unsupported file type "${ext || 'unknown'}". Allowed: ${ALLOWED_EXT.join(', ')}`));
      }
      cb(null, true);
    },
  });

  app.post(
    '/api/documents/import',
    requireAuth,
    upload.single('file'),
    asyncH(async (req, res) => {
      if (!req.file) throw new HttpError(400, 'Choose a file to import.');
      const html = await fileToHtml(req.file);
      const baseName = path.basename(req.file.originalname, path.extname(req.file.originalname)).trim();
      const title = (baseName || 'Imported document').slice(0, MAX_TITLE);
      const id = insertDoc(req.user.id, title, html);
      const { doc, access } = loadDoc(id, req.user.id);
      res.status(201).json(serialize(doc, access));
    })
  );

  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Not found.')));

  // ---- serve the built Angular app (production) ----
  if (staticDir && fs.existsSync(staticDir)) {
    app.use(express.static(staticDir));
    app.use((req, res, next) => {
      if (req.method !== 'GET') return next();
      res.sendFile(path.join(staticDir, 'index.html'));
    });
  }

  // ---- error handling ----
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err instanceof multer.MulterError) {
      const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
      const msg = err.code === 'LIMIT_FILE_SIZE' ? 'File is too large (max 2 MB).' : err.message;
      return res.status(status).json({ error: msg });
    }
    const status = err.status || 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ error: status >= 500 ? 'Something went wrong.' : err.message });
  });

  return app;
}

module.exports = { createApp };
