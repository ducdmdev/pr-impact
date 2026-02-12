import { simpleGit } from 'simple-git';

export interface ListChangedFilesParams {
  repoPath?: string;
  base: string;
  head: string;
}

export type FileStatus = 'added' | 'modified' | 'deleted' | 'renamed' | 'copied';

export interface ChangedFileEntry {
  path: string;
  status: FileStatus;
  additions: number;
  deletions: number;
}

export interface ListChangedFilesResult {
  files: ChangedFileEntry[];
  totalAdditions: number;
  totalDeletions: number;
}

export async function listChangedFiles(params: ListChangedFilesParams): Promise<ListChangedFilesResult> {
  const git = simpleGit(params.repoPath ?? process.cwd());
  const range = `${params.base}...${params.head}`;

  // Get file status (A/M/D/R/C) from --name-status
  const nameStatusOutput = await git.diff(['--name-status', range]);
  const statusMap = parseNameStatus(nameStatusOutput);

  // Get line counts from diffSummary
  const summary = await git.diffSummary([range]);

  const files: ChangedFileEntry[] = summary.files.map((f) => ({
    path: f.file,
    status: statusMap.get(f.file) ?? 'modified',
    additions: 'insertions' in f ? f.insertions : 0,
    deletions: 'deletions' in f ? f.deletions : 0,
  }));

  return {
    files,
    totalAdditions: summary.insertions,
    totalDeletions: summary.deletions,
  };
}

function parseNameStatus(output: string): Map<string, FileStatus> {
  const map = new Map<string, FileStatus>();
  const lines = output.trim().split('\n').filter(Boolean);

  for (const line of lines) {
    const parts = line.split('\t');
    if (parts.length < 2) continue;

    const statusCode = parts[0].charAt(0);
    let filePath: string;

    if (statusCode === 'R' || statusCode === 'C') {
      // Renamed/Copied: status\told-path\tnew-path
      filePath = parts[2] ?? parts[1];
    } else {
      filePath = parts[1];
    }

    map.set(filePath, mapStatusCode(statusCode));
  }

  return map;
}

function mapStatusCode(code: string): FileStatus {
  switch (code) {
    case 'A': return 'added';
    case 'D': return 'deleted';
    case 'R': return 'renamed';
    case 'C': return 'copied';
    case 'M':
    default:
      return 'modified';
  }
}
