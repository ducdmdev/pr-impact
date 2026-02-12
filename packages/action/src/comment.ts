const MARKER_START = '<!-- pr-impact:start -->';
const MARKER_END = '<!-- pr-impact:end -->';

export interface PostCommentOptions {
  token: string;
  repo: string;
  prNumber: number;
  body: string;
}

export async function postOrUpdateComment(opts: PostCommentOptions): Promise<string> {
  const { token, repo, prNumber, body } = opts;
  const markedBody = `${MARKER_START}\n${body}\n${MARKER_END}`;

  const baseUrl = `https://api.github.com/repos/${repo}/issues/${prNumber}/comments`;
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  const existingId = await findExistingComment(baseUrl, headers);

  if (existingId !== null) {
    const patchUrl = `https://api.github.com/repos/${repo}/issues/comments/${existingId}`;
    const res = await fetch(patchUrl, {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: markedBody }),
    });
    if (!res.ok) throw new Error(`GitHub API error updating comment: ${res.status}`);
    const data = (await res.json()) as { html_url: string };
    return data.html_url;
  }

  const res = await fetch(baseUrl, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ body: markedBody }),
  });
  if (!res.ok) throw new Error(`GitHub API error creating comment: ${res.status}`);
  const data = (await res.json()) as { html_url: string };
  return data.html_url;
}

async function findExistingComment(
  baseUrl: string,
  headers: Record<string, string>,
): Promise<number | null> {
  let page = 1;
  while (true) {
    const res = await fetch(`${baseUrl}?per_page=100&page=${page}`, { headers });
    if (!res.ok) {
      console.warn(`Failed to list PR comments (page ${page}): HTTP ${res.status}`);
      return null;
    }
    const comments = (await res.json()) as Array<{ id: number; body?: string }>;
    if (comments.length === 0) break;
    for (const c of comments) {
      if (c.body?.includes(MARKER_START)) return c.id;
    }
    if (comments.length < 100) break;
    page++;
  }
  return null;
}
