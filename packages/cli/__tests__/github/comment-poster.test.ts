import { describe, it, expect, vi, beforeEach } from 'vitest';
import { postOrUpdateComment } from '../../src/github/comment-poster.js';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('postOrUpdateComment', () => {
  const baseOpts = {
    token: 'ghp_test123',
    repo: 'owner/repo',
    prNumber: '42',
    body: '## PR Impact Report\nAll clear!',
  };

  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('creates a new comment when no existing comment found', async () => {
    // First call: list comments (empty)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    });

    // Second call: create comment
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ html_url: 'https://github.com/owner/repo/pull/42#issuecomment-1' }),
    });

    const url = await postOrUpdateComment(baseOpts);

    expect(url).toBe('https://github.com/owner/repo/pull/42#issuecomment-1');

    // Verify list call
    expect(mockFetch).toHaveBeenCalledTimes(2);
    const listCall = mockFetch.mock.calls[0];
    expect(listCall[0]).toContain('/repos/owner/repo/issues/42/comments');
    expect(listCall[1].method).toBe('GET');

    // Verify create call
    const createCall = mockFetch.mock.calls[1];
    expect(createCall[0]).toBe('https://api.github.com/repos/owner/repo/issues/42/comments');
    expect(createCall[1].method).toBe('POST');
    const createBody = JSON.parse(createCall[1].body);
    expect(createBody.body).toContain('<!-- pr-impact:start -->');
    expect(createBody.body).toContain('## PR Impact Report');
    expect(createBody.body).toContain('<!-- pr-impact:end -->');
  });

  it('updates an existing comment when marker is found', async () => {
    // First call: list comments (contains existing pr-impact comment)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { id: 100, body: 'Some other comment' },
        { id: 200, body: '<!-- pr-impact:start -->\nOld report\n<!-- pr-impact:end -->' },
      ],
    });

    // Second call: update comment
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ html_url: 'https://github.com/owner/repo/pull/42#issuecomment-200' }),
    });

    const url = await postOrUpdateComment(baseOpts);

    expect(url).toBe('https://github.com/owner/repo/pull/42#issuecomment-200');

    // Verify update call (PATCH)
    const updateCall = mockFetch.mock.calls[1];
    expect(updateCall[0]).toBe('https://api.github.com/repos/owner/repo/issues/comments/200');
    expect(updateCall[1].method).toBe('PATCH');
  });

  it('throws when creating a comment fails', async () => {
    // List comments: empty
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    });

    // Create comment: fails
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      text: async () => 'Forbidden',
    });

    await expect(postOrUpdateComment(baseOpts)).rejects.toThrow(
      'GitHub API error creating comment: 403 Forbidden',
    );
  });

  it('throws when updating a comment fails', async () => {
    // List comments: existing
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { id: 200, body: '<!-- pr-impact:start -->\nOld\n<!-- pr-impact:end -->' },
      ],
    });

    // Update comment: fails
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    });

    await expect(postOrUpdateComment(baseOpts)).rejects.toThrow(
      'GitHub API error updating comment: 500 Internal Server Error',
    );
  });

  it('treats failed list call as no existing comment and creates new', async () => {
    // List comments: fails
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
    });

    // Create comment: succeeds
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ html_url: 'https://github.com/owner/repo/pull/42#issuecomment-3' }),
    });

    const url = await postOrUpdateComment(baseOpts);
    expect(url).toBe('https://github.com/owner/repo/pull/42#issuecomment-3');
  });

  it('paginates through comments to find marker', async () => {
    // First page: 100 comments, no marker
    const page1 = Array.from({ length: 100 }, (_, i) => ({
      id: i + 1,
      body: `Comment ${i + 1}`,
    }));
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => page1,
    });

    // Second page: has marker
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { id: 500, body: '<!-- pr-impact:start -->\nReport\n<!-- pr-impact:end -->' },
      ],
    });

    // Update call
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ html_url: 'https://github.com/owner/repo/pull/42#issuecomment-500' }),
    });

    const url = await postOrUpdateComment(baseOpts);
    expect(url).toBe('https://github.com/owner/repo/pull/42#issuecomment-500');

    // First two calls are GET (pagination), third is PATCH (update)
    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(mockFetch.mock.calls[0][0]).toContain('page=1');
    expect(mockFetch.mock.calls[1][0]).toContain('page=2');
    expect(mockFetch.mock.calls[2][1].method).toBe('PATCH');
  });

  it('sends correct Authorization header', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ html_url: 'https://github.com/owner/repo/pull/42#issuecomment-1' }),
    });

    await postOrUpdateComment(baseOpts);

    const headers = mockFetch.mock.calls[0][1].headers;
    expect(headers.Authorization).toBe('Bearer ghp_test123');
  });
});
