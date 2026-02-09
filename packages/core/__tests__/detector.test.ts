import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock setup ──────────────────────────────────────────────────────────────
// vi.hoisted() ensures the mock fns exist before vi.mock factories run
// (vi.mock is hoisted above all other code by vitest).

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

vi.mock('fs/promises', () => ({
  readFile: mockReadFile,
}));

import { detectBreakingChanges } from '../src/breaking/detector.js';
import type { ChangedFile } from '../src/types.js';

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Create a minimal ChangedFile object for testing.
 */
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
 * Set up `git.show()` to return specific content based on the ref:path argument.
 * Accepts a map of `"ref:path"` → content string (or Error to simulate failure).
 */
function setupGitShow(fileContents: Record<string, string | Error>): void {
  mockShow.mockImplementation(async (args: string[]) => {
    const key = args[0]; // e.g. "main:src/lib.ts"
    if (key in fileContents) {
      const value = fileContents[key];
      if (value instanceof Error) {
        throw value;
      }
      return value;
    }
    // File does not exist at this ref
    throw new Error(`fatal: path '${key}' does not exist`);
  });
}

// ── Reset mocks before each test ────────────────────────────────────────────

beforeEach(() => {
  mockShow.mockReset();
  mockFg.mockReset();
  mockReadFile.mockReset();

  // By default, fast-glob returns no files (no consumers)
  mockFg.mockResolvedValue([]);
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe('detectBreakingChanges', () => {
  const repoPath = '/repo';
  const base = 'main';
  const head = 'feature';

  // ── 1. Removed exports ──────────────────────────────────────────────────

  describe('removed exports', () => {
    it('should detect a removed export function as removed_export with high severity', async () => {
      const baseContent = `
        export function foo(): void {}
        export function bar(): string { return ''; }
      `;
      const headContent = `
        export function foo(): void {}
      `;

      setupGitShow({
        'main:src/lib.ts': baseContent,
        'feature:src/lib.ts': headContent,
      });

      const files = [makeChangedFile({ path: 'src/lib.ts' })];
      const result = await detectBreakingChanges(repoPath, base, head, files);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('removed_export');
      expect(result[0].symbolName).toBe('bar');
      expect(result[0].severity).toBe('high');
      expect(result[0].filePath).toBe('src/lib.ts');
      expect(result[0].after).toBeNull();
      expect(result[0].before).toContain('bar');
    });

    it('should detect removal of multiple exports', async () => {
      const baseContent = `
        export function alpha(): void {}
        export function beta(): void {}
        export function gamma(): void {}
      `;
      const headContent = `
        export function alpha(): void {}
      `;

      setupGitShow({
        'main:src/lib.ts': baseContent,
        'feature:src/lib.ts': headContent,
      });

      const files = [makeChangedFile({ path: 'src/lib.ts' })];
      const result = await detectBreakingChanges(repoPath, base, head, files);

      const removedNames = result
        .filter((bc) => bc.type === 'removed_export')
        .map((bc) => bc.symbolName);
      expect(removedNames).toContain('beta');
      expect(removedNames).toContain('gamma');
      expect(removedNames).not.toContain('alpha');
    });

    it('should detect removal of a class export', async () => {
      const baseContent = `
        export class MyService {}
        export class MyHelper {}
      `;
      const headContent = `
        export class MyService {}
      `;

      setupGitShow({
        'main:src/service.ts': baseContent,
        'feature:src/service.ts': headContent,
      });

      const files = [makeChangedFile({ path: 'src/service.ts' })];
      const result = await detectBreakingChanges(repoPath, base, head, files);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('removed_export');
      expect(result[0].symbolName).toBe('MyHelper');
      expect(result[0].severity).toBe('high');
    });
  });

  // ── 2. Changed signatures ─────────────────────────────────────────────

  describe('changed signatures', () => {
    it('should detect an added parameter as changed_signature with medium severity', async () => {
      const baseContent = `export function calc(a: number): number { return a; }`;
      const headContent = `export function calc(a: number, b: number): number { return a + b; }`;

      setupGitShow({
        'main:src/math.ts': baseContent,
        'feature:src/math.ts': headContent,
      });

      const files = [makeChangedFile({ path: 'src/math.ts' })];
      const result = await detectBreakingChanges(repoPath, base, head, files);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('changed_signature');
      expect(result[0].symbolName).toBe('calc');
      expect(result[0].severity).toBe('medium');
      expect(result[0].before).toBeTruthy();
      expect(result[0].after).toBeTruthy();
    });

    it('should detect a removed parameter as changed_signature', async () => {
      const baseContent = `export function greet(name: string, greeting: string): string { return greeting + name; }`;
      const headContent = `export function greet(name: string): string { return name; }`;

      setupGitShow({
        'main:src/greet.ts': baseContent,
        'feature:src/greet.ts': headContent,
      });

      const files = [makeChangedFile({ path: 'src/greet.ts' })];
      const result = await detectBreakingChanges(repoPath, base, head, files);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('changed_signature');
      expect(result[0].symbolName).toBe('greet');
      expect(result[0].severity).toBe('medium');
    });

    it('should detect a changed parameter type as changed_signature', async () => {
      const baseContent = `export function parse(input: string): void {}`;
      const headContent = `export function parse(input: number): void {}`;

      setupGitShow({
        'main:src/parse.ts': baseContent,
        'feature:src/parse.ts': headContent,
      });

      const files = [makeChangedFile({ path: 'src/parse.ts' })];
      const result = await detectBreakingChanges(repoPath, base, head, files);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('changed_signature');
      expect(result[0].symbolName).toBe('parse');
      expect(result[0].severity).toBe('medium');
    });

    it('should detect a changed return type as changed_signature', async () => {
      const baseContent = `export function getId(): string { return ''; }`;
      const headContent = `export function getId(): number { return 0; }`;

      setupGitShow({
        'main:src/id.ts': baseContent,
        'feature:src/id.ts': headContent,
      });

      const files = [makeChangedFile({ path: 'src/id.ts' })];
      const result = await detectBreakingChanges(repoPath, base, head, files);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('changed_signature');
      expect(result[0].symbolName).toBe('getId');
      expect(result[0].severity).toBe('medium');
    });
  });

  // ── 3. Changed types ──────────────────────────────────────────────────

  describe('changed types', () => {
    it('should detect a kind change (const to variable) as changed_type with medium severity', async () => {
      const baseContent = `export const config = {};`;
      const headContent = `export let config = {};`;

      setupGitShow({
        'main:src/config.ts': baseContent,
        'feature:src/config.ts': headContent,
      });

      const files = [makeChangedFile({ path: 'src/config.ts' })];
      const result = await detectBreakingChanges(repoPath, base, head, files);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('changed_type');
      expect(result[0].symbolName).toBe('config');
      expect(result[0].severity).toBe('medium');
    });
  });

  // ── 4. Renamed exports ────────────────────────────────────────────────

  describe('renamed exports', () => {
    it('should detect a renamed function as renamed_export with low severity', async () => {
      // Same signature shape, different name => rename
      const baseContent = `export function oldName(x: number): number { return x; }`;
      const headContent = `export function newName(x: number): number { return x; }`;

      setupGitShow({
        'main:src/util.ts': baseContent,
        'feature:src/util.ts': headContent,
      });

      const files = [makeChangedFile({ path: 'src/util.ts' })];
      const result = await detectBreakingChanges(repoPath, base, head, files);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('renamed_export');
      expect(result[0].symbolName).toBe('oldName');
      expect(result[0].severity).toBe('low');
      expect(result[0].before).toContain('oldName');
      expect(result[0].after).toContain('newName');
    });

    it('should detect a renamed class as renamed_export', async () => {
      const baseContent = `export class OldClass {}`;
      const headContent = `export class NewClass {}`;

      setupGitShow({
        'main:src/cls.ts': baseContent,
        'feature:src/cls.ts': headContent,
      });

      const files = [makeChangedFile({ path: 'src/cls.ts' })];
      const result = await detectBreakingChanges(repoPath, base, head, files);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('renamed_export');
      expect(result[0].symbolName).toBe('OldClass');
      expect(result[0].severity).toBe('low');
    });

    it('should not match a rename when the kind differs', async () => {
      // Removed a function, added a class with same-ish signature shape.
      // Kind mismatch means it should NOT be detected as a rename.
      const baseContent = `export function Widget(): void {}`;
      const headContent = `export class Widget {}`;

      setupGitShow({
        'main:src/widget.ts': baseContent,
        'feature:src/widget.ts': headContent,
      });

      const files = [makeChangedFile({ path: 'src/widget.ts' })];
      const result = await detectBreakingChanges(repoPath, base, head, files);

      // This should show up as a changed_type (modified, kind changed) since
      // the name is the same in both base and head — diffExports puts it in modified
      const changedTypes = result.filter((bc) => bc.type === 'changed_type');
      expect(changedTypes.length).toBeGreaterThanOrEqual(1);
      expect(changedTypes[0].symbolName).toBe('Widget');
    });

    it('should not match a rename when signatures differ', async () => {
      // Different name AND different signature => removed_export, not rename
      const baseContent = `export function oldFunc(a: string): void {}`;
      const headContent = `export function newFunc(a: number, b: number): number { return 0; }`;

      setupGitShow({
        'main:src/func.ts': baseContent,
        'feature:src/func.ts': headContent,
      });

      const files = [makeChangedFile({ path: 'src/func.ts' })];
      const result = await detectBreakingChanges(repoPath, base, head, files);

      const removed = result.filter((bc) => bc.type === 'removed_export');
      expect(removed).toHaveLength(1);
      expect(removed[0].symbolName).toBe('oldFunc');
      expect(removed[0].severity).toBe('high');
    });
  });

  // ── 5. File filtering ─────────────────────────────────────────────────

  describe('file filtering', () => {
    it('should skip non-source files (.md, .json, .yaml)', async () => {
      // These files should not be analyzed even if they are "modified"
      const files = [
        makeChangedFile({ path: 'README.md', language: 'markdown', category: 'doc' }),
        makeChangedFile({ path: 'package.json', language: 'json', category: 'config' }),
        makeChangedFile({ path: 'config.yaml', language: 'yaml', category: 'config' }),
      ];

      const result = await detectBreakingChanges(repoPath, base, head, files);

      expect(result).toEqual([]);
      // git.show should not have been called at all
      expect(mockShow).not.toHaveBeenCalled();
    });

    it('should analyze .ts files', async () => {
      setupGitShow({
        'main:src/index.ts': `export function foo(): void {}`,
        'feature:src/index.ts': ``,
      });

      const files = [makeChangedFile({ path: 'src/index.ts' })];
      const result = await detectBreakingChanges(repoPath, base, head, files);

      expect(result).toHaveLength(1);
      expect(result[0].symbolName).toBe('foo');
    });

    it('should analyze .tsx files', async () => {
      setupGitShow({
        'main:src/App.tsx': `export function App(): void {}`,
        'feature:src/App.tsx': ``,
      });

      const files = [makeChangedFile({ path: 'src/App.tsx' })];
      const result = await detectBreakingChanges(repoPath, base, head, files);

      expect(result).toHaveLength(1);
      expect(result[0].symbolName).toBe('App');
    });

    it('should analyze .js files', async () => {
      setupGitShow({
        'main:lib/util.js': `export function helper() {}`,
        'feature:lib/util.js': ``,
      });

      const files = [
        makeChangedFile({ path: 'lib/util.js', language: 'javascript' }),
      ];
      const result = await detectBreakingChanges(repoPath, base, head, files);

      expect(result).toHaveLength(1);
      expect(result[0].symbolName).toBe('helper');
    });

    it('should analyze .jsx files', async () => {
      setupGitShow({
        'main:src/Button.jsx': `export function Button() {}`,
        'feature:src/Button.jsx': ``,
      });

      const files = [
        makeChangedFile({ path: 'src/Button.jsx', language: 'javascript' }),
      ];
      const result = await detectBreakingChanges(repoPath, base, head, files);

      expect(result).toHaveLength(1);
      expect(result[0].symbolName).toBe('Button');
    });

    it('should skip added files (only modified and deleted are analyzed)', async () => {
      const files = [
        makeChangedFile({ path: 'src/new-file.ts', status: 'added' }),
      ];

      const result = await detectBreakingChanges(repoPath, base, head, files);

      expect(result).toEqual([]);
      expect(mockShow).not.toHaveBeenCalled();
    });

    it('should skip renamed files', async () => {
      const files = [
        makeChangedFile({
          path: 'src/new-name.ts',
          status: 'renamed',
          oldPath: 'src/old-name.ts',
        }),
      ];

      const result = await detectBreakingChanges(repoPath, base, head, files);

      expect(result).toEqual([]);
      expect(mockShow).not.toHaveBeenCalled();
    });
  });

  // ── 6. Deleted files ──────────────────────────────────────────────────

  describe('deleted files', () => {
    it('should report all exports from a deleted file as removed_export with high severity', async () => {
      const baseContent = `
        export function alpha(): void {}
        export class Beta {}
        export const GAMMA = 42;
        export interface Delta { x: number; }
      `;

      setupGitShow({
        'main:src/deleted.ts': baseContent,
      });

      const files = [
        makeChangedFile({ path: 'src/deleted.ts', status: 'deleted' }),
      ];
      const result = await detectBreakingChanges(repoPath, base, head, files);

      expect(result.length).toBeGreaterThanOrEqual(4);
      for (const bc of result) {
        expect(bc.type).toBe('removed_export');
        expect(bc.severity).toBe('high');
        expect(bc.after).toBeNull();
        expect(bc.filePath).toBe('src/deleted.ts');
      }

      const names = result.map((bc) => bc.symbolName);
      expect(names).toContain('alpha');
      expect(names).toContain('Beta');
      expect(names).toContain('GAMMA');
      expect(names).toContain('Delta');
    });

    it('should handle a deleted file with no exports gracefully', async () => {
      const baseContent = `const internal = 42;`;

      setupGitShow({
        'main:src/internal.ts': baseContent,
      });

      const files = [
        makeChangedFile({ path: 'src/internal.ts', status: 'deleted' }),
      ];
      const result = await detectBreakingChanges(repoPath, base, head, files);

      expect(result).toEqual([]);
    });

    it('should skip a deleted file if base content is not available', async () => {
      // git.show for the base ref throws (file didn't exist in base either)
      setupGitShow({});

      const files = [
        makeChangedFile({ path: 'src/ghost.ts', status: 'deleted' }),
      ];
      const result = await detectBreakingChanges(repoPath, base, head, files);

      expect(result).toEqual([]);
    });
  });

  // ── 7. New files (only in head) ───────────────────────────────────────

  describe('new files (added)', () => {
    it('should produce no breaking changes for added files', async () => {
      const files = [
        makeChangedFile({ path: 'src/brand-new.ts', status: 'added' }),
        makeChangedFile({ path: 'src/another-new.tsx', status: 'added' }),
      ];

      const result = await detectBreakingChanges(repoPath, base, head, files);

      expect(result).toEqual([]);
    });
  });

  // ── 8. Error handling ─────────────────────────────────────────────────

  describe('error handling', () => {
    it('should silently skip files when git.show throws for base ref', async () => {
      // Simulates a binary file or unreadable file at base
      setupGitShow({});

      const files = [makeChangedFile({ path: 'src/binary.ts' })];
      const result = await detectBreakingChanges(repoPath, base, head, files);

      expect(result).toEqual([]);
    });

    it('should silently skip modified files when git.show throws for head ref', async () => {
      // Base exists but head throws
      setupGitShow({
        'main:src/broken.ts': `export function foo(): void {}`,
        // head ref not provided, so it will throw
      });

      const files = [makeChangedFile({ path: 'src/broken.ts' })];
      const result = await detectBreakingChanges(repoPath, base, head, files);

      // Head content is null => the file is skipped (continue)
      expect(result).toEqual([]);
    });

    it('should skip a file if an unexpected error occurs during analysis', async () => {
      // We set up base to return content, head to return content, but the content
      // causes diffExports to throw (unlikely but tests the catch block).
      // We'll simulate this by making git.show return then throw on the second call
      // for a different file, while the first file works fine.
      const goodBase = `export function working(): void {}`;
      const goodHead = ``;

      setupGitShow({
        'main:src/good.ts': goodBase,
        'feature:src/good.ts': goodHead,
        'main:src/bad.ts': `export function oops(): void {}`,
        'feature:src/bad.ts': `export function oops(): void {}`,
      });

      // Override show to throw specifically for bad.ts by making it throw
      // an error after returning base content
      const originalImpl = mockShow.getMockImplementation()!;
      let badCallCount = 0;
      mockShow.mockImplementation(async (args: string[]) => {
        const key = args[0];
        if (key === 'main:src/bad.ts') {
          badCallCount++;
          // Return base content first time
          return `export function oops(): void {}`;
        }
        if (key === 'feature:src/bad.ts') {
          // Throw on head to simulate corruption
          throw new Error('simulated corruption');
        }
        return originalImpl(args);
      });

      const files = [
        makeChangedFile({ path: 'src/good.ts' }),
        makeChangedFile({ path: 'src/bad.ts' }),
      ];
      const result = await detectBreakingChanges(repoPath, base, head, files);

      // good.ts should produce a result, bad.ts should be skipped
      const goodResults = result.filter((bc) => bc.filePath === 'src/good.ts');
      const badResults = result.filter((bc) => bc.filePath === 'src/bad.ts');
      expect(goodResults).toHaveLength(1);
      expect(badResults).toHaveLength(0);
    });

    it('should handle a mix of analyzable and unanalyzable files', async () => {
      setupGitShow({
        'main:src/ok.ts': `export function valid(): void {}`,
        'feature:src/ok.ts': ``,
        // src/nope.ts doesn't exist at either ref
      });

      const files = [
        makeChangedFile({ path: 'src/ok.ts' }),
        makeChangedFile({ path: 'src/nope.ts' }),
        makeChangedFile({ path: 'data.json', language: 'json', category: 'config' }),
      ];
      const result = await detectBreakingChanges(repoPath, base, head, files);

      expect(result).toHaveLength(1);
      expect(result[0].filePath).toBe('src/ok.ts');
    });
  });

  // ── 9. Empty changed files ────────────────────────────────────────────

  describe('empty changed files', () => {
    it('should return an empty array when no files are changed', async () => {
      const result = await detectBreakingChanges(repoPath, base, head, []);

      expect(result).toEqual([]);
      expect(mockShow).not.toHaveBeenCalled();
    });
  });

  // ── 10. Consumer population ───────────────────────────────────────────

  describe('consumer population', () => {
    it('should populate consumers for files with breaking changes', async () => {
      const baseContent = `
        export function removed(): void {}
        export function kept(): void {}
      `;
      const headContent = `
        export function kept(): void {}
      `;

      setupGitShow({
        'main:src/lib.ts': baseContent,
        'feature:src/lib.ts': headContent,
      });

      // fast-glob returns source files in the repo
      mockFg.mockResolvedValue([
        '/repo/src/lib.ts',
        '/repo/src/consumer-a.ts',
        '/repo/src/consumer-b.ts',
        '/repo/src/unrelated.ts',
      ]);

      // readFile returns content for consumer files
      mockReadFile.mockImplementation(async (path: string) => {
        if (path === '/repo/src/consumer-a.ts') {
          return `import { removed } from './lib';`;
        }
        if (path === '/repo/src/consumer-b.ts') {
          return `import { kept, removed } from './lib';`;
        }
        if (path === '/repo/src/unrelated.ts') {
          return `import { something } from './other';`;
        }
        if (path === '/repo/src/lib.ts') {
          return headContent;
        }
        throw new Error('file not found');
      });

      const files = [makeChangedFile({ path: 'src/lib.ts' })];
      const result = await detectBreakingChanges(repoPath, base, head, files);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('removed_export');
      expect(result[0].symbolName).toBe('removed');

      // Both consumer-a.ts and consumer-b.ts import from './lib'
      expect(result[0].consumers).toContain('src/consumer-a.ts');
      expect(result[0].consumers).toContain('src/consumer-b.ts');
      expect(result[0].consumers).not.toContain('src/unrelated.ts');
    });

    it('should not run consumer detection when there are no breaking changes', async () => {
      // No changes in exports
      const content = `export function unchanged(): void {}`;
      setupGitShow({
        'main:src/stable.ts': content,
        'feature:src/stable.ts': content,
      });

      const files = [makeChangedFile({ path: 'src/stable.ts' })];
      const result = await detectBreakingChanges(repoPath, base, head, files);

      expect(result).toEqual([]);
      // fast-glob should not have been called
      expect(mockFg).not.toHaveBeenCalled();
    });

    it('should handle consumers that cannot be read (unreadable files)', async () => {
      const baseContent = `export function old(): void {}`;
      const headContent = ``;

      setupGitShow({
        'main:src/api.ts': baseContent,
        'feature:src/api.ts': headContent,
      });

      mockFg.mockResolvedValue([
        '/repo/src/api.ts',
        '/repo/src/unreadable.ts',
      ]);

      mockReadFile.mockImplementation(async (path: string) => {
        if (path === '/repo/src/unreadable.ts') {
          throw new Error('EACCES: permission denied');
        }
        if (path === '/repo/src/api.ts') {
          return headContent;
        }
        throw new Error('file not found');
      });

      const files = [makeChangedFile({ path: 'src/api.ts' })];
      const result = await detectBreakingChanges(repoPath, base, head, files);

      // Should still produce the breaking change, just without unreadable consumers
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('removed_export');
      expect(result[0].consumers).toEqual([]);
    });

    it('should detect consumers using dynamic import()', async () => {
      const baseContent = `export function doWork(): void {}`;
      const headContent = ``;

      setupGitShow({
        'main:src/worker.ts': baseContent,
        'feature:src/worker.ts': headContent,
      });

      mockFg.mockResolvedValue([
        '/repo/src/worker.ts',
        '/repo/src/lazy.ts',
      ]);

      mockReadFile.mockImplementation(async (path: string) => {
        if (path === '/repo/src/lazy.ts') {
          return `const mod = await import('./worker');`;
        }
        if (path === '/repo/src/worker.ts') {
          return headContent;
        }
        throw new Error('file not found');
      });

      const files = [makeChangedFile({ path: 'src/worker.ts' })];
      const result = await detectBreakingChanges(repoPath, base, head, files);

      expect(result).toHaveLength(1);
      expect(result[0].consumers).toContain('src/lazy.ts');
    });

    it('should detect consumers using require()', async () => {
      const baseContent = `export function doWork(): void {}`;
      const headContent = ``;

      setupGitShow({
        'main:src/worker.js': baseContent,
        'feature:src/worker.js': headContent,
      });

      mockFg.mockResolvedValue([
        '/repo/src/worker.js',
        '/repo/src/loader.js',
      ]);

      mockReadFile.mockImplementation(async (path: string) => {
        if (path === '/repo/src/loader.js') {
          return `const mod = require('./worker');`;
        }
        if (path === '/repo/src/worker.js') {
          return headContent;
        }
        throw new Error('file not found');
      });

      const files = [
        makeChangedFile({ path: 'src/worker.js', language: 'javascript' }),
      ];
      const result = await detectBreakingChanges(repoPath, base, head, files);

      expect(result).toHaveLength(1);
      expect(result[0].consumers).toContain('src/loader.js');
    });

    it('should resolve imports with extension resolution', async () => {
      const baseContent = `export function helper(): void {}`;
      const headContent = ``;

      setupGitShow({
        'main:src/utils.ts': baseContent,
        'feature:src/utils.ts': headContent,
      });

      mockFg.mockResolvedValue([
        '/repo/src/utils.ts',
        '/repo/src/app.ts',
      ]);

      mockReadFile.mockImplementation(async (path: string) => {
        if (path === '/repo/src/app.ts') {
          // Imports without extension — should resolve to src/utils.ts
          return `import { helper } from './utils';`;
        }
        if (path === '/repo/src/utils.ts') {
          return headContent;
        }
        throw new Error('file not found');
      });

      const files = [makeChangedFile({ path: 'src/utils.ts' })];
      const result = await detectBreakingChanges(repoPath, base, head, files);

      expect(result).toHaveLength(1);
      expect(result[0].consumers).toContain('src/app.ts');
    });

    it('should ignore non-relative imports for consumer detection', async () => {
      const baseContent = `export function something(): void {}`;
      const headContent = ``;

      setupGitShow({
        'main:src/lib.ts': baseContent,
        'feature:src/lib.ts': headContent,
      });

      mockFg.mockResolvedValue([
        '/repo/src/lib.ts',
        '/repo/src/app.ts',
      ]);

      mockReadFile.mockImplementation(async (path: string) => {
        if (path === '/repo/src/app.ts') {
          // Only imports from node_modules, not relative
          return `import express from 'express';\nimport lodash from 'lodash';`;
        }
        if (path === '/repo/src/lib.ts') {
          return headContent;
        }
        throw new Error('file not found');
      });

      const files = [makeChangedFile({ path: 'src/lib.ts' })];
      const result = await detectBreakingChanges(repoPath, base, head, files);

      expect(result).toHaveLength(1);
      expect(result[0].consumers).toEqual([]);
    });

    it('should populate consumers on all breaking changes for the same file', async () => {
      const baseContent = `
        export function alpha(): void {}
        export function beta(): void {}
      `;
      const headContent = ``;

      setupGitShow({
        'main:src/api.ts': baseContent,
        'feature:src/api.ts': headContent,
      });

      mockFg.mockResolvedValue([
        '/repo/src/api.ts',
        '/repo/src/consumer.ts',
      ]);

      mockReadFile.mockImplementation(async (path: string) => {
        if (path === '/repo/src/consumer.ts') {
          return `import { alpha } from './api';`;
        }
        if (path === '/repo/src/api.ts') {
          return headContent;
        }
        throw new Error('file not found');
      });

      const files = [makeChangedFile({ path: 'src/api.ts' })];
      const result = await detectBreakingChanges(repoPath, base, head, files);

      // Both alpha and beta removals should have the same consumers
      expect(result).toHaveLength(2);
      for (const bc of result) {
        expect(bc.consumers).toContain('src/consumer.ts');
      }
    });
  });

  // ── Combined scenarios ────────────────────────────────────────────────

  describe('combined scenarios', () => {
    it('should handle multiple files with different change types', async () => {
      setupGitShow({
        // File 1: removed export
        'main:src/a.ts': `export function removed(): void {}`,
        'feature:src/a.ts': ``,
        // File 2: changed signature
        'main:src/b.ts': `export function changed(x: string): void {}`,
        'feature:src/b.ts': `export function changed(x: string, y: number): void {}`,
        // File 3: deleted file
        'main:src/c.ts': `export class Gone {}`,
      });

      mockFg.mockResolvedValue([]);

      const files = [
        makeChangedFile({ path: 'src/a.ts' }),
        makeChangedFile({ path: 'src/b.ts' }),
        makeChangedFile({ path: 'src/c.ts', status: 'deleted' }),
      ];
      const result = await detectBreakingChanges(repoPath, base, head, files);

      expect(result.length).toBeGreaterThanOrEqual(3);

      const removedFromA = result.find(
        (bc) => bc.filePath === 'src/a.ts' && bc.type === 'removed_export',
      );
      expect(removedFromA).toBeDefined();
      expect(removedFromA!.symbolName).toBe('removed');

      const changedInB = result.find(
        (bc) => bc.filePath === 'src/b.ts' && bc.type === 'changed_signature',
      );
      expect(changedInB).toBeDefined();
      expect(changedInB!.symbolName).toBe('changed');

      const deletedInC = result.find(
        (bc) => bc.filePath === 'src/c.ts' && bc.type === 'removed_export',
      );
      expect(deletedInC).toBeDefined();
      expect(deletedInC!.symbolName).toBe('Gone');
    });

    it('should handle a file with both renames and removals', async () => {
      // oldFunc -> newFunc (rename), deadFunc removed
      const baseContent = `
        export function oldFunc(x: number): number { return x; }
        export function deadFunc(): void {}
        export function stable(): void {}
      `;
      const headContent = `
        export function newFunc(x: number): number { return x; }
        export function stable(): void {}
      `;

      setupGitShow({
        'main:src/mixed.ts': baseContent,
        'feature:src/mixed.ts': headContent,
      });

      mockFg.mockResolvedValue([]);

      const files = [makeChangedFile({ path: 'src/mixed.ts' })];
      const result = await detectBreakingChanges(repoPath, base, head, files);

      const rename = result.find((bc) => bc.type === 'renamed_export');
      expect(rename).toBeDefined();
      expect(rename!.symbolName).toBe('oldFunc');

      const removed = result.find((bc) => bc.type === 'removed_export');
      expect(removed).toBeDefined();
      expect(removed!.symbolName).toBe('deadFunc');
    });

    it('should not report breaking changes when no exports changed', async () => {
      const content = `
        export function stable(): void {}
        export const VALUE = 42;
      `;

      setupGitShow({
        'main:src/stable.ts': content,
        'feature:src/stable.ts': content,
      });

      const files = [makeChangedFile({ path: 'src/stable.ts' })];
      const result = await detectBreakingChanges(repoPath, base, head, files);

      expect(result).toEqual([]);
    });
  });
});
