import fg from 'fast-glob';
import { readFile } from 'fs/promises';
import { resolve, relative, dirname } from 'path';

/**
 * Regex patterns for extracting import paths from TypeScript/JavaScript files.
 */
export const STATIC_IMPORT_RE = /(?:import|export)\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g;
export const DYNAMIC_IMPORT_RE = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
export const REQUIRE_RE = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

export const RESOLVE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];
export const INDEX_FILES = ['index.ts', 'index.tsx', 'index.js', 'index.jsx'];

/**
 * Extract all import paths from a file's content.
 */
export function extractImportPaths(content: string): string[] {
  const paths: string[] = [];

  for (const re of [STATIC_IMPORT_RE, DYNAMIC_IMPORT_RE, REQUIRE_RE]) {
    const pattern = new RegExp(re.source, re.flags);
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      paths.push(match[1]);
    }
  }

  return paths;
}

/**
 * Check if an import path is relative (starts with . or ..).
 */
export function isRelativeImport(importPath: string): boolean {
  return importPath.startsWith('./') || importPath.startsWith('../');
}

/**
 * Resolve a relative import to a repo-relative path by trying various
 * extensions and index file patterns.
 *
 * Returns the repo-relative path if a matching file exists in the file set,
 * or null if the import cannot be resolved.
 */
export function resolveImport(
  importPath: string,
  importerRepoRelPath: string,
  allFiles: Set<string>,
): string | null {
  const importerDir = dirname(importerRepoRelPath);
  const resolved = resolve('/', importerDir, importPath).slice(1);

  // Normalize: remove leading slash if present
  const normalized = resolved.startsWith('/') ? resolved.slice(1) : resolved;

  // 1. Exact match (already has extension)
  if (allFiles.has(normalized)) {
    return normalized;
  }

  // 2. Try appending each extension
  for (const ext of RESOLVE_EXTENSIONS) {
    const candidate = normalized + ext;
    if (allFiles.has(candidate)) {
      return candidate;
    }
  }

  // 3. Try as directory with index file
  for (const indexFile of INDEX_FILES) {
    const candidate = normalized + '/' + indexFile;
    if (allFiles.has(candidate)) {
      return candidate;
    }
  }

  return null;
}

/**
 * A reverse dependency map: key = file that is imported,
 * value = list of files that import it.
 */
export type ReverseDependencyMap = Map<string, string[]>;

/**
 * Scan the entire repo and build a reverse dependency map.
 *
 * The map keys are repo-relative file paths; each value is the list of
 * repo-relative paths of files that import that key.
 *
 * This is the expensive I/O step (fast-glob + batch file reads) that both
 * `findConsumers()` and `buildImpactGraph()` need. By running it once in
 * `analyzePR()` and passing the result to both consumers, the repo scan
 * is not duplicated.
 */
export async function buildReverseDependencyMap(
  repoPath: string,
): Promise<ReverseDependencyMap> {
  // Discover all source files in the repo
  const absolutePaths = await fg('**/*.{ts,tsx,js,jsx}', {
    cwd: repoPath,
    ignore: ['**/node_modules/**', '**/dist/**', '**/.git/**'],
    absolute: true,
  });

  const repoRelativePaths = absolutePaths.map((abs) => relative(repoPath, abs));
  const allFilesSet = new Set(repoRelativePaths);

  const reverseDeps: ReverseDependencyMap = new Map();

  // Scan files in batches to avoid EMFILE
  const BATCH_SIZE = 50;
  for (let i = 0; i < repoRelativePaths.length; i += BATCH_SIZE) {
    const batch = repoRelativePaths.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async (relPath) => {
        const absPath = resolve(repoPath, relPath);
        let content: string;
        try {
          content = await readFile(absPath, 'utf-8');
        } catch {
          return; // skip unreadable files
        }

        const importPaths = extractImportPaths(content);

        for (const importPath of importPaths) {
          if (!isRelativeImport(importPath)) {
            continue;
          }

          const resolved = resolveImport(importPath, relPath, allFilesSet);
          if (resolved === null) {
            continue;
          }

          let dependents = reverseDeps.get(resolved);
          if (!dependents) {
            dependents = [];
            reverseDeps.set(resolved, dependents);
          }
          dependents.push(relPath);
        }
      }),
    );
  }

  return reverseDeps;
}

/**
 * Find all source files that import from the given set of file paths.
 *
 * Returns a map: target file path -> list of consumer file paths that import it.
 *
 * When a pre-built `reverseDependencyMap` is provided, the expensive repo scan
 * is skipped and the map is used directly. Otherwise the scan is performed
 * internally (backward-compatible).
 */
export async function findConsumers(
  repoPath: string,
  targetFiles: Set<string>,
  reverseDependencyMap?: ReverseDependencyMap,
): Promise<Map<string, string[]>> {
  const consumers = new Map<string, string[]>();
  for (const target of targetFiles) {
    consumers.set(target, []);
  }

  const reverseDeps = reverseDependencyMap ?? await buildReverseDependencyMap(repoPath);

  for (const target of targetFiles) {
    const dependents = reverseDeps.get(target);
    if (dependents) {
      consumers.set(target, [...dependents]);
    }
  }

  return consumers;
}
