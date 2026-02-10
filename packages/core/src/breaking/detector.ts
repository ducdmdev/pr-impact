import simpleGit from 'simple-git';
import { BreakingChange, ChangedFile } from '../types.js';
import { diffExports, parseExports } from './export-differ.js';
import { diffSignatures } from './signature-differ.js';
import { findConsumers, ReverseDependencyMap } from '../imports/import-resolver.js';

/** File extensions that we analyze for breaking changes. */
const ANALYZABLE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);

/**
 * Get the file extension (lowercased) from a file path.
 */
function getExtension(filePath: string): string {
  const lastDot = filePath.lastIndexOf('.');
  if (lastDot === -1) return '';
  return filePath.slice(lastDot).toLowerCase();
}

/**
 * Safely retrieve file content at a specific git ref.
 * Returns `null` if the file doesn't exist at that ref.
 */
async function getFileAtRef(
  git: ReturnType<typeof simpleGit>,
  ref: string,
  filePath: string,
): Promise<string | null> {
  try {
    return await git.show([`${ref}:${filePath}`]);
  } catch {
    // File doesn't exist at this ref (new file, or path changed)
    return null;
  }
}

/**
 * Detect breaking changes between two branches by analyzing export differences
 * in changed source files.
 *
 * @param repoPath               - Absolute path to the git repository
 * @param baseBranch             - The base branch/ref (e.g. "main", "origin/main")
 * @param headBranch             - The head branch/ref (e.g. "feature/xyz", "HEAD")
 * @param changedFiles           - List of files changed between the two branches
 * @param reverseDependencyMap   - Optional pre-built reverse dependency map to avoid a redundant repo scan
 * @returns Array of detected breaking changes
 */
export async function detectBreakingChanges(
  repoPath: string,
  baseBranch: string,
  headBranch: string,
  changedFiles: ChangedFile[],
  reverseDependencyMap?: ReverseDependencyMap,
): Promise<BreakingChange[]> {
  const git = simpleGit(repoPath);
  const breakingChanges: BreakingChange[] = [];

  // Only analyze source files that were modified, deleted, or renamed
  const filesToAnalyze = changedFiles.filter((f) => {
    const ext = getExtension(f.path);
    return (
      ANALYZABLE_EXTENSIONS.has(ext) &&
      (f.status === 'modified' || f.status === 'deleted' || f.status === 'renamed')
    );
  });

  for (const file of filesToAnalyze) {
    try {
      if (file.status === 'renamed' && file.oldPath) {
        // For renamed files, the old path's consumers will break
        const oldBaseContent = await getFileAtRef(git, baseBranch, file.oldPath);
        if (oldBaseContent === null) {
          continue;
        }

        const oldExports = parseExports(oldBaseContent, file.oldPath);
        const headContent = await getFileAtRef(git, headBranch, file.path);
        const newExports = headContent ? parseExports(headContent, file.path) : { filePath: file.path, symbols: [] };

        // Every export from the old path is effectively removed from that path
        for (const sym of oldExports.symbols) {
          // Check if the symbol still exists in the new file with the same signature
          const stillExists = newExports.symbols.some(
            (s) => s.name === sym.name && s.kind === sym.kind,
          );

          if (stillExists) {
            // Symbol exists in new location — it's a path rename, low severity
            breakingChanges.push({
              filePath: file.oldPath,
              type: 'renamed_export',
              symbolName: sym.name,
              before: `${formatSymbolDescription(sym)} (at ${file.oldPath})`,
              after: `${formatSymbolDescription(sym)} (at ${file.path})`,
              severity: 'low',
              consumers: [],
            });
          } else {
            // Symbol was removed during the rename — high severity
            breakingChanges.push({
              filePath: file.oldPath,
              type: 'removed_export',
              symbolName: sym.name,
              before: formatSymbolDescription(sym),
              after: null,
              severity: 'high',
              consumers: [],
            });
          }
        }

        continue;
      }

      const baseContent = await getFileAtRef(git, baseBranch, file.path);

      // If we can't get the base content, we can't detect breaking changes
      if (baseContent === null) {
        continue;
      }

      if (file.status === 'deleted') {
        // Every export in a deleted file is a breaking change
        const baseExports = parseExports(baseContent, file.path);

        for (const sym of baseExports.symbols) {
          breakingChanges.push({
            filePath: file.path,
            type: 'removed_export',
            symbolName: sym.name,
            before: formatSymbolDescription(sym),
            after: null,
            severity: 'high',
            consumers: [],
          });
        }
      } else {
        // File was modified — compare exports
        const headContent = await getFileAtRef(git, headBranch, file.path);

        if (headContent === null) {
          // Shouldn't happen for a 'modified' file, but handle gracefully
          continue;
        }

        const diff = diffExports(file.path, baseContent, headContent);

        // ── Detect renames ──────────────────────────────────────────────
        // A rename is when a symbol was removed and a new symbol with the
        // same kind and a similar (or identical) signature was added in
        // the same file. We pair them up and flag as 'renamed_export'
        // with low severity, removing them from removed/added so they
        // don't also appear as separate removed_export entries.
        const remainingRemoved: typeof diff.removed = [];
        const matchedAddedIndices = new Set<number>();

        for (const removedSym of diff.removed) {
          let matchIndex = -1;

          for (let i = 0; i < diff.added.length; i++) {
            if (matchedAddedIndices.has(i)) continue;

            const addedSym = diff.added[i];

            // Must be the same kind (function → function, class → class, etc.)
            if (removedSym.kind !== addedSym.kind) continue;

            // Compare signatures — if diffSignatures reports no change,
            // they have the same signature shape, indicating a likely rename
            const sigResult = diffSignatures(
              removedSym.signature,
              addedSym.signature,
            );

            if (!sigResult.changed) {
              matchIndex = i;
              break;
            }
          }

          if (matchIndex !== -1) {
            const addedSym = diff.added[matchIndex];
            matchedAddedIndices.add(matchIndex);

            breakingChanges.push({
              filePath: file.path,
              type: 'renamed_export',
              symbolName: removedSym.name,
              before: formatSymbolDescription(removedSym),
              after: formatSymbolDescription(addedSym),
              severity: 'low',
              consumers: [],
            });
          } else {
            remainingRemoved.push(removedSym);
          }
        }

        // Removed exports (not matched as renames) → high severity
        for (const sym of remainingRemoved) {
          breakingChanges.push({
            filePath: file.path,
            type: 'removed_export',
            symbolName: sym.name,
            before: formatSymbolDescription(sym),
            after: null,
            severity: 'high',
            consumers: [],
          });
        }

        // Modified signatures → medium severity
        for (const { before, after } of diff.modified) {
          const sigDiff = diffSignatures(before.signature, after.signature);

          // Only report if there's an actual signature change
          // (kind changes are also caught here since diffExports flags them)
          if (sigDiff.changed || before.kind !== after.kind) {
            breakingChanges.push({
              filePath: file.path,
              type: before.kind !== after.kind ? 'changed_type' : 'changed_signature',
              symbolName: before.name,
              before: formatSymbolDescription(before),
              after: formatSymbolDescription(after),
              severity: 'medium',
              consumers: [],
            });
          }
        }
      }
    } catch (error) {
      // If we can't analyze a file (e.g. binary, encoding issues), skip it
      // but warn on stderr so failures aren't completely silent.
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(`[pr-impact] Skipping ${file.path}: ${msg}`);
      continue;
    }
  }

  // ── Populate consumers ───────────────────────────────────────────────────
  // Collect the set of files that have at least one breaking change, then
  // scan repo source files to find which ones import from those files.
  if (breakingChanges.length > 0) {
    const affectedFiles = new Set(breakingChanges.map((bc) => bc.filePath));
    const consumersMap = await findConsumers(repoPath, affectedFiles, reverseDependencyMap);

    for (const bc of breakingChanges) {
      bc.consumers = consumersMap.get(bc.filePath) ?? [];
    }
  }

  return breakingChanges;
}

/**
 * Format a symbol into a human-readable description string.
 */
function formatSymbolDescription(sym: {
  name: string;
  kind: string;
  signature?: string;
  isDefault: boolean;
}): string {
  const parts: string[] = [];

  if (sym.isDefault) {
    parts.push('default');
  }

  parts.push(sym.kind);
  parts.push(sym.name);

  if (sym.signature) {
    parts.push(sym.signature);
  }

  return parts.join(' ');
}
