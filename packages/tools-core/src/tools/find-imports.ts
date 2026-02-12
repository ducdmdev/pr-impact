import fg from 'fast-glob';
import { readFile } from 'fs/promises';
import { relative, resolve, dirname } from 'path';

export interface FindImportersParams {
  repoPath?: string;
  modulePath: string;
}

export interface FindImportersResult {
  importers: string[];
}

const IMPORT_RE = /(?:import|export)\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g;
const DYNAMIC_IMPORT_RE = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
const REQUIRE_RE = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];

// Session-level cache: maps repoPath -> reverse dependency map.
// The reverse dep map maps a normalized module base -> list of importer relative paths.
let cachedRepoPath: string | null = null;
let cachedReverseMap: Map<string, string[]> | null = null;

export function clearImporterCache(): void {
  cachedRepoPath = null;
  cachedReverseMap = null;
}

export async function findImporters(params: FindImportersParams): Promise<FindImportersResult> {
  const repoPath = params.repoPath ?? process.cwd();
  const targetModule = params.modulePath;

  // Build or reuse cached reverse dependency map
  if (cachedRepoPath !== repoPath || cachedReverseMap === null) {
    cachedReverseMap = await buildReverseMap(repoPath);
    cachedRepoPath = repoPath;
  }

  // Look up importers from the reverse map
  const targetBase = normalizeModulePath(targetModule);
  const importers = cachedReverseMap.get(targetBase) ?? [];

  return { importers: [...importers] };
}

async function buildReverseMap(repoPath: string): Promise<Map<string, string[]>> {
  const reverseMap = new Map<string, string[]>();

  const absolutePaths = await fg('**/*.{ts,tsx,js,jsx}', {
    cwd: repoPath,
    ignore: ['**/node_modules/**', '**/dist/**', '**/.git/**'],
    absolute: true,
  });

  for (const absPath of absolutePaths) {
    const relPath = relative(repoPath, absPath);
    let content: string;
    try {
      content = await readFile(absPath, 'utf-8');
    } catch {
      continue;
    }

    const importPaths = extractImports(content);
    for (const importPath of importPaths) {
      if (!importPath.startsWith('./') && !importPath.startsWith('../')) continue;

      const resolvedBase = resolveAndNormalize(importPath, relPath);
      if (resolvedBase === null) continue;

      const existing = reverseMap.get(resolvedBase);
      if (existing) {
        if (!existing.includes(relPath)) {
          existing.push(relPath);
        }
      } else {
        reverseMap.set(resolvedBase, [relPath]);
      }
    }
  }

  return reverseMap;
}

function extractImports(content: string): string[] {
  const paths: string[] = [];
  for (const re of [IMPORT_RE, DYNAMIC_IMPORT_RE, REQUIRE_RE]) {
    const pattern = new RegExp(re.source, re.flags);
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      paths.push(match[1]);
    }
  }
  return paths;
}

function resolveAndNormalize(importPath: string, importerRelPath: string): string | null {
  const importerDir = dirname(importerRelPath);
  const resolved = resolve('/', importerDir, importPath).slice(1);
  return normalizeModulePath(resolved);
}

function normalizeModulePath(modulePath: string): string {
  // Strip leading slash if present
  let normalized = modulePath.startsWith('/') ? modulePath.slice(1) : modulePath;
  // Strip known extensions for consistent lookup
  for (const ext of EXTENSIONS) {
    if (normalized.endsWith(ext)) {
      normalized = normalized.slice(0, -ext.length);
      break;
    }
  }
  // Strip /index suffix so bare directory imports match index files
  if (normalized.endsWith('/index')) {
    normalized = normalized.slice(0, -'/index'.length);
  }
  return normalized;
}
