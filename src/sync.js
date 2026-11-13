import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { loadEnvFile } from './env.js';
import { classifyItem, dueDateToIso, parseICS } from './core.js';
import { readDeadlines, writeDeadlines } from './github-repo.js';

loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url)));

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Thiếu cấu hình môi trường: ${name}`);
  return value;
}

async function fetchJiraItems(domain, email, apiToken) {
  const hostname = domain.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  if (!/^[a-zA-Z0-9.-]+$/.test(hostname)) {
    throw new Error('JIRA_DOMAIN không hợp lệ; chỉ nhập hostname, ví dụ company.atlassian.net.');
  }

  const auth = Buffer.from(`${email}:${apiToken}`).toString('base64');
  const jql = 'assignee = currentUser() AND duedate IS NOT EMPTY ORDER BY duedate ASC';
  const items = [];
  let nextPageToken;

  do {
    const url = new URL(`https://${hostname}/rest/api/3/search/jql`);
    url.searchParams.set('jql', jql);
    url.searchParams.set('maxResults', '100');
    url.searchParams.set('fields', 'summary,duedate,resolutiondate,project,status');
    if (nextPageToken) url.searchParams.set('nextPageToken', nextPageToken);

    const response = await fetch(url, {
      headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
    });
    if (!response.ok) {
      throw new Error(`Jira API trả về HTTP ${response.status}. Kiểm tra domain và Jira secrets.`);
    }

    const data = await response.json();
    for (const issue of data.issues || []) {
      const fields = issue.fields || {};
      if (!fields.duedate) continue;
      const completedAt = fields.resolutiondate || null;
      items.push({
        id: `jira_${issue.key}`,
        source: 'JIRA',
        group: fields.project?.name || 'Dự án Jira',
        title: `[${issue.key}] ${fields.summary || '(không có tiêu đề)'}`,
        due_at: dueDateToIso(fields.duedate),
        submitted_at: completedAt,
        url: `https://${hostname}/browse/${encodeURIComponent(issue.key)}`,
      });
    }
    nextPageToken = data.nextPageToken || null;
  } while (nextPageToken);

  return items;
}

export async function syncNow() {
  const icsUrl = requiredEnv('CITD_ICS_URL');
  const jiraDomain = requiredEnv('JIRA_DOMAIN');
  const jiraEmail = requiredEnv('JIRA_EMAIL');
  const jiraToken = requiredEnv('JIRA_API_TOKEN');
  const repository = requiredEnv('GITHUB_REPOSITORY');
  const githubToken = requiredEnv('GH_PAT');

  const parsedIcsUrl = new URL(icsUrl);
  if (parsedIcsUrl.protocol !== 'https:') {
    throw new Error('CITD_ICS_URL phải dùng HTTPS.');
  }

  const [icsResponse, jiraItems, previousFile] = await Promise.all([
    fetch(icsUrl, {
      headers: {
        Accept: 'text/calendar, text/plain;q=0.9, */*;q=0.8',
        'User-Agent': 'DeadlineTracker/1.0',
      },
    }),
    fetchJiraItems(jiraDomain, jiraEmail, jiraToken),
    readDeadlines(githubToken, repository),
  ]);
  // if (!icsResponse.ok) {
  //   throw new Error(`Không tải được lịch CITD (HTTP ${icsResponse.status}). Kiểm tra secret CITD_ICS_URL.`);
  // }

  if (!icsResponse.ok) {
    const body = (await icsResponse.text()).slice(0, 300);
    console.error('Server:', icsResponse.headers.get('server'), '| Body:', body);
    throw new Error(`Không tải được lịch CITD (HTTP ${icsResponse.status}).`);
  }

  const icsText = await icsResponse.text();
  if (!icsText.includes('BEGIN:VCALENDAR')) {
    throw new Error('CITD không trả về nội dung iCalendar hợp lệ. Không cập nhật file deadline.');
  }

  const oldCitdItems = new Map(
    (previousFile.data.items || [])
      .filter((item) => item.source === 'CITD')
      .map((item) => [item.id, item]),
  );
  const citdItems = parseICS(icsText).map((item) => {
    const previous = oldCitdItems.get(item.id);
    return {
      ...item,
      submitted_at: previous?.submitted_at || null,
    };
  });

  const items = [...citdItems, ...jiraItems];
  const payload = {
    updated_at: new Date().toISOString(),
    items,
  };

  await writeDeadlines(
    githubToken,
    repository,
    payload,
    previousFile.sha,
    'Update synced deadlines',
  );

  const statusCounts = items.reduce((counts, item) => {
    const status = classifyItem(item);
    counts[status] = (counts[status] || 0) + 1;
    return counts;
  }, {});
  console.log(`Đồng bộ ${citdItems.length} CITD, ${jiraItems.length} Jira.`);
  console.log(`Trạng thái: ${JSON.stringify(statusCounts)}`);
}

const isDirectExecution = process.argv[1]
  && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isDirectExecution) {
  syncNow().catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  });
}
