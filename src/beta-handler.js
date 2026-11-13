import { timingSafeEqual } from 'node:crypto';
import { extname, join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  authenticateAccessToken,
  getUserIntegration,
  listUserDeadlines,
  publicSupabaseConfiguration,
  saveUserIntegration,
  syncAllUserIntegrations,
  syncUserIntegration,
  updateUserSubmission,
} from './beta-data.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const WEB_ROOT = join(ROOT, 'web');

function jsonResponse(response, status, value) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(JSON.stringify(value));
}

function secretsMatch(received, expected) {
  const receivedBytes = Buffer.from(received);
  const expectedBytes = Buffer.from(expected);
  return receivedBytes.length === expectedBytes.length && timingSafeEqual(receivedBytes, expectedBytes);
}

async function readJsonBody(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk.toString();
    if (body.length > 16_384) throw new Error('Nội dung gửi lên vượt giới hạn.');
  }
  try {
    return JSON.parse(body);
  } catch {
    throw new Error('JSON gửi lên không hợp lệ.');
  }
}

async function serveBetaStatic(pathname, response) {
  const files = {
    '/': 'beta.html',
    '/index.html': 'beta.html',
    '/beta.css': 'beta.css',
    '/beta-app.js': 'beta-app.bundle.js',
  };
  const file = files[pathname];
  if (!file) return false;
  const content = await readFile(join(WEB_ROOT, file));
  const type = extname(file) === '.html' ? 'text/html; charset=utf-8'
    : extname(file) === '.js' ? 'text/javascript; charset=utf-8'
      : 'text/css; charset=utf-8';
  let connectSource = "'self'";
  try {
    connectSource = `'self' ${new URL(process.env.SUPABASE_URL).origin}`;
  } catch {
    // Keep a same-origin policy while the beta's Supabase settings are incomplete.
  }
  response.writeHead(200, {
    'Content-Type': type,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': `default-src 'self'; connect-src ${connectSource}; img-src 'self' data:; style-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'`,
  });
  response.end(content);
  return true;
}

function accessTokenFrom(request) {
  const authorization = request.headers.authorization || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || '';
}

export async function betaHandler(request, response) {
  const isVercel = process.env.VERCEL === '1';
  const requestHost = (request.headers['x-forwarded-host'] || request.headers.host || '').split(',')[0].trim();
  const requestProtocol = (request.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const requestOrigin = isVercel ? `${requestProtocol}://${requestHost}` : `http://127.0.0.1:${process.env.PORT || 4173}`;
  if (isVercel ? !requestHost : requestHost !== `127.0.0.1:${process.env.PORT || 4173}`) {
    return jsonResponse(response, 403, { error: 'Yêu cầu không hợp lệ.' });
  }
  const suppliedOrigin = request.headers.origin;
  if (suppliedOrigin && suppliedOrigin !== requestOrigin) {
    return jsonResponse(response, 403, { error: 'Origin không được phép.' });
  }

  const url = new URL(request.url || '/', requestOrigin);
  const routedPath = url.searchParams.get('path');
  const pathname = routedPath === null ? url.pathname : `/${routedPath.replace(/^\/+/, '')}`;

  if (request.method === 'GET' && pathname === '/api/config') {
    try {
      return jsonResponse(response, 200, publicSupabaseConfiguration());
    } catch {
      return jsonResponse(response, 503, { error: 'Bản beta chưa được nối với Supabase.' });
    }
  }

  if (isVercel && request.method === 'GET' && pathname === '/api/cron/sync') {
    const expectedAuthorization = process.env.CRON_SECRET ? `Bearer ${process.env.CRON_SECRET}` : '';
    if (!expectedAuthorization || !secretsMatch(request.headers.authorization || '', expectedAuthorization)) {
      return jsonResponse(response, 401, { error: 'Không được phép chạy tác vụ định kỳ.' });
    }
    try {
      const result = await syncAllUserIntegrations();
      return jsonResponse(response, 200, { success: true, ...result, completed_at: new Date().toISOString() });
    } catch (error) {
      console.error('Đồng bộ beta theo lịch thất bại:', error.message || error);
      return jsonResponse(response, 500, { error: 'Không thể đồng bộ các feed beta.' });
    }
  }

  if (request.method === 'GET' && await serveBetaStatic(pathname, response)) return;
  if (!pathname.startsWith('/api/')) return jsonResponse(response, 404, { error: 'Không tìm thấy đường dẫn.' });

  const token = accessTokenFrom(request);
  let identity;
  try {
    identity = await authenticateAccessToken(token);
  } catch {
    return jsonResponse(response, 503, { error: 'Không thể kiểm tra phiên đăng nhập.' });
  }
  if (!identity) return jsonResponse(response, 401, { error: 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.' });

  const { client, user } = identity;
  try {
    if (request.method === 'GET' && pathname === '/api/deadlines') {
      const items = await listUserDeadlines(client);
      const integration = await getUserIntegration(client, user.id);
      return jsonResponse(response, 200, { updated_at: integration?.last_synced_at || null, items });
    }

    if (request.method === 'GET' && pathname === '/api/integration') {
      const integration = await getUserIntegration(client, user.id);
      return jsonResponse(response, 200, {
        configured: Boolean(integration),
        last_synced_at: integration?.last_synced_at || null,
      });
    }

    if (request.method === 'PUT' && pathname === '/api/integration') {
      if (suppliedOrigin !== requestOrigin) return jsonResponse(response, 403, { error: 'Origin không được phép.' });
      const input = await readJsonBody(request);
      await saveUserIntegration(client, user.id, input);
      return jsonResponse(response, 200, { configured: true });
    }

    if (request.method === 'POST' && pathname === '/api/sync') {
      if (suppliedOrigin !== requestOrigin) return jsonResponse(response, 403, { error: 'Origin không được phép.' });
      const result = await syncUserIntegration(client, user.id);
      return jsonResponse(response, 200, { success: true, ...result });
    }

    const submissionMatch = pathname.match(/^\/api\/items\/([^/]+)\/submission$/);
    if (request.method === 'POST' && submissionMatch) {
      if (suppliedOrigin !== requestOrigin) return jsonResponse(response, 403, { error: 'Origin không được phép.' });
      const input = await readJsonBody(request);
      if (typeof input.submitted !== 'boolean') return jsonResponse(response, 400, { error: 'submitted phải là boolean.' });
      const item = await updateUserSubmission(client, user.id, decodeURIComponent(submissionMatch[1]), input.submitted);
      return jsonResponse(response, 200, { item });
    }

    return jsonResponse(response, 404, { error: 'Không tìm thấy đường dẫn.' });
  } catch (error) {
    const message = error.message || 'Yêu cầu thất bại.';
    const clientError = /feed|url|https|ics|hệ thống|tìm thấy|vượt giới hạn|boolean|json/i.test(message);
    return jsonResponse(response, clientError ? 400 : 500, { error: message });
  }
}
