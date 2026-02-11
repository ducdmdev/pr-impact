import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('simple-git', () => ({
  simpleGit: vi.fn(),
}));

import { simpleGit } from 'simple-git';
import { gitDiff } from '../src/tools/git-diff.js';

const mockGit = {
  diff: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(simpleGit).mockReturnValue(mockGit as never);
});

describe('gitDiff', () => {
  it('returns full diff between two branches', async () => {
    mockGit.diff.mockResolvedValue('diff --git a/src/foo.ts b/src/foo.ts\n--- a/src/foo.ts\n+++ b/src/foo.ts\n@@ -1 +1 @@\n-old\n+new');

    const result = await gitDiff({
      repoPath: '/repo',
      base: 'main',
      head: 'HEAD',
    });

    expect(simpleGit).toHaveBeenCalledWith('/repo');
    expect(mockGit.diff).toHaveBeenCalledWith(['main...HEAD']);
    expect(result.diff).toContain('diff --git');
  });

  it('returns diff for a single file when file parameter is provided', async () => {
    mockGit.diff.mockResolvedValue('diff for single file');

    const result = await gitDiff({
      repoPath: '/repo',
      base: 'main',
      head: 'HEAD',
      file: 'src/foo.ts',
    });

    expect(mockGit.diff).toHaveBeenCalledWith(['main...HEAD', '--', 'src/foo.ts']);
    expect(result.diff).toBe('diff for single file');
  });

  it('defaults repoPath to cwd when not provided', async () => {
    mockGit.diff.mockResolvedValue('some diff');

    await gitDiff({ base: 'main', head: 'HEAD' });

    expect(simpleGit).toHaveBeenCalledWith(process.cwd());
  });

  it('throws on failure', async () => {
    mockGit.diff.mockRejectedValue(new Error('not a git repo'));

    await expect(gitDiff({ base: 'main', head: 'HEAD' })).rejects.toThrow('not a git repo');
  });
});
