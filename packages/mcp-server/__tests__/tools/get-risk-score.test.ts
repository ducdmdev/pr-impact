import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerGetRiskScoreTool } from '../../src/tools/get-risk-score.js';
import type { PRAnalysis, RiskAssessment, RiskFactor } from '@pr-impact/core';

// ── Mock @pr-impact/core ──
const mockAnalyzePR = vi.fn();
vi.mock('@pr-impact/core', () => ({
  analyzePR: (...args: unknown[]) => mockAnalyzePR(...args),
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
function makeRiskFactor(overrides: Partial<RiskFactor> = {}): RiskFactor {
  return {
    name: 'Breaking Changes',
    score: 50,
    weight: 0.3,
    description: 'Breaking changes detected',
    details: ['removed export helper'],
    ...overrides,
  };
}

function makeRiskAssessment(overrides: Partial<RiskAssessment> = {}): RiskAssessment {
  return {
    score: 42,
    level: 'medium',
    factors: [makeRiskFactor()],
    ...overrides,
  };
}

function makePRAnalysis(riskOverrides: Partial<RiskAssessment> = {}): PRAnalysis {
  return {
    repoPath: '/repo',
    baseBranch: 'main',
    headBranch: 'HEAD',
    changedFiles: [],
    breakingChanges: [],
    testCoverage: { changedSourceFiles: 0, sourceFilesWithTestChanges: 0, coverageRatio: 1, gaps: [] },
    docStaleness: { staleReferences: [], checkedFiles: [] },
    impactGraph: { directlyChanged: [], indirectlyAffected: [], edges: [] },
    riskScore: makeRiskAssessment(riskOverrides),
    summary: 'Test summary',
  };
}

describe('get_risk_score tool', () => {
  let server: ReturnType<typeof createMockServer>;

  beforeEach(() => {
    vi.clearAllMocks();
    server = createMockServer();
    registerGetRiskScoreTool(server as never);
    mockAnalyzePR.mockResolvedValue(makePRAnalysis());
  });

  it('registers the tool with correct name and description', () => {
    const tool = server.getRegisteredTool('get_risk_score');
    expect(tool).toBeDefined();
    expect(tool!.description).toContain('risk score');
  });

  it('defines schema with repoPath, baseBranch, and headBranch', () => {
    const tool = server.getRegisteredTool('get_risk_score');
    expect(tool!.schema).toHaveProperty('repoPath');
    expect(tool!.schema).toHaveProperty('baseBranch');
    expect(tool!.schema).toHaveProperty('headBranch');
  });

  it('calls analyzePR with provided parameters', async () => {
    const tool = server.getRegisteredTool('get_risk_score')!;
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
    const tool = server.getRegisteredTool('get_risk_score')!;
    await tool.handler({});

    expect(mockAnalyzePR).toHaveBeenCalledWith({
      repoPath: process.cwd(),
      baseBranch: undefined,
      headBranch: undefined,
    });
  });

  it('returns formatted risk assessment with score and level', async () => {
    const tool = server.getRegisteredTool('get_risk_score')!;
    const result = await tool.handler({}) as { content: Array<{ type: string; text: string }> };

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');
    expect(result.content[0].text).toContain('## Risk Assessment');
    expect(result.content[0].text).toContain('42/100');
    expect(result.content[0].text).toContain('MEDIUM');
  });

  it('includes contributing factors in the output', async () => {
    const tool = server.getRegisteredTool('get_risk_score')!;
    const result = await tool.handler({}) as { content: Array<{ type: string; text: string }> };

    expect(result.content[0].text).toContain('Contributing Factors');
    expect(result.content[0].text).toContain('**Breaking Changes**');
    expect(result.content[0].text).toContain('score: 50');
    expect(result.content[0].text).toContain('weight: 0.3');
    expect(result.content[0].text).toContain('weighted: 15.0');
    expect(result.content[0].text).toContain('Breaking changes detected');
    expect(result.content[0].text).toContain('removed export helper');
  });

  it('handles risk assessment with no factors', async () => {
    mockAnalyzePR.mockResolvedValue(makePRAnalysis({ factors: [] }));

    const tool = server.getRegisteredTool('get_risk_score')!;
    const result = await tool.handler({}) as { content: Array<{ type: string; text: string }> };

    expect(result.content[0].text).toContain('No risk factors identified');
  });

  it('handles factors without details', async () => {
    mockAnalyzePR.mockResolvedValue(
      makePRAnalysis({
        factors: [makeRiskFactor({ details: undefined })],
      }),
    );

    const tool = server.getRegisteredTool('get_risk_score')!;
    const result = await tool.handler({}) as { content: Array<{ type: string; text: string }> };

    expect(result.content[0].text).toContain('**Breaking Changes**');
    expect(result.content[0].text).not.toContain('- removed export helper');
  });

  it('handles factors with empty details array', async () => {
    mockAnalyzePR.mockResolvedValue(
      makePRAnalysis({
        factors: [makeRiskFactor({ details: [] })],
      }),
    );

    const tool = server.getRegisteredTool('get_risk_score')!;
    const result = await tool.handler({}) as { content: Array<{ type: string; text: string }> };

    expect(result.content[0].text).toContain('**Breaking Changes**');
  });

  it('formats different risk levels correctly', async () => {
    for (const level of ['low', 'medium', 'high', 'critical'] as const) {
      mockAnalyzePR.mockResolvedValue(makePRAnalysis({ level, score: level === 'low' ? 10 : level === 'medium' ? 42 : level === 'high' ? 70 : 90 }));

      const freshServer = createMockServer();
      registerGetRiskScoreTool(freshServer as never);
      const tool = freshServer.getRegisteredTool('get_risk_score')!;
      const result = await tool.handler({}) as { content: Array<{ type: string; text: string }> };

      expect(result.content[0].text).toContain(level.toUpperCase());
    }
  });

  it('returns error content when analyzePR throws an Error', async () => {
    mockAnalyzePR.mockRejectedValue(new Error('analysis failed'));

    const tool = server.getRegisteredTool('get_risk_score')!;
    const result = await tool.handler({}) as { content: Array<{ type: string; text: string }>; isError: boolean };

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Error calculating risk score: analysis failed');
  });

  it('returns error content when analyzePR throws a non-Error value', async () => {
    mockAnalyzePR.mockRejectedValue('string error');

    const tool = server.getRegisteredTool('get_risk_score')!;
    const result = await tool.handler({}) as { content: Array<{ type: string; text: string }>; isError: boolean };

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('string error');
  });

  it('includes multiple factors in the output', async () => {
    mockAnalyzePR.mockResolvedValue(
      makePRAnalysis({
        factors: [
          makeRiskFactor({ name: 'Breaking Changes', score: 50, weight: 0.3 }),
          makeRiskFactor({ name: 'Untested Changes', score: 80, weight: 0.25, description: 'Tests missing', details: ['src/foo.ts untested'] }),
        ],
      }),
    );

    const tool = server.getRegisteredTool('get_risk_score')!;
    const result = await tool.handler({}) as { content: Array<{ type: string; text: string }> };

    expect(result.content[0].text).toContain('**Breaking Changes**');
    expect(result.content[0].text).toContain('**Untested Changes**');
    expect(result.content[0].text).toContain('Tests missing');
    expect(result.content[0].text).toContain('src/foo.ts untested');
  });
});
