import simpleGit from 'simple-git';
import fg from 'fast-glob';
import { readFile } from 'node:fs/promises';
import { join as joinPath } from 'node:path';
import { ChangedFile, DocStalenessReport, StaleReference } from '../types.js';

/**
 * Checks whether documentation files in the repository reference symbols or
 * file paths that were deleted, removed, or renamed in the current change set.
 */
export async function checkDocStaleness(
  repoPath: string,
  changedFiles: ChangedFile[],
  baseBranch: string,
  headBranch: string,
): Promise<DocStalenessReport> {
  const git = simpleGit(repoPath);

  // ---- 1. Discover all doc files in the repo at HEAD ---------------------
  const docPatterns = ['**/*.md', '**/*.mdx'];
  const docFiles = await fg(docPatterns, {
    cwd: repoPath,
    ignore: ['**/node_modules/**'],
    dot: false,
    onlyFiles: true,
  });

  if (docFiles.length === 0) {
    return { staleReferences: [], checkedFiles: [] };
  }

  // ---- 2. Collect references we want to search for ----------------------
  const deletedPaths = buildDeletedPaths(changedFiles);
  const renamedPaths = buildRenamedPaths(changedFiles);
  const removedSymbols = await collectRemovedSymbols(
    git,
    changedFiles,
    baseBranch,
    headBranch,
  );

  // If there is nothing to look for, short-circuit.
  if (
    deletedPaths.length === 0 &&
    renamedPaths.length === 0 &&
    removedSymbols.length === 0
  ) {
    return { staleReferences: [], checkedFiles: docFiles };
  }

  // ---- 3. Pre-compile symbol regexes for efficient scanning ----------------
  // For generic names (index, types, utils, etc.) use a stricter regex that
  // only matches when the name appears in a file-path or import context,
  // avoiding false positives from ordinary English prose.
  const symbolPatterns = removedSymbols.map((sym) => ({
    ...sym,
    regex: sym.isGeneric
      ? buildPathContextRegex(sym.name)
      : new RegExp(`\\b${escapeRegex(sym.name)}\\b`),
  }));

  // ---- 4. Scan doc files for stale references ---------------------------
  const staleReferences: StaleReference[] = [];

  for (const docFile of docFiles) {
    const content = await safeReadFile(repoPath, docFile, git, headBranch);
    if (content === null) {
      continue;
    }

    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNumber = i + 1;

      // Check deleted file paths
      for (const dp of deletedPaths) {
        if (line.includes(dp)) {
          staleReferences.push({
            docFile,
            line: lineNumber,
            reference: dp,
            reason: 'referenced file was deleted',
          });
        }
      }

      // Check renamed file paths (old path)
      for (const rp of renamedPaths) {
        if (line.includes(rp.oldPath)) {
          staleReferences.push({
            docFile,
            line: lineNumber,
            reference: rp.oldPath,
            reason: `referenced file was renamed to ${rp.newPath}`,
          });
        }
      }

      // Check removed symbols (word-boundary match, pre-compiled)
      for (const sym of symbolPatterns) {
        if (sym.regex.test(line)) {
          staleReferences.push({
            docFile,
            line: lineNumber,
            reference: sym.name,
            reason: `referenced symbol was removed from ${sym.sourceFile}`,
          });
        }
      }
    }
  }

  return { staleReferences, checkedFiles: docFiles };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface RemovedSymbol {
  name: string;
  sourceFile: string;
  /** When true, only match in file-path or import contexts (not standalone prose). */
  isGeneric?: boolean;
}

interface RenamedPath {
  oldPath: string;
  newPath: string;
}

/** Collect file paths that were deleted. */
function buildDeletedPaths(changedFiles: ChangedFile[]): string[] {
  return changedFiles
    .filter((f) => f.status === 'deleted')
    .map((f) => f.path);
}

/** Collect old paths from renames. */
function buildRenamedPaths(changedFiles: ChangedFile[]): RenamedPath[] {
  return changedFiles
    .filter((f) => f.status === 'renamed' && f.oldPath)
    .map((f) => ({ oldPath: f.oldPath!, newPath: f.path }));
}

/**
 * For deleted source files, derive the filename stem as a potential reference.
 * For modified source files, diff the exported symbols between base and head
 * to find removed exports.
 */
async function collectRemovedSymbols(
  git: ReturnType<typeof simpleGit>,
  changedFiles: ChangedFile[],
  baseBranch: string,
  headBranch: string,
): Promise<RemovedSymbol[]> {
  const removed: RemovedSymbol[] = [];

  for (const file of changedFiles) {
    if (file.category !== 'source') {
      continue;
    }

    if (file.status === 'deleted') {
      // Use the filename stem as a symbol reference.
      // Generic names (e.g. "types", "utils") are still tracked but flagged
      // so the scanner uses a stricter path-context-only regex for them.
      const stem = filenameStem(file.path);
      if (stem) {
        removed.push({
          name: stem,
          sourceFile: file.path,
          isGeneric: isGenericName(stem),
        });
      }

      // Also extract exported symbols from the base version
      const baseContent = await safeShowFile(git, baseBranch, file.path);
      if (baseContent) {
        for (const sym of extractExportedSymbolNames(baseContent)) {
          removed.push({ name: sym, sourceFile: file.path });
        }
      }
    } else if (file.status === 'modified') {
      const baseContent = await safeShowFile(git, baseBranch, file.path);
      const headContent = await safeShowFile(git, headBranch, file.path);

      if (baseContent) {
        const baseSymbols = extractExportedSymbolNames(baseContent);
        const headSymbols = new Set(
          headContent ? extractExportedSymbolNames(headContent) : [],
        );

        for (const sym of baseSymbols) {
          if (!headSymbols.has(sym)) {
            removed.push({ name: sym, sourceFile: file.path });
          }
        }
      }
    }
  }

  return removed;
}

/**
 * Regex-based extraction of exported symbol names from TypeScript/JavaScript
 * source code.  Matches patterns like:
 *   export function foo(
 *   export async function* bar(
 *   export class Baz
 *   export abstract class Baz
 *   export declare class Baz
 *   export const qux
 *   export let quux
 *   export var quuz
 *   export type Foo
 *   export interface Bar
 *   export enum Status
 *   export const enum Direction
 *   export default function foo(
 *   export default class Bar
 */
const EXPORT_REGEX =
  /export\s+(?:default\s+)?(?:declare\s+)?(?:async\s+)?(?:abstract\s+)?(?:function\s*\*?\s*|class\s+|const\s+enum\s+|const\s+|let\s+|var\s+|type\s+|interface\s+|enum\s+)([A-Za-z_$][A-Za-z0-9_$]*)/g;

function extractExportedSymbolNames(content: string): string[] {
  const names: string[] = [];
  let match: RegExpExecArray | null;

  const regex = new RegExp(EXPORT_REGEX.source, EXPORT_REGEX.flags);

  while ((match = regex.exec(content)) !== null) {
    const name = match[1];
    if (name) {
      names.push(name);
    }
  }

  return [...new Set(names)];
}

/** Get the filename without extension. */
function filenameStem(filePath: string): string {
  const name = filePath.replace(/\\/g, '/').split('/').pop() ?? '';
  const dotIndex = name.indexOf('.');
  return dotIndex === -1 ? name : name.slice(0, dotIndex);
}

/** Filter out overly generic file stems that would cause false positives. */
function isGenericName(name: string): boolean {
  const GENERIC = new Set([
    'index',
    'main',
    'app',
    'mod',
    'lib',
    'utils',
    'helpers',
    'types',
    'constants',
    'config',
  ]);
  return GENERIC.has(name.toLowerCase());
}

/**
 * Build a regex that matches a generic name only when it appears in a
 * file-path or import/require context inside documentation.  This avoids
 * false positives where common English words like "index" or "main" appear
 * naturally in prose.
 *
 * Matched patterns (examples for name = "types"):
 *   File path contexts:
 *     ./types          ../types         src/types        path/to/types
 *     types.ts         types.js         types.mjs        types.d.ts
 *     types/           /types
 *   Import / require contexts:
 *     from './types'   from "../types"  from 'types'
 *     import types     import { x } from "types"
 *     require('./types')  require("types")
 *   Code-fenced / backtick references:
 *     `types`          `types.ts`
 */
function buildPathContextRegex(name: string): RegExp {
  const n = escapeRegex(name);

  // Each alternative captures a distinct context where a generic name is
  // actually a code / file reference rather than plain English.
  const alternatives = [
    // 1. Preceded by a path separator: ./types, ../types, foo/types
    `(?:[./\\\\])${n}\\b`,
    // 2. Followed by a file extension: types.ts, types.js, types.mjs, types.d.ts
    `\\b${n}(?:\\.d)?\\.(?:ts|js|mjs|cjs|tsx|jsx|mts|cts)\\b`,
    // 3. Followed by a directory separator: types/
    `\\b${n}/`,
    // 4. Inside an import/require statement:
    //    from 'types'  |  from './types'  |  import types  |  require('types')
    `(?:from\\s+['"\`][^'"\`]*\\b${n}\\b[^'"\`]*['"\`])`,
    `(?:import\\s+${n}\\b)`,
    `(?:require\\s*\\(\\s*['"\`][^'"\`]*\\b${n}\\b[^'"\`]*['"\`]\\s*\\))`,
    // 5. Inside backticks in Markdown: `types` or `types.ts`
    `\`[^\`]*\\b${n}\\b[^\`]*\``,
  ];

  return new RegExp(alternatives.join('|'), 'i');
}

/** Safely read a file from a git branch, returning null on failure. */
async function safeShowFile(
  git: ReturnType<typeof simpleGit>,
  branch: string,
  filePath: string,
): Promise<string | null> {
  try {
    return await git.show(`${branch}:${filePath}`);
  } catch {
    return null;
  }
}

/**
 * Read a doc file -- first try the working tree (fs), fall back to git show
 * at headBranch if the file is not on disk (e.g. running in a detached state).
 */
async function safeReadFile(
  repoPath: string,
  relPath: string,
  git: ReturnType<typeof simpleGit>,
  headBranch: string,
): Promise<string | null> {
  try {
    return await readFile(joinPath(repoPath, relPath), 'utf-8');
  } catch {
    // File might not be on disk if we're on a different branch; try git show
    return safeShowFile(git, headBranch, relPath);
  }
}

/** Escape special regex characters in a string. */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
