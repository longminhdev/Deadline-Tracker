import { createClient } from '@supabase/supabase-js';

const state = {
  data: { updated_at: null, items: [] },
  integration: { configured: false, last_synced_at: null },
  filter: 'ALL',
  query: '',
  userId: null,
};

const elements = {
  lastUpdated: document.querySelector('#last-updated'),
  signInPanel: document.querySelector('#sign-in-panel'),
  signInForm: document.querySelector('#sign-in-form'),
  signInButton: document.querySelector('#sign-in-button'),
  emailInput: document.querySelector('#email-input'),
  signInMessage: document.querySelector('#sign-in-message'),
  appPanel: document.querySelector('#app-panel'),
  accountBar: document.querySelector('#account-bar'),
  accountEmail: document.querySelector('#account-email'),
  signOutButton: document.querySelector('#sign-out-button'),
  integrationForm: document.querySelector('#integration-form'),
  icsUrlInput: document.querySelector('#ics-url-input'),
  saveIntegrationButton: document.querySelector('#save-integration-button'),
  integrationStatus: document.querySelector('#integration-status'),
  syncButton: document.querySelector('#sync-button'),
  notice: document.querySelector('#notice'),
  citdList: document.querySelector('#citd-list'),
  citdCount: document.querySelector('#citd-count'),
  overdueCount: document.querySelector('#overdue-count'),
  urgentCount: document.querySelector('#urgent-count'),
  openCount: document.querySelector('#open-count'),
  doneCount: document.querySelector('#done-count'),
  searchInput: document.querySelector('#search-input'),
};

let supabase;

function setNotice(message, isError = false) {
  elements.notice.textContent = message;
  elements.notice.classList.toggle('is-error', isError);
  elements.notice.hidden = !message;
}

function setIntegrationStatus(message, isError = false) {
  elements.integrationStatus.textContent = message;
  elements.integrationStatus.classList.toggle('is-error', isError);
}

async function api(path, options = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.');
  const response = await fetch(path, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      Authorization: `Bearer ${session.access_token}`,
      ...options.headers,
    },
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `Yêu cầu thất bại (${response.status}).`);
  return result;
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Không rõ hạn';
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    hour12: false,
  }).format(date);
}

function formatDuration(milliseconds) {
  const minutes = Math.floor(Math.abs(milliseconds) / 60_000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const remainingMinutes = minutes % 60;
  const parts = [];
  if (days) parts.push(`${days} ngày`);
  if (hours) parts.push(`${hours} giờ`);
  parts.push(`${remainingMinutes} phút`);
  return parts.join(' ');
}

function classify(item) {
  if (!item.submitted_at) return 'UNSUBMITTED';
  return new Date(item.submitted_at).getTime() <= new Date(item.due_at).getTime()
    ? 'SUBMITTED_ON_TIME'
    : 'SUBMITTED_LATE';
}

function getStatus(item, status, remaining) {
  if (status === 'SUBMITTED_ON_TIME') return { label: 'Đã nộp đúng hạn', className: 'status-done' };
  if (status === 'SUBMITTED_LATE') return {
    label: `Đã nộp trễ ${formatDuration(new Date(item.submitted_at) - new Date(item.due_at))}`,
    className: 'status-done',
  };
  if (remaining < 0) return { label: `⚠ Quá hạn ${formatDuration(remaining)}`, className: 'status-overdue' };
  if (remaining < 86_400_000) return { label: `Còn ${formatDuration(remaining)}`, className: 'status-urgent' };
  return { label: `Còn ${formatDuration(remaining)}`, className: 'status-open' };
}

function makeElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

async function toggleSubmitted(item, button) {
  button.disabled = true;
  setNotice('');
  try {
    const result = await api(`/api/items/${encodeURIComponent(item.id)}/submission`, {
      method: 'POST',
      body: JSON.stringify({ submitted: !item.submitted_at }),
    });
    const index = state.data.items.findIndex((entry) => entry.id === item.id);
    if (index >= 0) state.data.items[index] = result.item;
    render();
  } catch (error) {
    setNotice(error.message, true);
    button.disabled = false;
  }
}

function makeCard(item) {
  const status = classify(item);
  const due = new Date(item.due_at).getTime();
  const remaining = due - Date.now();
  const statusInfo = getStatus(item, status, remaining);
  const card = makeElement('article', 'deadline-card');
  if (status !== 'UNSUBMITTED') card.classList.add('is-done');
  else if (remaining < 0) card.classList.add('is-overdue');
  else if (remaining < 86_400_000) card.classList.add('is-urgent');

  const top = makeElement('div', 'card-top');
  const details = makeElement('div', 'card-group-details');
  details.append(makeElement('span', 'card-group', item.group || ''));
  if (item.course_name) details.append(makeElement('span', 'card-course-name', item.course_name));
  if (item.instructor) details.append(makeElement('span', 'card-instructor', `Giảng viên: ${item.instructor}`));
  top.append(details, makeElement('span', `card-status ${statusInfo.className}`, statusInfo.label));

  const title = makeElement('a', 'card-title', item.title || '(Không có tiêu đề)');
  try {
    const url = new URL(item.url);
    if (url.protocol === 'https:') {
      title.href = url.href;
      title.target = '_blank';
      title.rel = 'noopener noreferrer';
    }
  } catch {
    title.removeAttribute('href');
  }

  const bottom = makeElement('div', 'card-bottom');
  bottom.append(makeElement('span', '', `Hạn: ${formatDate(item.due_at)}`));
  const button = makeElement('button', 'submit-button', item.submitted_at ? 'Hoàn tác' : 'Đánh dấu đã nộp');
  button.type = 'button';
  button.addEventListener('click', () => toggleSubmitted(item, button));
  bottom.append(button);
  card.append(top, title, bottom);
  return card;
}

function renderList(items) {
  elements.citdList.replaceChildren();
  if (!items.length) {
    elements.citdList.append(makeElement('p', 'empty-state', 'Không có deadline phù hợp.'));
    return;
  }
  for (const item of items) elements.citdList.append(makeCard(item));
}

function render() {
  const now = Date.now();
  const items = state.data.items;
  const openItems = items.filter((item) => classify(item) === 'UNSUBMITTED');
  elements.overdueCount.textContent = openItems.filter((item) => new Date(item.due_at).getTime() < now).length;
  elements.urgentCount.textContent = openItems.filter((item) => {
    const remaining = new Date(item.due_at).getTime() - now;
    return remaining >= 0 && remaining < 86_400_000;
  }).length;
  elements.openCount.textContent = openItems.length;
  elements.doneCount.textContent = items.length - openItems.length;

  const query = state.query.trim().toLocaleLowerCase('vi');
  const visible = items.filter((item) => {
    if (state.filter !== 'ALL' && classify(item) !== state.filter) return false;
    return !query || `${item.title} ${item.group} ${item.course_name || ''}`.toLocaleLowerCase('vi').includes(query);
  });
  elements.citdCount.textContent = visible.length;
  renderList(visible);
}

async function loadDashboard() {
  elements.lastUpdated.textContent = 'Đang tải deadline của bạn...';
  const [data, integration] = await Promise.all([api('/api/deadlines'), api('/api/integration')]);
  state.data = data;
  state.integration = integration;
  elements.lastUpdated.textContent = data.updated_at
    ? `Cập nhật gần nhất: ${formatDate(data.updated_at)}`
    : 'Chưa đồng bộ feed ICS';
  setIntegrationStatus(integration.configured
    ? `Đã lưu feed riêng · Đồng bộ gần nhất: ${integration.last_synced_at ? formatDate(integration.last_synced_at) : 'chưa có'}`
    : 'Chưa kết nối lịch ICS.');
  render();
}

async function setSignedIn(session) {
  const userId = session?.user?.id || null;
  if (state.userId === userId) return;
  state.userId = userId;
  elements.signInPanel.hidden = Boolean(session);
  elements.appPanel.hidden = !session;
  elements.accountBar.hidden = !session;
  elements.accountEmail.textContent = session?.user?.email || '';
  elements.signInMessage.textContent = '';
  setNotice('');
  if (!session) {
    state.data = { updated_at: null, items: [] };
    state.integration = { configured: false, last_synced_at: null };
    elements.lastUpdated.textContent = 'Đăng nhập để xem deadline của bạn';
    render();
    return;
  }
  try {
    await loadDashboard();
  } catch (error) {
    if (/hết hạn|đăng nhập lại/i.test(error.message)) await supabase.auth.signOut();
    else setNotice(error.message, true);
  }
}

async function submitEmail(event) {
  event.preventDefault();
  elements.signInButton.disabled = true;
  elements.signInMessage.textContent = 'Đang gửi liên kết...';
  try {
    const { error } = await supabase.auth.signInWithOtp({
      email: elements.emailInput.value.trim(),
      options: {
        shouldCreateUser: false,
        emailRedirectTo: window.location.origin,
      },
    });
    if (error) throw error;
    elements.signInMessage.textContent = 'Nếu email đã được mời tham gia beta, liên kết đăng nhập sẽ tới hộp thư của bạn.';
  } catch {
    elements.signInMessage.textContent = 'Chưa gửi được liên kết. Kiểm tra email đã được mời và thử lại sau.';
  } finally {
    elements.signInButton.disabled = false;
  }
}

async function saveIntegration(event) {
  event.preventDefault();
  elements.saveIntegrationButton.disabled = true;
  setIntegrationStatus('Đang mã hóa và lưu URL lịch...');
  try {
    await api('/api/integration', {
      method: 'PUT',
      body: JSON.stringify({ ics_url: elements.icsUrlInput.value.trim() }),
    });
    elements.icsUrlInput.value = '';
    await loadDashboard();
    setIntegrationStatus('Đã lưu feed riêng. Bấm “Đồng bộ ngay” để lấy deadline.');
  } catch (error) {
    setIntegrationStatus(error.message, true);
  } finally {
    elements.saveIntegrationButton.disabled = false;
  }
}

async function syncNow() {
  elements.syncButton.disabled = true;
  elements.syncButton.textContent = 'Đang đồng bộ...';
  setNotice('');
  try {
    const result = await api('/api/sync', { method: 'POST' });
    await loadDashboard();
    setNotice(`Đồng bộ xong ${result.count} deadline.`);
  } catch (error) {
    setNotice(error.message, true);
  } finally {
    elements.syncButton.disabled = false;
    elements.syncButton.textContent = 'Đồng bộ ngay';
  }
}

async function initialize() {
  const configResponse = await fetch('/api/config', { cache: 'no-store' });
  const config = await configResponse.json();
  if (!configResponse.ok) throw new Error(config.error || 'Bản beta chưa được cấu hình.');
  supabase = createClient(config.url, config.anonKey, {
    auth: { autoRefreshToken: true, detectSessionInUrl: true, persistSession: true, flowType: 'pkce' },
  });

  elements.signInForm.addEventListener('submit', submitEmail);
  elements.integrationForm.addEventListener('submit', saveIntegration);
  elements.syncButton.addEventListener('click', syncNow);
  elements.signOutButton.addEventListener('click', () => supabase.auth.signOut());
  elements.searchInput.addEventListener('input', () => {
    state.query = elements.searchInput.value;
    render();
  });
  document.querySelectorAll('.filter-button').forEach((button) => {
    button.addEventListener('click', () => {
      state.filter = button.dataset.filter;
      document.querySelectorAll('.filter-button').forEach((candidate) => {
        candidate.classList.toggle('is-active', candidate === button);
      });
      render();
    });
  });

  supabase.auth.onAuthStateChange((_event, session) => {
    window.setTimeout(() => setSignedIn(session), 0);
  });
  const { data: { session } } = await supabase.auth.getSession();
  await setSignedIn(session);
}

initialize().catch((error) => {
  elements.signInPanel.hidden = false;
  elements.signInMessage.textContent = error.message || 'Không thể khởi động bản beta.';
});

setInterval(() => {
  if (state.userId) render();
}, 60_000);
