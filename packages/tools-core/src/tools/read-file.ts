import { simpleGit } from 'simple-git';

export interface ReadFileAtRefParams {
  repoPath?: string;
  ref: string;
  filePath: string;
}

export interface ReadFileAtRefResult {
  content: string;
}

export async function readFileAtRef(params: ReadFileAtRefParams): Promise<ReadFileAtRefResult> {
  const git = simpleGit(params.repoPath ?? process.cwd());
  const content = await git.show([`${params.ref}:${params.filePath}`]);
  return { content };
}
