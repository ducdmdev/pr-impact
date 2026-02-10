import { ExportedSymbol, FileExports } from '../types.js';

/**
 * Callback type for resolving barrel re-exports.
 *
 * Given a module specifier (e.g. `'./utils'`) and the path of the file that
 * contains the `export * from` statement, the resolver should return the
 * content of the target module as a string, or `null` if it cannot be resolved.
 *
 * The second return value is the resolved file path (repo-relative) for the
 * target module, used for cycle detection.
 */
export type FileResolver = (
  moduleSpecifier: string,
  importerFilePath: string,
) => Promise<{ content: string; resolvedPath: string } | null> | { content: string; resolvedPath: string } | null;

/**
 * Regex patterns for extracting exported symbols from TypeScript/JavaScript.
 *
 * Each pattern captures:
 *  - The symbol name
 *  - Optionally the kind (function, class, etc.)
 *  - Optionally the signature (parameter list + return type for functions)
 */

// export * from './module'
const EXPORT_STAR_RE = /export\s+\*\s+from\s+['"]([^'"]+)['"]/g;

// export * as ns from './module'
const EXPORT_STAR_AS_RE = /export\s+\*\s+as\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g;

// export [declare] async? function[*] NAME(...)
const EXPORT_FUNCTION_RE =
  /export\s+(?:declare\s+)?(?:async\s+)?function\s*\*?\s*(\w+)\s*(\([^)]*\)(?:\s*:\s*[^{;]+)?)/g;

// export default [declare] async? function[*] NAME(...)
const EXPORT_DEFAULT_FUNCTION_RE =
  /export\s+default\s+(?:declare\s+)?(?:async\s+)?function\s*\*?\s*(\w+)\s*(\([^)]*\)(?:\s*:\s*[^{;]+)?)/g;

// export default [declare] async? function[*](...)  — unnamed default
const EXPORT_DEFAULT_ANON_FUNCTION_RE =
  /export\s+default\s+(?:declare\s+)?(?:async\s+)?function\s*\*?\s*(\([^)]*\)(?:\s*:\s*[^{;]+)?)/g;

// export [declare] [abstract] class NAME
const EXPORT_CLASS_RE = /export\s+(?:declare\s+)?(?:abstract\s+)?class\s+(\w+)/g;

// export default [declare] [abstract] class NAME
const EXPORT_DEFAULT_CLASS_RE = /export\s+default\s+(?:declare\s+)?(?:abstract\s+)?class\s+(\w+)/g;

// export [declare] const enum NAME (must be checked before variable regex)
const EXPORT_CONST_ENUM_RE = /export\s+(?:declare\s+)?const\s+enum\s+(\w+)/g;

// export [declare] const NAME / export let NAME / export var NAME
// Also handles: export const NAME: Type = ...
const EXPORT_VARIABLE_RE =
  /export\s+(?:declare\s+)?(const|let|var)\s+(\w+)\s*(?::\s*([^=;]+?))?(?:\s*=|;)/g;

// export [declare] const { a, b } = ... (destructured object)
const EXPORT_DESTRUCTURED_OBJ_RE =
  /export\s+(?:declare\s+)?(?:const|let|var)\s+\{([^}]+)\}/g;

// export [declare] const [ a, b ] = ... (destructured array)
const EXPORT_DESTRUCTURED_ARR_RE =
  /export\s+(?:declare\s+)?(?:const|let|var)\s+\[([^\]]+)\]/g;

// export [declare] interface NAME
const EXPORT_INTERFACE_RE = /export\s+(?:declare\s+)?interface\s+(\w+)/g;

// export [declare] type NAME
const EXPORT_TYPE_RE = /export\s+(?:declare\s+)?type\s+(\w+)/g;

// export [declare] enum NAME
const EXPORT_ENUM_RE = /export\s+(?:declare\s+)?enum\s+(\w+)/g;

// export { a, b, c } or export { a as b, c as default }
const EXPORT_NAMED_RE = /export\s*\{([^}]+)\}/g;

// export default <expression> (catch-all for default exports not matched above)
const EXPORT_DEFAULT_EXPR_RE = /export\s+default\s+(?!function|class|interface|type|enum|abstract|async|declare)(\w+)/g;

/**
 * Strip single-line and multi-line comments from source code to avoid
 * matching exports inside comments.
 */
function stripComments(content: string): string {
  // Remove single-line comments but preserve strings
  // Remove block comments
  return content
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
}

/**
 * Normalize a signature string by collapsing whitespace.
 */
function normalizeSignature(sig: string): string {
  return sig.replace(/\s+/g, ' ').trim();
}

/** Maximum depth for recursively resolving barrel re-exports. */
const MAX_BARREL_DEPTH = 10;

/**
 * Parse a TypeScript/JavaScript file's content to extract all exported symbols.
 *
 * When a `fileResolver` is provided, `export * from '...'` barrel re-exports
 * are resolved by reading the target module and recursively parsing its exports.
 * The `export *` syntax re-exports all named exports but NOT the default export
 * (standard ES module behavior).
 *
 * For `export * as ns from '...'`, a single namespace symbol is created.
 */
export function parseExports(
  content: string,
  filePath: string,
  fileResolver?: FileResolver,
): FileExports {
  // Delegate to the internal async implementation and unwrap if synchronous
  const result = parseExportsInternal(
    content,
    filePath,
    fileResolver ?? null,
    new Set<string>(),
    0,
  );

  // If no resolver is provided, the result is always synchronous
  if (result instanceof Promise) {
    // Cannot await in a sync function — wrap in a sync-compatible pattern.
    // In practice, if callers use a fileResolver they should use parseExportsAsync.
    // For backward compatibility parseExports stays sync when no resolver is given.
    throw new Error(
      'parseExports returned a Promise unexpectedly. Use parseExportsAsync for barrel re-export resolution.',
    );
  }

  return result;
}

/**
 * Async version of parseExports that supports barrel re-export resolution.
 *
 * When `fileResolver` is provided, `export * from '...'` statements are
 * recursively resolved. Without a resolver, behaves identically to `parseExports`.
 */
export async function parseExportsAsync(
  content: string,
  filePath: string,
  fileResolver?: FileResolver | null,
): Promise<FileExports> {
  return parseExportsInternal(
    content,
    filePath,
    fileResolver ?? null,
    new Set<string>(),
    0,
  );
}

/**
 * Internal implementation that returns a Promise when barrel resolution is needed
 * and a plain value when it is not.
 */
function parseExportsInternal(
  content: string,
  filePath: string,
  fileResolver: FileResolver | null,
  visited: Set<string>,
  depth: number,
): FileExports | Promise<FileExports> {
  const symbols: ExportedSymbol[] = [];
  const seen = new Set<string>();

  const stripped = stripComments(content);

  function addSymbol(sym: ExportedSymbol): void {
    // Use a compound key to differentiate default vs named
    const key = sym.isDefault ? `default::${sym.name}` : sym.name;
    if (!seen.has(key)) {
      seen.add(key);
      symbols.push(sym);
    }
  }

  // 1. export default function NAME(...)
  {
    const re = new RegExp(EXPORT_DEFAULT_FUNCTION_RE.source, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(stripped)) !== null) {
      addSymbol({
        name: m[1],
        kind: 'function',
        signature: normalizeSignature(m[2]),
        isDefault: true,
      });
    }
  }

  // 2. export default anonymous function(...)
  {
    const re = new RegExp(EXPORT_DEFAULT_ANON_FUNCTION_RE.source, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(stripped)) !== null) {
      // Only match if this is truly anonymous (no name captured by the named variant)
      // The named variant regex already matched named ones, so check if the char before '(' is not a word char
      const beforeParen = stripped.substring(0, m.index + m[0].indexOf('('));
      if (/function\s*$/.test(beforeParen)) {
        addSymbol({
          name: 'default',
          kind: 'function',
          signature: normalizeSignature(m[1]),
          isDefault: true,
        });
      }
    }
  }

  // 3. export function NAME(...)
  {
    const re = new RegExp(EXPORT_FUNCTION_RE.source, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(stripped)) !== null) {
      // Ensure this is not a "default" export (already handled above)
      const prefix = stripped.substring(Math.max(0, m.index - 10), m.index + 7);
      if (prefix.includes('default')) continue;

      addSymbol({
        name: m[1],
        kind: 'function',
        signature: normalizeSignature(m[2]),
        isDefault: false,
      });
    }
  }

  // 4. export default class NAME
  {
    const re = new RegExp(EXPORT_DEFAULT_CLASS_RE.source, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(stripped)) !== null) {
      addSymbol({
        name: m[1],
        kind: 'class',
        isDefault: true,
      });
    }
  }

  // 5. export class NAME
  {
    const re = new RegExp(EXPORT_CLASS_RE.source, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(stripped)) !== null) {
      const prefix = stripped.substring(Math.max(0, m.index - 10), m.index + 7);
      if (prefix.includes('default')) continue;

      addSymbol({
        name: m[1],
        kind: 'class',
        isDefault: false,
      });
    }
  }

  // 6a. export const enum NAME (before variable regex to avoid false matches)
  const constEnumNames = new Set<string>();
  {
    const re = new RegExp(EXPORT_CONST_ENUM_RE.source, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(stripped)) !== null) {
      constEnumNames.add(m[1]);
      addSymbol({
        name: m[1],
        kind: 'enum',
        isDefault: false,
      });
    }
  }

  // 6b. export const { a, b } = ... (destructured object)
  const destructuredNames = new Set<string>();
  {
    const re = new RegExp(EXPORT_DESTRUCTURED_OBJ_RE.source, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(stripped)) !== null) {
      const items = m[1].split(',');
      for (const item of items) {
        // Handle "original as renamed" pattern
        const asMatch = item.trim().match(/^(\w+)\s+as\s+(\w+)$/);
        const name = asMatch ? asMatch[2] : item.trim().match(/^(\w+)/)?.[1];
        if (name) {
          destructuredNames.add(name);
          addSymbol({
            name,
            kind: 'const',
            isDefault: false,
          });
        }
      }
    }
  }

  // 6c. export const [ a, b ] = ... (destructured array)
  {
    const re = new RegExp(EXPORT_DESTRUCTURED_ARR_RE.source, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(stripped)) !== null) {
      const items = m[1].split(',');
      for (const item of items) {
        const name = item.trim().match(/^(\w+)/)?.[1];
        if (name) {
          destructuredNames.add(name);
          addSymbol({
            name,
            kind: 'const',
            isDefault: false,
          });
        }
      }
    }
  }

  // 6d. export const/let/var NAME
  {
    const re = new RegExp(EXPORT_VARIABLE_RE.source, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(stripped)) !== null) {
      const varKeyword = m[1]; // const, let, var
      const name = m[2];

      // Skip if this was already captured as a const enum or destructured binding
      if (constEnumNames.has(name) || destructuredNames.has(name)) continue;
      // Skip "export const enum Foo" — the "enum" would be captured as a variable name
      if (name === 'enum') continue;

      const typeAnnotation = m[3] ? normalizeSignature(m[3]) : undefined;

      addSymbol({
        name,
        kind: varKeyword === 'const' ? 'const' : 'variable',
        signature: typeAnnotation,
        isDefault: false,
      });
    }
  }

  // 7. export interface NAME
  {
    const re = new RegExp(EXPORT_INTERFACE_RE.source, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(stripped)) !== null) {
      addSymbol({
        name: m[1],
        kind: 'interface',
        isDefault: false,
      });
    }
  }

  // 8. export type NAME (but not "export type {" which is a re-export)
  {
    const re = new RegExp(EXPORT_TYPE_RE.source, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(stripped)) !== null) {
      // Skip "export type {" — that's a type-only re-export block, not a type alias
      const afterMatch = stripped.substring(m.index + m[0].length).trimStart();
      if (afterMatch.startsWith('{')) continue;

      addSymbol({
        name: m[1],
        kind: 'type',
        isDefault: false,
      });
    }
  }

  // 9. export enum NAME
  {
    const re = new RegExp(EXPORT_ENUM_RE.source, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(stripped)) !== null) {
      addSymbol({
        name: m[1],
        kind: 'enum',
        isDefault: false,
      });
    }
  }

  // 10. export { a, b, c } and export { a as b }
  {
    const re = new RegExp(EXPORT_NAMED_RE.source, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(stripped)) !== null) {
      // Check if this is preceded by "type" → export type { ... }
      const preceding = stripped.substring(Math.max(0, m.index - 6), m.index);
      const isTypeOnly = /type\s*$/.test(preceding);

      const inner = m[1];
      const items = inner.split(',');

      for (const item of items) {
        const trimmed = item.trim();
        if (!trimmed) continue;

        // Handle "name as alias" patterns
        const asMatch = trimmed.match(/^(\w+)\s+as\s+(\w+)$/);
        let exportedName: string;
        let isDefault = false;

        if (asMatch) {
          exportedName = asMatch[2];
          if (exportedName === 'default') {
            isDefault = true;
            exportedName = asMatch[1]; // Use original name for tracking
          }
        } else {
          exportedName = trimmed;
        }

        // Skip if not a valid identifier
        if (!/^\w+$/.test(exportedName)) continue;

        addSymbol({
          name: exportedName,
          kind: isTypeOnly ? 'type' : 'variable',
          isDefault,
        });
      }
    }
  }

  // 11. export default <expression> (identifier)
  {
    const re = new RegExp(EXPORT_DEFAULT_EXPR_RE.source, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(stripped)) !== null) {
      addSymbol({
        name: m[1],
        kind: 'variable',
        isDefault: true,
      });
    }
  }

  // 12. export * as ns from '...' (namespace re-export — must be checked BEFORE export *)
  const starAsSpecifiers = new Set<string>();
  {
    const re = new RegExp(EXPORT_STAR_AS_RE.source, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(stripped)) !== null) {
      const nsName = m[1];
      const specifier = m[2];
      starAsSpecifiers.add(specifier);
      addSymbol({
        name: nsName,
        kind: 'variable',
        isDefault: false,
      });
    }
  }

  // 13. export * from '...' (barrel re-export)
  // Collect the specifiers. If a resolver is provided, we resolve them
  // recursively. Otherwise we just skip them (backward-compatible).
  const barrelSpecifiers: string[] = [];
  {
    const re = new RegExp(EXPORT_STAR_RE.source, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(stripped)) !== null) {
      const specifier = m[1];
      // Skip if this specifier was already captured by export * as ns from '...'
      if (!starAsSpecifiers.has(specifier)) {
        barrelSpecifiers.push(specifier);
      }
    }
  }

  // If there are no barrel specifiers or no resolver, return synchronously
  if (barrelSpecifiers.length === 0 || fileResolver === null || depth >= MAX_BARREL_DEPTH) {
    return { filePath, symbols };
  }

  // Mark current file as visited to prevent circular re-exports
  const normalizedPath = filePath.replace(/\\/g, '/');
  if (visited.has(normalizedPath)) {
    return { filePath, symbols };
  }
  visited.add(normalizedPath);

  // Resolve barrel re-exports (potentially async)
  const resolveBarrels = async (): Promise<FileExports> => {
    for (const specifier of barrelSpecifiers) {
      const resolved = await fileResolver(specifier, filePath);
      if (resolved === null) {
        continue;
      }

      const { content: targetContent, resolvedPath: targetPath } = resolved;
      const normalizedTargetPath = targetPath.replace(/\\/g, '/');

      // Skip if we've already visited this file (circular re-export)
      if (visited.has(normalizedTargetPath)) {
        continue;
      }

      // Recursively parse the target file's exports
      const targetExports = await parseExportsInternal(
        targetContent,
        targetPath,
        fileResolver,
        visited,
        depth + 1,
      );

      // Add all non-default symbols from the target
      // (export * does NOT re-export default)
      for (const sym of targetExports.symbols) {
        if (!sym.isDefault) {
          addSymbol(sym);
        }
      }
    }

    return { filePath, symbols };
  };

  return resolveBarrels();
}

/** Return type for diffExports / diffExportsAsync. */
export interface ExportDiffResult {
  removed: ExportedSymbol[];
  added: ExportedSymbol[];
  modified: Array<{ before: ExportedSymbol; after: ExportedSymbol }>;
}

/**
 * Compare exports between the base and head version of a file.
 *
 * Returns:
 *  - removed:  symbols present in base but missing from head
 *  - added:    symbols present in head but missing from base
 *  - modified: symbols present in both but whose signature changed
 */
export function diffExports(
  basePath: string,
  baseContent: string,
  headContent: string,
): ExportDiffResult {
  const baseExports = parseExports(baseContent, basePath);
  const headExports = parseExports(headContent, basePath);

  return computeDiff(baseExports, headExports);
}

/**
 * Async version of diffExports that supports barrel re-export resolution.
 */
export async function diffExportsAsync(
  basePath: string,
  baseContent: string,
  headContent: string,
  fileResolver?: FileResolver | null,
): Promise<ExportDiffResult> {
  const [baseExports, headExports] = await Promise.all([
    parseExportsAsync(baseContent, basePath, fileResolver),
    parseExportsAsync(headContent, basePath, fileResolver),
  ]);

  return computeDiff(baseExports, headExports);
}

/**
 * Compute the diff between two sets of file exports.
 */
function computeDiff(
  baseExports: FileExports,
  headExports: FileExports,
): ExportDiffResult {
  // Build lookup maps keyed by (name + isDefault) for accurate matching
  const baseMap = new Map<string, ExportedSymbol>();
  for (const sym of baseExports.symbols) {
    const key = sym.isDefault ? `default::${sym.name}` : sym.name;
    baseMap.set(key, sym);
  }

  const headMap = new Map<string, ExportedSymbol>();
  for (const sym of headExports.symbols) {
    const key = sym.isDefault ? `default::${sym.name}` : sym.name;
    headMap.set(key, sym);
  }

  const removed: ExportedSymbol[] = [];
  const added: ExportedSymbol[] = [];
  const modified: Array<{ before: ExportedSymbol; after: ExportedSymbol }> = [];

  // Find removed and modified symbols
  for (const [key, baseSym] of baseMap) {
    const headSym = headMap.get(key);
    if (!headSym) {
      removed.push(baseSym);
    } else {
      // Check if signature or kind changed
      const baseSig = baseSym.signature ?? '';
      const headSig = headSym.signature ?? '';
      const kindChanged = baseSym.kind !== headSym.kind;
      const sigChanged = baseSig !== headSig;

      if (kindChanged || sigChanged) {
        modified.push({ before: baseSym, after: headSym });
      }
    }
  }

  // Find added symbols
  for (const [key, headSym] of headMap) {
    if (!baseMap.has(key)) {
      added.push(headSym);
    }
  }

  return { removed, added, modified };
}
