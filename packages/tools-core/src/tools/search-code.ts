import { simpleGit } from 'simple-git';

export interface SearchCodeParams {
  repoPath?: string;
  pattern: string;
  glob?: string;
}

export interface SearchMatch {
  file: string;
  line: number;
  match: string;
}

export interface SearchCodeResult {
  matches: SearchMatch[];
}

export async function searchCode(params: SearchCodeParams): Promise<SearchCodeResult> {
  const git = simpleGit(params.repoPath ?? process.cwd());

  // Build raw git grep command to properly support glob filtering.
  // Using git.raw() instead of git.grep() because simple-git's grep()
  // does not reliably pass glob path specs.
  const args = ['grep', '-n', '--', params.pattern];
  if (params.glob) {
    args.push(params.glob);
  }

  let output: string;
  try {
    output = await git.raw(args);
  } catch (error: unknown) {
    // git grep exits with code 1 when no matches are found.
    // simple-git wraps this as an error containing "exited with code 1".
    // Other errors (e.g. not a git repo) should propagate.
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('exited with code 1')) {
      return { matches: [] };
    }
    throw error;
  }

  const matches: SearchMatch[] = [];
  const lines = output.trim().split('\n').filter(Boolean);

  for (const line of lines) {
    // Format: file:line:content
    const firstColon = line.indexOf(':');
    if (firstColon === -1) continue;
    const secondColon = line.indexOf(':', firstColon + 1);
    if (secondColon === -1) continue;

    const file = line.slice(0, firstColon);
    const lineNum = parseInt(line.slice(firstColon + 1, secondColon), 10);
    const matchText = line.slice(secondColon + 1);

    if (!isNaN(lineNum)) {
      matches.push({ file, line: lineNum, match: matchText });
    }
  }

  return { matches };
}
