import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  gitDiff,
  readFileAtRef,
  listChangedFiles,
  searchCode,
  findImporters,
  listTestFiles,
} from '@pr-impact/tools-core';

interface ToolResult {
  [key: string]: unknown;
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

function success(text: string): ToolResult {
  return { content: [{ type: 'text', text }] };
}

function error(err: unknown): ToolResult {
  const message = err instanceof Error ? err.message : String(err);
  return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
}

export function registerAllTools(server: McpServer): void {
  server.tool(
    'git_diff',
    'Get the raw git diff between two branches, optionally for a single file',
    {
      repoPath: z.string().optional().describe('Path to git repo, defaults to cwd'),
      base: z.string().describe('Base branch or ref'),
      head: z.string().describe('Head branch or ref'),
      file: z.string().optional().describe('Optional file path to get diff for a single file'),
    },
    async (params) => {
      try {
        const result = await gitDiff(params);
        return success(result.diff);
      } catch (err) {
        return error(err);
      }
    },
  );

  server.tool(
    'read_file_at_ref',
    'Read a file content at a specific git ref (branch or commit)',
    {
      repoPath: z.string().optional().describe('Path to git repo, defaults to cwd'),
      ref: z.string().describe('Git ref (branch name, commit SHA, or tag)'),
      filePath: z.string().describe('Repo-relative file path'),
    },
    async (params) => {
      try {
        const result = await readFileAtRef(params);
        return success(result.content);
      } catch (err) {
        return error(err);
      }
    },
  );

  server.tool(
    'list_changed_files',
    'List all files changed between two branches with status and addition/deletion stats',
    {
      repoPath: z.string().optional().describe('Path to git repo, defaults to cwd'),
      base: z.string().describe('Base branch or ref'),
      head: z.string().describe('Head branch or ref'),
    },
    async (params) => {
      try {
        const result = await listChangedFiles(params);
        return success(JSON.stringify(result, null, 2));
      } catch (err) {
        return error(err);
      }
    },
  );

  server.tool(
    'search_code',
    'Search for a regex pattern across the codebase using git grep',
    {
      repoPath: z.string().optional().describe('Path to git repo, defaults to cwd'),
      pattern: z.string().describe('Regex pattern to search for'),
      glob: z.string().optional().describe('File glob to limit search scope (e.g. "*.md")'),
    },
    async (params) => {
      try {
        const result = await searchCode(params);
        return success(JSON.stringify(result, null, 2));
      } catch (err) {
        return error(err);
      }
    },
  );

  server.tool(
    'find_importers',
    'Find all source files that import a given module path',
    {
      repoPath: z.string().optional().describe('Path to git repo, defaults to cwd'),
      modulePath: z.string().describe('Repo-relative path of the module to find importers for'),
    },
    async (params) => {
      try {
        const result = await findImporters(params);
        return success(JSON.stringify(result, null, 2));
      } catch (err) {
        return error(err);
      }
    },
  );

  server.tool(
    'list_test_files',
    'Find test files associated with a source file using naming conventions',
    {
      repoPath: z.string().optional().describe('Path to git repo, defaults to cwd'),
      sourceFile: z.string().describe('Repo-relative path of the source file'),
    },
    async (params) => {
      try {
        const result = await listTestFiles(params);
        return success(JSON.stringify(result, null, 2));
      } catch (err) {
        return error(err);
      }
    },
  );
}
