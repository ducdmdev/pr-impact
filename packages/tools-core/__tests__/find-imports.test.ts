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

  it('finds files using dynamic import()', async () => {
    vi.mocked(fg).mockResolvedValue([
      '/repo/src/loader.ts',
      '/repo/src/foo.ts',
    ]);

    vi.mocked(readFile).mockImplementation(async (path) => {
      if (String(path).endsWith('loader.ts')) {
        return 'const mod = await import("./foo.js");' as never;
      }
      return 'export const x = 1;' as never;
    });

    const result = await findImporters({
      repoPath: '/repo',
      modulePath: 'src/foo.ts',
    });

    expect(result.importers).toContain('src/loader.ts');
  });

  it('finds files using require()', async () => {
    vi.mocked(fg).mockResolvedValue([
      '/repo/src/legacy.ts',
      '/repo/src/foo.ts',
    ]);

    vi.mocked(readFile).mockImplementation(async (path) => {
      if (String(path).endsWith('legacy.ts')) {
        return 'const mod = require("./foo.js");' as never;
      }
      return 'export const x = 1;' as never;
    });

    const result = await findImporters({
      repoPath: '/repo',
      modulePath: 'src/foo.ts',
    });

    expect(result.importers).toContain('src/legacy.ts');
  });

  it('resolves bare directory imports to index files', async () => {
    vi.mocked(fg).mockResolvedValue([
      '/repo/src/app.ts',
      '/repo/src/utils/index.ts',
    ]);

    vi.mocked(readFile).mockImplementation(async (path) => {
      if (String(path).endsWith('app.ts')) {
        return 'import { helper } from "./utils";' as never;
      }
      return 'export function helper() {}' as never;
    });

    const result = await findImporters({
      repoPath: '/repo',
      modulePath: 'src/utils/index.ts',
    });

    expect(result.importers).toContain('src/app.ts');
  });

  it('skips files that cannot be read', async () => {
    vi.mocked(fg).mockResolvedValue([
      '/repo/src/bad.ts',
      '/repo/src/good.ts',
      '/repo/src/foo.ts',
    ]);

    vi.mocked(readFile).mockImplementation(async (path) => {
      if (String(path).endsWith('bad.ts')) {
        throw new Error('EACCES: permission denied');
      }
      if (String(path).endsWith('good.ts')) {
        return 'import { x } from "./foo.js";' as never;
      }
      return 'export const x = 1;' as never;
    });

    const result = await findImporters({
      repoPath: '/repo',
      modulePath: 'src/foo.ts',
    });

    expect(result.importers).toContain('src/good.ts');
    expect(result.importers).not.toContain('src/bad.ts');
  });
});
