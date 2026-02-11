import { describe, it, expect, vi } from 'vitest';

vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: vi.fn().mockImplementation(() => ({
    tool: vi.fn(),
    connect: vi.fn(),
    close: vi.fn(),
  })),
}));

vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: vi.fn(),
}));

// Mock all tools-core handlers
vi.mock('@pr-impact/tools-core', () => ({
  gitDiff: vi.fn().mockResolvedValue({ diff: 'mock diff' }),
  readFileAtRef: vi.fn().mockResolvedValue({ content: 'mock content' }),
  listChangedFiles: vi.fn().mockResolvedValue({ files: [], totalAdditions: 0, totalDeletions: 0 }),
  searchCode: vi.fn().mockResolvedValue({ matches: [] }),
  findImporters: vi.fn().mockResolvedValue({ importers: [] }),
  listTestFiles: vi.fn().mockResolvedValue({ testFiles: [] }),
  clearImporterCache: vi.fn(),
}));

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

describe('MCP server setup', () => {
  it('registers all 6 tools on the server', async () => {
    const mockInstance = {
      tool: vi.fn(),
      connect: vi.fn(),
      close: vi.fn(),
    };
    vi.mocked(McpServer).mockImplementation(() => mockInstance as never);

    const { registerAllTools } = await import('../src/register.js');
    registerAllTools(mockInstance as never);

    expect(mockInstance.tool).toHaveBeenCalledTimes(6);
    const toolNames = mockInstance.tool.mock.calls.map((call: unknown[]) => call[0]);
    expect(toolNames).toContain('git_diff');
    expect(toolNames).toContain('read_file_at_ref');
    expect(toolNames).toContain('list_changed_files');
    expect(toolNames).toContain('search_code');
    expect(toolNames).toContain('find_importers');
    expect(toolNames).toContain('list_test_files');
  });

  it('tool handlers format results as MCP ToolResult', async () => {
    const mockInstance = {
      tool: vi.fn(),
      connect: vi.fn(),
      close: vi.fn(),
    };
    vi.mocked(McpServer).mockImplementation(() => mockInstance as never);

    const { registerAllTools } = await import('../src/register.js');
    registerAllTools(mockInstance as never);

    // Find the git_diff handler and call it
    const gitDiffCall = mockInstance.tool.mock.calls.find(
      (call: unknown[]) => call[0] === 'git_diff',
    );
    expect(gitDiffCall).toBeDefined();

    // The handler is the last argument (index 3)
    const handler = gitDiffCall![3] as (params: Record<string, unknown>) => Promise<unknown>;
    const result = await handler({ base: 'main', head: 'HEAD' });

    expect(result).toEqual({
      content: [{ type: 'text', text: expect.stringContaining('mock diff') }],
    });
  });

  it('tool handlers return isError on failure', async () => {
    const { gitDiff } = await import('@pr-impact/tools-core');
    vi.mocked(gitDiff).mockRejectedValueOnce(new Error('repo not found'));

    const mockInstance = {
      tool: vi.fn(),
      connect: vi.fn(),
      close: vi.fn(),
    };
    vi.mocked(McpServer).mockImplementation(() => mockInstance as never);

    const { registerAllTools } = await import('../src/register.js');
    registerAllTools(mockInstance as never);

    const gitDiffCall = mockInstance.tool.mock.calls.find(
      (call: unknown[]) => call[0] === 'git_diff',
    );
    const handler = gitDiffCall![3] as (params: Record<string, unknown>) => Promise<unknown>;
    const result = await handler({ base: 'main', head: 'HEAD' });

    expect(result).toEqual({
      content: [{ type: 'text', text: expect.stringContaining('repo not found') }],
      isError: true,
    });
  });
});
