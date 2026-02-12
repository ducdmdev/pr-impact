import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('simple-git', () => ({
  simpleGit: vi.fn(),
}));

import { simpleGit } from 'simple-git';
import { readFileAtRef } from '../src/tools/read-file.js';

const mockGit = {
  show: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(simpleGit).mockReturnValue(mockGit as never);
});

describe('readFileAtRef', () => {
  it('reads a file at a specific git ref', async () => {
    mockGit.show.mockResolvedValue('export function foo() {}');

    const result = await readFileAtRef({
      repoPath: '/repo',
      ref: 'main',
      filePath: 'src/foo.ts',
    });

    expect(simpleGit).toHaveBeenCalledWith('/repo');
    expect(mockGit.show).toHaveBeenCalledWith(['main:src/foo.ts']);
    expect(result.content).toBe('export function foo() {}');
  });

  it('defaults repoPath to cwd when not provided', async () => {
    mockGit.show.mockResolvedValue('content');

    await readFileAtRef({ ref: 'main', filePath: 'src/foo.ts' });

    expect(simpleGit).toHaveBeenCalledWith(process.cwd());
  });

  it('throws when file does not exist at ref', async () => {
    mockGit.show.mockRejectedValue(new Error('path not found'));

    await expect(
      readFileAtRef({ repoPath: '/repo', ref: 'main', filePath: 'src/missing.ts' }),
    ).rejects.toThrow('path not found');
  });
});
