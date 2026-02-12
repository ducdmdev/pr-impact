import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@pr-impact/tools-core', async (importOriginal) => {
  const original = await importOriginal<typeof import('@pr-impact/tools-core')>();
  return {
    TOOL_DEFS: original.TOOL_DEFS,
    gitDiff: vi.fn(),
    readFileAtRef: vi.fn(),
    listChangedFiles: vi.fn(),
    searchCode: vi.fn(),
    findImporters: vi.fn(),
    listTestFiles: vi.fn(),
    clearImporterCache: vi.fn(),
  };
});

vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: vi.fn(),
}));

import {
  gitDiff,
  readFileAtRef,
  listChangedFiles,
  searchCode,
  findImporters,
  listTestFiles,
} from '@pr-impact/tools-core';
import { registerAllTools } from '../src/register.js';

function createMockServer() {
  return { tool: vi.fn(), connect: vi.fn(), close: vi.fn() };
}

function getHandler(mock: ReturnType<typeof createMockServer>, toolName: string) {
  const call = mock.tool.mock.calls.find((c: unknown[]) => c[0] === toolName);
  if (!call) throw new Error(`Tool ${toolName} not registered`);
  return call[3] as (params: Record<string, unknown>) => Promise<unknown>;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('registerAllTools', () => {
  describe('git_diff handler', () => {
    it('returns diff text on success', async () => {
      vi.mocked(gitDiff).mockResolvedValue({ diff: 'diff --git a/file.ts' });
      const server = createMockServer();
      registerAllTools(server as never);

      const result = await getHandler(server, 'git_diff')({ base: 'main', head: 'HEAD' });
      expect(result).toEqual({
        content: [{ type: 'text', text: 'diff --git a/file.ts' }],
      });
    });

    it('returns isError on failure', async () => {
      vi.mocked(gitDiff).mockRejectedValue(new Error('not a git repo'));
      const server = createMockServer();
      registerAllTools(server as never);

      const result = await getHandler(server, 'git_diff')({ base: 'main', head: 'HEAD' });
      expect(result).toEqual({
        content: [{ type: 'text', text: 'Error: not a git repo' }],
        isError: true,
      });
    });
  });

  describe('read_file_at_ref handler', () => {
    it('returns file content on success', async () => {
      vi.mocked(readFileAtRef).mockResolvedValue({ content: 'file content here' });
      const server = createMockServer();
      registerAllTools(server as never);

      const result = await getHandler(server, 'read_file_at_ref')({
        ref: 'main',
        filePath: 'src/index.ts',
      });
      expect(result).toEqual({
        content: [{ type: 'text', text: 'file content here' }],
      });
    });

    it('returns isError when file not found', async () => {
      vi.mocked(readFileAtRef).mockRejectedValue(new Error("path 'missing.ts' does not exist"));
      const server = createMockServer();
      registerAllTools(server as never);

      const result = await getHandler(server, 'read_file_at_ref')({
        ref: 'main',
        filePath: 'missing.ts',
      });
      expect(result).toEqual({
        content: [{ type: 'text', text: expect.stringContaining('does not exist') }],
        isError: true,
      });
    });
  });

  describe('list_changed_files handler', () => {
    it('returns JSON-stringified result', async () => {
      const mockFiles = { files: [{ path: 'a.ts', status: 'modified', additions: 5, deletions: 2 }] };
      vi.mocked(listChangedFiles).mockResolvedValue(mockFiles as never);
      const server = createMockServer();
      registerAllTools(server as never);

      const result = await getHandler(server, 'list_changed_files')({ base: 'main', head: 'HEAD' });
      const text = (result as { content: Array<{ text: string }> }).content[0].text;
      expect(JSON.parse(text)).toEqual(mockFiles);
    });
  });

  describe('search_code handler', () => {
    it('returns JSON-stringified matches', async () => {
      const mockResult = { matches: [{ file: 'a.ts', line: 10, match: 'hello' }] };
      vi.mocked(searchCode).mockResolvedValue(mockResult);
      const server = createMockServer();
      registerAllTools(server as never);

      const result = await getHandler(server, 'search_code')({ pattern: 'hello' });
      const text = (result as { content: Array<{ text: string }> }).content[0].text;
      expect(JSON.parse(text)).toEqual(mockResult);
    });
  });

  describe('find_importers handler', () => {
    it('returns JSON-stringified importers', async () => {
      const mockResult = { importers: ['src/index.ts', 'src/tools.ts'] };
      vi.mocked(findImporters).mockResolvedValue(mockResult);
      const server = createMockServer();
      registerAllTools(server as never);

      const result = await getHandler(server, 'find_importers')({ modulePath: 'src/utils.ts' });
      const text = (result as { content: Array<{ text: string }> }).content[0].text;
      expect(JSON.parse(text)).toEqual(mockResult);
    });
  });

  describe('list_test_files handler', () => {
    it('returns JSON-stringified test files', async () => {
      const mockResult = { testFiles: ['__tests__/foo.test.ts'] };
      vi.mocked(listTestFiles).mockResolvedValue(mockResult);
      const server = createMockServer();
      registerAllTools(server as never);

      const result = await getHandler(server, 'list_test_files')({ sourceFile: 'src/foo.ts' });
      const text = (result as { content: Array<{ text: string }> }).content[0].text;
      expect(JSON.parse(text)).toEqual(mockResult);
    });
  });

  describe('error handler edge cases', () => {
    it('handles non-Error thrown values', async () => {
      vi.mocked(gitDiff).mockRejectedValue('string error');
      const server = createMockServer();
      registerAllTools(server as never);

      const result = await getHandler(server, 'git_diff')({ base: 'main', head: 'HEAD' });
      expect(result).toEqual({
        content: [{ type: 'text', text: 'Error: string error' }],
        isError: true,
      });
    });
  });
});
