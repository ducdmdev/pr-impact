import { ExportedSymbol, FileExports } from '../types.js';

/**
 * Regex patterns for extracting exported symbols from TypeScript/JavaScript.
 *
 * Each pattern captures:
 *  - The symbol name
 *  - Optionally the kind (function, class, etc.)
 *  - Optionally the signature (parameter list + return type for functions)
 */

// export async? function NAME(...)
const EXPORT_FUNCTION_RE =
  /export\s+(?:async\s+)?function\s+(\w+)\s*(\([^)]*\)(?:\s*:\s*[^{;]+)?)/g;

// export default async? function NAME(...)
const EXPORT_DEFAULT_FUNCTION_RE =
  /export\s+default\s+(?:async\s+)?function\s+(\w+)\s*(\([^)]*\)(?:\s*:\s*[^{;]+)?)/g;

// export default async? function(...)  — unnamed default
const EXPORT_DEFAULT_ANON_FUNCTION_RE =
  /export\s+default\s+(?:async\s+)?function\s*(\([^)]*\)(?:\s*:\s*[^{;]+)?)/g;

// export class NAME
const EXPORT_CLASS_RE = /export\s+class\s+(\w+)/g;

// export default class NAME
const EXPORT_DEFAULT_CLASS_RE = /export\s+default\s+class\s+(\w+)/g;

// export const NAME / export let NAME / export var NAME
// Also handles: export const NAME: Type = ...
const EXPORT_VARIABLE_RE =
  /export\s+(const|let|var)\s+(\w+)\s*(?::\s*([^=;]+?))?(?:\s*=|;)/g;

// export interface NAME
const EXPORT_INTERFACE_RE = /export\s+interface\s+(\w+)/g;

// export type NAME
const EXPORT_TYPE_RE = /export\s+type\s+(\w+)/g;

// export enum NAME
const EXPORT_ENUM_RE = /export\s+enum\s+(\w+)/g;

// export { a, b, c } or export { a as b, c as default }
const EXPORT_NAMED_RE = /export\s*\{([^}]+)\}/g;

// export default <expression> (catch-all for default exports not matched above)
const EXPORT_DEFAULT_EXPR_RE = /export\s+default\s+(?!function|class|interface|type|enum)(\w+)/g;

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

/**
 * Parse a TypeScript/JavaScript file's content to extract all exported symbols.
 */
export function parseExports(content: string, filePath: string): FileExports {
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

  // 6. export const/let/var NAME
  {
    const re = new RegExp(EXPORT_VARIABLE_RE.source, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(stripped)) !== null) {
      const varKeyword = m[1]; // const, let, var
      const name = m[2];
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

  return { filePath, symbols };
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
): {
  removed: ExportedSymbol[];
  added: ExportedSymbol[];
  modified: Array<{ before: ExportedSymbol; after: ExportedSymbol }>;
} {
  const baseExports = parseExports(baseContent, basePath);
  const headExports = parseExports(headContent, basePath);

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
