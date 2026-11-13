import { createClient } from '@supabase/supabase-js';
import { parseICS } from './core.js';
import { decryptIcsUrl, encryptIcsUrl } from './ics-crypto.js';

function readPublicSupabaseConfiguration() {
  const url = process.env.SUPABASE_URL?.trim();
  const anonKey = process.env.SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) {
    throw new Error('Chưa cấu hình Supabase cho bản beta.');
  }
  return { url: url.replace(/\/$/, ''), anonKey };
}

function supabaseConfiguration() {
  const config = readPublicSupabaseConfiguration();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!serviceRoleKey) throw new Error('Chưa cấu hình khóa máy chủ Supabase cho bản beta.');
  return { ...config, serviceRoleKey };
}

function userClient(accessToken) {
  const { url, anonKey } = supabaseConfiguration();
  return createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

function adminClient() {
  const { url, serviceRoleKey } = supabaseConfiguration();
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function publicSupabaseConfiguration() {
  return readPublicSupabaseConfiguration();
}

export async function authenticateAccessToken(accessToken) {
  if (!accessToken) return null;
  const client = userClient(accessToken);
  const { data, error } = await client.auth.getUser(accessToken);
  if (error || !data.user) return null;
  return { client, user: data.user };
}

export async function listUserDeadlines(client) {
  const { data, error } = await client
    .from('deadline_items')
    .select('id, source, group_name, course_name, instructor, title, due_at, submitted_at, url')
    .order('due_at', { ascending: true });
  if (error) throw error;
  return (data || []).map((item) => ({ ...item, group: item.group_name || '' }));
}

export async function getUserIntegration(client, userId) {
  const { data, error } = await client
    .from('user_integrations')
    .select('user_id, ics_url_encrypted, last_synced_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

function validateIcsUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Nhập URL feed lịch ICS hợp lệ.');
  }
  const hostname = url.hostname.toLowerCase();
  const allowedHosts = (process.env.ICS_ALLOWED_HOSTS || '')
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
  if (url.protocol !== 'https:' || (url.port && url.port !== '443') || url.username || url.password || !allowedHosts.includes(hostname)) {
    throw new Error('Feed phải dùng HTTPS và thuộc hệ thống eLearning đã được phép cho bản beta.');
  }
  return url.href;
}

export async function saveUserIntegration(client, userId, input) {
  const icsUrl = validateIcsUrl(input?.ics_url);
  const { error } = await client.from('user_integrations').upsert({
    user_id: userId,
    ics_url_encrypted: encryptIcsUrl(icsUrl),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });
  if (error) throw error;
}

async function loadCalendar(icsUrl) {
  const response = await fetch(icsUrl, {
    redirect: 'error',
    headers: {
      Accept: 'text/calendar, text/plain;q=0.9, */*;q=0.8',
      'User-Agent': 'DeadlineTracker/1.0',
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Feed ICS trả về HTTP ${response.status}.`);
  const text = await response.text();
  if (!text.includes('BEGIN:VCALENDAR')) throw new Error('Feed không chứa iCalendar hợp lệ.');
  return parseICS(text);
}

async function syncWithClient(client, userId, integration) {
  const icsUrl = decryptIcsUrl(integration.ics_url_encrypted);
  const parsedItems = await loadCalendar(icsUrl);
  const { data: previousItems, error: previousError } = await client
    .from('deadline_items')
    .select('external_id, submitted_at')
    .eq('user_id', userId)
    .eq('source', 'CITD');
  if (previousError) throw previousError;

  const previousSubmissions = new Map((previousItems || []).map((item) => [item.external_id, item.submitted_at]));
  const updatedAt = new Date().toISOString();
  const rows = parsedItems.map((item) => ({
    user_id: userId,
    external_id: item.id,
    source: 'CITD',
    group_name: item.group || null,
    course_name: item.course_name || null,
    instructor: item.instructor || null,
    title: item.title || '(Không có tiêu đề)',
    due_at: item.due_at,
    submitted_at: previousSubmissions.get(item.id) || null,
    url: item.url || null,
    synced_at: updatedAt,
  }));

  if (rows.length) {
    const { error } = await client.from('deadline_items').upsert(rows, { onConflict: 'user_id,external_id' });
    if (error) throw error;
  }
  const { error: integrationError } = await client
    .from('user_integrations')
    .update({ last_synced_at: updatedAt, updated_at: updatedAt })
    .eq('user_id', userId);
  if (integrationError) throw integrationError;
  return { count: rows.length, completed_at: updatedAt };
}

export async function syncUserIntegration(client, userId) {
  const integration = await getUserIntegration(client, userId);
  if (!integration) throw new Error('Hãy lưu feed ICS của bạn trước khi đồng bộ.');
  return syncWithClient(client, userId, integration);
}

export async function syncAllUserIntegrations() {
  const admin = adminClient();
  const { data: integrations, error } = await admin
    .from('user_integrations')
    .select('user_id, ics_url_encrypted');
  if (error) throw error;

  const results = [];
  for (const integration of integrations || []) {
    try {
      const result = await syncWithClient(admin, integration.user_id, integration);
      results.push({ success: true, ...result });
    } catch (syncError) {
      console.error('Đồng bộ feed beta thất bại:', syncError.message || syncError);
      results.push({ success: false });
    }
  }
  return {
    users: (integrations || []).length,
    succeeded: results.filter((result) => result.success).length,
    failed: results.filter((result) => !result.success).length,
  };
}

export async function updateUserSubmission(client, userId, itemId, submitted) {
  const { data, error } = await client
    .from('deadline_items')
    .update({ submitted_at: submitted ? new Date().toISOString() : null })
    .eq('id', itemId)
    .eq('user_id', userId)
    .eq('source', 'CITD')
    .select('id, source, group_name, course_name, instructor, title, due_at, submitted_at, url')
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Không tìm thấy bài trong tài khoản này.');
  return { ...data, group: data.group_name || '' };
}
