import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFile } from 'fs/promises';

vi.mock('fast-glob', () => ({
  default: vi.fn(),
}));

vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
}));

import fg from 'fast-glob';
import { findImporters, clearImporterCache } from '../src/tools/find-imports.js';

beforeEach(() => {
  vi.clearAllMocks();
  clearImporterCache();
});

describe('findImporters', () => {
  it('finds files that import a given module', async () => {
    vi.mocked(fg).mockResolvedValue([
      '/repo/src/bar.ts',
      '/repo/src/baz.ts',
      '/repo/src/foo.ts',
    ]);

    vi.mocked(readFile).mockImplementation(async (path) => {
      if (String(path).endsWith('bar.ts')) {
        return 'import { doStuff } from "./foo.js";\nconsole.log(doStuff());' as never;
      }
      if (String(path).endsWith('baz.ts')) {
        return 'import { other } from "./utils.js";\nconsole.log(other());' as never;
      }
      if (String(path).endsWith('foo.ts')) {
        return 'export function doStuff() { return 1; }' as never;
      }
      return '' as never;
    });

    const result = await findImporters({
      repoPath: '/repo',
      modulePath: 'src/foo.ts',
    });

    expect(result.importers).toContain('src/bar.ts');
    expect(result.importers).not.toContain('src/baz.ts');
  });

  it('returns empty array when no importers found', async () => {
    vi.mocked(fg).mockResolvedValue(['/repo/src/bar.ts']);
    vi.mocked(readFile).mockResolvedValue('const x = 1;' as never);

    const result = await findImporters({
      repoPath: '/repo',
      modulePath: 'src/foo.ts',
    });

    expect(result.importers).toHaveLength(0);
  });

  it('caches the reverse dependency map across calls', async () => {
    vi.mocked(fg).mockResolvedValue([
      '/repo/src/bar.ts',
      '/repo/src/foo.ts',
    ]);

    vi.mocked(readFile).mockImplementation(async (path) => {
      if (String(path).endsWith('bar.ts')) {
        return 'import { doStuff } from "./foo.js";' as never;
      }
      return 'export function doStuff() {}' as never;
    });

    // First call builds the cache
    await findImporters({ repoPath: '/repo', modulePath: 'src/foo.ts' });
    expect(fg).toHaveBeenCalledTimes(1);

    // Second call should reuse the cache — fg should NOT be called again
    await findImporters({ repoPath: '/repo', modulePath: 'src/foo.ts' });
    expect(fg).toHaveBeenCalledTimes(1);
  });

  it('clearImporterCache forces rebuild on next call', async () => {
    vi.mocked(fg).mockResolvedValue(['/repo/src/bar.ts']);
    vi.mocked(readFile).mockResolvedValue('const x = 1;' as never);

    await findImporters({ repoPath: '/repo', modulePath: 'src/foo.ts' });
    expect(fg).toHaveBeenCalledTimes(1);

    clearImporterCache();

    await findImporters({ repoPath: '/repo', modulePath: 'src/foo.ts' });
    expect(fg).toHaveBeenCalledTimes(2);
  });
});
