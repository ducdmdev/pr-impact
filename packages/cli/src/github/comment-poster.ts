/**
 * Post or update a PR comment on GitHub using the GitHub REST API (native fetch).
 *
 * Uses hidden HTML markers to identify existing comments for upsert behavior
 * (update-or-create).
 */

const MARKER_START = '<!-- pr-impact:start -->';
const MARKER_END = '<!-- pr-impact:end -->';

export interface PostCommentOptions {
  /** GitHub API token with repo/write:discussion permissions. */
  token: string;
  /** Repository in "owner/repo" format. */
  repo: string;
  /** Pull request number. */
  prNumber: string;
  /** Markdown body of the comment (markers are added automatically). */
  body: string;
}

interface GitHubComment {
  id: number;
  body?: string;
}

/**
 * Post a new PR comment or update an existing one tagged with the pr-impact marker.
 *
 * Returns the comment URL on success or throws on failure.
 */
export async function postOrUpdateComment(opts: PostCommentOptions): Promise<string> {
  const { token, repo, prNumber, body } = opts;
  const markedBody = `${MARKER_START}\n${body}\n${MARKER_END}`;

  const baseUrl = `https://api.github.com/repos/${repo}/issues/${prNumber}/comments`;
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  // 1. Find existing comment with our marker
  const existingId = await findExistingComment(baseUrl, headers);

  if (existingId !== null) {
    // 2a. Update the existing comment
    const patchUrl = `https://api.github.com/repos/${repo}/issues/comments/${existingId}`;
    const res = await fetch(patchUrl, {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: markedBody }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`GitHub API error updating comment: ${res.status} ${text}`);
    }

    const data = (await res.json()) as { html_url: string };
    return data.html_url;
  }

  // 2b. Create a new comment
  const res = await fetch(baseUrl, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ body: markedBody }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub API error creating comment: ${res.status} ${text}`);
  }

  const data = (await res.json()) as { html_url: string };
  return data.html_url;
}

/**
 * Search through paginated issue comments to find one with our marker.
 */
async function findExistingComment(
  baseUrl: string,
  headers: Record<string, string>,
): Promise<number | null> {
  let page = 1;

  while (true) {
    const url = `${baseUrl}?per_page=100&page=${page}`;
    const res = await fetch(url, { method: 'GET', headers });

    if (!res.ok) {
      // If we can't list comments, treat as "no existing comment"
      return null;
    }

    const comments = (await res.json()) as GitHubComment[];
    if (comments.length === 0) break;

    for (const comment of comments) {
      if (comment.body?.includes(MARKER_START)) {
        return comment.id;
      }
    }

    // GitHub typically returns at most 100 per page
    if (comments.length < 100) break;
    page++;
  }

  return null;
}
