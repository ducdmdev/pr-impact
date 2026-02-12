import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  gitDiff,
  readFileAtRef,
  listChangedFiles,
  searchCode,
  findImporters,
  listTestFiles,
  TOOL_DEFS,
} from '@pr-impact/tools-core';
import type {
  ToolDef,
  GitDiffParams,
  ReadFileAtRefParams,
  ListChangedFilesParams,
  SearchCodeParams,
  FindImportersParams,
  ListTestFilesParams,
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

/** Convert a ToolDef to a zod schema, adding the MCP-specific repoPath param. */
function defToZod(def: ToolDef): Record<string, z.ZodTypeAny> {
  const shape: Record<string, z.ZodTypeAny> = {
    repoPath: z.string().optional().describe('Path to git repo, defaults to cwd'),
  };
  for (const [key, param] of Object.entries(def.properties)) {
    const base = z.string().describe(param.description);
    shape[key] = def.required.includes(key) ? base : base.optional();
  }
  return shape;
}

function getDef(name: string): ToolDef {
  const def = TOOL_DEFS.find((d) => d.name === name);
  if (!def) throw new Error(`Unknown tool definition: ${name}`);
  return def;
}

export function registerAllTools(server: McpServer): void {
  const gitDiffDef = getDef('git_diff');
  server.tool(
    gitDiffDef.name,
    gitDiffDef.description,
    defToZod(gitDiffDef),
    async (params) => {
      try {
        const result = await gitDiff(params as unknown as GitDiffParams);
        return success(result.diff);
      } catch (err) {
        return error(err);
      }
    },
  );

  const readFileDef = getDef('read_file_at_ref');
  server.tool(
    readFileDef.name,
    readFileDef.description,
    defToZod(readFileDef),
    async (params) => {
      try {
        const result = await readFileAtRef(params as unknown as ReadFileAtRefParams);
        return success(result.content);
      } catch (err) {
        return error(err);
      }
    },
  );

  const listFilesDef = getDef('list_changed_files');
  server.tool(
    listFilesDef.name,
    listFilesDef.description,
    defToZod(listFilesDef),
    async (params) => {
      try {
        const result = await listChangedFiles(params as unknown as ListChangedFilesParams);
        return success(JSON.stringify(result, null, 2));
      } catch (err) {
        return error(err);
      }
    },
  );

  const searchDef = getDef('search_code');
  server.tool(
    searchDef.name,
    searchDef.description,
    defToZod(searchDef),
    async (params) => {
      try {
        const result = await searchCode(params as unknown as SearchCodeParams);
        return success(JSON.stringify(result, null, 2));
      } catch (err) {
        return error(err);
      }
    },
  );

  const importersDef = getDef('find_importers');
  server.tool(
    importersDef.name,
    importersDef.description,
    defToZod(importersDef),
    async (params) => {
      try {
        const result = await findImporters(params as unknown as FindImportersParams);
        return success(JSON.stringify(result, null, 2));
      } catch (err) {
        return error(err);
      }
    },
  );

  const testsDef = getDef('list_test_files');
  server.tool(
    testsDef.name,
    testsDef.description,
    defToZod(testsDef),
    async (params) => {
      try {
        const result = await listTestFiles(params as unknown as ListTestFilesParams);
        return success(JSON.stringify(result, null, 2));
      } catch (err) {
        return error(err);
      }
    },
  );
}
