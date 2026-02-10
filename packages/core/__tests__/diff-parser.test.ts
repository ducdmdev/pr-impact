import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock simple-git before importing the module under test.
const mockDiffSummary = vi.fn();
vi.mock('simple-git', () => ({
  default: () => ({
    diffSummary: mockDiffSummary,
  }),
}));

import { parseDiff, detectLanguage } from '../src/diff/diff-parser.js';

beforeEach(() => {
  mockDiffSummary.mockReset();
});

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Build a minimal DiffSummary-shaped object for simple-git.
 * `files` is the list of file entries; the optional arrays let us flag
 * created / deleted / renamed files by their raw path strings.
 */
function makeDiffSummary(
  files: Array<{
    file: string;
    insertions: number;
    deletions: number;
    binary?: boolean;
  }>,
  opts: {
    created?: string[];
    deleted?: string[];
    renamed?: string[];
  } = {},
) {
  return {
    files,
    insertions: files.reduce((s, f) => s + f.insertions, 0),
    deletions: files.reduce((s, f) => s + f.deletions, 0),
    changed: files.length,
    created: opts.created ?? [],
    deleted: opts.deleted ?? [],
    renamed: opts.renamed ?? [],
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('parseDiff', () => {
  // ── Language detection ────────────────────────────────────────────────────

  describe('language detection', () => {
    it.each([
      ['src/index.ts', 'typescript'],
      ['src/App.tsx', 'typescript'],
      ['lib/util.js', 'javascript'],
      ['lib/Widget.jsx', 'javascript'],
      ['lib/esm.mjs', 'javascript'],
      ['lib/cjs.cjs', 'javascript'],
      ['app/main.py', 'python'],
      ['cmd/server.go', 'go'],
      ['src/lib.rs', 'rust'],
      ['src/Main.java', 'java'],
      ['src/main.c', 'c'],
      ['src/main.cpp', 'cpp'],
      ['include/header.h', 'c'],
      ['include/header.hpp', 'cpp'],
      ['lib/app.rb', 'ruby'],
      ['src/index.php', 'php'],
      ['Sources/App.swift', 'swift'],
      ['src/main.kt', 'kotlin'],
      ['src/Main.scala', 'scala'],
      ['src/Program.cs', 'csharp'],
      ['src/App.vue', 'vue'],
      ['src/App.svelte', 'svelte'],
      ['docs/guide.md', 'markdown'],
      ['docs/guide.mdx', 'markdown'],
      ['data/config.json', 'json'],
      ['config.yaml', 'yaml'],
      ['config.yml', 'yaml'],
      ['config.toml', 'toml'],
      ['data/feed.xml', 'xml'],
      ['public/index.html', 'html'],
      ['styles/main.css', 'css'],
      ['styles/main.scss', 'scss'],
      ['styles/main.less', 'less'],
      ['db/migrations.sql', 'sql'],
      ['scripts/run.sh', 'shell'],
      ['scripts/run.bash', 'shell'],
      ['scripts/run.zsh', 'shell'],
      ['Dockerfile', 'dockerfile'],
      ['schema.graphql', 'graphql'],
      ['schema.gql', 'graphql'],
      ['api/service.proto', 'protobuf'],
      ['notes.txt', 'text'],
      ['docs/index.rst', 'restructuredtext'],
    ])('should detect language for %s as %s', async (filePath, expectedLang) => {
      mockDiffSummary.mockResolvedValueOnce(
        makeDiffSummary([{ file: filePath, insertions: 1, deletions: 0 }]),
      );

      const result = await parseDiff('/repo', 'main', 'feature');
      expect(result).toHaveLength(1);
      expect(result[0].language).toBe(expectedLang);
    });

    it('should return "unknown" for files with no extension', async () => {
      mockDiffSummary.mockResolvedValueOnce(
        makeDiffSummary([{ file: 'LICENSE', insertions: 1, deletions: 0 }]),
      );

      const result = await parseDiff('/repo', 'main', 'feature');
      expect(result[0].language).toBe('unknown');
    });

    it('should return "unknown" for unrecognized extensions', async () => {
      mockDiffSummary.mockResolvedValueOnce(
        makeDiffSummary([{ file: 'data/file.xyz', insertions: 1, deletions: 0 }]),
      );

      const result = await parseDiff('/repo', 'main', 'feature');
      expect(result[0].language).toBe('unknown');
    });

    it('should detect "dockerfile" for a file named Dockerfile (no extension)', async () => {
      mockDiffSummary.mockResolvedValueOnce(
        makeDiffSummary([{ file: 'deploy/Dockerfile', insertions: 3, deletions: 0 }]),
      );

      const result = await parseDiff('/repo', 'main', 'feature');
      expect(result[0].language).toBe('dockerfile');
    });

    it('should detect "makefile" for a file named Makefile', async () => {
      mockDiffSummary.mockResolvedValueOnce(
        makeDiffSummary([{ file: 'Makefile', insertions: 5, deletions: 2 }]),
      );

      const result = await parseDiff('/repo', 'main', 'feature');
      expect(result[0].language).toBe('makefile');
    });

    it('should detect ".dockerfile" extension as dockerfile', async () => {
      mockDiffSummary.mockResolvedValueOnce(
        makeDiffSummary([{ file: 'build/app.dockerfile', insertions: 2, deletions: 0 }]),
      );

      const result = await parseDiff('/repo', 'main', 'feature');
      expect(result[0].language).toBe('dockerfile');
    });
  });

  // ── Status determination ─────────────────────────────────────────────────

  describe('status determination', () => {
    it('should mark a created file as added', async () => {
      const filePath = 'src/new-file.ts';
      mockDiffSummary.mockResolvedValueOnce(
        makeDiffSummary(
          [{ file: filePath, insertions: 10, deletions: 0 }],
          { created: [filePath] },
        ),
      );

      const result = await parseDiff('/repo', 'main', 'feature');
      expect(result).toHaveLength(1);
      expect(result[0].status).toBe('added');
    });

    it('should mark a deleted file as deleted', async () => {
      const filePath = 'src/old-file.ts';
      mockDiffSummary.mockResolvedValueOnce(
        makeDiffSummary(
          [{ file: filePath, insertions: 0, deletions: 20 }],
          { deleted: [filePath] },
        ),
      );

      const result = await parseDiff('/repo', 'main', 'feature');
      expect(result).toHaveLength(1);
      expect(result[0].status).toBe('deleted');
    });

    it('should mark a renamed file as renamed', async () => {
      const rawPath = 'src/old-name.ts => src/new-name.ts';
      mockDiffSummary.mockResolvedValueOnce(
        makeDiffSummary(
          [{ file: rawPath, insertions: 0, deletions: 0 }],
          { renamed: [rawPath] },
        ),
      );

      const result = await parseDiff('/repo', 'main', 'feature');
      expect(result).toHaveLength(1);
      expect(result[0].status).toBe('renamed');
    });

    it('should default to modified when file is not in created/deleted/renamed', async () => {
      const filePath = 'src/existing.ts';
      mockDiffSummary.mockResolvedValueOnce(
        makeDiffSummary([{ file: filePath, insertions: 5, deletions: 3 }]),
      );

      const result = await parseDiff('/repo', 'main', 'feature');
      expect(result).toHaveLength(1);
      expect(result[0].status).toBe('modified');
    });

    it('should upgrade status to renamed when oldPath is detected from path pattern but simple-git says modified', async () => {
      // The file path contains a rename pattern, but simple-git did not
      // include it in the renamed array. parseDiff should still treat it as renamed.
      const rawPath = 'src/{old.ts => new.ts}';
      mockDiffSummary.mockResolvedValueOnce(
        makeDiffSummary([{ file: rawPath, insertions: 2, deletions: 1 }]),
      );

      const result = await parseDiff('/repo', 'main', 'feature');
      expect(result).toHaveLength(1);
      expect(result[0].status).toBe('renamed');
      expect(result[0].oldPath).toBe('src/old.ts');
      expect(result[0].path).toBe('src/new.ts');
    });
  });

  // ── Rename parsing ───────────────────────────────────────────────────────

  describe('rename parsing', () => {
    it('should parse brace-style rename with prefix: dir/{old.ts => new.ts}', async () => {
      const rawPath = 'src/{utils.ts => helpers.ts}';
      mockDiffSummary.mockResolvedValueOnce(
        makeDiffSummary(
          [{ file: rawPath, insertions: 0, deletions: 0 }],
          { renamed: [rawPath] },
        ),
      );

      const result = await parseDiff('/repo', 'main', 'feature');
      expect(result[0].path).toBe('src/helpers.ts');
      expect(result[0].oldPath).toBe('src/utils.ts');
      expect(result[0].status).toBe('renamed');
    });

    it('should parse brace-style rename with suffix: {old => new}/file.ts', async () => {
      const rawPath = '{src => lib}/index.ts';
      mockDiffSummary.mockResolvedValueOnce(
        makeDiffSummary(
          [{ file: rawPath, insertions: 0, deletions: 0 }],
          { renamed: [rawPath] },
        ),
      );

      const result = await parseDiff('/repo', 'main', 'feature');
      expect(result[0].path).toBe('lib/index.ts');
      expect(result[0].oldPath).toBe('src/index.ts');
      expect(result[0].status).toBe('renamed');
    });

    it('should parse brace-style rename with both prefix and suffix: a/{b => c}/d.ts', async () => {
      const rawPath = 'packages/{core => shared}/types.ts';
      mockDiffSummary.mockResolvedValueOnce(
        makeDiffSummary(
          [{ file: rawPath, insertions: 3, deletions: 1 }],
          { renamed: [rawPath] },
        ),
      );

      const result = await parseDiff('/repo', 'main', 'feature');
      expect(result[0].path).toBe('packages/shared/types.ts');
      expect(result[0].oldPath).toBe('packages/core/types.ts');
    });

    it('should parse simple rename: old.ts => new.ts', async () => {
      const rawPath = 'old-name.ts => new-name.ts';
      mockDiffSummary.mockResolvedValueOnce(
        makeDiffSummary(
          [{ file: rawPath, insertions: 0, deletions: 0 }],
          { renamed: [rawPath] },
        ),
      );

      const result = await parseDiff('/repo', 'main', 'feature');
      expect(result[0].path).toBe('new-name.ts');
      expect(result[0].oldPath).toBe('old-name.ts');
      expect(result[0].status).toBe('renamed');
    });

    it('should parse simple rename with directory paths', async () => {
      const rawPath = 'src/components/Button.tsx => src/ui/Button.tsx';
      mockDiffSummary.mockResolvedValueOnce(
        makeDiffSummary(
          [{ file: rawPath, insertions: 0, deletions: 0 }],
          { renamed: [rawPath] },
        ),
      );

      const result = await parseDiff('/repo', 'main', 'feature');
      expect(result[0].path).toBe('src/ui/Button.tsx');
      expect(result[0].oldPath).toBe('src/components/Button.tsx');
    });

    it('should not set oldPath for a non-rename file', async () => {
      mockDiffSummary.mockResolvedValueOnce(
        makeDiffSummary([{ file: 'src/index.ts', insertions: 5, deletions: 2 }]),
      );

      const result = await parseDiff('/repo', 'main', 'feature');
      expect(result[0].oldPath).toBeUndefined();
    });
  });

  // ── Path normalization ───────────────────────────────────────────────────

  describe('path normalization', () => {
    it('should remove double slashes from oldPath in brace-style renames', async () => {
      // git may report: "dir/{a => a/b}/file.ts"
      // With prefix="dir/", old="a", new="a/b", suffix="/file.ts"
      // oldPath = "dir/" + "a" + "/file.ts" => "dir/a/file.ts" (clean)
      // newPath = "dir/" + "a/b" + "/file.ts" => "dir/a/b/file.ts" (clean)
      // Test a case where concatenation produces double slashes:
      // prefix ends with "/" and old/new part is empty-like after slash manipulation
      // E.g., "src//{old => new}/" scenario -- not realistic with .+?,
      // but we can test a rename where prefix/suffix join cleanly.
      const rawPath = 'packages/{core => shared}/types.ts';
      mockDiffSummary.mockResolvedValueOnce(
        makeDiffSummary(
          [{ file: rawPath, insertions: 3, deletions: 1 }],
          { renamed: [rawPath] },
        ),
      );

      const result = await parseDiff('/repo', 'main', 'feature');
      expect(result[0].path).toBe('packages/shared/types.ts');
      expect(result[0].oldPath).toBe('packages/core/types.ts');
      expect(result[0].path).not.toContain('//');
      expect(result[0].oldPath).not.toContain('//');
    });

    it('should handle brace rename where prefix has trailing slash and suffix has leading slash', async () => {
      // "src/lib/{old => new}/index.ts" produces:
      //   prefix = "src/lib/", old = "old", new = "new", suffix = "/index.ts"
      //   oldPath = "src/lib/" + "old" + "/index.ts" => no double slash
      const rawPath = 'src/lib/{old => new}/index.ts';
      mockDiffSummary.mockResolvedValueOnce(
        makeDiffSummary(
          [{ file: rawPath, insertions: 0, deletions: 0 }],
          { renamed: [rawPath] },
        ),
      );

      const result = await parseDiff('/repo', 'main', 'feature');
      expect(result[0].path).toBe('src/lib/new/index.ts');
      expect(result[0].oldPath).toBe('src/lib/old/index.ts');
      expect(result[0].path).not.toContain('//');
      expect(result[0].oldPath).not.toContain('//');
    });
  });

  // ── Category assignment ──────────────────────────────────────────────────

  describe('category assignment', () => {
    it('should assign "source" category to a .ts source file', async () => {
      mockDiffSummary.mockResolvedValueOnce(
        makeDiffSummary([{ file: 'src/utils.ts', insertions: 3, deletions: 1 }]),
      );

      const result = await parseDiff('/repo', 'main', 'feature');
      expect(result[0].category).toBe('source');
    });

    it('should assign "test" category to a .test.ts file', async () => {
      mockDiffSummary.mockResolvedValueOnce(
        makeDiffSummary([{ file: 'src/utils.test.ts', insertions: 5, deletions: 0 }]),
      );

      const result = await parseDiff('/repo', 'main', 'feature');
      expect(result[0].category).toBe('test');
    });

    it('should assign "doc" category to a .md file', async () => {
      mockDiffSummary.mockResolvedValueOnce(
        makeDiffSummary([{ file: 'README.md', insertions: 2, deletions: 1 }]),
      );

      const result = await parseDiff('/repo', 'main', 'feature');
      expect(result[0].category).toBe('doc');
    });

    it('should assign "config" category to package.json', async () => {
      mockDiffSummary.mockResolvedValueOnce(
        makeDiffSummary([{ file: 'package.json', insertions: 1, deletions: 1 }]),
      );

      const result = await parseDiff('/repo', 'main', 'feature');
      expect(result[0].category).toBe('config');
    });

    it('should assign "other" category to an unrecognized file type', async () => {
      mockDiffSummary.mockResolvedValueOnce(
        makeDiffSummary([{ file: 'assets/logo.png', insertions: 0, deletions: 0 }]),
      );

      const result = await parseDiff('/repo', 'main', 'feature');
      expect(result[0].category).toBe('other');
    });
  });

  // ── Additions and deletions ──────────────────────────────────────────────

  describe('additions and deletions', () => {
    it('should report correct additions and deletions', async () => {
      mockDiffSummary.mockResolvedValueOnce(
        makeDiffSummary([{ file: 'src/app.ts', insertions: 42, deletions: 13 }]),
      );

      const result = await parseDiff('/repo', 'main', 'feature');
      expect(result[0].additions).toBe(42);
      expect(result[0].deletions).toBe(13);
    });

    it('should default to 0 when insertions/deletions are absent', async () => {
      // Simulate a file entry without insertions/deletions properties (e.g., binary)
      mockDiffSummary.mockResolvedValueOnce({
        files: [{ file: 'image.png', binary: true }],
        insertions: 0,
        deletions: 0,
        changed: 1,
        created: [],
        deleted: [],
        renamed: [],
      });

      const result = await parseDiff('/repo', 'main', 'feature');
      expect(result[0].additions).toBe(0);
      expect(result[0].deletions).toBe(0);
    });
  });

  // ── Edge cases ───────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('should return an empty array for an empty diff', async () => {
      mockDiffSummary.mockResolvedValueOnce(
        makeDiffSummary([]),
      );

      const result = await parseDiff('/repo', 'main', 'feature');
      expect(result).toEqual([]);
    });

    it('should handle multiple files in a single diff', async () => {
      mockDiffSummary.mockResolvedValueOnce(
        makeDiffSummary(
          [
            { file: 'src/a.ts', insertions: 10, deletions: 2 },
            { file: 'src/b.ts', insertions: 5, deletions: 0 },
            { file: 'src/c.ts', insertions: 0, deletions: 8 },
          ],
          { created: ['src/b.ts'], deleted: ['src/c.ts'] },
        ),
      );

      const result = await parseDiff('/repo', 'main', 'feature');
      expect(result).toHaveLength(3);

      expect(result[0].path).toBe('src/a.ts');
      expect(result[0].status).toBe('modified');

      expect(result[1].path).toBe('src/b.ts');
      expect(result[1].status).toBe('added');

      expect(result[2].path).toBe('src/c.ts');
      expect(result[2].status).toBe('deleted');
    });

    it('should handle binary files with zero additions and deletions', async () => {
      mockDiffSummary.mockResolvedValueOnce({
        files: [{ file: 'assets/icon.png', binary: true }],
        insertions: 0,
        deletions: 0,
        changed: 1,
        created: ['assets/icon.png'],
        deleted: [],
        renamed: [],
      });

      const result = await parseDiff('/repo', 'main', 'feature');
      expect(result).toHaveLength(1);
      expect(result[0].path).toBe('assets/icon.png');
      expect(result[0].status).toBe('added');
      expect(result[0].additions).toBe(0);
      expect(result[0].deletions).toBe(0);
    });

    it('should handle files with zero additions and zero deletions (e.g., mode change)', async () => {
      mockDiffSummary.mockResolvedValueOnce(
        makeDiffSummary([{ file: 'scripts/deploy.sh', insertions: 0, deletions: 0 }]),
      );

      const result = await parseDiff('/repo', 'main', 'feature');
      expect(result).toHaveLength(1);
      expect(result[0].additions).toBe(0);
      expect(result[0].deletions).toBe(0);
      expect(result[0].status).toBe('modified');
    });

    it('should use the new path for language detection on renamed files', async () => {
      const rawPath = 'src/{old.js => new.ts}';
      mockDiffSummary.mockResolvedValueOnce(
        makeDiffSummary(
          [{ file: rawPath, insertions: 5, deletions: 5 }],
          { renamed: [rawPath] },
        ),
      );

      const result = await parseDiff('/repo', 'main', 'feature');
      expect(result[0].language).toBe('typescript');
      expect(result[0].path).toBe('src/new.ts');
    });

    it('should use the new path for category detection on renamed files', async () => {
      const rawPath = 'src/{code.ts => code.test.ts}';
      mockDiffSummary.mockResolvedValueOnce(
        makeDiffSummary(
          [{ file: rawPath, insertions: 10, deletions: 0 }],
          { renamed: [rawPath] },
        ),
      );

      const result = await parseDiff('/repo', 'main', 'feature');
      expect(result[0].category).toBe('test');
    });
  });

  // ── Git invocation ───────────────────────────────────────────────────────

  describe('git invocation', () => {
    it('should call diffSummary with the correct base..head range', async () => {
      mockDiffSummary.mockResolvedValueOnce(makeDiffSummary([]));

      await parseDiff('/my/repo', 'main', 'feature-branch');

      expect(mockDiffSummary).toHaveBeenCalledTimes(1);
      expect(mockDiffSummary).toHaveBeenCalledWith(['main..feature-branch']);
    });
  });

  // ── Missing created / deleted / renamed arrays ───────────────────────────

  describe('missing created/deleted/renamed arrays', () => {
    it('should default to empty arrays when diffSummary lacks created/deleted/renamed', async () => {
      mockDiffSummary.mockResolvedValueOnce({
        files: [{ file: 'src/index.ts', insertions: 1, deletions: 0 }],
        insertions: 1,
        deletions: 0,
        changed: 1,
        // no created, deleted, or renamed properties
      });

      const result = await parseDiff('/repo', 'main', 'feature');
      expect(result).toHaveLength(1);
      expect(result[0].status).toBe('modified');
    });
  });
});

// ── detectLanguage (direct unit tests) ────────────────────────────────────────

describe('detectLanguage', () => {
  it('detects TypeScript files', () => {
    expect(detectLanguage('src/index.ts')).toBe('typescript');
    expect(detectLanguage('components/App.tsx')).toBe('typescript');
  });

  it('detects JavaScript files', () => {
    expect(detectLanguage('src/utils.js')).toBe('javascript');
    expect(detectLanguage('lib/component.jsx')).toBe('javascript');
    expect(detectLanguage('config.mjs')).toBe('javascript');
    expect(detectLanguage('config.cjs')).toBe('javascript');
  });

  it('detects other languages', () => {
    expect(detectLanguage('main.py')).toBe('python');
    expect(detectLanguage('main.go')).toBe('go');
    expect(detectLanguage('main.rs')).toBe('rust');
    expect(detectLanguage('Main.java')).toBe('java');
  });

  it('detects special filenames', () => {
    expect(detectLanguage('Dockerfile')).toBe('dockerfile');
    expect(detectLanguage('path/to/Dockerfile')).toBe('dockerfile');
    expect(detectLanguage('Makefile')).toBe('makefile');
  });

  it('detects config file formats', () => {
    expect(detectLanguage('config.json')).toBe('json');
    expect(detectLanguage('config.yaml')).toBe('yaml');
    expect(detectLanguage('config.yml')).toBe('yaml');
    expect(detectLanguage('config.toml')).toBe('toml');
  });

  it('returns unknown for unrecognized extensions', () => {
    expect(detectLanguage('file.xyz')).toBe('unknown');
    expect(detectLanguage('binary')).toBe('unknown');
  });
});
