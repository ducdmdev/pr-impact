import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerAnalyzeDiffTool } from '../../src/tools/analyze-diff.js';
import type { PRAnalysis } from '@pr-impact/core';

// ── Mock @pr-impact/core ──
const mockAnalyzePR = vi.fn();
const mockFormatMarkdown = vi.fn();
vi.mock('@pr-impact/core', () => ({
  analyzePR: (...args: unknown[]) => mockAnalyzePR(...args),
  formatMarkdown: (...args: unknown[]) => mockFormatMarkdown(...args),
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
function makePRAnalysis(): PRAnalysis {
  return {
    repoPath: '/repo',
    baseBranch: 'main',
    headBranch: 'HEAD',
    changedFiles: [],
    breakingChanges: [],
    testCoverage: { changedSourceFiles: 0, sourceFilesWithTestChanges: 0, coverageRatio: 1, gaps: [] },
    docStaleness: { staleReferences: [], checkedFiles: [] },
    impactGraph: { directlyChanged: [], indirectlyAffected: [], edges: [] },
    riskScore: { score: 10, level: 'low', factors: [] },
    summary: 'Test summary',
  };
}

describe('analyze_diff tool', () => {
  let server: ReturnType<typeof createMockServer>;

  beforeEach(() => {
    vi.clearAllMocks();
    server = createMockServer();
    registerAnalyzeDiffTool(server as never);
    mockAnalyzePR.mockResolvedValue(makePRAnalysis());
    mockFormatMarkdown.mockReturnValue('# Analysis Report');
  });

  it('registers the tool with correct name and description', () => {
    const tool = server.getRegisteredTool('analyze_diff');
    expect(tool).toBeDefined();
    expect(tool!.description).toContain('full PR impact analysis');
  });

  it('defines schema with repoPath, baseBranch, headBranch as optional', () => {
    const tool = server.getRegisteredTool('analyze_diff');
    expect(tool!.schema).toHaveProperty('repoPath');
    expect(tool!.schema).toHaveProperty('baseBranch');
    expect(tool!.schema).toHaveProperty('headBranch');
  });

  it('calls analyzePR with provided parameters', async () => {
    const tool = server.getRegisteredTool('analyze_diff')!;
    await tool.handler({
      repoPath: '/custom/repo',
      baseBranch: 'develop',
      headBranch: 'feature',
    });

    expect(mockAnalyzePR).toHaveBeenCalledWith({
      repoPath: '/custom/repo',
      baseBranch: 'develop',
      headBranch: 'feature',
    });
  });

  it('defaults repoPath to process.cwd() when not provided', async () => {
    const tool = server.getRegisteredTool('analyze_diff')!;
    await tool.handler({});

    expect(mockAnalyzePR).toHaveBeenCalledWith({
      repoPath: process.cwd(),
      baseBranch: undefined,
      headBranch: undefined,
    });
  });

  it('returns formatted markdown in content', async () => {
    const tool = server.getRegisteredTool('analyze_diff')!;
    const result = await tool.handler({ repoPath: '/repo' }) as { content: Array<{ type: string; text: string }> };

    expect(mockFormatMarkdown).toHaveBeenCalledWith(makePRAnalysis());
    expect(result.content).toHaveLength(1);
    expect(result.content[0]).toEqual({ type: 'text', text: '# Analysis Report' });
  });

  it('returns error content when analyzePR throws an Error', async () => {
    mockAnalyzePR.mockRejectedValue(new Error('git not found'));

    const tool = server.getRegisteredTool('analyze_diff')!;
    const result = await tool.handler({}) as { content: Array<{ type: string; text: string }>; isError: boolean };

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Error analyzing diff: git not found');
  });

  it('returns error content when analyzePR throws a non-Error value', async () => {
    mockAnalyzePR.mockRejectedValue('string error');

    const tool = server.getRegisteredTool('analyze_diff')!;
    const result = await tool.handler({}) as { content: Array<{ type: string; text: string }>; isError: boolean };

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('string error');
  });
});
