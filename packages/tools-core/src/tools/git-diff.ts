import { simpleGit } from 'simple-git';

export interface GitDiffParams {
  repoPath?: string;
  base: string;
  head: string;
  file?: string;
}

export interface GitDiffResult {
  diff: string;
}

export async function gitDiff(params: GitDiffParams): Promise<GitDiffResult> {
  const git = simpleGit(params.repoPath ?? process.cwd());
  const args = [`${params.base}...${params.head}`];
  if (params.file) {
    args.push('--', params.file);
  }
  const diff = await git.diff(args);
  return { diff };
}
