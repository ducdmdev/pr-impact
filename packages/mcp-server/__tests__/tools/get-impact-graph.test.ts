import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerGetImpactGraphTool } from '../../src/tools/get-impact-graph.js';
import type { ImpactGraph, ChangedFile } from '@pr-impact/core';

// ── Mock @pr-impact/core ──
const mockParseDiff = vi.fn();
const mockBuildImpactGraph = vi.fn();
const mockResolveDefaultBaseBranch = vi.fn();
vi.mock('@pr-impact/core', () => ({
  parseDiff: (...args: unknown[]) => mockParseDiff(...args),
  buildImpactGraph: (...args: unknown[]) => mockBuildImpactGraph(...args),
  resolveDefaultBaseBranch: (...args: unknown[]) => mockResolveDefaultBaseBranch(...args),
}));

// ── Mock McpServer ──
type ToolHandler = (params: Record<string, unknown>) => Promise<unknown>;

function createMockServer() {
  const tools: Map<string, { description: string; schema: unknown; handler: ToolHandler }> = new Map();
  return {
    tool: (name: string, description: string, schema: unknown, handler: ToolHandler) => {
      tools.set(name, { description, schema, handler });
    },
    getRegisteredTool: (name: string) => tools.get(name),
    getRegisteredTools: () => tools,
  };
}

// ── Helpers ──
function makeGraph(overrides: Partial<ImpactGraph> = {}): ImpactGraph {
  return {
    directlyChanged: ['src/a.ts'],
    indirectlyAffected: ['src/b.ts'],
    edges: [{ from: 'src/b.ts', to: 'src/a.ts', type: 'imports' as const }],
    ...overrides,
  };
}

describe('get_impact_graph tool', () => {
  let server: ReturnType<typeof createMockServer>;

  beforeEach(() => {
    vi.clearAllMocks();
    server = createMockServer();
    registerGetImpactGraphTool(server as never);
    mockResolveDefaultBaseBranch.mockResolvedValue('main');
    mockParseDiff.mockResolvedValue([
      {
        path: 'src/a.ts',
        status: 'modified',
        additions: 5,
        deletions: 2,
        language: 'typescript',
        category: 'source',
      },
    ]);
    mockBuildImpactGraph.mockResolvedValue(makeGraph());
  });

  it('registers the tool with correct name and description', () => {
    const tool = server.getRegisteredTool('get_impact_graph');
    expect(tool).toBeDefined();
    expect(tool!.description).toContain('import dependency graph');
  });

  it('defines schema with repoPath, baseBranch, headBranch, filePath, and depth', () => {
    const tool = server.getRegisteredTool('get_impact_graph');
    expect(tool!.schema).toHaveProperty('repoPath');
    expect(tool!.schema).toHaveProperty('baseBranch');
    expect(tool!.schema).toHaveProperty('headBranch');
    expect(tool!.schema).toHaveProperty('filePath');
    expect(tool!.schema).toHaveProperty('depth');
  });

  it('resolves default base branch when not provided', async () => {
    const tool = server.getRegisteredTool('get_impact_graph')!;
    await tool.handler({});

    expect(mockResolveDefaultBaseBranch).toHaveBeenCalledWith(process.cwd());
    expect(mockParseDiff).toHaveBeenCalledWith(process.cwd(), 'main', 'HEAD');
  });

  it('uses provided baseBranch and headBranch', async () => {
    const tool = server.getRegisteredTool('get_impact_graph')!;
    await tool.handler({
      repoPath: '/repo',
      baseBranch: 'develop',
      headBranch: 'feature',
    });

    expect(mockResolveDefaultBaseBranch).not.toHaveBeenCalled();
    expect(mockParseDiff).toHaveBeenCalledWith('/repo', 'develop', 'feature');
  });

  it('calls buildImpactGraph with default depth of 3', async () => {
    const tool = server.getRegisteredTool('get_impact_graph')!;
    await tool.handler({});

    expect(mockBuildImpactGraph).toHaveBeenCalledWith(
      process.cwd(),
      expect.any(Array),
      3,
    );
  });

  it('passes custom depth to buildImpactGraph', async () => {
    const tool = server.getRegisteredTool('get_impact_graph')!;
    await tool.handler({ depth: 5 });

    expect(mockBuildImpactGraph).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Array),
      5,
    );
  });

  it('returns full graph formatted output when no filePath is provided', async () => {
    const tool = server.getRegisteredTool('get_impact_graph')!;
    const result = await tool.handler({}) as { content: Array<{ type: string; text: string }> };

    expect(result.content[0].text).toContain('## Impact Graph');
    expect(result.content[0].text).toContain('Directly Changed (1)');
    expect(result.content[0].text).toContain('`src/a.ts`');
    expect(result.content[0].text).toContain('Indirectly Affected (1)');
    expect(result.content[0].text).toContain('`src/b.ts`');
  });

  it('returns file-focused output when filePath is a directly changed file', async () => {
    const tool = server.getRegisteredTool('get_impact_graph')!;
    const result = await tool.handler({ filePath: 'src/a.ts' }) as { content: Array<{ type: string; text: string }> };

    expect(result.content[0].text).toContain('## Impact Graph for `src/a.ts`');
    expect(result.content[0].text).toContain('**directly changed**');
  });

  it('returns file-focused output when filePath is indirectly affected', async () => {
    const tool = server.getRegisteredTool('get_impact_graph')!;
    const result = await tool.handler({ filePath: 'src/b.ts' }) as { content: Array<{ type: string; text: string }> };

    expect(result.content[0].text).toContain('## Impact Graph for `src/b.ts`');
    expect(result.content[0].text).toContain('**indirectly affected**');
  });

  it('reports file not affected when filePath is not in graph', async () => {
    const tool = server.getRegisteredTool('get_impact_graph')!;
    const result = await tool.handler({ filePath: 'src/z.ts' }) as { content: Array<{ type: string; text: string }> };

    expect(result.content[0].text).toContain('not affected');
  });

  it('returns error content when an error occurs', async () => {
    mockBuildImpactGraph.mockRejectedValue(new Error('graph failed'));

    const tool = server.getRegisteredTool('get_impact_graph')!;
    const result = await tool.handler({}) as { content: Array<{ type: string; text: string }>; isError: boolean };

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Error building impact graph: graph failed');
  });

  it('handles non-Error thrown values', async () => {
    mockBuildImpactGraph.mockRejectedValue(42);

    const tool = server.getRegisteredTool('get_impact_graph')!;
    const result = await tool.handler({}) as { content: Array<{ type: string; text: string }>; isError: boolean };

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('42');
  });

  it('handles empty graph', async () => {
    mockBuildImpactGraph.mockResolvedValue({
      directlyChanged: [],
      indirectlyAffected: [],
      edges: [],
    });

    const tool = server.getRegisteredTool('get_impact_graph')!;
    const result = await tool.handler({}) as { content: Array<{ type: string; text: string }> };

    expect(result.content[0].text).toContain('No files directly changed');
    expect(result.content[0].text).toContain('No files indirectly affected');
  });

  it('includes dependency edges in the full graph output', async () => {
    const tool = server.getRegisteredTool('get_impact_graph')!;
    const result = await tool.handler({}) as { content: Array<{ type: string; text: string }> };

    expect(result.content[0].text).toContain('Dependency Edges (1)');
    expect(result.content[0].text).toContain('`src/b.ts`');
    expect(result.content[0].text).toContain('`src/a.ts`');
  });
});
