import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@pr-impact/tools-core', () => ({
  gitDiff: vi.fn(),
  readFileAtRef: vi.fn(),
  listChangedFiles: vi.fn(),
  searchCode: vi.fn(),
  findImporters: vi.fn(),
  listTestFiles: vi.fn(),
  clearImporterCache: vi.fn(),
}));

import {
  gitDiff,
  readFileAtRef,
  listChangedFiles,
  searchCode,
  findImporters,
  listTestFiles,
} from '@pr-impact/tools-core';
import { executeTool } from '../src/tools.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('executeTool', () => {
  it('dispatches git_diff tool and returns stringified result', async () => {
    vi.mocked(gitDiff).mockResolvedValue({ diff: 'diff output' });

    const result = await executeTool('git_diff', {
      repoPath: '/repo',
      base: 'main',
      head: 'HEAD',
    });

    expect(gitDiff).toHaveBeenCalledWith({
      repoPath: '/repo',
      base: 'main',
      head: 'HEAD',
    });
    expect(result).toContain('diff output');
  });

  it('dispatches read_file_at_ref tool', async () => {
    vi.mocked(readFileAtRef).mockResolvedValue({ content: 'file content' });

    const result = await executeTool('read_file_at_ref', {
      repoPath: '/repo',
      ref: 'main',
      filePath: 'src/foo.ts',
    });

    expect(readFileAtRef).toHaveBeenCalledWith({
      repoPath: '/repo',
      ref: 'main',
      filePath: 'src/foo.ts',
    });
    expect(result).toContain('file content');
  });

  it('dispatches list_changed_files tool', async () => {
    vi.mocked(listChangedFiles).mockResolvedValue({
      files: [{ path: 'a.ts', status: 'modified', additions: 1, deletions: 0 }],
      totalAdditions: 1,
      totalDeletions: 0,
    });

    const result = await executeTool('list_changed_files', {
      repoPath: '/repo',
      base: 'main',
      head: 'HEAD',
    });

    const parsed = JSON.parse(result);
    expect(parsed.files).toHaveLength(1);
    expect(parsed.files[0].status).toBe('modified');
  });

  it('dispatches search_code tool', async () => {
    vi.mocked(searchCode).mockResolvedValue({
      matches: [{ file: 'a.ts', line: 1, match: 'test' }],
    });

    const result = await executeTool('search_code', {
      repoPath: '/repo',
      pattern: 'test',
      glob: '*.ts',
    });

    const parsed = JSON.parse(result);
    expect(parsed.matches).toHaveLength(1);
  });

  it('dispatches find_importers tool', async () => {
    vi.mocked(findImporters).mockResolvedValue({ importers: ['src/bar.ts'] });

    const result = await executeTool('find_importers', {
      repoPath: '/repo',
      modulePath: 'src/foo.ts',
    });

    const parsed = JSON.parse(result);
    expect(parsed.importers).toContain('src/bar.ts');
  });

  it('dispatches list_test_files tool', async () => {
    vi.mocked(listTestFiles).mockResolvedValue({
      testFiles: ['src/__tests__/foo.test.ts'],
    });

    const result = await executeTool('list_test_files', {
      repoPath: '/repo',
      sourceFile: 'src/foo.ts',
    });

    const parsed = JSON.parse(result);
    expect(parsed.testFiles).toContain('src/__tests__/foo.test.ts');
  });

  it('throws for unknown tool', async () => {
    await expect(executeTool('unknown_tool', {})).rejects.toThrow('Unknown tool: unknown_tool');
  });
});
