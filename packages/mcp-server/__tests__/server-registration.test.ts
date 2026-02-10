import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Track tool registrations ──
const registeredTools: string[] = [];

// ── Mock all tool registration modules ──
vi.mock('../src/tools/analyze-diff.js', () => ({
  registerAnalyzeDiffTool: () => { registeredTools.push('analyze_diff'); },
}));
vi.mock('../src/tools/get-breaking-changes.js', () => ({
  registerGetBreakingChangesTool: () => { registeredTools.push('get_breaking_changes'); },
}));
vi.mock('../src/tools/get-risk-score.js', () => ({
  registerGetRiskScoreTool: () => { registeredTools.push('get_risk_score'); },
}));
vi.mock('../src/tools/get-impact-graph.js', () => ({
  registerGetImpactGraphTool: () => { registeredTools.push('get_impact_graph'); },
}));

// ── Mock McpServer ──
vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: vi.fn().mockImplementation(() => ({
    tool: vi.fn(),
    connect: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  })),
}));

// ── Mock StdioServerTransport ──
vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: vi.fn().mockImplementation(() => ({})),
}));

// ── Mock createRequire for version reading ──
vi.mock('module', () => ({
  createRequire: () => () => ({ version: '0.1.0' }),
}));

describe('MCP server registration', () => {
  beforeEach(() => {
    registeredTools.length = 0;
  });

  it('registers all four tools', async () => {
    // Dynamically import to trigger module-level code
    await import('../src/index.js');

    expect(registeredTools).toContain('analyze_diff');
    expect(registeredTools).toContain('get_breaking_changes');
    expect(registeredTools).toContain('get_risk_score');
    expect(registeredTools).toContain('get_impact_graph');
    expect(registeredTools).toHaveLength(4);
  });
});
