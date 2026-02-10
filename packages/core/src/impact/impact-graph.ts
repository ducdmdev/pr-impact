import { ChangedFile, ImpactGraph, ImpactEdge } from '../types.js';
import { buildReverseDependencyMap, ReverseDependencyMap } from '../imports/import-resolver.js';

/**
 * Build an impact graph showing which files are directly changed and which
 * are indirectly affected through import dependencies.
 *
 * Uses BFS over a reverse dependency map (dependents) to find files that
 * transitively depend on the changed files, up to `maxDepth` levels.
 *
 * When a pre-built `reverseDependencyMap` is provided, the expensive repo scan
 * is skipped and the map is used directly. Otherwise the scan is performed
 * internally (backward-compatible).
 */
export async function buildImpactGraph(
  repoPath: string,
  changedFiles: ChangedFile[],
  maxDepth: number = 3,
  reverseDependencyMap?: ReverseDependencyMap,
): Promise<ImpactGraph> {
  // 1. Build or reuse the reverse dependency map
  const reverseDeps = reverseDependencyMap ?? await buildReverseDependencyMap(repoPath);

  // 2. Identify directly changed source files
  const directlyChanged = changedFiles
    .filter((f) => f.category === 'source')
    .map((f) => f.path);

  const directlyChangedSet = new Set(directlyChanged);

  // 3. BFS traversal over reverse dependencies to find indirectly affected files
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

  // 4. Indirectly affected = visited files minus the directly changed ones
  const indirectlyAffected = [...visited].filter(
    (f) => !directlyChangedSet.has(f),
  );

  return {
    directlyChanged,
    indirectlyAffected,
    edges,
  };
}
