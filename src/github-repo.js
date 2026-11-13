export const DATA_FILE_PATH = 'data/deadlines.json';

const API_HEADERS = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
};

function repositoryPath(repository) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository || '')) {
    throw new Error('GITHUB_REPOSITORY phải có dạng owner/repository.');
  }
  return repository;
}

export async function readDeadlines(token, repository) {
  const repo = repositoryPath(repository);
  const response = await fetch(
    `https://api.github.com/repos/${repo}/contents/${DATA_FILE_PATH}`,
    { headers: { ...API_HEADERS, Authorization: `Bearer ${token}` } },
  );
  if (!response.ok) {
    throw new Error(`Không đọc được file deadline trong repository (HTTP ${response.status}).`);
  }

  const file = await response.json();
  if (file.encoding !== 'base64' || typeof file.content !== 'string' || typeof file.sha !== 'string') {
    throw new Error('File deadline trong repository có định dạng không hợp lệ.');
  }
  const content = Buffer.from(file.content.replace(/\s/g, ''), 'base64').toString('utf8');
  return { data: JSON.parse(content), sha: file.sha };
}

export async function writeDeadlines(token, repository, data, sha, message) {
  const repo = repositoryPath(repository);
  const response = await fetch(
    `https://api.github.com/repos/${repo}/contents/${DATA_FILE_PATH}`,
    {
      method: 'PUT',
      headers: {
        ...API_HEADERS,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message,
        content: Buffer.from(JSON.stringify(data, null, 2)).toString('base64'),
        sha,
      }),
    },
  );
  if (!response.ok) {
    throw new Error(`Không cập nhật được file deadline trong repository (HTTP ${response.status}).`);
  }
}
