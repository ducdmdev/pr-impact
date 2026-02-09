import fg from 'fast-glob';
import { posix as path } from 'node:path';

/**
 * Maps a source file to its expected test file paths using common naming
 * conventions, then returns only those that actually exist on disk.
 *
 * Conventions checked (given e.g. `src/utils/parser.ts`):
 *   1. Same directory:        src/utils/parser.test.ts, src/utils/parser.spec.ts
 *   2. __tests__ sibling dir: src/utils/__tests__/parser.ts, src/utils/__tests__/parser.test.ts
 *   3. Top-level test dirs:   test/utils/parser.ts, tests/utils/parser.test.ts
 *   4. All of the above with .js/.jsx/.tsx variants as well.
 */
export async function mapTestFiles(
  repoPath: string,
  sourceFile: string,
): Promise<string[]> {
  const candidates = buildCandidatePaths(sourceFile);

  if (candidates.length === 0) {
    return [];
  }

  // fast-glob expects forward-slash patterns and a cwd
  const existing = await fg(candidates, {
    cwd: repoPath,
    dot: false,
    onlyFiles: true,
  });

  return existing;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Extensions we consider valid for test files. */
const TEST_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'] as const;

/**
 * Build all candidate test file paths for a given source file.
 * Paths are returned as repo-relative with forward slashes.
 */
function buildCandidatePaths(sourceFile: string): string[] {
  const normalized = sourceFile.replace(/\\/g, '/');
  const dir = path.dirname(normalized);
  const ext = path.extname(normalized);
  const base = path.basename(normalized, ext);

  // Derive the relative part after the first conventional source directory
  // (e.g. `src/`). This is used for top-level test directories.
  const subPath = stripLeadingSourceDir(normalized);
  const subDir = path.dirname(subPath);
  const candidates: string[] = [];

  for (const testExt of TEST_EXTENSIONS) {
    // --- 1. Same directory with .test / .spec suffix ----------------------
    candidates.push(path.join(dir, `${base}.test${testExt}`));
    candidates.push(path.join(dir, `${base}.spec${testExt}`));

    // --- 2. __tests__ sibling directory -----------------------------------
    const testsDir = path.join(dir, '__tests__');
    candidates.push(path.join(testsDir, `${base}${testExt}`));
    candidates.push(path.join(testsDir, `${base}.test${testExt}`));
    candidates.push(path.join(testsDir, `${base}.spec${testExt}`));

    // --- 3. Top-level test / tests directories ----------------------------
    for (const topDir of ['test', 'tests']) {
      candidates.push(path.join(topDir, subDir, `${base}${testExt}`));
      candidates.push(path.join(topDir, subDir, `${base}.test${testExt}`));
      candidates.push(path.join(topDir, subDir, `${base}.spec${testExt}`));
    }
  }

  // Deduplicate (some paths may overlap when dir === '.')
  return [...new Set(candidates)];
}

/**
 * Strips a leading conventional source directory prefix such as `src/` so that
 * we can reconstruct paths relative to a top-level `test/` directory.
 *
 * Examples:
 *   `src/utils/parser.ts`  -> `utils/parser.ts`
 *   `lib/core/index.ts`    -> `core/index.ts`
 *   `packages/foo/src/a.ts` -> `a.ts`         (strips up to and including src/)
 *   `utils/parser.ts`      -> `utils/parser.ts` (no prefix to strip)
 */
function stripLeadingSourceDir(filePath: string): string {
  // Look for the last occurrence of a conventional source dir segment.
  const srcIndex = filePath.lastIndexOf('src/');
  if (srcIndex !== -1) {
    return filePath.slice(srcIndex + 'src/'.length);
  }

  const libIndex = filePath.lastIndexOf('lib/');
  if (libIndex !== -1) {
    return filePath.slice(libIndex + 'lib/'.length);
  }

  return filePath;
}
