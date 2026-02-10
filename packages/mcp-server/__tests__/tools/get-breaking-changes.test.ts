import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerGetBreakingChangesTool } from '../../src/tools/get-breaking-changes.js';
import type { BreakingChange, ChangedFile } from '@pr-impact/core';

// ── Mock @pr-impact/core ──
const mockParseDiff = vi.fn();
const mockDetectBreakingChanges = vi.fn();
const mockResolveDefaultBaseBranch = vi.fn();
vi.mock('@pr-impact/core', () => ({
  parseDiff: (...args: unknown[]) => mockParseDiff(...args),
  detectBreakingChanges: (...args: unknown[]) => mockDetectBreakingChanges(...args),
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
function makeChangedFile(overrides: Partial<ChangedFile> = {}): ChangedFile {
  return {
    path: 'src/utils.ts',
    status: 'modified',
    additions: 10,
    deletions: 2,
    language: 'typescript',
    category: 'source',
    ...overrides,
  };
}

function makeBreakingChange(overrides: Partial<BreakingChange> = {}): BreakingChange {
  return {
    filePath: 'src/utils.ts',
    type: 'removed_export',
    symbolName: 'helper',
    before: 'function helper()',
    after: null,
    severity: 'high',
    consumers: ['src/app.ts'],
    ...overrides,
  };
}

describe('get_breaking_changes tool', () => {
  let server: ReturnType<typeof createMockServer>;

  beforeEach(() => {
    vi.clearAllMocks();
    server = createMockServer();
    registerGetBreakingChangesTool(server as never);
    mockResolveDefaultBaseBranch.mockResolvedValue('main');
    mockParseDiff.mockResolvedValue([makeChangedFile()]);
    mockDetectBreakingChanges.mockResolvedValue([]);
  });

  it('registers the tool with correct name and description', () => {
    const tool = server.getRegisteredTool('get_breaking_changes');
    expect(tool).toBeDefined();
    expect(tool!.description).toContain('breaking changes');
  });

  it('defines schema with repoPath, baseBranch, headBranch, and minSeverity', () => {
    const tool = server.getRegisteredTool('get_breaking_changes');
    expect(tool!.schema).toHaveProperty('repoPath');
    expect(tool!.schema).toHaveProperty('baseBranch');
    expect(tool!.schema).toHaveProperty('headBranch');
    expect(tool!.schema).toHaveProperty('minSeverity');
  });

  it('resolves default base branch when not provided', async () => {
    const tool = server.getRegisteredTool('get_breaking_changes')!;
    await tool.handler({});

    expect(mockResolveDefaultBaseBranch).toHaveBeenCalledWith(process.cwd());
    expect(mockParseDiff).toHaveBeenCalledWith(process.cwd(), 'main', 'HEAD');
  });

  it('uses provided baseBranch and headBranch', async () => {
    const tool = server.getRegisteredTool('get_breaking_changes')!;
    await tool.handler({
      repoPath: '/repo',
      baseBranch: 'develop',
      headBranch: 'feature',
    });

    expect(mockResolveDefaultBaseBranch).not.toHaveBeenCalled();
    expect(mockParseDiff).toHaveBeenCalledWith('/repo', 'develop', 'feature');
  });

  it('calls detectBreakingChanges with parsed changed files', async () => {
    const changedFiles = [makeChangedFile()];
    mockParseDiff.mockResolvedValue(changedFiles);

    const tool = server.getRegisteredTool('get_breaking_changes')!;
    await tool.handler({ repoPath: '/repo', baseBranch: 'main', headBranch: 'HEAD' });

    expect(mockDetectBreakingChanges).toHaveBeenCalledWith('/repo', 'main', 'HEAD', changedFiles);
  });

  it('returns "no breaking changes" message when none found', async () => {
    mockDetectBreakingChanges.mockResolvedValue([]);

    const tool = server.getRegisteredTool('get_breaking_changes')!;
    const result = await tool.handler({}) as { content: Array<{ type: string; text: string }> };

    expect(result.content[0].text).toContain('No breaking changes detected');
  });

  it('returns formatted breaking changes when found', async () => {
    mockDetectBreakingChanges.mockResolvedValue([makeBreakingChange()]);

    const tool = server.getRegisteredTool('get_breaking_changes')!;
    const result = await tool.handler({}) as { content: Array<{ type: string; text: string }> };

    expect(result.content[0].text).toContain('Found 1 breaking change:');
    expect(result.content[0].text).toContain('**helper**');
    expect(result.content[0].text).toContain('`src/utils.ts`');
  });

  it('filters by minSeverity when provided', async () => {
    const changes = [
      makeBreakingChange({ severity: 'low', symbolName: 'lowFn' }),
      makeBreakingChange({ severity: 'medium', symbolName: 'medFn' }),
      makeBreakingChange({ severity: 'high', symbolName: 'highFn' }),
    ];
    mockDetectBreakingChanges.mockResolvedValue(changes);

    const tool = server.getRegisteredTool('get_breaking_changes')!;
    const result = await tool.handler({ minSeverity: 'high' }) as { content: Array<{ type: string; text: string }> };

    expect(result.content[0].text).toContain('highFn');
    expect(result.content[0].text).not.toContain('lowFn');
    expect(result.content[0].text).not.toContain('medFn');
  });

  it('includes medium and high when minSeverity is medium', async () => {
    const changes = [
      makeBreakingChange({ severity: 'low', symbolName: 'lowFn' }),
      makeBreakingChange({ severity: 'medium', symbolName: 'medFn' }),
      makeBreakingChange({ severity: 'high', symbolName: 'highFn' }),
    ];
    mockDetectBreakingChanges.mockResolvedValue(changes);

    const tool = server.getRegisteredTool('get_breaking_changes')!;
    const result = await tool.handler({ minSeverity: 'medium' }) as { content: Array<{ type: string; text: string }> };

    expect(result.content[0].text).toContain('medFn');
    expect(result.content[0].text).toContain('highFn');
    expect(result.content[0].text).not.toContain('lowFn');
  });

  it('includes severity qualifier in no-results message when minSeverity is set', async () => {
    const changes = [
      makeBreakingChange({ severity: 'low', symbolName: 'lowFn' }),
    ];
    mockDetectBreakingChanges.mockResolvedValue(changes);

    const tool = server.getRegisteredTool('get_breaking_changes')!;
    const result = await tool.handler({ minSeverity: 'high' }) as { content: Array<{ type: string; text: string }> };

    expect(result.content[0].text).toContain('at or above high severity');
  });

  it('returns correct plural for multiple breaking changes', async () => {
    mockDetectBreakingChanges.mockResolvedValue([
      makeBreakingChange({ symbolName: 'a' }),
      makeBreakingChange({ symbolName: 'b' }),
    ]);

    const tool = server.getRegisteredTool('get_breaking_changes')!;
    const result = await tool.handler({}) as { content: Array<{ type: string; text: string }> };

    expect(result.content[0].text).toContain('Found 2 breaking changes:');
  });

  it('returns singular form for one breaking change', async () => {
    mockDetectBreakingChanges.mockResolvedValue([makeBreakingChange()]);

    const tool = server.getRegisteredTool('get_breaking_changes')!;
    const result = await tool.handler({}) as { content: Array<{ type: string; text: string }> };

    expect(result.content[0].text).toContain('Found 1 breaking change:');
    expect(result.content[0].text).not.toContain('changes:');
  });

  it('returns error content when an error occurs', async () => {
    mockParseDiff.mockRejectedValue(new Error('diff failed'));

    const tool = server.getRegisteredTool('get_breaking_changes')!;
    const result = await tool.handler({}) as { content: Array<{ type: string; text: string }>; isError: boolean };

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Error detecting breaking changes: diff failed');
  });

  it('handles non-Error thrown values', async () => {
    mockParseDiff.mockRejectedValue('unexpected');

    const tool = server.getRegisteredTool('get_breaking_changes')!;
    const result = await tool.handler({}) as { content: Array<{ type: string; text: string }>; isError: boolean };

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('unexpected');
  });
});
