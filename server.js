import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from './src/env.js';
import { readDeadlines, writeDeadlines } from './src/github-repo.js';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const WEB_ROOT = join(ROOT, 'web');
loadEnvFile(join(ROOT, '.env'));

const port = Number(process.env.PORT || 4173);
const origin = `http://127.0.0.1:${port}`;
const syncEnvNames = [
  'CITD_ICS_URL',
  'JIRA_DOMAIN',
  'JIRA_EMAIL',
  'JIRA_API_TOKEN',
  'GH_PAT',
  'GITHUB_REPOSITORY',
];
let syncState = {
  running: false,
  startedAt: null,
  completedAt: null,
  success: null,
  error: null,
};

function jsonResponse(response, status, value) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(JSON.stringify(value));
}

function credentials() {
  const token = process.env.GH_PAT?.trim();
  const repository = process.env.GITHUB_REPOSITORY?.trim();
  if (!token || !repository) {
    throw new Error('Cấu hình GH_PAT và GITHUB_REPOSITORY trong file .env trước khi sử dụng.');
  }
  return { token, repository };
}

function startLocalSync() {
  const missing = syncEnvNames.filter((name) => !process.env[name]?.trim());
  if (missing.length) {
    throw new Error(`Thiếu cấu hình trong .env: ${missing.join(', ')}`);
  }

  const startedAt = new Date().toISOString();
  syncState = { running: true, startedAt, completedAt: null, success: null, error: null };
  const child = spawn(process.execPath, ['src/sync.js'], {
    cwd: ROOT,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let output = '';
  let launchError = null;
  const capture = (chunk) => {
    output = `${output}${chunk.toString()}`.slice(-4000);
  };
  child.stdout.on('data', capture);
  child.stderr.on('data', capture);
  child.on('error', (error) => { launchError = error; });
  child.on('close', (code) => {
    const success = code === 0;
    syncState = {
      running: false,
      startedAt,
      completedAt: new Date().toISOString(),
      success,
      error: success ? null : launchError?.message || output.trim() || `Đồng bộ thoát với mã ${code}.`,
    };
  });
}

async function readJsonBody(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 16_384) throw new Error('Nội dung gửi lên vượt giới hạn.');
  }
  try {
    return JSON.parse(body);
  } catch {
    throw new Error('JSON gửi lên không hợp lệ.');
  }
}

async function serveStatic(pathname, response) {
  const files = {
    '/': 'index.html',
    '/index.html': 'index.html',
    '/app.js': 'app.js',
    '/styles.css': 'styles.css',
  };
  const file = files[pathname];
  if (!file) return false;

  const safePath = normalize(join(WEB_ROOT, file));
  const content = await readFile(safePath);
  const type = extname(file) === '.html' ? 'text/html; charset=utf-8'
    : extname(file) === '.js' ? 'text/javascript; charset=utf-8'
      : 'text/css; charset=utf-8';
  response.writeHead(200, {
    'Content-Type': type,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
  });
  response.end(content);
  return true;
}

const server = createServer(async (request, response) => {
  if (request.headers.host !== `127.0.0.1:${port}`) {
    return jsonResponse(response, 403, { error: 'Chỉ cho phép truy cập qua 127.0.0.1.' });
  }

  const requestOrigin = request.headers.origin;
  if (requestOrigin && requestOrigin !== origin) {
    return jsonResponse(response, 403, { error: 'Origin không được phép.' });
  }

  const url = new URL(request.url || '/', origin);
  try {
    if (request.method === 'GET' && url.pathname === '/api/deadlines') {
      const { token, repository } = credentials();
      const { data } = await readDeadlines(token, repository);
      return jsonResponse(response, 200, data);
    }

    if (request.method === 'GET' && url.pathname === '/api/sync/status') {
      return jsonResponse(response, 200, syncState);
    }

    if (request.method === 'POST' && url.pathname === '/api/sync') {
      if (requestOrigin !== origin) {
        return jsonResponse(response, 403, { error: 'Origin không được phép.' });
      }
      if (syncState.running) {
        return jsonResponse(response, 409, { error: 'Một lần đồng bộ khác đang chạy.' });
      }
      startLocalSync();
      return jsonResponse(response, 202, { started: true });
    }

    const submissionMatch = url.pathname.match(/^\/api\/items\/([^/]+)\/submission$/);
    if (request.method === 'POST' && submissionMatch) {
      if (requestOrigin !== origin) {
        return jsonResponse(response, 403, { error: 'Origin không được phép.' });
      }
      const input = await readJsonBody(request);
      if (typeof input.submitted !== 'boolean') {
        return jsonResponse(response, 400, { error: 'Trường submitted phải là boolean.' });
      }
      const { token, repository } = credentials();
      const { data, sha } = await readDeadlines(token, repository);
      const itemId = decodeURIComponent(submissionMatch[1]);
      const item = (data.items || []).find((entry) => entry.id === itemId);
      if (!item || item.source !== 'CITD') {
        return jsonResponse(response, 404, { error: 'Không tìm thấy bài CITD.' });
      }

      item.submitted_at = input.submitted ? new Date().toISOString() : null;
      await writeDeadlines(token, repository, data, sha, 'Update CITD submission status');
      return jsonResponse(response, 200, { item });
    }

    if (request.method === 'GET' && await serveStatic(url.pathname, response)) return;
    return jsonResponse(response, 404, { error: 'Không tìm thấy đường dẫn.' });
  } catch (error) {
    return jsonResponse(response, 500, { error: error.message || 'Lỗi máy chủ.' });
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Deadline Tracker đang chạy tại ${origin}`);
});

server.on('error', (error) => {
  console.error(`Không thể khởi động máy chủ: ${error.message}`);
  process.exitCode = 1;
});
