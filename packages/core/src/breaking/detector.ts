import fg from 'fast-glob';
import { readFile } from 'fs/promises';
import { resolve, relative, dirname } from 'path';
import simpleGit from 'simple-git';
import { BreakingChange, ChangedFile } from '../types.js';
import { diffExports, parseExports } from './export-differ.js';
import { diffSignatures } from './signature-differ.js';

/** File extensions that we analyze for breaking changes. */
const ANALYZABLE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);

// ── Import extraction (same patterns as impact-graph.ts) ──

const STATIC_IMPORT_RE = /(?:import|export)\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g;
const DYNAMIC_IMPORT_RE = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
const REQUIRE_RE = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

const RESOLVE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];
const INDEX_FILES = ['index.ts', 'index.tsx', 'index.js', 'index.jsx'];

/**
 * Extract all import paths from a file's content.
 */
function extractImportPaths(content: string): string[] {
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
function isRelativeImport(importPath: string): boolean {
  return importPath.startsWith('./') || importPath.startsWith('../');
}

/**
 * Resolve a relative import to a repo-relative path by trying various
 * extensions and index file patterns.
 */
function resolveImport(
  importPath: string,
  importerRepoRelPath: string,
  allFiles: Set<string>,
): string | null {
  const importerDir = dirname(importerRepoRelPath);
  const resolved = resolve('/', importerDir, importPath).slice(1);

  const normalized = resolved.startsWith('/') ? resolved.slice(1) : resolved;

  // 1. Exact match
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
 * Find all source files that import from the given set of file paths.
 *
 * Returns a map: target file path -> list of consumer file paths that import it.
 */
async function findConsumers(
  repoPath: string,
  targetFiles: Set<string>,
): Promise<Map<string, string[]>> {
  const consumers = new Map<string, string[]>();
  for (const target of targetFiles) {
    consumers.set(target, []);
  }

  // Discover all source files in the repo
  const absolutePaths = await fg('**/*.{ts,tsx,js,jsx}', {
    cwd: repoPath,
    ignore: ['**/node_modules/**', '**/dist/**', '**/.git/**'],
    absolute: true,
  });

  const repoRelativePaths = absolutePaths.map((abs) => relative(repoPath, abs));
  const allFilesSet = new Set(repoRelativePaths);

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

          if (targetFiles.has(resolved)) {
            consumers.get(resolved)!.push(relPath);
          }
        }
      }),
    );
  }

  return consumers;
}

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
      // If we can't analyze a file (e.g. binary, encoding issues), skip it.
      // In a production tool we'd log this; for now we silently continue.
      continue;
    }
  }

  // ── Populate consumers ───────────────────────────────────────────────────
  // Collect the set of files that have at least one breaking change, then
  // scan repo source files to find which ones import from those files.
  if (breakingChanges.length > 0) {
    const affectedFiles = new Set(breakingChanges.map((bc) => bc.filePath));
    const consumersMap = await findConsumers(repoPath, affectedFiles);

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
