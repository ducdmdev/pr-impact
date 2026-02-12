import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('simple-git', () => ({
  simpleGit: vi.fn(),
}));

import { simpleGit } from 'simple-git';
import { listChangedFiles } from '../src/tools/list-files.js';

const mockGit = {
  diff: vi.fn(),
  diffSummary: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(simpleGit).mockReturnValue(mockGit as never);
});

describe('listChangedFiles', () => {
  it('returns list of changed files with status and stats', async () => {
    mockGit.diff.mockResolvedValue('M\tsrc/foo.ts\nA\tsrc/bar.ts\nD\told.ts\n');
    mockGit.diffSummary.mockResolvedValue({
      files: [
        { file: 'src/foo.ts', insertions: 10, deletions: 3, binary: false },
        { file: 'src/bar.ts', insertions: 20, deletions: 0, binary: false },
        { file: 'old.ts', insertions: 0, deletions: 15, binary: false },
      ],
      insertions: 30,
      deletions: 18,
    });

    const result = await listChangedFiles({
      repoPath: '/repo',
      base: 'main',
      head: 'HEAD',
    });

    expect(simpleGit).toHaveBeenCalledWith('/repo');
    expect(mockGit.diff).toHaveBeenCalledWith(['--name-status', 'main...HEAD']);
    expect(mockGit.diffSummary).toHaveBeenCalledWith(['main...HEAD']);
    expect(result.files).toHaveLength(3);
    expect(result.files[0]).toEqual({
      path: 'src/foo.ts',
      status: 'modified',
      additions: 10,
      deletions: 3,
    });
    expect(result.files[1]).toEqual({
      path: 'src/bar.ts',
      status: 'added',
      additions: 20,
      deletions: 0,
    });
    expect(result.files[2]).toEqual({
      path: 'old.ts',
      status: 'deleted',
      additions: 0,
      deletions: 15,
    });
    expect(result.totalAdditions).toBe(30);
    expect(result.totalDeletions).toBe(18);
  });

  it('handles renamed files (R status with score)', async () => {
    mockGit.diff.mockResolvedValue('R100\told-name.ts\tnew-name.ts\n');
    mockGit.diffSummary.mockResolvedValue({
      files: [
        { file: 'new-name.ts', insertions: 0, deletions: 0, binary: false },
      ],
      insertions: 0,
      deletions: 0,
    });

    const result = await listChangedFiles({
      repoPath: '/repo',
      base: 'main',
      head: 'HEAD',
    });

    expect(result.files).toHaveLength(1);
    expect(result.files[0]).toEqual({
      path: 'new-name.ts',
      status: 'renamed',
      additions: 0,
      deletions: 0,
    });
  });

  it('defaults repoPath to cwd when not provided', async () => {
    mockGit.diff.mockResolvedValue('');
    mockGit.diffSummary.mockResolvedValue({
      files: [],
      insertions: 0,
      deletions: 0,
    });

    await listChangedFiles({ base: 'main', head: 'HEAD' });

    expect(simpleGit).toHaveBeenCalledWith(process.cwd());
  });

  it('handles copied files (C status)', async () => {
    mockGit.diff.mockResolvedValue('C100\tsrc/original.ts\tsrc/copy.ts\n');
    mockGit.diffSummary.mockResolvedValue({
      files: [
        { file: 'src/copy.ts', insertions: 5, deletions: 0, binary: false },
      ],
      insertions: 5,
      deletions: 0,
    });

    const result = await listChangedFiles({
      repoPath: '/repo',
      base: 'main',
      head: 'HEAD',
    });

    expect(result.files).toHaveLength(1);
    expect(result.files[0]).toEqual({
      path: 'src/copy.ts',
      status: 'copied',
      additions: 5,
      deletions: 0,
    });
  });

  it('handles binary files with zero additions/deletions', async () => {
    mockGit.diff.mockResolvedValue('A\timage.png\n');
    mockGit.diffSummary.mockResolvedValue({
      files: [
        { file: 'image.png', binary: true },
      ],
      insertions: 0,
      deletions: 0,
    });

    const result = await listChangedFiles({
      repoPath: '/repo',
      base: 'main',
      head: 'HEAD',
    });

    expect(result.files).toHaveLength(1);
    expect(result.files[0]).toEqual({
      path: 'image.png',
      status: 'added',
      additions: 0,
      deletions: 0,
    });
  });

  it('throws on failure', async () => {
    mockGit.diff.mockRejectedValue(new Error('bad revision'));

    await expect(
      listChangedFiles({ base: 'main', head: 'HEAD' }),
    ).rejects.toThrow('bad revision');
  });
});
