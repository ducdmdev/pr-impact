/**
 * Canonical tool definitions shared between the MCP server and GitHub Action.
 *
 * Each definition describes a tool's name, description, and parameter schema
 * (JSON-Schema-style). The MCP server (`@pr-impact/tools`) converts these to
 * zod schemas; the GitHub Action (`@pr-impact/action`) maps them to
 * Anthropic API tool definitions.
 *
 * `repoPath` is intentionally omitted here — it is added by each consumer:
 * the MCP server exposes it as an optional parameter; the action injects it
 * at runtime from the working directory.
 */

export interface ToolParamDef {
  type: 'string';
  description: string;
}

export interface ToolDef {
  name: string;
  description: string;
  properties: Record<string, ToolParamDef>;
  required: string[];
}

export const TOOL_DEFS: readonly ToolDef[] = [
  {
    name: 'git_diff',
    description: 'Get the raw git diff between two branches, optionally for a single file',
    properties: {
      base: { type: 'string', description: 'Base branch or ref' },
      head: { type: 'string', description: 'Head branch or ref' },
      file: { type: 'string', description: 'Optional file path to get diff for a single file' },
    },
    required: ['base', 'head'],
  },
  {
    name: 'read_file_at_ref',
    description: 'Read a file content at a specific git ref (branch or commit)',
    properties: {
      ref: { type: 'string', description: 'Git ref (branch name, commit SHA, or tag)' },
      filePath: { type: 'string', description: 'Repo-relative file path' },
    },
    required: ['ref', 'filePath'],
  },
  {
    name: 'list_changed_files',
    description: 'List all files changed between two branches with status and addition/deletion stats',
    properties: {
      base: { type: 'string', description: 'Base branch or ref' },
      head: { type: 'string', description: 'Head branch or ref' },
    },
    required: ['base', 'head'],
  },
  {
    name: 'search_code',
    description: 'Search for a regex pattern across the codebase using git grep',
    properties: {
      pattern: { type: 'string', description: 'Regex pattern to search for' },
      glob: { type: 'string', description: 'File glob to limit search scope (e.g. "*.md")' },
    },
    required: ['pattern'],
  },
  {
    name: 'find_importers',
    description: 'Find all source files that import a given module path',
    properties: {
      modulePath: { type: 'string', description: 'Repo-relative path of the module to find importers for' },
    },
    required: ['modulePath'],
  },
  {
    name: 'list_test_files',
    description: 'Find test files associated with a source file using naming conventions',
    properties: {
      sourceFile: { type: 'string', description: 'Repo-relative path of the source file' },
    },
    required: ['sourceFile'],
  },
];
