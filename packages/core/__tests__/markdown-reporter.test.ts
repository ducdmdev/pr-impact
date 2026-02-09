import { describe, it, expect } from 'vitest';
import { formatMarkdown } from '../src/output/markdown-reporter.js';
import type { PRAnalysis } from '../src/types.js';

// ── Helper to build a full PRAnalysis fixture ───────────────────────────────

function makeAnalysis(overrides: Partial<PRAnalysis> = {}): PRAnalysis {
  return {
    repoPath: '/path/to/repo',
    baseBranch: 'main',
    headBranch: 'feature/test',
    changedFiles: [],
    breakingChanges: [],
    testCoverage: {
      changedSourceFiles: 0,
      sourceFilesWithTestChanges: 0,
      coverageRatio: 1,
      gaps: [],
    },
    docStaleness: {
      staleReferences: [],
      checkedFiles: [],
    },
    impactGraph: {
      directlyChanged: [],
      indirectlyAffected: [],
      edges: [],
    },
    riskScore: {
      score: 0,
      level: 'low',
      factors: [],
    },
    summary: 'No significant changes detected.',
    ...overrides,
  };
}

describe('formatMarkdown', () => {
  // ── Section presence ──────────────────────────────────────────────────────

  describe('expected sections', () => {
    it('should contain the header "PR Impact Analysis"', () => {
      const output = formatMarkdown(makeAnalysis());
      expect(output).toContain('# PR Impact Analysis');
    });

    it('should contain the repository path', () => {
      const output = formatMarkdown(
        makeAnalysis({ repoPath: '/my/repo' }),
      );
      expect(output).toContain('**Repository:** /my/repo');
    });

    it('should contain the branch comparison', () => {
      const output = formatMarkdown(
        makeAnalysis({ baseBranch: 'main', headBranch: 'feat/abc' }),
      );
      expect(output).toContain('`main`');
      expect(output).toContain('`feat/abc`');
    });

    it('should contain the Risk Score section', () => {
      const output = formatMarkdown(
        makeAnalysis({
          riskScore: {
            score: 42,
            level: 'medium',
            factors: [],
          },
        }),
      );
      expect(output).toContain('## Risk Score: 42/100 (medium)');
    });

    it('should contain the Summary section', () => {
      const output = formatMarkdown(
        makeAnalysis({ summary: 'Test summary text.' }),
      );
      expect(output).toContain('## Summary');
      expect(output).toContain('Test summary text.');
    });

    it('should contain the Changed Files section', () => {
      const output = formatMarkdown(makeAnalysis());
      expect(output).toContain('## Changed Files');
    });

    it('should contain the Breaking Changes section', () => {
      const output = formatMarkdown(makeAnalysis());
      expect(output).toContain('## Breaking Changes');
    });

    it('should contain the Test Coverage section', () => {
      const output = formatMarkdown(makeAnalysis());
      expect(output).toContain('## Test Coverage');
    });

    it('should contain the Documentation Staleness section', () => {
      const output = formatMarkdown(makeAnalysis());
      expect(output).toContain('## Documentation Staleness');
    });

    it('should contain the Impact Graph section', () => {
      const output = formatMarkdown(makeAnalysis());
      expect(output).toContain('## Impact Graph');
    });
  });

  // ── Empty analysis ────────────────────────────────────────────────────────

  describe('empty analysis (no changes)', () => {
    it('should show "No files changed." when there are no changed files', () => {
      const output = formatMarkdown(makeAnalysis({ changedFiles: [] }));
      expect(output).toContain('No files changed.');
    });

    it('should show "No breaking changes detected." when there are none', () => {
      const output = formatMarkdown(makeAnalysis({ breakingChanges: [] }));
      expect(output).toContain('No breaking changes detected.');
    });

    it('should show "No stale references found." when there are none', () => {
      const output = formatMarkdown(makeAnalysis());
      expect(output).toContain('No stale references found.');
    });

    it('should show "No risk factors identified." when factors list is empty', () => {
      const output = formatMarkdown(
        makeAnalysis({
          riskScore: { score: 0, level: 'low', factors: [] },
        }),
      );
      expect(output).toContain('No risk factors identified.');
    });

    it('should display 0 changed files count', () => {
      const output = formatMarkdown(makeAnalysis({ changedFiles: [] }));
      expect(output).toContain('## Changed Files (0)');
    });
  });

  // ── With changed files ────────────────────────────────────────────────────

  describe('with changed files', () => {
    it('should display changed file details in a table', () => {
      const output = formatMarkdown(
        makeAnalysis({
          changedFiles: [
            {
              path: 'src/index.ts',
              status: 'modified',
              additions: 10,
              deletions: 5,
              language: 'typescript',
              category: 'source',
            },
          ],
        }),
      );

      expect(output).toContain('## Changed Files (1)');
      expect(output).toContain('| File | Status | +/- | Category |');
      expect(output).toContain('src/index.ts');
      expect(output).toContain('modified');
      expect(output).toContain('+10/-5');
      expect(output).toContain('source');
    });

    it('should display multiple changed files', () => {
      const output = formatMarkdown(
        makeAnalysis({
          changedFiles: [
            {
              path: 'src/a.ts',
              status: 'added',
              additions: 100,
              deletions: 0,
              language: 'typescript',
              category: 'source',
            },
            {
              path: 'src/b.ts',
              status: 'deleted',
              additions: 0,
              deletions: 50,
              language: 'typescript',
              category: 'source',
            },
          ],
        }),
      );

      expect(output).toContain('## Changed Files (2)');
      expect(output).toContain('src/a.ts');
      expect(output).toContain('src/b.ts');
      expect(output).toContain('added');
      expect(output).toContain('deleted');
    });
  });

  // ── With breaking changes ─────────────────────────────────────────────────

  describe('with breaking changes', () => {
    it('should display breaking changes in a table', () => {
      const output = formatMarkdown(
        makeAnalysis({
          breakingChanges: [
            {
              filePath: 'src/api.ts',
              type: 'removed_export',
              symbolName: 'fetchData',
              before: 'export function fetchData(): void',
              after: null,
              severity: 'high',
              consumers: [],
            },
          ],
        }),
      );

      expect(output).toContain('## Breaking Changes (1)');
      expect(output).toContain('| Symbol | Type | Severity | File |');
      expect(output).toContain('fetchData');
      expect(output).toContain('removed export');
      expect(output).toContain('high');
      expect(output).toContain('src/api.ts');
    });

    it('should format "changed_signature" type correctly', () => {
      const output = formatMarkdown(
        makeAnalysis({
          breakingChanges: [
            {
              filePath: 'src/utils.ts',
              type: 'changed_signature',
              symbolName: 'parse',
              before: '(a: string): void',
              after: '(a: string, b: number): void',
              severity: 'medium',
              consumers: [],
            },
          ],
        }),
      );

      expect(output).toContain('changed signature');
    });

    it('should format "changed_type" type correctly', () => {
      const output = formatMarkdown(
        makeAnalysis({
          breakingChanges: [
            {
              filePath: 'src/types.ts',
              type: 'changed_type',
              symbolName: 'Config',
              before: 'type Config = { a: string }',
              after: 'type Config = { a: number }',
              severity: 'medium',
              consumers: [],
            },
          ],
        }),
      );

      expect(output).toContain('changed type');
    });

    it('should format "renamed_export" type correctly', () => {
      const output = formatMarkdown(
        makeAnalysis({
          breakingChanges: [
            {
              filePath: 'src/api.ts',
              type: 'renamed_export',
              symbolName: 'oldName',
              before: 'oldName',
              after: 'newName',
              severity: 'low',
              consumers: [],
            },
          ],
        }),
      );

      expect(output).toContain('renamed export');
    });

    it('should display multiple breaking changes', () => {
      const output = formatMarkdown(
        makeAnalysis({
          breakingChanges: [
            {
              filePath: 'src/a.ts',
              type: 'removed_export',
              symbolName: 'foo',
              before: '',
              after: null,
              severity: 'high',
              consumers: [],
            },
            {
              filePath: 'src/b.ts',
              type: 'changed_signature',
              symbolName: 'bar',
              before: '',
              after: '',
              severity: 'medium',
              consumers: [],
            },
          ],
        }),
      );

      expect(output).toContain('## Breaking Changes (2)');
    });
  });

  // ── Test Coverage section ─────────────────────────────────────────────────

  describe('test coverage section', () => {
    it('should display coverage statistics', () => {
      const output = formatMarkdown(
        makeAnalysis({
          testCoverage: {
            changedSourceFiles: 10,
            sourceFilesWithTestChanges: 7,
            coverageRatio: 0.7,
            gaps: [],
          },
        }),
      );

      expect(output).toContain('**Changed source files:** 10');
      expect(output).toContain('**Files with test changes:** 7');
      expect(output).toContain('**Coverage ratio:** 70%');
    });

    it('should display test coverage gaps', () => {
      const output = formatMarkdown(
        makeAnalysis({
          testCoverage: {
            changedSourceFiles: 2,
            sourceFilesWithTestChanges: 1,
            coverageRatio: 0.5,
            gaps: [
              {
                sourceFile: 'src/utils.ts',
                expectedTestFiles: ['src/utils.test.ts'],
                testFileExists: true,
                testFileChanged: false,
              },
            ],
          },
        }),
      );

      expect(output).toContain('### Gaps');
      expect(output).toContain('**src/utils.ts**');
      expect(output).toContain('test file exists but was not changed');
    });

    it('should say "no test file found" for gaps without test files', () => {
      const output = formatMarkdown(
        makeAnalysis({
          testCoverage: {
            changedSourceFiles: 1,
            sourceFilesWithTestChanges: 0,
            coverageRatio: 0,
            gaps: [
              {
                sourceFile: 'src/new-module.ts',
                expectedTestFiles: [],
                testFileExists: false,
                testFileChanged: false,
              },
            ],
          },
        }),
      );

      expect(output).toContain('no test file found');
    });

    it('should list expected test files for each gap', () => {
      const output = formatMarkdown(
        makeAnalysis({
          testCoverage: {
            changedSourceFiles: 1,
            sourceFilesWithTestChanges: 0,
            coverageRatio: 0,
            gaps: [
              {
                sourceFile: 'src/parser.ts',
                expectedTestFiles: [
                  'src/parser.test.ts',
                  'src/__tests__/parser.ts',
                ],
                testFileExists: true,
                testFileChanged: false,
              },
            ],
          },
        }),
      );

      expect(output).toContain('src/parser.test.ts');
      expect(output).toContain('src/__tests__/parser.ts');
    });
  });

  // ── Documentation staleness ───────────────────────────────────────────────

  describe('documentation staleness section', () => {
    it('should display stale references', () => {
      const output = formatMarkdown(
        makeAnalysis({
          docStaleness: {
            staleReferences: [
              {
                docFile: 'docs/api.md',
                line: 42,
                reference: 'oldFunction',
                reason: 'function was removed',
              },
            ],
            checkedFiles: ['docs/api.md'],
          },
        }),
      );

      expect(output).toContain('**docs/api.md** (line 42)');
      expect(output).toContain('`oldFunction`');
      expect(output).toContain('function was removed');
    });
  });

  // ── Impact Graph section ──────────────────────────────────────────────────

  describe('impact graph section', () => {
    it('should display directly changed and indirectly affected counts', () => {
      const output = formatMarkdown(
        makeAnalysis({
          impactGraph: {
            directlyChanged: ['src/a.ts', 'src/b.ts'],
            indirectlyAffected: ['src/c.ts'],
            edges: [],
          },
        }),
      );

      expect(output).toContain('**Directly changed:** 2 files');
      expect(output).toContain('**Indirectly affected:** 1 file');
    });

    it('should use singular "file" for single items', () => {
      const output = formatMarkdown(
        makeAnalysis({
          impactGraph: {
            directlyChanged: ['src/a.ts'],
            indirectlyAffected: ['src/b.ts'],
            edges: [],
          },
        }),
      );

      expect(output).toContain('1 file');
      expect(output).not.toContain('1 files');
    });

    it('should display dependency edges', () => {
      const output = formatMarkdown(
        makeAnalysis({
          impactGraph: {
            directlyChanged: ['src/a.ts'],
            indirectlyAffected: ['src/b.ts'],
            edges: [
              {
                from: 'src/b.ts',
                to: 'src/a.ts',
                type: 'imports',
              },
            ],
          },
        }),
      );

      expect(output).toContain('### Dependency Edges');
      expect(output).toContain('src/b.ts');
      expect(output).toContain('src/a.ts');
      expect(output).toContain('`imports`');
    });

    it('should not display dependency edges section when there are no edges', () => {
      const output = formatMarkdown(
        makeAnalysis({
          impactGraph: {
            directlyChanged: [],
            indirectlyAffected: [],
            edges: [],
          },
        }),
      );

      expect(output).not.toContain('### Dependency Edges');
    });
  });

  // ── Risk factors table ────────────────────────────────────────────────────

  describe('risk factors table', () => {
    it('should render risk factors in a table', () => {
      const output = formatMarkdown(
        makeAnalysis({
          riskScore: {
            score: 55,
            level: 'high',
            factors: [
              {
                name: 'Breaking changes',
                score: 100,
                weight: 0.30,
                description: '1 breaking change(s) detected.',
              },
              {
                name: 'Untested changes',
                score: 50,
                weight: 0.25,
                description: '2/4 files covered.',
              },
            ],
          },
        }),
      );

      expect(output).toContain('| Factor | Score | Weight |');
      expect(output).toContain('| Breaking changes | 100 | 0.3 |');
      expect(output).toContain('| Untested changes | 50 | 0.25 |');
    });
  });

  // ── Output format ─────────────────────────────────────────────────────────

  describe('output format', () => {
    it('should end with a trailing newline', () => {
      const output = formatMarkdown(makeAnalysis());
      expect(output.endsWith('\n')).toBe(true);
    });

    it('should return a non-empty string', () => {
      const output = formatMarkdown(makeAnalysis());
      expect(output.length).toBeGreaterThan(0);
    });
  });
});
