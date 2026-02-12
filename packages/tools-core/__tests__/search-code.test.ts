import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('simple-git', () => ({
  simpleGit: vi.fn(),
}));

import { simpleGit } from 'simple-git';
import { searchCode } from '../src/tools/search-code.js';

const mockGit = {
  raw: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(simpleGit).mockReturnValue(mockGit as never);
});

describe('searchCode', () => {
  it('searches for a pattern and returns matches', async () => {
    mockGit.raw.mockResolvedValue(
      'src/foo.ts:5:export function doStuff() {\n' +
      'src/bar.ts:12:import { doStuff } from "./foo"\n',
    );

    const result = await searchCode({
      repoPath: '/repo',
      pattern: 'doStuff',
    });

    expect(mockGit.raw).toHaveBeenCalledWith(['grep', '-n', '--', 'doStuff']);
    expect(result.matches).toHaveLength(2);
    expect(result.matches[0]).toEqual({
      file: 'src/foo.ts',
      line: 5,
      match: 'export function doStuff() {',
    });
    expect(result.matches[1]).toEqual({
      file: 'src/bar.ts',
      line: 12,
      match: 'import { doStuff } from "./foo"',
    });
  });

  it('passes glob parameter to filter files', async () => {
    mockGit.raw.mockResolvedValue('docs/api.md:3:doStuff reference\n');

    const result = await searchCode({
      repoPath: '/repo',
      pattern: 'doStuff',
      glob: '*.md',
    });

    expect(mockGit.raw).toHaveBeenCalledWith(['grep', '-n', '--', 'doStuff', '*.md']);
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].file).toBe('docs/api.md');
  });

  it('returns empty matches when git grep finds nothing (exit code 1)', async () => {
    const error = new Error('process exited with code 1');
    mockGit.raw.mockRejectedValue(error);

    const result = await searchCode({
      repoPath: '/repo',
      pattern: 'nonexistent',
    });

    expect(result.matches).toHaveLength(0);
  });

  it('throws on real errors (not exit code 1)', async () => {
    const error = new Error('fatal: not a git repository');
    mockGit.raw.mockRejectedValue(error);

    await expect(
      searchCode({ repoPath: '/repo', pattern: 'anything' }),
    ).rejects.toThrow('fatal: not a git repository');
  });
});
