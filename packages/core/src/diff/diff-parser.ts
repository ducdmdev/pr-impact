import simpleGit from 'simple-git';
import { ChangedFile } from '../types.js';
import { categorizeFile } from './file-categorizer.js';

const EXTENSION_LANGUAGE_MAP: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.py': 'python',
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java',
  '.c': 'c',
  '.cpp': 'cpp',
  '.h': 'c',
  '.hpp': 'cpp',
  '.rb': 'ruby',
  '.php': 'php',
  '.swift': 'swift',
  '.kt': 'kotlin',
  '.scala': 'scala',
  '.cs': 'csharp',
  '.vue': 'vue',
  '.svelte': 'svelte',
  '.md': 'markdown',
  '.mdx': 'markdown',
  '.json': 'json',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.toml': 'toml',
  '.xml': 'xml',
  '.html': 'html',
  '.css': 'css',
  '.scss': 'scss',
  '.less': 'less',
  '.sql': 'sql',
  '.sh': 'shell',
  '.bash': 'shell',
  '.zsh': 'shell',
  '.dockerfile': 'dockerfile',
  '.graphql': 'graphql',
  '.gql': 'graphql',
  '.proto': 'protobuf',
  '.txt': 'text',
  '.rst': 'restructuredtext',
};

function detectLanguage(filePath: string): string {
  const fileName = filePath.split('/').pop() ?? '';
  const lowerName = fileName.toLowerCase();

  if (lowerName === 'dockerfile') return 'dockerfile';
  if (lowerName === 'makefile') return 'makefile';

  const lastDot = filePath.lastIndexOf('.');
  if (lastDot === -1) return 'unknown';

  const ext = filePath.slice(lastDot).toLowerCase();
  return EXTENSION_LANGUAGE_MAP[ext] ?? 'unknown';
}

/**
 * Resolves a file path from a diff entry, handling renames.
 * simple-git may report renames as "old => new" or "{prefix/old => prefix/new}/suffix".
 * Returns { newPath, oldPath } where oldPath is set only for renames.
 */
function resolveFilePath(raw: string): { newPath: string; oldPath?: string } {
  // Handle brace-style renames: "dir/{old.ts => new.ts}" or "{old => new}/file.ts"
  const braceMatch = raw.match(/^(.*?)\{(.+?) => (.+?)\}(.*)$/);
  if (braceMatch) {
    const [, prefix, oldPart, newPart, suffix] = braceMatch;
    const oldPath = `${prefix}${oldPart}${suffix}`.replace(/\/\//g, '/');
    const newPath = `${prefix}${newPart}${suffix}`.replace(/\/\//g, '/');
    return { newPath, oldPath };
  }

  // Handle simple renames: "old.ts => new.ts"
  const simpleMatch = raw.match(/^(.+?) => (.+?)$/);
  if (simpleMatch) {
    return { newPath: simpleMatch[2], oldPath: simpleMatch[1] };
  }

  return { newPath: raw };
}

function determineStatus(
  filePath: string,
  created: string[],
  deleted: string[],
  renamed: string[],
): ChangedFile['status'] {
  if (created.includes(filePath)) return 'added';
  if (deleted.includes(filePath)) return 'deleted';
  if (renamed.includes(filePath)) return 'renamed';
  return 'modified';
}

export async function parseDiff(
  repoPath: string,
  base: string,
  head: string,
): Promise<ChangedFile[]> {
  const git = simpleGit(repoPath);
  const diffSummary = await git.diffSummary([`${base}..${head}`]);

  // Build lookup sets from the categorized arrays in the diff summary.
  // simple-git provides .created, .deleted, .renamed as arrays of file paths.
  const createdFiles: string[] = (diffSummary as any).created ?? [];
  const deletedFiles: string[] = (diffSummary as any).deleted ?? [];
  const renamedFiles: string[] = (diffSummary as any).renamed ?? [];

  const changedFiles: ChangedFile[] = [];

  for (const file of diffSummary.files) {
    const { newPath, oldPath } = resolveFilePath(file.file);

    const status = determineStatus(
      file.file,
      createdFiles,
      deletedFiles,
      renamedFiles,
    );

    // If we detected a rename from the path pattern but simple-git didn't flag it,
    // treat it as renamed when oldPath is present.
    const finalStatus: ChangedFile['status'] =
      status === 'modified' && oldPath ? 'renamed' : status;

    const changedFile: ChangedFile = {
      path: newPath,
      status: finalStatus,
      additions: 'insertions' in file ? file.insertions : 0,
      deletions: 'deletions' in file ? file.deletions : 0,
      language: detectLanguage(newPath),
      category: categorizeFile(newPath),
    };

    if (oldPath) {
      changedFile.oldPath = oldPath;
    }

    changedFiles.push(changedFile);
  }

  return changedFiles;
}
