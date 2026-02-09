import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock setup ──────────────────────────────────────────────────────────────

const { mockFg, mockReadFile } = vi.hoisted(() => ({
  mockFg: vi.fn(),
  mockReadFile: vi.fn(),
}));

vi.mock('fast-glob', () => ({
  default: mockFg,
}));

vi.mock('fs/promises', () => ({
  readFile: mockReadFile,
}));

import { buildImpactGraph } from '../src/impact/impact-graph.js';
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
 * Set up fast-glob to return a list of absolute paths and readFile to return
 * file contents.
 *
 * @param fileMap Map of repo-relative path -> file content.
 * @param repoPath The repo path used to construct absolute paths.
 */
function setupFiles(
  fileMap: Record<string, string>,
  repoPath: string = '/repo',
): void {
  const absolutePaths = Object.keys(fileMap).map((rel) => `${repoPath}/${rel}`);
  mockFg.mockResolvedValue(absolutePaths);

  mockReadFile.mockImplementation(async (absPath: string) => {
    // Convert absolute path back to relative
    const prefix = repoPath + '/';
    const rel = absPath.startsWith(prefix) ? absPath.slice(prefix.length) : absPath;
    if (rel in fileMap) {
      return fileMap[rel];
    }
    throw new Error(`ENOENT: no such file: ${absPath}`);
  });
}

// ── Reset mocks ─────────────────────────────────────────────────────────────

beforeEach(() => {
  mockFg.mockReset();
  mockReadFile.mockReset();

  mockFg.mockResolvedValue([]);
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe('buildImpactGraph', () => {
  const repoPath = '/repo';

  // ── Direct change only ──────────────────────────────────────────────

  describe('direct change only', () => {
    it('should list changed source files as directlyChanged', async () => {
      setupFiles({
        'src/a.ts': '',
        'src/b.ts': '',
      });

      const changedFiles = [
        makeChangedFile({ path: 'src/a.ts' }),
      ];

      const result = await buildImpactGraph(repoPath, changedFiles);

      expect(result.directlyChanged).toEqual(['src/a.ts']);
      expect(result.indirectlyAffected).toEqual([]);
      expect(result.edges).toEqual([]);
    });

    it('should only include source-category files in directlyChanged', async () => {
      setupFiles({
        'src/a.ts': '',
      });

      const changedFiles = [
        makeChangedFile({ path: 'src/a.ts', category: 'source' }),
        makeChangedFile({ path: 'README.md', category: 'doc' }),
        makeChangedFile({ path: 'package.json', category: 'config' }),
      ];

      const result = await buildImpactGraph(repoPath, changedFiles);

      expect(result.directlyChanged).toEqual(['src/a.ts']);
    });
  });

  // ── Single-level import ─────────────────────────────────────────────

  describe('single-level import', () => {
    it('should detect a file that directly imports a changed file', async () => {
      setupFiles({
        'src/a.ts': "import { foo } from './b';",
        'src/b.ts': 'export function foo() {}',
      });

      const changedFiles = [
        makeChangedFile({ path: 'src/b.ts' }),
      ];

      const result = await buildImpactGraph(repoPath, changedFiles);

      expect(result.directlyChanged).toEqual(['src/b.ts']);
      expect(result.indirectlyAffected).toContain('src/a.ts');
      expect(result.edges).toContainEqual({
        from: 'src/a.ts',
        to: 'src/b.ts',
        type: 'imports',
      });
    });

    it('should detect multiple files importing the same changed file', async () => {
      setupFiles({
        'src/a.ts': "import { foo } from './c';",
        'src/b.ts': "import { bar } from './c';",
        'src/c.ts': 'export function foo() {}\nexport function bar() {}',
      });

      const changedFiles = [
        makeChangedFile({ path: 'src/c.ts' }),
      ];

      const result = await buildImpactGraph(repoPath, changedFiles);

      expect(result.directlyChanged).toEqual(['src/c.ts']);
      expect(result.indirectlyAffected).toContain('src/a.ts');
      expect(result.indirectlyAffected).toContain('src/b.ts');
      expect(result.edges).toHaveLength(2);
    });
  });

  // ── Transitive imports ──────────────────────────────────────────────

  describe('transitive imports', () => {
    it('should detect transitive dependencies: A -> B -> C where C is changed', async () => {
      setupFiles({
        'src/a.ts': "import { b } from './b';",
        'src/b.ts': "import { c } from './c';",
        'src/c.ts': 'export const c = 1;',
      });

      const changedFiles = [
        makeChangedFile({ path: 'src/c.ts' }),
      ];

      const result = await buildImpactGraph(repoPath, changedFiles);

      expect(result.directlyChanged).toEqual(['src/c.ts']);
      expect(result.indirectlyAffected).toContain('src/b.ts');
      expect(result.indirectlyAffected).toContain('src/a.ts');

      // Edges: b imports c, a imports b
      expect(result.edges).toContainEqual({
        from: 'src/b.ts',
        to: 'src/c.ts',
        type: 'imports',
      });
      expect(result.edges).toContainEqual({
        from: 'src/a.ts',
        to: 'src/b.ts',
        type: 'imports',
      });
    });
  });

  // ── maxDepth limiting ───────────────────────────────────────────────

  describe('maxDepth limiting', () => {
    it('should stop BFS at depth=1 (only direct importers)', async () => {
      setupFiles({
        'src/a.ts': "import { b } from './b';",
        'src/b.ts': "import { c } from './c';",
        'src/c.ts': 'export const c = 1;',
      });

      const changedFiles = [
        makeChangedFile({ path: 'src/c.ts' }),
      ];

      const result = await buildImpactGraph(repoPath, changedFiles, 1);

      expect(result.directlyChanged).toEqual(['src/c.ts']);
      // Only b.ts is at depth 1
      expect(result.indirectlyAffected).toContain('src/b.ts');
      // a.ts is at depth 2, should NOT be included
      expect(result.indirectlyAffected).not.toContain('src/a.ts');
    });

    it('should include all levels when maxDepth is large enough', async () => {
      setupFiles({
        'src/a.ts': "import { b } from './b';",
        'src/b.ts': "import { c } from './c';",
        'src/c.ts': "import { d } from './d';",
        'src/d.ts': 'export const d = 1;',
      });

      const changedFiles = [
        makeChangedFile({ path: 'src/d.ts' }),
      ];

      const result = await buildImpactGraph(repoPath, changedFiles, 10);

      expect(result.indirectlyAffected).toContain('src/c.ts');
      expect(result.indirectlyAffected).toContain('src/b.ts');
      expect(result.indirectlyAffected).toContain('src/a.ts');
    });

    it('should return only directly changed with maxDepth=0', async () => {
      setupFiles({
        'src/a.ts': "import { b } from './b';",
        'src/b.ts': 'export const b = 1;',
      });

      const changedFiles = [
        makeChangedFile({ path: 'src/b.ts' }),
      ];

      const result = await buildImpactGraph(repoPath, changedFiles, 0);

      expect(result.directlyChanged).toEqual(['src/b.ts']);
      expect(result.indirectlyAffected).toEqual([]);
      expect(result.edges).toEqual([]);
    });
  });

  // ── Circular dependencies ───────────────────────────────────────────

  describe('circular dependencies', () => {
    it('should not infinite loop on A -> B -> A when A is changed', async () => {
      setupFiles({
        'src/a.ts': "import { b } from './b';\nexport const a = 1;",
        'src/b.ts': "import { a } from './a';\nexport const b = 2;",
      });

      const changedFiles = [
        makeChangedFile({ path: 'src/a.ts' }),
      ];

      const result = await buildImpactGraph(repoPath, changedFiles);

      expect(result.directlyChanged).toEqual(['src/a.ts']);
      expect(result.indirectlyAffected).toContain('src/b.ts');
      // Should complete without hanging
    });

    it('should handle three-way circular dependency: A -> B -> C -> A', async () => {
      setupFiles({
        'src/a.ts': "import { c } from './c';\nexport const a = 1;",
        'src/b.ts': "import { a } from './a';\nexport const b = 2;",
        'src/c.ts': "import { b } from './b';\nexport const c = 3;",
      });

      const changedFiles = [
        makeChangedFile({ path: 'src/a.ts' }),
      ];

      const result = await buildImpactGraph(repoPath, changedFiles);

      expect(result.directlyChanged).toEqual(['src/a.ts']);
      // b imports a (directly), c imports b (transitively)
      expect(result.indirectlyAffected).toContain('src/b.ts');
      expect(result.indirectlyAffected).toContain('src/c.ts');
    });
  });

  // ── Import resolution ───────────────────────────────────────────────

  describe('import resolution', () => {
    it('should resolve imports without extension by trying .ts', async () => {
      setupFiles({
        'src/a.ts': "import { helper } from './utils';",
        'src/utils.ts': 'export function helper() {}',
      });

      const changedFiles = [
        makeChangedFile({ path: 'src/utils.ts' }),
      ];

      const result = await buildImpactGraph(repoPath, changedFiles);

      expect(result.indirectlyAffected).toContain('src/a.ts');
    });

    it('should resolve imports with .js extension to .ts files', async () => {
      // In ESM with .js extensions, the import './utils.js' should resolve
      // to utils.js if it exists, or to utils.ts via extension resolution
      setupFiles({
        'src/a.ts': "import { helper } from './utils.js';",
        'src/utils.js': 'export function helper() {}',
      });

      const changedFiles = [
        makeChangedFile({ path: 'src/utils.js' }),
      ];

      const result = await buildImpactGraph(repoPath, changedFiles);

      expect(result.indirectlyAffected).toContain('src/a.ts');
    });

    it('should resolve /index.ts imports for directory-style imports', async () => {
      setupFiles({
        'src/app.ts': "import { create } from './lib';",
        'src/lib/index.ts': 'export function create() {}',
      });

      const changedFiles = [
        makeChangedFile({ path: 'src/lib/index.ts' }),
      ];

      const result = await buildImpactGraph(repoPath, changedFiles);

      expect(result.indirectlyAffected).toContain('src/app.ts');
    });

    it('should resolve .tsx extension', async () => {
      setupFiles({
        'src/app.tsx': "import { Button } from './components/Button';",
        'src/components/Button.tsx': 'export function Button() {}',
      });

      const changedFiles = [
        makeChangedFile({ path: 'src/components/Button.tsx' }),
      ];

      const result = await buildImpactGraph(repoPath, changedFiles);

      expect(result.indirectlyAffected).toContain('src/app.tsx');
    });
  });

  // ── Only relative imports tracked ───────────────────────────────────

  describe('bare specifier / non-relative imports', () => {
    it('should skip bare specifiers (node_modules imports)', async () => {
      setupFiles({
        'src/a.ts': "import express from 'express';\nimport lodash from 'lodash';",
        'src/b.ts': 'export const b = 1;',
      });

      const changedFiles = [
        makeChangedFile({ path: 'src/b.ts' }),
      ];

      const result = await buildImpactGraph(repoPath, changedFiles);

      // a.ts does not import b.ts, only external modules
      expect(result.indirectlyAffected).not.toContain('src/a.ts');
      expect(result.edges).toEqual([]);
    });

    it('should only track relative imports starting with ./ or ../', async () => {
      setupFiles({
        'src/a.ts': "import { foo } from './b';\nimport pkg from 'some-package';",
        'src/b.ts': 'export const foo = 1;',
      });

      const changedFiles = [
        makeChangedFile({ path: 'src/b.ts' }),
      ];

      const result = await buildImpactGraph(repoPath, changedFiles);

      // Only the relative import should create an edge
      expect(result.edges).toHaveLength(1);
      expect(result.edges[0]).toEqual({
        from: 'src/a.ts',
        to: 'src/b.ts',
        type: 'imports',
      });
    });
  });

  // ── Import patterns: static, dynamic, require ───────────────────────

  describe('import pattern detection', () => {
    it('should detect static import statements', async () => {
      setupFiles({
        'src/a.ts': "import { helper } from './b';",
        'src/b.ts': 'export function helper() {}',
      });

      const changedFiles = [makeChangedFile({ path: 'src/b.ts' })];
      const result = await buildImpactGraph(repoPath, changedFiles);

      expect(result.indirectlyAffected).toContain('src/a.ts');
    });

    it('should detect dynamic import() calls', async () => {
      setupFiles({
        'src/a.ts': "const mod = await import('./b');",
        'src/b.ts': 'export function helper() {}',
      });

      const changedFiles = [makeChangedFile({ path: 'src/b.ts' })];
      const result = await buildImpactGraph(repoPath, changedFiles);

      expect(result.indirectlyAffected).toContain('src/a.ts');
    });

    it('should detect require() calls', async () => {
      setupFiles({
        'src/a.js': "const mod = require('./b');",
        'src/b.js': 'module.exports = {};',
      });

      const changedFiles = [makeChangedFile({ path: 'src/b.js' })];
      const result = await buildImpactGraph(repoPath, changedFiles);

      expect(result.indirectlyAffected).toContain('src/a.js');
    });

    it('should detect export ... from statements', async () => {
      setupFiles({
        'src/barrel.ts': "export { foo } from './b';",
        'src/b.ts': 'export const foo = 1;',
      });

      const changedFiles = [makeChangedFile({ path: 'src/b.ts' })];
      const result = await buildImpactGraph(repoPath, changedFiles);

      expect(result.indirectlyAffected).toContain('src/barrel.ts');
    });
  });

  // ── No imports ──────────────────────────────────────────────────────

  describe('no imports', () => {
    it('should return only directlyChanged with no edges when files have no imports', async () => {
      setupFiles({
        'src/a.ts': 'export const a = 1;',
        'src/b.ts': 'export const b = 2;',
        'src/c.ts': 'export const c = 3;',
      });

      const changedFiles = [
        makeChangedFile({ path: 'src/a.ts' }),
      ];

      const result = await buildImpactGraph(repoPath, changedFiles);

      expect(result.directlyChanged).toEqual(['src/a.ts']);
      expect(result.indirectlyAffected).toEqual([]);
      expect(result.edges).toEqual([]);
    });
  });

  // ── Multiple changed files ──────────────────────────────────────────

  describe('multiple changed files', () => {
    it('should handle multiple directly changed files with separate dependents', async () => {
      setupFiles({
        'src/a.ts': "import { x } from './x';",
        'src/b.ts': "import { y } from './y';",
        'src/x.ts': 'export const x = 1;',
        'src/y.ts': 'export const y = 2;',
      });

      const changedFiles = [
        makeChangedFile({ path: 'src/x.ts' }),
        makeChangedFile({ path: 'src/y.ts' }),
      ];

      const result = await buildImpactGraph(repoPath, changedFiles);

      expect(result.directlyChanged).toContain('src/x.ts');
      expect(result.directlyChanged).toContain('src/y.ts');
      expect(result.indirectlyAffected).toContain('src/a.ts');
      expect(result.indirectlyAffected).toContain('src/b.ts');
      expect(result.edges).toHaveLength(2);
    });

    it('should deduplicate indirectly affected files that import multiple changed files', async () => {
      setupFiles({
        'src/consumer.ts': "import { x } from './x';\nimport { y } from './y';",
        'src/x.ts': 'export const x = 1;',
        'src/y.ts': 'export const y = 2;',
      });

      const changedFiles = [
        makeChangedFile({ path: 'src/x.ts' }),
        makeChangedFile({ path: 'src/y.ts' }),
      ];

      const result = await buildImpactGraph(repoPath, changedFiles);

      expect(result.directlyChanged).toContain('src/x.ts');
      expect(result.directlyChanged).toContain('src/y.ts');
      // consumer.ts should appear only once in indirectlyAffected
      const consumerCount = result.indirectlyAffected.filter(
        (f) => f === 'src/consumer.ts',
      ).length;
      expect(consumerCount).toBe(1);

      // But there should be two edges (consumer -> x, consumer -> y)
      expect(result.edges).toContainEqual({
        from: 'src/consumer.ts',
        to: 'src/x.ts',
        type: 'imports',
      });
      expect(result.edges).toContainEqual({
        from: 'src/consumer.ts',
        to: 'src/y.ts',
        type: 'imports',
      });
    });
  });

  // ── Unresolvable imports ────────────────────────────────────────────

  describe('unresolvable imports', () => {
    it('should gracefully skip imports that cannot be resolved to any file', async () => {
      setupFiles({
        'src/a.ts': "import { missing } from './nonexistent';",
        'src/b.ts': 'export const b = 1;',
      });

      const changedFiles = [makeChangedFile({ path: 'src/b.ts' })];
      const result = await buildImpactGraph(repoPath, changedFiles);

      // a.ts imports a file that doesn't exist, so no edge is created
      expect(result.indirectlyAffected).not.toContain('src/a.ts');
      expect(result.edges).toEqual([]);
    });
  });

  // ── Unreadable files ────────────────────────────────────────────────

  describe('unreadable files', () => {
    it('should skip files that cannot be read', async () => {
      // fast-glob returns the file, but readFile throws
      mockFg.mockResolvedValue(['/repo/src/a.ts', '/repo/src/b.ts']);
      mockReadFile.mockImplementation(async (absPath: string) => {
        if (absPath === '/repo/src/a.ts') {
          throw new Error('EACCES: permission denied');
        }
        return "import { a } from './a';";
      });

      const changedFiles = [makeChangedFile({ path: 'src/a.ts' })];
      const result = await buildImpactGraph(repoPath, changedFiles);

      // b.ts imports a.ts, but a.ts itself is unreadable (still processed as changed)
      expect(result.directlyChanged).toEqual(['src/a.ts']);
      expect(result.indirectlyAffected).toContain('src/b.ts');
    });
  });

  // ── Relative path with ../ ──────────────────────────────────────────

  describe('parent directory imports', () => {
    it('should resolve ../ imports correctly', async () => {
      setupFiles({
        'src/utils/helper.ts': "import { config } from '../config';",
        'src/config.ts': 'export const config = {};',
      });

      const changedFiles = [makeChangedFile({ path: 'src/config.ts' })];
      const result = await buildImpactGraph(repoPath, changedFiles);

      expect(result.indirectlyAffected).toContain('src/utils/helper.ts');
    });
  });

  // ── Empty repo ──────────────────────────────────────────────────────

  describe('empty scenarios', () => {
    it('should handle empty changed files list', async () => {
      setupFiles({
        'src/a.ts': "import { b } from './b';",
        'src/b.ts': 'export const b = 1;',
      });

      const result = await buildImpactGraph(repoPath, []);

      expect(result.directlyChanged).toEqual([]);
      expect(result.indirectlyAffected).toEqual([]);
      expect(result.edges).toEqual([]);
    });

    it('should handle no source files in repo', async () => {
      mockFg.mockResolvedValue([]);

      const changedFiles = [makeChangedFile({ path: 'src/a.ts' })];
      const result = await buildImpactGraph(repoPath, changedFiles);

      expect(result.directlyChanged).toEqual(['src/a.ts']);
      expect(result.indirectlyAffected).toEqual([]);
      expect(result.edges).toEqual([]);
    });
  });
});
