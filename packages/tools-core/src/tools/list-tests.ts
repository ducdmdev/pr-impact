import fg from 'fast-glob';
import { posix as path } from 'node:path';

export interface ListTestFilesParams {
  repoPath?: string;
  sourceFile: string;
}

export interface ListTestFilesResult {
  testFiles: string[];
}

const TEST_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'] as const;

export async function listTestFiles(params: ListTestFilesParams): Promise<ListTestFilesResult> {
  const repoPath = params.repoPath ?? process.cwd();
  const candidates = buildCandidatePaths(params.sourceFile);

  if (candidates.length === 0) {
    return { testFiles: [] };
  }

  const existing = await fg(candidates, {
    cwd: repoPath,
    dot: false,
    onlyFiles: true,
  });

  return { testFiles: existing };
}

function buildCandidatePaths(sourceFile: string): string[] {
  const normalized = sourceFile.replace(/\\/g, '/');
  const dir = path.dirname(normalized);
  const ext = path.extname(normalized);
  const base = path.basename(normalized, ext);
  const subPath = stripLeadingSourceDir(normalized);
  const subDir = path.dirname(subPath);
  const candidates: string[] = [];

  // Find the package root by looking for the parent of src/ or lib/
  const packageRoot = getPackageRoot(normalized);

  for (const testExt of TEST_EXTENSIONS) {
    // Sibling patterns
    candidates.push(path.join(dir, `${base}.test${testExt}`));
    candidates.push(path.join(dir, `${base}.spec${testExt}`));

    // __tests__ directory under source dir
    const testsDir = path.join(dir, '__tests__');
    candidates.push(path.join(testsDir, `${base}${testExt}`));
    candidates.push(path.join(testsDir, `${base}.test${testExt}`));
    candidates.push(path.join(testsDir, `${base}.spec${testExt}`));

    // __tests__ directory at package root (sibling to src/)
    if (packageRoot && packageRoot !== dir) {
      const rootTestsDir = path.join(packageRoot, '__tests__');
      candidates.push(path.join(rootTestsDir, `${base}${testExt}`));
      candidates.push(path.join(rootTestsDir, `${base}.test${testExt}`));
      candidates.push(path.join(rootTestsDir, `${base}.spec${testExt}`));
    }

    // Top-level test/tests directories
    for (const topDir of ['test', 'tests']) {
      candidates.push(path.join(topDir, subDir, `${base}${testExt}`));
      candidates.push(path.join(topDir, subDir, `${base}.test${testExt}`));
      candidates.push(path.join(topDir, subDir, `${base}.spec${testExt}`));
    }
  }

  return [...new Set(candidates)];
}

function stripLeadingSourceDir(filePath: string): string {
  const srcIndex = filePath.lastIndexOf('src/');
  if (srcIndex !== -1) return filePath.slice(srcIndex + 4);
  const libIndex = filePath.lastIndexOf('lib/');
  if (libIndex !== -1) return filePath.slice(libIndex + 4);
  return filePath;
}

function getPackageRoot(filePath: string): string | null {
  const srcIndex = filePath.lastIndexOf('src/');
  if (srcIndex !== -1) return filePath.slice(0, srcIndex).replace(/\/$/, '') || null;
  const libIndex = filePath.lastIndexOf('lib/');
  if (libIndex !== -1) return filePath.slice(0, libIndex).replace(/\/$/, '') || null;
  return null;
}
