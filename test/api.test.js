'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../server/app');

let server;
let base;

before(async () => {
  const app = createApp({ dbPath: ':memory:', secret: 'test-secret' });
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

async function api(path, { method = 'GET', token, body, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(base + path, { method, headers, body: payload });
  const text = await res.text();
  return { status: res.status, data: text ? JSON.parse(text) : null };
}

const login = async (email) => (await api('/api/login', { method: 'POST', body: { email } })).data.token;

test('requests without a token are rejected', async () => {
  assert.equal((await api('/api/documents')).status, 401);
});

test('unknown user cannot log in', async () => {
  assert.equal((await api('/api/login', { method: 'POST', body: { email: 'nobody@example.com' } })).status, 401);
});

test('sharing: access is private until shared, then role-limited', async () => {
  const alice = await login('alice@example.com');
  const carol = await login('carol@example.com');

  const created = await api('/api/documents', { method: 'POST', token: alice, body: { title: 'Plan' } });
  assert.equal(created.status, 201);
  const id = created.data.id;
  assert.equal(created.data.access, 'owner');

  // Carol has no access yet; existence must not leak.
  assert.equal((await api(`/api/documents/${id}`, { token: carol })).status, 404);

  // Share as viewer: can read, cannot write.
  const shared = await api(`/api/documents/${id}/shares`, {
    method: 'POST', token: alice, body: { email: 'carol@example.com', role: 'viewer' },
  });
  assert.equal(shared.status, 201);
  const read = await api(`/api/documents/${id}`, { token: carol });
  assert.equal(read.status, 200);
  assert.equal(read.data.access, 'viewer');
  assert.equal((await api(`/api/documents/${id}`, { method: 'PUT', token: carol, body: { content: '<p>x</p>' } })).status, 403);

  // Upgrade to editor: can write, still cannot share or delete.
  await api(`/api/documents/${id}/shares`, { method: 'POST', token: alice, body: { email: 'carol@example.com', role: 'editor' } });
  const edit = await api(`/api/documents/${id}`, { method: 'PUT', token: carol, body: { content: '<p>hello</p>' } });
  assert.equal(edit.status, 200);
  assert.equal(edit.data.content, '<p>hello</p>');
  assert.equal((await api(`/api/documents/${id}/shares`, { method: 'POST', token: carol, body: { email: 'bob@example.com', role: 'viewer' } })).status, 403);
  assert.equal((await api(`/api/documents/${id}`, { method: 'DELETE', token: carol })).status, 403);

  // Owned vs shared are distinguishable in the list.
  const carolList = (await api('/api/documents', { token: carol })).data;
  assert.equal(carolList.find((d) => d.id === id).access, 'editor');
  const aliceList = (await api('/api/documents', { token: alice })).data;
  assert.equal(aliceList.find((d) => d.id === id).access, 'owner');

  // Revoking removes access.
  const carolId = (await api('/api/me', { token: carol })).data.id;
  await api(`/api/documents/${id}/shares/${carolId}`, { method: 'DELETE', token: alice });
  assert.equal((await api(`/api/documents/${id}`, { token: carol })).status, 404);
});

test('validation: empty title, bad role, bad id', async () => {
  const alice = await login('alice@example.com');
  const { data } = await api('/api/documents', { method: 'POST', token: alice, body: {} });
  assert.equal((await api(`/api/documents/${data.id}`, { method: 'PUT', token: alice, body: { title: '   ' } })).status, 400);
  assert.equal((await api(`/api/documents/${data.id}/shares`, { method: 'POST', token: alice, body: { email: 'bob@example.com', role: 'admin' } })).status, 400);
  assert.equal((await api('/api/documents/abc', { token: alice })).status, 400);
});

test('stored content is sanitized', async () => {
  const alice = await login('alice@example.com');
  const { data } = await api('/api/documents', { method: 'POST', token: alice, body: {} });
  const res = await api(`/api/documents/${data.id}`, {
    method: 'PUT', token: alice,
    body: { content: '<p onclick="x()">Hi <strong>there</strong></p><script>alert(1)</script>' },
  });
  assert.equal(res.data.content, '<p>Hi <strong>there</strong></p>');
});

test('upload: .txt becomes an editable document, other types are rejected', async () => {
  const alice = await login('alice@example.com');

  const form = new FormData();
  form.append('file', new Blob(['First paragraph\n\nSecond <b>paragraph</b>']), 'meeting-notes.txt');
  const ok = await api('/api/documents/import', { method: 'POST', token: alice, form });
  assert.equal(ok.status, 201);
  assert.equal(ok.data.title, 'meeting-notes');
  assert.equal(ok.data.content, '<p>First paragraph</p><p>Second &lt;b&gt;paragraph&lt;/b&gt;</p>');

  const bad = new FormData();
  bad.append('file', new Blob(['MZ']), 'virus.exe');
  const rejected = await api('/api/documents/import', { method: 'POST', token: alice, form: bad });
  assert.equal(rejected.status, 400);
  assert.match(rejected.data.error, /Unsupported file type/);
});

test('upload: .md keeps formatting, even with a UTF-8 BOM', async () => {
  const alice = await login('alice@example.com');
  const form = new FormData();
  form.append('file', new Blob(['﻿# Plan\n\n**bold** text\n\n- one\n- two']), 'plan.md');
  const res = await api('/api/documents/import', { method: 'POST', token: alice, form });
  assert.equal(res.status, 201);
  assert.match(res.data.content, /^<h1>Plan<\/h1>/);
  assert.match(res.data.content, /<strong>bold<\/strong>/);
  assert.match(res.data.content, /<ul>\s*<li>one<\/li>/);
});

test('seed data: Bob sees the welcome document shared by Alice', async () => {
  const bob = await login('bob@example.com');
  const list = (await api('/api/documents', { token: bob })).data;
  const welcome = list.find((d) => d.title.startsWith('Welcome'));
  assert.ok(welcome);
  assert.equal(welcome.access, 'viewer');
});
