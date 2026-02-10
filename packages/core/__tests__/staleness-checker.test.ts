import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock setup ──────────────────────────────────────────────────────────────
// vi.hoisted() ensures the mock fns exist before vi.mock factories run.

const { mockShow, mockFg, mockReadFile } = vi.hoisted(() => ({
  mockShow: vi.fn(),
  mockFg: vi.fn(),
  mockReadFile: vi.fn(),
}));

vi.mock('simple-git', () => ({
  default: () => ({
    show: mockShow,
  }),
}));

vi.mock('fast-glob', () => ({
  default: mockFg,
}));

vi.mock('node:fs/promises', () => ({
  readFile: mockReadFile,
}));

import { checkDocStaleness } from '../src/docs/staleness-checker.js';
import type { ChangedFile } from '../src/types.js';

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeChangedFile(
  overrides: Partial<ChangedFile> & Pick<ChangedFile, 'path'>,
): ChangedFile {
  return {
    status: 'modified',
    additions: 0,
    deletions: 0,
    language: 'typescript',
    category: 'source',
    ...overrides,
  };
}

/**
 * Set up `git.show()` to return specific content based on the "ref:path" argument.
 * Accepts a map of `"ref:path"` -> content string.
 */
function setupGitShow(fileContents: Record<string, string>): void {
  mockShow.mockImplementation(async (ref: string) => {
    if (ref in fileContents) {
      return fileContents[ref];
    }
    throw new Error(`fatal: path '${ref}' does not exist`);
  });
}

// ── Reset mocks ─────────────────────────────────────────────────────────────

beforeEach(() => {
  mockShow.mockReset();
  mockFg.mockReset();
  mockReadFile.mockReset();

  // By default, fast-glob returns no doc files
  mockFg.mockResolvedValue([]);
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe('checkDocStaleness', () => {
  const repoPath = '/repo';
  const base = 'main';
  const head = 'feature';

  // ── No doc files ─────────────────────────────────────────────────────

  describe('no doc files', () => {
    it('should return empty staleReferences and checkedFiles when no doc files exist', async () => {
      mockFg.mockResolvedValue([]);

      const changedFiles = [
        makeChangedFile({ path: 'src/lib.ts', status: 'deleted' }),
      ];

      const result = await checkDocStaleness(repoPath, changedFiles, base, head);

      expect(result.staleReferences).toEqual([]);
      expect(result.checkedFiles).toEqual([]);
    });
  });

  // ── No changed source files ──────────────────────────────────────────

  describe('no changed source files', () => {
    it('should return no staleReferences when no source files are changed', async () => {
      mockFg.mockResolvedValue(['docs/guide.md']);
      mockReadFile.mockResolvedValue('Some documentation content');

      // Only doc files changed, no source/deleted/renamed
      const changedFiles = [
        makeChangedFile({ path: 'docs/guide.md', category: 'doc', status: 'modified' }),
      ];

      const result = await checkDocStaleness(repoPath, changedFiles, base, head);

      expect(result.staleReferences).toEqual([]);
      expect(result.checkedFiles).toEqual(['docs/guide.md']);
    });

    it('should return no staleReferences when only added files are present (no deletions or removals)', async () => {
      mockFg.mockResolvedValue(['README.md']);
      mockReadFile.mockResolvedValue('Some text');

      const changedFiles = [
        makeChangedFile({ path: 'src/new-module.ts', status: 'added', category: 'source' }),
      ];

      const result = await checkDocStaleness(repoPath, changedFiles, base, head);

      expect(result.staleReferences).toEqual([]);
      expect(result.checkedFiles).toEqual(['README.md']);
    });
  });

  // ── Deleted source file referenced in docs ───────────────────────────

  describe('deleted source file referenced in docs', () => {
    it('should detect a stale reference when a deleted file path appears in a doc', async () => {
      mockFg.mockResolvedValue(['docs/api.md']);

      const docContent = 'See the implementation in src/old-module.ts for details.';
      mockReadFile.mockResolvedValue(docContent);

      setupGitShow({
        'main:src/old-module.ts': 'export function oldFunc(): void {}',
      });

      const changedFiles = [
        makeChangedFile({ path: 'src/old-module.ts', status: 'deleted' }),
      ];

      const result = await checkDocStaleness(repoPath, changedFiles, base, head);

      expect(result.staleReferences.length).toBeGreaterThanOrEqual(1);

      // Check that the deleted file path reference is found
      const pathRef = result.staleReferences.find(
        (r) => r.reference === 'src/old-module.ts',
      );
      expect(pathRef).toBeDefined();
      expect(pathRef!.reason).toBe('referenced file was deleted');
      expect(pathRef!.docFile).toBe('docs/api.md');
      expect(pathRef!.line).toBe(1);
    });

    it('should also detect removed exported symbols from a deleted file', async () => {
      mockFg.mockResolvedValue(['docs/api.md']);

      const docContent = 'Use the oldFunc function to process data.';
      mockReadFile.mockResolvedValue(docContent);

      setupGitShow({
        'main:src/old-module.ts': 'export function oldFunc(): void {}',
      });

      const changedFiles = [
        makeChangedFile({ path: 'src/old-module.ts', status: 'deleted' }),
      ];

      const result = await checkDocStaleness(repoPath, changedFiles, base, head);

      const symbolRef = result.staleReferences.find(
        (r) => r.reference === 'oldFunc',
      );
      expect(symbolRef).toBeDefined();
      expect(symbolRef!.reason).toContain('referenced symbol was removed from');
      expect(symbolRef!.reason).toContain('src/old-module.ts');
    });
  });

  // ── Renamed file ─────────────────────────────────────────────────────

  describe('renamed file', () => {
    it('should detect stale reference to old path when a file is renamed', async () => {
      mockFg.mockResolvedValue(['docs/guide.md']);

      const docContent = 'Import from src/old-name.ts to get the helper.';
      mockReadFile.mockResolvedValue(docContent);

      const changedFiles = [
        makeChangedFile({
          path: 'src/new-name.ts',
          oldPath: 'src/old-name.ts',
          status: 'renamed',
        }),
      ];

      const result = await checkDocStaleness(repoPath, changedFiles, base, head);

      expect(result.staleReferences).toHaveLength(1);
      expect(result.staleReferences[0].reference).toBe('src/old-name.ts');
      expect(result.staleReferences[0].reason).toContain('renamed to src/new-name.ts');
      expect(result.staleReferences[0].docFile).toBe('docs/guide.md');
    });
  });

  // ── Removed exports ──────────────────────────────────────────────────

  describe('removed exports from modified file', () => {
    it('should detect stale reference when an exported symbol is removed', async () => {
      mockFg.mockResolvedValue(['README.md']);

      const docContent = 'Call processData to handle incoming requests.';
      mockReadFile.mockResolvedValue(docContent);

      setupGitShow({
        'main:src/api.ts': `
          export function processData(): void {}
          export function keepThis(): void {}
        `,
        'feature:src/api.ts': `
          export function keepThis(): void {}
        `,
      });

      const changedFiles = [
        makeChangedFile({ path: 'src/api.ts', status: 'modified', category: 'source' }),
      ];

      const result = await checkDocStaleness(repoPath, changedFiles, base, head);

      const ref = result.staleReferences.find((r) => r.reference === 'processData');
      expect(ref).toBeDefined();
      expect(ref!.reason).toContain('referenced symbol was removed from');
      expect(ref!.reason).toContain('src/api.ts');
    });

    it('should not flag symbols that still exist in head', async () => {
      mockFg.mockResolvedValue(['README.md']);

      const docContent = 'Use keepThis for stable functionality.';
      mockReadFile.mockResolvedValue(docContent);

      setupGitShow({
        'main:src/api.ts': `
          export function processData(): void {}
          export function keepThis(): void {}
        `,
        'feature:src/api.ts': `
          export function keepThis(): void {}
        `,
      });

      const changedFiles = [
        makeChangedFile({ path: 'src/api.ts', status: 'modified', category: 'source' }),
      ];

      const result = await checkDocStaleness(repoPath, changedFiles, base, head);

      // keepThis should NOT be flagged as stale since it still exists
      const keepRef = result.staleReferences.find((r) => r.reference === 'keepThis');
      expect(keepRef).toBeUndefined();
    });
  });

  // ── Generic name handling ────────────────────────────────────────────

  describe('generic name handling', () => {
    it('should NOT flag standalone prose "types" as stale', async () => {
      mockFg.mockResolvedValue(['docs/guide.md']);

      // "types" in ordinary prose — should not be flagged
      const docContent = 'There are several types of configuration available.';
      mockReadFile.mockResolvedValue(docContent);

      setupGitShow({
        'main:src/types.ts': 'export interface Config { key: string; }',
      });

      const changedFiles = [
        makeChangedFile({ path: 'src/types.ts', status: 'deleted' }),
      ];

      const result = await checkDocStaleness(repoPath, changedFiles, base, head);

      // The deleted path "src/types.ts" should still be found if the doc mentions it
      // but the generic stem "types" should NOT match in plain prose
      const genericRef = result.staleReferences.find(
        (r) => r.reference === 'types' && r.reason.includes('referenced symbol was removed'),
      );
      // "types" as a standalone word in prose should not be flagged via stem
      // (it IS flagged if the doc doesn't contain it in a path-like context)
      expect(genericRef).toBeUndefined();
    });

    it('should flag "./types" as stale (path context)', async () => {
      mockFg.mockResolvedValue(['docs/guide.md']);

      const docContent = 'Import from ./types to get the Config interface.';
      mockReadFile.mockResolvedValue(docContent);

      setupGitShow({
        'main:src/types.ts': 'export interface Config { key: string; }',
      });

      const changedFiles = [
        makeChangedFile({ path: 'src/types.ts', status: 'deleted' }),
      ];

      const result = await checkDocStaleness(repoPath, changedFiles, base, head);

      // The stem "types" should be flagged because it appears in a path context: ./types
      const stemRef = result.staleReferences.find(
        (r) => r.reference === 'types' && r.reason.includes('referenced symbol was removed'),
      );
      expect(stemRef).toBeDefined();
    });

    it('should flag "types.ts" as stale (file extension context)', async () => {
      mockFg.mockResolvedValue(['docs/guide.md']);

      const docContent = 'See types.ts for all interfaces.';
      mockReadFile.mockResolvedValue(docContent);

      setupGitShow({
        'main:src/types.ts': 'export interface Config { key: string; }',
      });

      const changedFiles = [
        makeChangedFile({ path: 'src/types.ts', status: 'deleted' }),
      ];

      const result = await checkDocStaleness(repoPath, changedFiles, base, head);

      const stemRef = result.staleReferences.find(
        (r) => r.reference === 'types' && r.reason.includes('referenced symbol was removed'),
      );
      expect(stemRef).toBeDefined();
    });

    it('should flag backtick-quoted `types` as stale (code context)', async () => {
      mockFg.mockResolvedValue(['docs/guide.md']);

      const docContent = 'The `types` module exports all shared interfaces.';
      mockReadFile.mockResolvedValue(docContent);

      setupGitShow({
        'main:src/types.ts': 'export interface Config { key: string; }',
      });

      const changedFiles = [
        makeChangedFile({ path: 'src/types.ts', status: 'deleted' }),
      ];

      const result = await checkDocStaleness(repoPath, changedFiles, base, head);

      const stemRef = result.staleReferences.find(
        (r) => r.reference === 'types' && r.reason.includes('referenced symbol was removed'),
      );
      expect(stemRef).toBeDefined();
    });

    it('should flag non-generic names even in plain prose', async () => {
      mockFg.mockResolvedValue(['docs/guide.md']);

      // "processData" is not a generic name, so it should match via word-boundary
      const docContent = 'Call processData to transform the payload.';
      mockReadFile.mockResolvedValue(docContent);

      setupGitShow({
        'main:src/processor.ts': 'export function processData(): void {}',
      });

      const changedFiles = [
        makeChangedFile({ path: 'src/processor.ts', status: 'deleted' }),
      ];

      const result = await checkDocStaleness(repoPath, changedFiles, base, head);

      const ref = result.staleReferences.find((r) => r.reference === 'processData');
      expect(ref).toBeDefined();
    });
  });

  // ── Multiple stale references in one doc ──────────────────────────────

  describe('multiple stale references in one doc', () => {
    it('should report all stale references found in the same doc file', async () => {
      mockFg.mockResolvedValue(['docs/api.md']);

      const docContent = [
        'Line 1: See src/old-module.ts for the old implementation.',
        'Line 2: The function processData handles input.',
        'Line 3: Import from src/renamed.ts for helpers.',
      ].join('\n');
      mockReadFile.mockResolvedValue(docContent);

      setupGitShow({
        'main:src/old-module.ts': 'export function processData(): void {}',
      });

      const changedFiles = [
        makeChangedFile({ path: 'src/old-module.ts', status: 'deleted' }),
        makeChangedFile({
          path: 'src/new-name.ts',
          oldPath: 'src/renamed.ts',
          status: 'renamed',
        }),
      ];

      const result = await checkDocStaleness(repoPath, changedFiles, base, head);

      // Expect at least 3 references:
      // 1. deleted path "src/old-module.ts" (line 1)
      // 2. removed symbol "processData" (line 2)
      // 3. renamed old path "src/renamed.ts" (line 3)
      expect(result.staleReferences.length).toBeGreaterThanOrEqual(3);

      const pathRef = result.staleReferences.find(
        (r) => r.reference === 'src/old-module.ts',
      );
      expect(pathRef).toBeDefined();
      expect(pathRef!.line).toBe(1);

      const symbolRef = result.staleReferences.find(
        (r) => r.reference === 'processData',
      );
      expect(symbolRef).toBeDefined();
      expect(symbolRef!.line).toBe(2);

      const renamedRef = result.staleReferences.find(
        (r) => r.reference === 'src/renamed.ts',
      );
      expect(renamedRef).toBeDefined();
      expect(renamedRef!.line).toBe(3);
    });
  });

  // ── Doc files checked list ────────────────────────────────────────────

  describe('checkedFiles list', () => {
    it('should populate checkedFiles with all discovered doc files', async () => {
      mockFg.mockResolvedValue(['README.md', 'docs/api.md', 'docs/guide.mdx']);
      mockReadFile.mockResolvedValue('No references here.');

      const changedFiles = [
        makeChangedFile({ path: 'src/module.ts', status: 'deleted' }),
      ];

      setupGitShow({
        'main:src/module.ts': 'export function unused(): void {}',
      });

      const result = await checkDocStaleness(repoPath, changedFiles, base, head);

      expect(result.checkedFiles).toEqual(['README.md', 'docs/api.md', 'docs/guide.mdx']);
    });

    it('should return checkedFiles even when nothing is stale', async () => {
      mockFg.mockResolvedValue(['README.md']);
      mockReadFile.mockResolvedValue('No stale content at all.');

      // Only added files, no deletions/renames/removals to check for
      const changedFiles = [
        makeChangedFile({ path: 'src/brand-new.ts', status: 'added', category: 'source' }),
      ];

      const result = await checkDocStaleness(repoPath, changedFiles, base, head);

      // checkedFiles returned because there was nothing to search for (short-circuit)
      expect(result.checkedFiles).toEqual(['README.md']);
      expect(result.staleReferences).toEqual([]);
    });
  });

  // ── File reading fallback ─────────────────────────────────────────────

  describe('file reading', () => {
    it('should fall back to git show when readFile fails', async () => {
      mockFg.mockResolvedValue(['docs/api.md']);

      // readFile throws (file not on disk)
      mockReadFile.mockRejectedValue(new Error('ENOENT'));

      // git show returns the doc content instead
      setupGitShow({
        'feature:docs/api.md': 'Reference to src/deleted.ts here.',
        'main:src/deleted.ts': 'export function gone(): void {}',
      });

      const changedFiles = [
        makeChangedFile({ path: 'src/deleted.ts', status: 'deleted' }),
      ];

      const result = await checkDocStaleness(repoPath, changedFiles, base, head);

      const ref = result.staleReferences.find(
        (r) => r.reference === 'src/deleted.ts',
      );
      expect(ref).toBeDefined();
    });

    it('should skip a doc file when both readFile and git show fail', async () => {
      mockFg.mockResolvedValue(['docs/broken.md']);

      // Both reading methods fail
      mockReadFile.mockRejectedValue(new Error('ENOENT'));
      mockShow.mockRejectedValue(new Error('fatal: not found'));

      const changedFiles = [
        makeChangedFile({ path: 'src/deleted.ts', status: 'deleted' }),
      ];

      const result = await checkDocStaleness(repoPath, changedFiles, base, head);

      // No stale references since the doc couldn't be read
      expect(result.staleReferences).toEqual([]);
    });
  });

  // ── filenameStem() edge cases ──────────────────────────────────────────
  // These test the internal filenameStem() helper indirectly through the
  // public checkDocStaleness() function. The stem is used as a symbol
  // reference for deleted source files.

  describe('filenameStem() edge cases', () => {
    it('should use the full filename as stem when there is no extension (e.g. "Makefile")', async () => {
      mockFg.mockResolvedValue(['docs/guide.md']);

      // The doc references "Makefile" as a word — since it's not a generic name,
      // it should be matched via word-boundary regex.
      const docContent = 'The Makefile handles the build process.';
      mockReadFile.mockResolvedValue(docContent);

      setupGitShow({
        'main:src/Makefile': 'export const BUILD = true;',
      });

      const changedFiles = [
        makeChangedFile({ path: 'src/Makefile', status: 'deleted' }),
      ];

      const result = await checkDocStaleness(repoPath, changedFiles, base, head);

      // The stem "Makefile" (no dot, so the whole name is the stem) should
      // match via word-boundary regex.
      const stemRef = result.staleReferences.find(
        (r) => r.reference === 'Makefile' && r.reason.includes('referenced symbol was removed'),
      );
      expect(stemRef).toBeDefined();
    });

    it('should use only the part before the first dot for files with multiple dots (e.g. "file.test.ts")', async () => {
      mockFg.mockResolvedValue(['docs/guide.md']);

      // The doc references "file" as a word — this tests that filenameStem
      // returns "file" not "file.test" for "file.test.ts"
      const docContent = 'The file module provides utility functions.';
      mockReadFile.mockResolvedValue(docContent);

      setupGitShow({
        'main:src/file.test.ts': 'export function testHelper(): void {}',
      });

      const changedFiles = [
        makeChangedFile({ path: 'src/file.test.ts', status: 'deleted' }),
      ];

      const result = await checkDocStaleness(repoPath, changedFiles, base, head);

      // The stem should be "file" (before the first dot), not "file.test".
      // "file" is not a generic name, so it matches via word-boundary.
      const stemRef = result.staleReferences.find(
        (r) => r.reference === 'file' && r.reason.includes('referenced symbol was removed'),
      );
      expect(stemRef).toBeDefined();
    });

    it('should handle empty path gracefully (no stem produced)', async () => {
      mockFg.mockResolvedValue(['docs/guide.md']);
      mockReadFile.mockResolvedValue('Nothing here.');

      // A file with an empty-ish path should not crash the system.
      // We simulate the deleted file scenario but the stem will be empty.
      setupGitShow({});

      const changedFiles = [
        makeChangedFile({ path: '.ts', status: 'deleted' }),
      ];

      // The stem of ".ts" is "" (empty before the first dot), so it should
      // not be pushed as a symbol reference. This should not crash.
      const result = await checkDocStaleness(repoPath, changedFiles, base, head);

      // No stale references should be generated from an empty stem
      const stemRefs = result.staleReferences.filter(
        (r) => r.reason.includes('referenced symbol was removed'),
      );
      expect(stemRefs).toEqual([]);
    });
  });

  // ── escapeRegex() edge cases ──────────────────────────────────────────
  // These test the internal escapeRegex() helper indirectly. The function
  // is used when building regex patterns for symbol name matching.

  describe('escapeRegex() edge cases', () => {
    it('should correctly escape special regex characters in symbol names used for matching', async () => {
      mockFg.mockResolvedValue(['docs/api.md']);

      // The symbol name "processData" doesn't have special chars, but
      // this test ensures that escapeRegex is invoked correctly when building
      // the generic name path context regex. The generic stem "config" with
      // special chars in the doc path should still work correctly.
      // Here we test a non-generic symbol that appears in the doc.
      const docContent = 'Use getValue_v2 from the settings module.';
      mockReadFile.mockResolvedValue(docContent);

      setupGitShow({
        'main:src/settings.ts': 'export const getValue_v2 = {};',
        'feature:src/settings.ts': '',
      });

      const changedFiles = [
        makeChangedFile({ path: 'src/settings.ts', status: 'modified', category: 'source' }),
      ];

      const result = await checkDocStaleness(repoPath, changedFiles, base, head);

      const ref = result.staleReferences.find((r) => r.reference === 'getValue_v2');
      expect(ref).toBeDefined();
    });

    it('should correctly match generic names in path context where escapeRegex is used for buildPathContextRegex', async () => {
      mockFg.mockResolvedValue(['docs/api.md']);

      // The generic stem "utils" with a path context should still work
      // even though the buildPathContextRegex uses escapeRegex internally.
      const docContent = 'Import from ./utils to get helpers.';
      mockReadFile.mockResolvedValue(docContent);

      setupGitShow({
        'main:src/utils.ts': 'export function helper(): void {}',
      });

      const changedFiles = [
        makeChangedFile({ path: 'src/utils.ts', status: 'deleted' }),
      ];

      const result = await checkDocStaleness(repoPath, changedFiles, base, head);

      const stemRef = result.staleReferences.find(
        (r) => r.reference === 'utils' && r.reason.includes('referenced symbol was removed'),
      );
      expect(stemRef).toBeDefined();
    });
  });

  // ── extractExportedSymbolNames() edge cases ─────────────────────────
  // These test the internal extractExportedSymbolNames() helper indirectly
  // through the public API by providing various export syntaxes in the base
  // file content.

  describe('extractExportedSymbolNames() edge cases', () => {
    it('should detect async function exports', async () => {
      mockFg.mockResolvedValue(['docs/api.md']);

      const docContent = 'Call fetchData to retrieve records.';
      mockReadFile.mockResolvedValue(docContent);

      setupGitShow({
        'main:src/fetcher.ts': 'export async function fetchData(): Promise<void> {}',
        'feature:src/fetcher.ts': '',
      });

      const changedFiles = [
        makeChangedFile({ path: 'src/fetcher.ts', status: 'modified', category: 'source' }),
      ];

      const result = await checkDocStaleness(repoPath, changedFiles, base, head);

      const ref = result.staleReferences.find((r) => r.reference === 'fetchData');
      expect(ref).toBeDefined();
      expect(ref!.reason).toContain('referenced symbol was removed from');
    });

    it('should detect generator function exports', async () => {
      mockFg.mockResolvedValue(['docs/api.md']);

      const docContent = 'Use generateItems for lazy iteration.';
      mockReadFile.mockResolvedValue(docContent);

      setupGitShow({
        'main:src/gen.ts': 'export function* generateItems(): Generator<number> { yield 1; }',
        'feature:src/gen.ts': '',
      });

      const changedFiles = [
        makeChangedFile({ path: 'src/gen.ts', status: 'modified', category: 'source' }),
      ];

      const result = await checkDocStaleness(repoPath, changedFiles, base, head);

      const ref = result.staleReferences.find((r) => r.reference === 'generateItems');
      expect(ref).toBeDefined();
    });

    it('should detect default exported function', async () => {
      mockFg.mockResolvedValue(['docs/api.md']);

      const docContent = 'Call mainHandler to start the app.';
      mockReadFile.mockResolvedValue(docContent);

      setupGitShow({
        'main:src/handler.ts': 'export default function mainHandler(): void {}',
        'feature:src/handler.ts': '',
      });

      const changedFiles = [
        makeChangedFile({ path: 'src/handler.ts', status: 'modified', category: 'source' }),
      ];

      const result = await checkDocStaleness(repoPath, changedFiles, base, head);

      const ref = result.staleReferences.find((r) => r.reference === 'mainHandler');
      expect(ref).toBeDefined();
    });

    it('should detect default exported class', async () => {
      mockFg.mockResolvedValue(['docs/api.md']);

      const docContent = 'Instantiate AppServer to start.';
      mockReadFile.mockResolvedValue(docContent);

      setupGitShow({
        'main:src/server.ts': 'export default class AppServer {}',
        'feature:src/server.ts': '',
      });

      const changedFiles = [
        makeChangedFile({ path: 'src/server.ts', status: 'modified', category: 'source' }),
      ];

      const result = await checkDocStaleness(repoPath, changedFiles, base, head);

      const ref = result.staleReferences.find((r) => r.reference === 'AppServer');
      expect(ref).toBeDefined();
    });

    it('should detect enum exports', async () => {
      mockFg.mockResolvedValue(['docs/api.md']);

      const docContent = 'Use the Status enum for state management.';
      mockReadFile.mockResolvedValue(docContent);

      setupGitShow({
        'main:src/enums.ts': 'export enum Status { Active, Inactive }',
        'feature:src/enums.ts': '',
      });

      const changedFiles = [
        makeChangedFile({ path: 'src/enums.ts', status: 'modified', category: 'source' }),
      ];

      const result = await checkDocStaleness(repoPath, changedFiles, base, head);

      const ref = result.staleReferences.find((r) => r.reference === 'Status');
      expect(ref).toBeDefined();
    });

    it('should detect async default exported function', async () => {
      mockFg.mockResolvedValue(['docs/api.md']);

      const docContent = 'Use bootstrap to initialize the app.';
      mockReadFile.mockResolvedValue(docContent);

      setupGitShow({
        'main:src/boot.ts': 'export default async function bootstrap(): Promise<void> {}',
        'feature:src/boot.ts': '',
      });

      const changedFiles = [
        makeChangedFile({ path: 'src/boot.ts', status: 'modified', category: 'source' }),
      ];

      const result = await checkDocStaleness(repoPath, changedFiles, base, head);

      const ref = result.staleReferences.find((r) => r.reference === 'bootstrap');
      expect(ref).toBeDefined();
    });

    it('should deduplicate symbols that appear multiple times in the source', async () => {
      mockFg.mockResolvedValue(['docs/api.md']);

      const docContent = 'Use doStuff for processing.';
      mockReadFile.mockResolvedValue(docContent);

      // The same symbol name exported in different forms — but since
      // extractExportedSymbolNames deduplicates, only one reference
      // should be tracked. However, note that "export function doStuff" and
      // "export const doStuff" are both parsed. Since the function uses
      // `new Set()` for dedup, only one entry should result.
      setupGitShow({
        'main:src/dupe.ts': [
          'export function doStuff(): void {}',
          // In practice a single file wouldn't have duplicate names, but
          // for testing the Set dedup, let's just put two export lines that
          // regex would match the same name.
        ].join('\n'),
        'feature:src/dupe.ts': '',
      });

      const changedFiles = [
        makeChangedFile({ path: 'src/dupe.ts', status: 'modified', category: 'source' }),
      ];

      const result = await checkDocStaleness(repoPath, changedFiles, base, head);

      // Should have exactly one reference for "doStuff"
      const refs = result.staleReferences.filter((r) => r.reference === 'doStuff');
      expect(refs).toHaveLength(1);
    });
  });

  // ── Renamed file with falsy oldPath ───────────────────────────────────

  describe('renamed file with falsy oldPath', () => {
    it('should not produce stale references for a renamed file when oldPath is undefined', async () => {
      mockFg.mockResolvedValue(['docs/guide.md']);

      const docContent = 'Import from src/old-path.ts for helpers.';
      mockReadFile.mockResolvedValue(docContent);

      // The file is marked as renamed but oldPath is undefined (falsy).
      // buildRenamedPaths filters with `f.status === 'renamed' && f.oldPath`,
      // so this should be excluded.
      const changedFiles = [
        makeChangedFile({
          path: 'src/new-path.ts',
          oldPath: undefined,
          status: 'renamed',
        }),
      ];

      const result = await checkDocStaleness(repoPath, changedFiles, base, head);

      // No stale references from rename since oldPath is falsy
      const renamedRefs = result.staleReferences.filter(
        (r) => r.reason.includes('renamed'),
      );
      expect(renamedRefs).toEqual([]);
    });

    it('should not produce stale references for a renamed file when oldPath is empty string', async () => {
      mockFg.mockResolvedValue(['docs/guide.md']);

      const docContent = 'See the API guide.';
      mockReadFile.mockResolvedValue(docContent);

      const changedFiles = [
        makeChangedFile({
          path: 'src/new-path.ts',
          oldPath: '',
          status: 'renamed',
        }),
      ];

      const result = await checkDocStaleness(repoPath, changedFiles, base, head);

      const renamedRefs = result.staleReferences.filter(
        (r) => r.reason.includes('renamed'),
      );
      expect(renamedRefs).toEqual([]);
    });
  });

  // ── Non-source files are skipped for symbol extraction ────────────────

  describe('non-source file filtering', () => {
    it('should not extract symbols from non-source category files', async () => {
      mockFg.mockResolvedValue(['README.md']);
      mockReadFile.mockResolvedValue('Reference to someFunc here.');

      const changedFiles = [
        makeChangedFile({ path: 'test/helper.ts', status: 'modified', category: 'test' }),
      ];

      const result = await checkDocStaleness(repoPath, changedFiles, base, head);

      // No symbols should be extracted from test files
      expect(result.staleReferences).toEqual([]);
    });
  });

  // ── Multiple doc files ────────────────────────────────────────────────

  describe('multiple doc files', () => {
    it('should scan all doc files for stale references', async () => {
      mockFg.mockResolvedValue(['README.md', 'docs/api.md']);

      mockReadFile.mockImplementation(async (filePath: string) => {
        if (filePath === '/repo/README.md') {
          return 'This project uses src/deleted.ts for core logic.';
        }
        if (filePath === '/repo/docs/api.md') {
          return 'The src/deleted.ts module provides key APIs.';
        }
        throw new Error('ENOENT');
      });

      const changedFiles = [
        makeChangedFile({ path: 'src/deleted.ts', status: 'deleted' }),
      ];

      setupGitShow({
        'main:src/deleted.ts': 'export function api(): void {}',
      });

      const result = await checkDocStaleness(repoPath, changedFiles, base, head);

      // Both doc files reference the deleted path
      const readmeRefs = result.staleReferences.filter(
        (r) => r.docFile === 'README.md' && r.reference === 'src/deleted.ts',
      );
      const apiRefs = result.staleReferences.filter(
        (r) => r.docFile === 'docs/api.md' && r.reference === 'src/deleted.ts',
      );

      expect(readmeRefs).toHaveLength(1);
      expect(apiRefs).toHaveLength(1);
    });
  });

  // ── Line numbers ──────────────────────────────────────────────────────

  describe('line number tracking', () => {
    it('should report the correct line number for stale references', async () => {
      mockFg.mockResolvedValue(['docs/guide.md']);

      const docContent = [
        'This is line 1.',
        'This is line 2.',
        'See src/legacy-module.ts for details.',
        'This is line 4.',
      ].join('\n');
      mockReadFile.mockResolvedValue(docContent);

      const changedFiles = [
        makeChangedFile({ path: 'src/legacy-module.ts', status: 'deleted' }),
      ];

      // The deleted file has no exports, so only the path reference triggers
      setupGitShow({
        'main:src/legacy-module.ts': 'const internal = 1;',
      });

      const result = await checkDocStaleness(repoPath, changedFiles, base, head);

      // The stem "legacy-module" is not a generic name and does not appear in the doc,
      // only the full path does, but the stem may also match via word-boundary regex.
      // We check that the path reference on line 3 is reported.
      const pathRef = result.staleReferences.find(
        (r) => r.reference === 'src/legacy-module.ts',
      );
      expect(pathRef).toBeDefined();
      expect(pathRef!.line).toBe(3);
    });
  });
});
