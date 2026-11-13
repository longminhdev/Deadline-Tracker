import test from 'node:test';
import assert from 'node:assert/strict';
import { DATA_FILE_PATH, readDeadlines, writeDeadlines } from '../src/github-repo.js';

test('reads and decodes deadline JSON from a repository file', async () => {
  const originalFetch = globalThis.fetch;
  const expected = { updated_at: null, items: [] };
  globalThis.fetch = async (url, options) => {
    assert.match(url, new RegExp(`/contents/${DATA_FILE_PATH}$`));
    assert.equal(options.headers.Authorization, 'Bearer test-token');
    return new Response(JSON.stringify({
      encoding: 'base64',
      content: Buffer.from(JSON.stringify(expected)).toString('base64'),
      sha: 'file-sha',
    }));
  };

  try {
    assert.deepEqual(await readDeadlines('test-token', 'owner/repo'), {
      data: expected,
      sha: 'file-sha',
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('writes updated JSON using the current file SHA', async () => {
  const originalFetch = globalThis.fetch;
  const expected = { updated_at: '2026-11-13T00:00:00.000Z', items: [] };
  globalThis.fetch = async (url, options) => {
    assert.match(url, new RegExp(`/contents/${DATA_FILE_PATH}$`));
    assert.equal(options.method, 'PUT');
    const body = JSON.parse(options.body);
    assert.equal(body.sha, 'file-sha');
    assert.deepEqual(JSON.parse(Buffer.from(body.content, 'base64').toString('utf8')), expected);
    return new Response('{}', { status: 201 });
  };

  try {
    await writeDeadlines('test-token', 'owner/repo', expected, 'file-sha', 'test update');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('rejects invalid repository names before making a request', async () => {
  await assert.rejects(() => readDeadlines('test-token', 'invalid/repository/name'), /owner\/repository/);
});
