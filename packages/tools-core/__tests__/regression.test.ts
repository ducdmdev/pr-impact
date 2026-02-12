/**
 * Regression tests for tool output structure.
 *
 * These tests run the actual tool functions against a known git state
 * (the test fixtures committed in this repo) to validate output shape
 * and catch unexpected regressions in parsing or formatting.
 *
 * Unlike the unit tests (which mock simple-git), these use the real
 * git repo. They are scoped to the repo's own committed history so
 * they remain deterministic.
 */
import { describe, it, expect } from 'vitest';
import { simpleGit } from 'simple-git';
import {
  gitDiff,
  readFileAtRef,
  listChangedFiles,
  searchCode,
  findImporters,
  listTestFiles,
} from '../src/index.js';

import { beforeAll } from 'vitest';

// Use the repo root as repoPath
const repoPath = process.cwd();

// Find two consecutive commits to test against
let baseRef: string;
let headRef: string;

describe('regression: tool output structure', () => {
  beforeAll(async () => {
    const git = simpleGit(repoPath);
    const log = await git.log({ maxCount: 3 });
    if (log.all.length < 2) {
      throw new Error('Need at least 2 commits for regression tests');
    }
    headRef = log.all[0].hash;
    baseRef = log.all[1].hash;
  });

  describe('gitDiff', () => {
    it('returns a string diff property', async () => {
      const result = await gitDiff({ repoPath, base: baseRef, head: headRef });
      expect(result).toHaveProperty('diff');
      expect(typeof result.diff).toBe('string');
    });
  });

  describe('readFileAtRef', () => {
    it('returns file content for a known file', async () => {
      const result = await readFileAtRef({ repoPath, ref: headRef, filePath: 'package.json' });
      expect(result).toHaveProperty('content');
      expect(typeof result.content).toBe('string');
      expect(result.content).toContain('"name"');
    });

    it('throws for a nonexistent file', async () => {
      await expect(
        readFileAtRef({ repoPath, ref: headRef, filePath: 'nonexistent-file-xyz.ts' }),
      ).rejects.toThrow();
    });
  });

  describe('listChangedFiles', () => {
    it('returns files array with required fields', async () => {
      const result = await listChangedFiles({ repoPath, base: baseRef, head: headRef });
      expect(result).toHaveProperty('files');
      expect(Array.isArray(result.files)).toBe(true);

      if (result.files.length > 0) {
        const file = result.files[0];
        expect(file).toHaveProperty('path');
        expect(file).toHaveProperty('status');
        expect(file).toHaveProperty('additions');
        expect(file).toHaveProperty('deletions');
        expect(typeof file.path).toBe('string');
        expect(typeof file.additions).toBe('number');
        expect(typeof file.deletions).toBe('number');
      }
    });
  });

  describe('searchCode', () => {
    it('finds matches for a known pattern', async () => {
      const result = await searchCode({ repoPath, pattern: 'pr-impact', glob: 'package.json' });
      expect(result).toHaveProperty('matches');
      expect(Array.isArray(result.matches)).toBe(true);
      expect(result.matches.length).toBeGreaterThan(0);

      const match = result.matches[0];
      expect(match).toHaveProperty('file');
      expect(match).toHaveProperty('line');
      expect(match).toHaveProperty('match');
      expect(typeof match.file).toBe('string');
      expect(typeof match.line).toBe('number');
      expect(typeof match.match).toBe('string');
    });

    it('returns empty matches for impossible pattern', async () => {
      // Build the pattern dynamically so the literal string doesn't appear in this file
      const pattern = ['zzz', 'nonexistent', 'xyzzy', '99'].join('_');
      const result = await searchCode({ repoPath, pattern });
      expect(result.matches).toHaveLength(0);
    });
  });

  describe('findImporters', () => {
    it('returns importers array', async () => {
      const result = await findImporters({
        repoPath,
        modulePath: 'packages/tools-core/src/tools/git-diff.js',
      });
      expect(result).toHaveProperty('importers');
      expect(Array.isArray(result.importers)).toBe(true);
      // git-diff.ts should be imported by at least index.ts barrel
      expect(result.importers.length).toBeGreaterThan(0);
      expect(result.importers).toContain('packages/tools-core/src/index.ts');
    });

    it('returns empty for unknown module', async () => {
      const result = await findImporters({
        repoPath,
        modulePath: 'nonexistent/module.js',
      });
      expect(result.importers).toHaveLength(0);
    });
  });

  describe('listTestFiles', () => {
    it('finds test files for a known source file', async () => {
      const result = await listTestFiles({
        repoPath,
        sourceFile: 'packages/tools-core/src/tools/git-diff.ts',
      });
      expect(result).toHaveProperty('testFiles');
      expect(Array.isArray(result.testFiles)).toBe(true);
      expect(result.testFiles.length).toBeGreaterThan(0);
      expect(result.testFiles).toContain('packages/tools-core/__tests__/git-diff.test.ts');
    });

    it('finds test at package root __tests__/', async () => {
      const result = await listTestFiles({
        repoPath,
        sourceFile: 'packages/action/src/client.ts',
      });
      expect(result.testFiles).toContain('packages/action/__tests__/client.test.ts');
    });

    it('returns empty for a file with no tests', async () => {
      const result = await listTestFiles({
        repoPath,
        sourceFile: 'scripts/embed-templates.ts',
      });
      expect(result.testFiles).toHaveLength(0);
    });
  });
});
