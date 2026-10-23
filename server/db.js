'use strict';
const fs = require('node:fs');
const path = require('node:path');
// Built-in SQLite (Node >= 22.13): no native compilation needed on any host.
const { DatabaseSync } = require('node:sqlite');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id    INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  name  TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS documents (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  content    TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS shares (
  doc_id  INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role    TEXT NOT NULL CHECK (role IN ('editor','viewer')),
  PRIMARY KEY (doc_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_documents_owner ON documents(owner_id);
CREATE INDEX IF NOT EXISTS idx_shares_user ON shares(user_id);
`;

const SEED_USERS = [
  ['alice@example.com', 'Alice Owner'],
  ['bob@example.com', 'Bob Reviewer'],
  ['carol@example.com', 'Carol Teammate'],
];

function seed(db) {
  const count = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if (count > 0) return;
  const insertUser = db.prepare('INSERT INTO users (email, name) VALUES (?, ?)');
  for (const [email, name] of SEED_USERS) insertUser.run(email, name);

  const now = new Date().toISOString();
  const alice = db.prepare('SELECT id FROM users WHERE email = ?').get('alice@example.com').id;
  const bob = db.prepare('SELECT id FROM users WHERE email = ?').get('bob@example.com').id;
  const welcome =
    '<h1>Welcome to Ajaia Docs</h1>' +
    '<p>This document is owned by <strong>Alice</strong> and shared with Bob as a <em>viewer</em>.</p>' +
    '<ul><li>Try the formatting toolbar</li><li>Import a .txt, .md or .docx file from the dashboard</li></ul>';
  const info = db
    .prepare('INSERT INTO documents (owner_id, title, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
    .run(alice, 'Welcome (shared with Bob)', welcome, now, now);
  db.prepare('INSERT INTO shares (doc_id, user_id, role) VALUES (?, ?, ?)').run(Number(info.lastInsertRowid), bob, 'viewer');
}

function openDb(dbPath = ':memory:') {
  if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  seed(db);
  return db;
}

module.exports = { openDb };
