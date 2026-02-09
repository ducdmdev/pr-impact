import simpleGit from 'simple-git';
import { BreakingChange, ChangedFile } from '../types.js';
import { diffExports, parseExports } from './export-differ.js';
import { diffSignatures } from './signature-differ.js';

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
 * @param repoPath     - Absolute path to the git repository
 * @param baseBranch   - The base branch/ref (e.g. "main", "origin/main")
 * @param headBranch   - The head branch/ref (e.g. "feature/xyz", "HEAD")
 * @param changedFiles - List of files changed between the two branches
 * @returns Array of detected breaking changes
 */
export async function detectBreakingChanges(
  repoPath: string,
  baseBranch: string,
  headBranch: string,
  changedFiles: ChangedFile[],
): Promise<BreakingChange[]> {
  const git = simpleGit(repoPath);
  const breakingChanges: BreakingChange[] = [];

  // Only analyze source files that were modified or deleted
  const filesToAnalyze = changedFiles.filter((f) => {
    const ext = getExtension(f.path);
    return (
      ANALYZABLE_EXTENSIONS.has(ext) &&
      (f.status === 'modified' || f.status === 'deleted')
    );
  });

  for (const file of filesToAnalyze) {
    try {
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

        // Removed exports → high severity
        for (const sym of diff.removed) {
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
      // If we can't analyze a file (e.g. binary, encoding issues), skip it.
      // In a production tool we'd log this; for now we silently continue.
      continue;
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
