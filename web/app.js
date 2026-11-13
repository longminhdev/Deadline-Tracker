const state = {
  data: { updated_at: null, items: [] },
  filter: 'ALL',
  query: '',
};

const elements = {
  lastUpdated: document.querySelector('#last-updated'),
  notice: document.querySelector('#notice'),
  citdList: document.querySelector('#citd-list'),
  jiraList: document.querySelector('#jira-list'),
  citdCount: document.querySelector('#citd-count'),
  jiraCount: document.querySelector('#jira-count'),
  overdueCount: document.querySelector('#overdue-count'),
  urgentCount: document.querySelector('#urgent-count'),
  openCount: document.querySelector('#open-count'),
  doneCount: document.querySelector('#done-count'),
  refreshButton: document.querySelector('#refresh-button'),
  syncButton: document.querySelector('#sync-button'),
  searchInput: document.querySelector('#search-input'),
};

function classify(item) {
  if (!item.submitted_at) return 'UNSUBMITTED';
  return new Date(item.submitted_at).getTime() <= new Date(item.due_at).getTime()
    ? 'SUBMITTED_ON_TIME'
    : 'SUBMITTED_LATE';
}

function formatDuration(milliseconds) {
  const minutes = Math.floor(Math.abs(milliseconds) / 60_000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const remainingMinutes = minutes % 60;
  const result = [];
  if (days) result.push(`${days} ngày`);
  if (hours) result.push(`${hours} giờ`);
  result.push(`${remainingMinutes} phút`);
  return result.join(' ');
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

function setNotice(message, isError = false) {
  elements.notice.textContent = message;
  elements.notice.classList.toggle('is-error', isError);
  elements.notice.hidden = !message;
}

async function loadData({ quiet = false } = {}) {
  if (!quiet) {
    elements.refreshButton.disabled = true;
    elements.lastUpdated.textContent = 'Đang tải dữ liệu...';
  }
  try {
    const response = await fetch('/api/deadlines', { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `Lỗi tải dữ liệu (${response.status}).`);
    if (!Array.isArray(data.items)) throw new Error('File deadline không có danh sách items hợp lệ.');

    state.data = data;
    elements.lastUpdated.textContent = data.updated_at
      ? `Cập nhật lần cuối: ${formatDate(data.updated_at)}`
      : 'Chưa có lần đồng bộ nào';
    setNotice('');
    render();
  } catch (error) {
    elements.lastUpdated.textContent = 'Không thể tải dữ liệu';
    setNotice(error.message, true);
  } finally {
    elements.refreshButton.disabled = false;
  }
}

function makeElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function getStatusLabel(item, status, remaining) {
  if (status === 'SUBMITTED_ON_TIME') {
    return { label: item.source === 'CITD' ? 'Đã nộp đúng hạn' : 'Hoàn thành đúng hạn', className: 'status-done' };
  }
  if (status === 'SUBMITTED_LATE') {
    return {
      label: item.source === 'CITD'
        ? `Đã nộp trễ ${formatDuration(new Date(item.submitted_at) - new Date(item.due_at))}`
        : `Hoàn thành trễ ${formatDuration(new Date(item.submitted_at) - new Date(item.due_at))}`,
      className: 'status-completed-late',
    };
  }
  if (remaining < 0) return { label: `Quá hạn ${formatDuration(remaining)}`, className: 'status-overdue' };
  if (remaining < 86_400_000) return { label: `Còn ${formatDuration(remaining)}`, className: 'status-urgent' };
  return { label: `Còn ${formatDuration(remaining)}`, className: 'status-open' };
}

function makeCard(item) {
  const status = classify(item);
  const due = new Date(item.due_at).getTime();
  const remaining = due - Date.now();
  const statusInfo = getStatusLabel(item, status, remaining);
  const card = makeElement('article', 'deadline-card');
  if (status !== 'UNSUBMITTED') card.classList.add('is-done');
  else if (remaining < 0) card.classList.add('is-overdue');
  else if (remaining < 86_400_000) card.classList.add('is-urgent');

  const top = makeElement('div', 'card-top');
  top.append(makeElement('span', 'card-group', item.group || ''));
  top.append(makeElement('span', `card-status ${statusInfo.className}`, statusInfo.label));

  const title = makeElement('a', 'card-title', item.title || '(Không có tiêu đề)');
  try {
    const url = new URL(item.url);
    if (url.protocol === 'https:') {
      title.href = url.href;
      title.target = '_blank';
      title.rel = 'noopener noreferrer';
    } else {
      title.removeAttribute('href');
    }
  } catch {
    title.removeAttribute('href');
  }

  const bottom = makeElement('div', 'card-bottom');
  bottom.append(makeElement('span', '', `Hạn: ${formatDate(item.due_at)}`));
  if (item.source === 'CITD') {
    const button = makeElement('button', 'submit-button', item.submitted_at ? 'Hoàn tác' : 'Đánh dấu đã nộp');
    button.type = 'button';
    button.addEventListener('click', () => toggleSubmitted(item, button));
    bottom.append(button);
  }

  card.append(top, title, bottom);
  return card;
}

function renderList(container, items) {
  container.replaceChildren();
  if (!items.length) {
    container.append(makeElement('p', 'empty-state', 'Không có deadline phù hợp.'));
    return;
  }
  for (const item of items) container.append(makeCard(item));
}

function render() {
  const now = Date.now();
  const allItems = state.data.items;
  const openItems = allItems.filter((item) => classify(item) === 'UNSUBMITTED');
  elements.overdueCount.textContent = openItems.filter((item) => new Date(item.due_at).getTime() < now).length;
  elements.urgentCount.textContent = openItems.filter((item) => {
    const remaining = new Date(item.due_at).getTime() - now;
    return remaining >= 0 && remaining < 86_400_000;
  }).length;
  elements.openCount.textContent = openItems.length;
  elements.doneCount.textContent = allItems.length - openItems.length;

  const normalizedQuery = state.query.trim().toLocaleLowerCase('vi');
  const visible = allItems.filter((item) => {
    if (state.filter !== 'ALL' && classify(item) !== state.filter) return false;
    return !normalizedQuery || `${item.title} ${item.group} ${item.source}`.toLocaleLowerCase('vi').includes(normalizedQuery);
  });
  const citd = visible.filter((item) => item.source === 'CITD').sort((a, b) => new Date(a.due_at) - new Date(b.due_at));
  const jira = visible.filter((item) => item.source === 'JIRA').sort((a, b) => new Date(a.due_at) - new Date(b.due_at));
  elements.citdCount.textContent = citd.length;
  elements.jiraCount.textContent = jira.length;
  renderList(elements.citdList, citd);
  renderList(elements.jiraList, jira);
}

async function toggleSubmitted(item, button) {
  button.disabled = true;
  setNotice('');
  try {
    const response = await fetch(`/api/items/${encodeURIComponent(item.id)}/submission`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ submitted: !item.submitted_at }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `Không lưu được trạng thái (${response.status}).`);
    const index = state.data.items.findIndex((entry) => entry.id === item.id);
    if (index >= 0) state.data.items[index] = result.item;
    render();
  } catch (error) {
    setNotice(error.message, true);
    button.disabled = false;
  }
}

async function triggerSync() {
  elements.syncButton.disabled = true;
  elements.syncButton.textContent = 'Đang kích hoạt...';
  setNotice('');
  try {
    const response = await fetch('/api/sync', { method: 'POST' });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `Không thể kích hoạt đồng bộ (${response.status}).`);
    setNotice('Đã xếp hàng đồng bộ. Đang chờ GitHub Actions cập nhật dữ liệu...');

    for (let attempt = 0; attempt < 12; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      await loadData({ quiet: true });
    }
    setNotice('Đã chờ đồng bộ tối đa 60 giây. Bấm “Làm mới” để kiểm tra dữ liệu mới nhất.');
  } catch (error) {
    setNotice(error.message, true);
  } finally {
    elements.syncButton.disabled = false;
    elements.syncButton.textContent = 'Quét dữ liệu ngay';
  }
}

document.querySelectorAll('.filter-button').forEach((button) => {
  button.addEventListener('click', () => {
    state.filter = button.dataset.filter;
    document.querySelectorAll('.filter-button').forEach((candidate) => {
      candidate.classList.toggle('is-active', candidate === button);
    });
    render();
  });
});
elements.searchInput.addEventListener('input', () => {
  state.query = elements.searchInput.value;
  render();
});
elements.refreshButton.addEventListener('click', () => loadData());
elements.syncButton.addEventListener('click', triggerSync);

loadData();
setInterval(render, 60_000);
