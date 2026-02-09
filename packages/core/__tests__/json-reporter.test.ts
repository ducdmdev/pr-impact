import { describe, it, expect } from 'vitest';
import { formatJSON } from '../src/output/json-reporter.js';
import type { PRAnalysis } from '../src/types.js';

// ── Helper ──────────────────────────────────────────────────────────────────

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

describe('formatJSON', () => {
  // ── Valid JSON ────────────────────────────────────────────────────────────

  describe('valid JSON output', () => {
    it('should produce valid JSON', () => {
      const output = formatJSON(makeAnalysis());
      expect(() => JSON.parse(output)).not.toThrow();
    });

    it('should produce pretty-printed JSON (indented with 2 spaces)', () => {
      const output = formatJSON(makeAnalysis());
      // Pretty-printed JSON starts with "{\n  " (object with 2-space indent)
      expect(output).toMatch(/^\{\n {2}/);
    });

    it('should produce valid JSON for complex analysis', () => {
      const analysis = makeAnalysis({
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
        breakingChanges: [
          {
            filePath: 'src/api.ts',
            type: 'removed_export',
            symbolName: 'foo',
            before: 'export function foo(): void',
            after: null,
            severity: 'high',
            consumers: ['src/bar.ts'],
          },
        ],
        riskScore: {
          score: 75,
          level: 'high',
          factors: [
            {
              name: 'Breaking changes',
              score: 100,
              weight: 0.30,
              description: '1 breaking change(s) detected.',
              details: ['removed_export of "foo" in src/api.ts (high)'],
            },
          ],
        },
      });

      const output = formatJSON(analysis);
      expect(() => JSON.parse(output)).not.toThrow();
    });
  });

  // ── Roundtrip ─────────────────────────────────────────────────────────────

  describe('roundtrip (serialize then deserialize)', () => {
    it('should roundtrip a minimal analysis correctly', () => {
      const analysis = makeAnalysis();
      const output = formatJSON(analysis);
      const parsed = JSON.parse(output);

      expect(parsed.repoPath).toBe(analysis.repoPath);
      expect(parsed.baseBranch).toBe(analysis.baseBranch);
      expect(parsed.headBranch).toBe(analysis.headBranch);
      expect(parsed.changedFiles).toEqual(analysis.changedFiles);
      expect(parsed.breakingChanges).toEqual(analysis.breakingChanges);
      expect(parsed.testCoverage).toEqual(analysis.testCoverage);
      expect(parsed.docStaleness).toEqual(analysis.docStaleness);
      expect(parsed.impactGraph).toEqual(analysis.impactGraph);
      expect(parsed.riskScore).toEqual(analysis.riskScore);
      expect(parsed.summary).toBe(analysis.summary);
    });

    it('should roundtrip a full analysis with all fields populated', () => {
      const analysis = makeAnalysis({
        repoPath: '/workspace/my-project',
        baseBranch: 'develop',
        headBranch: 'feature/new-api',
        changedFiles: [
          {
            path: 'src/index.ts',
            status: 'modified',
            additions: 42,
            deletions: 13,
            language: 'typescript',
            category: 'source',
          },
          {
            path: 'src/index.test.ts',
            status: 'modified',
            additions: 20,
            deletions: 5,
            language: 'typescript',
            category: 'test',
          },
          {
            path: 'README.md',
            status: 'modified',
            additions: 3,
            deletions: 1,
            language: 'markdown',
            category: 'doc',
          },
        ],
        breakingChanges: [
          {
            filePath: 'src/api.ts',
            type: 'removed_export',
            symbolName: 'legacyHandler',
            before: 'export function legacyHandler(): void',
            after: null,
            severity: 'high',
            consumers: ['src/app.ts', 'src/routes.ts'],
          },
          {
            filePath: 'src/types.ts',
            type: 'changed_signature',
            symbolName: 'processData',
            before: '(data: string): void',
            after: '(data: Buffer): Promise<void>',
            severity: 'medium',
            consumers: [],
          },
        ],
        testCoverage: {
          changedSourceFiles: 3,
          sourceFilesWithTestChanges: 2,
          coverageRatio: 0.67,
          gaps: [
            {
              sourceFile: 'src/new-module.ts',
              expectedTestFiles: ['src/new-module.test.ts'],
              testFileExists: false,
              testFileChanged: false,
            },
          ],
        },
        docStaleness: {
          staleReferences: [
            {
              docFile: 'docs/api.md',
              line: 15,
              reference: 'legacyHandler',
              reason: 'function was removed',
            },
          ],
          checkedFiles: ['docs/api.md', 'README.md'],
        },
        impactGraph: {
          directlyChanged: ['src/index.ts', 'src/api.ts'],
          indirectlyAffected: ['src/app.ts', 'src/routes.ts'],
          edges: [
            { from: 'src/app.ts', to: 'src/api.ts', type: 'imports' },
            { from: 'src/routes.ts', to: 'src/api.ts', type: 'imports' },
          ],
        },
        riskScore: {
          score: 62,
          level: 'high',
          factors: [
            {
              name: 'Breaking changes',
              score: 100,
              weight: 0.30,
              description: '2 breaking change(s) detected.',
            },
            {
              name: 'Untested changes',
              score: 33,
              weight: 0.25,
              description: '2/3 changed source files have corresponding test changes.',
            },
          ],
        },
        summary:
          'This PR introduces breaking API changes and has moderate test coverage gaps.',
      });

      const output = formatJSON(analysis);
      const parsed = JSON.parse(output) as PRAnalysis;

      // Deep equality check for the entire object
      expect(parsed).toEqual(analysis);
    });

    it('should preserve null values (e.g. after field in breaking changes)', () => {
      const analysis = makeAnalysis({
        breakingChanges: [
          {
            filePath: 'src/api.ts',
            type: 'removed_export',
            symbolName: 'gone',
            before: 'export function gone(): void',
            after: null,
            severity: 'high',
            consumers: [],
          },
        ],
      });

      const output = formatJSON(analysis);
      const parsed = JSON.parse(output);

      expect(parsed.breakingChanges[0].after).toBeNull();
    });

    it('should preserve empty arrays', () => {
      const analysis = makeAnalysis({
        changedFiles: [],
        breakingChanges: [],
      });

      const output = formatJSON(analysis);
      const parsed = JSON.parse(output);

      expect(parsed.changedFiles).toEqual([]);
      expect(parsed.breakingChanges).toEqual([]);
    });

    it('should preserve numeric values accurately', () => {
      const analysis = makeAnalysis({
        testCoverage: {
          changedSourceFiles: 42,
          sourceFilesWithTestChanges: 33,
          coverageRatio: 0.785714285714,
          gaps: [],
        },
        riskScore: {
          score: 57,
          level: 'high',
          factors: [
            {
              name: 'Test',
              score: 21.5,
              weight: 0.25,
              description: 'test',
            },
          ],
        },
      });

      const output = formatJSON(analysis);
      const parsed = JSON.parse(output);

      expect(parsed.testCoverage.changedSourceFiles).toBe(42);
      expect(parsed.testCoverage.coverageRatio).toBe(0.785714285714);
      expect(parsed.riskScore.score).toBe(57);
      expect(parsed.riskScore.factors[0].score).toBe(21.5);
    });
  });

  // ── Structure ─────────────────────────────────────────────────────────────

  describe('output structure', () => {
    it('should contain all top-level keys', () => {
      const output = formatJSON(makeAnalysis());
      const parsed = JSON.parse(output);

      expect(parsed).toHaveProperty('repoPath');
      expect(parsed).toHaveProperty('baseBranch');
      expect(parsed).toHaveProperty('headBranch');
      expect(parsed).toHaveProperty('changedFiles');
      expect(parsed).toHaveProperty('breakingChanges');
      expect(parsed).toHaveProperty('testCoverage');
      expect(parsed).toHaveProperty('docStaleness');
      expect(parsed).toHaveProperty('impactGraph');
      expect(parsed).toHaveProperty('riskScore');
      expect(parsed).toHaveProperty('summary');
    });

    it('should return a string', () => {
      const output = formatJSON(makeAnalysis());
      expect(typeof output).toBe('string');
    });
  });

  // ── Special characters ────────────────────────────────────────────────────

  describe('special characters', () => {
    it('should handle special characters in strings', () => {
      const analysis = makeAnalysis({
        summary: 'Changes include "quoted text" and backslashes \\ and newlines\n.',
      });

      const output = formatJSON(analysis);
      expect(() => JSON.parse(output)).not.toThrow();

      const parsed = JSON.parse(output);
      expect(parsed.summary).toBe(analysis.summary);
    });

    it('should handle unicode characters', () => {
      const analysis = makeAnalysis({
        summary: 'Unicode: emoji test, CJK characters, accents: cafe',
      });

      const output = formatJSON(analysis);
      const parsed = JSON.parse(output);
      expect(parsed.summary).toBe(analysis.summary);
    });
  });
});
