import fg from 'fast-glob';
import { readFile } from 'fs/promises';
import { resolve, relative } from 'path';
import { ChangedFile, ImpactGraph, ImpactEdge } from '../types.js';
import { extractImportPaths, isRelativeImport, resolveImport } from '../imports/import-resolver.js';

/**
 * Build an impact graph showing which files are directly changed and which
 * are indirectly affected through import dependencies.
 *
 * Uses BFS over a reverse dependency map (dependents) to find files that
 * transitively depend on the changed files, up to `maxDepth` levels.
 */
export async function buildImpactGraph(
  repoPath: string,
  changedFiles: ChangedFile[],
  maxDepth: number = 3,
): Promise<ImpactGraph> {
  // 1. Discover all source files in the repo
  const absolutePaths = await fg('**/*.{ts,tsx,js,jsx}', {
    cwd: repoPath,
    ignore: ['**/node_modules/**', '**/dist/**', '**/.git/**'],
    absolute: true,
  });

  // Build a set of repo-relative paths for quick lookup
  const repoRelativePaths = absolutePaths.map((abs) => relative(repoPath, abs));
  const allFilesSet = new Set(repoRelativePaths);

  // 2. Parse imports for every source file and build a reverse dependency map
  // reverseDeps: key = file that is imported, value = set of files that import it
  const reverseDeps = new Map<string, Set<string>>();

  // Process files in batches to avoid EMFILE (too many open files)
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
            continue; // skip node_modules / bare specifier imports
          }

          const resolved = resolveImport(importPath, relPath, allFilesSet);
          if (resolved === null) {
            continue;
          }

          let dependents = reverseDeps.get(resolved);
          if (!dependents) {
            dependents = new Set();
            reverseDeps.set(resolved, dependents);
          }
          dependents.add(relPath);
        }
      }),
    );
  }

  // 3. Identify directly changed source files
  const directlyChanged = changedFiles
    .filter((f) => f.category === 'source')
    .map((f) => f.path);

  const directlyChangedSet = new Set(directlyChanged);

  // 4. BFS traversal over reverse dependencies to find indirectly affected files
  const visited = new Set<string>(directlyChanged);
  const edges: ImpactEdge[] = [];
  let frontier = [...directlyChanged];

  for (let depth = 0; depth < maxDepth && frontier.length > 0; depth++) {
    const nextFrontier: string[] = [];

    for (const file of frontier) {
      const dependents = reverseDeps.get(file);
      if (!dependents) {
        continue;
      }

      for (const dependent of dependents) {
        edges.push({
          from: dependent,
          to: file,
          type: 'imports',
        });

        if (!visited.has(dependent)) {
          visited.add(dependent);
          nextFrontier.push(dependent);
        }
      }
    }

    frontier = nextFrontier;
  }

  // 5. Indirectly affected = visited files minus the directly changed ones
  const indirectlyAffected = [...visited].filter(
    (f) => !directlyChangedSet.has(f),
  );

  return {
    directlyChanged,
    indirectlyAffected,
    edges,
  };
}
