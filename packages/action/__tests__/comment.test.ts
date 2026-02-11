import { describe, it, expect, vi, beforeEach } from 'vitest';
import { postOrUpdateComment } from '../src/comment.js';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('postOrUpdateComment', () => {
  const baseOpts = {
    token: 'ghp_test123',
    repo: 'owner/repo',
    prNumber: 42,
    body: '# PR Impact Report\nSome analysis',
  };

  it('creates a new comment when no existing comment is found', async () => {
    // List comments returns empty array
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    });
    // Create comment
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ html_url: 'https://github.com/owner/repo/pull/42#issuecomment-123' }),
    });

    const url = await postOrUpdateComment(baseOpts);

    expect(url).toBe('https://github.com/owner/repo/pull/42#issuecomment-123');

    // Verify list call
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const listCall = fetchMock.mock.calls[0];
    expect(listCall[0]).toBe(
      'https://api.github.com/repos/owner/repo/issues/42/comments?per_page=100&page=1',
    );
    expect(listCall[1].headers['Authorization']).toBe('Bearer ghp_test123');

    // Verify create call
    const createCall = fetchMock.mock.calls[1];
    expect(createCall[0]).toBe(
      'https://api.github.com/repos/owner/repo/issues/42/comments',
    );
    expect(createCall[1].method).toBe('POST');
    const createBody = JSON.parse(createCall[1].body);
    expect(createBody.body).toContain('# PR Impact Report');
  });

  it('updates existing comment when HTML marker is found', async () => {
    // List comments returns one with the marker
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { id: 111, body: 'unrelated comment' },
        { id: 222, body: '<!-- pr-impact:start -->\nold report\n<!-- pr-impact:end -->' },
      ],
    });
    // Update (PATCH) comment
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ html_url: 'https://github.com/owner/repo/pull/42#issuecomment-222' }),
    });

    const url = await postOrUpdateComment(baseOpts);

    expect(url).toBe('https://github.com/owner/repo/pull/42#issuecomment-222');

    // Verify PATCH call
    const patchCall = fetchMock.mock.calls[1];
    expect(patchCall[0]).toBe(
      'https://api.github.com/repos/owner/repo/issues/comments/222',
    );
    expect(patchCall[1].method).toBe('PATCH');
  });

  it('wraps body with pr-impact markers', async () => {
    // No existing comments
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    });
    // Create
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ html_url: 'https://github.com/...' }),
    });

    await postOrUpdateComment(baseOpts);

    const createBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(createBody.body).toBe(
      '<!-- pr-impact:start -->\n# PR Impact Report\nSome analysis\n<!-- pr-impact:end -->',
    );
  });

  it('throws on non-ok response when creating a comment', async () => {
    // No existing comments
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    });
    // Create returns 403
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 403,
    });

    await expect(postOrUpdateComment(baseOpts)).rejects.toThrow(
      'GitHub API error creating comment: 403',
    );
  });

  it('throws on non-ok response when updating a comment', async () => {
    // List comments returns one with the marker
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { id: 999, body: '<!-- pr-impact:start -->\nold\n<!-- pr-impact:end -->' },
      ],
    });
    // Update returns 500
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    await expect(postOrUpdateComment(baseOpts)).rejects.toThrow(
      'GitHub API error updating comment: 500',
    );
  });

  it('handles pagination when first page returns 100 comments without marker', async () => {
    // First page: 100 comments, none with marker
    const page1 = Array.from({ length: 100 }, (_, i) => ({
      id: i + 1,
      body: `comment ${i + 1}`,
    }));
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => page1,
    });

    // Second page: fewer than 100, one has marker
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { id: 201, body: '<!-- pr-impact:start -->\nexisting\n<!-- pr-impact:end -->' },
        { id: 202, body: 'another' },
      ],
    });

    // PATCH for the found comment
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ html_url: 'https://github.com/owner/repo/pull/42#issuecomment-201' }),
    });

    const url = await postOrUpdateComment(baseOpts);

    expect(url).toBe('https://github.com/owner/repo/pull/42#issuecomment-201');

    // Verify pagination: page 1 then page 2
    expect(fetchMock.mock.calls[0][0]).toContain('page=1');
    expect(fetchMock.mock.calls[1][0]).toContain('page=2');

    // Verify update call targets the correct comment
    expect(fetchMock.mock.calls[2][0]).toContain('/issues/comments/201');
  });

  it('creates a new comment when pagination exhausts all pages without finding marker', async () => {
    // First page: 100 comments
    const page1 = Array.from({ length: 100 }, (_, i) => ({
      id: i + 1,
      body: `comment ${i + 1}`,
    }));
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => page1,
    });

    // Second page: fewer than 100, no marker
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { id: 201, body: 'no marker here' },
      ],
    });

    // Create new comment
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ html_url: 'https://github.com/owner/repo/pull/42#issuecomment-300' }),
    });

    const url = await postOrUpdateComment(baseOpts);

    expect(url).toBe('https://github.com/owner/repo/pull/42#issuecomment-300');
    // 2 list calls + 1 create call
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[2][1].method).toBe('POST');
  });

  it('creates new comment when list call fails (non-ok)', async () => {
    // List returns non-ok (findExistingComment returns null)
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    // Create comment
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ html_url: 'https://github.com/owner/repo/pull/42#issuecomment-new' }),
    });

    const url = await postOrUpdateComment(baseOpts);

    expect(url).toBe('https://github.com/owner/repo/pull/42#issuecomment-new');
    expect(fetchMock.mock.calls[1][1].method).toBe('POST');
  });
});
