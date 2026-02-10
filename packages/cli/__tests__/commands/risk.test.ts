import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';
import { registerRiskCommand } from '../../src/commands/risk.js';
import type { PRAnalysis, RiskAssessment, RiskFactor } from '@pr-impact/core';

// ── Mock @pr-impact/core ──
const mockAnalyzePR = vi.fn();
vi.mock('@pr-impact/core', () => ({
  analyzePR: (...args: unknown[]) => mockAnalyzePR(...args),
}));

// ── Mock ora ──
const mockStart = vi.fn();
const mockStop = vi.fn();
const mockFail = vi.fn();
vi.mock('ora', () => ({
  default: () => ({
    start: () => {
      mockStart();
      return { stop: mockStop, fail: mockFail };
    },
  }),
}));

// ── Mock chalk (passthrough) ──
vi.mock('chalk', () => {
  const passthrough = (s: string) => s;
  const fn = Object.assign(passthrough, {
    bold: Object.assign(passthrough, { red: passthrough }),
    dim: passthrough,
    red: Object.assign(passthrough, { bold: passthrough }),
    green: passthrough,
    yellow: passthrough,
  });
  return { default: fn };
});

// ── Helpers ──
function makeRiskFactor(overrides: Partial<RiskFactor> = {}): RiskFactor {
  return {
    name: 'Breaking Changes',
    score: 50,
    weight: 0.3,
    description: 'Some breaking changes detected',
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

function createProgram(): Command {
  const program = new Command();
  program.exitOverride();
  registerRiskCommand(program);
  return program;
}

describe('risk command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAnalyzePR.mockResolvedValue(makePRAnalysis());
  });

  it('calls analyzePR with default options when no arguments given', async () => {
    const program = createProgram();
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await program.parseAsync(['node', 'pri', 'risk']);

    expect(mockAnalyzePR).toHaveBeenCalledTimes(1);
    const callArgs = mockAnalyzePR.mock.calls[0][0];
    expect(callArgs).toHaveProperty('repoPath');
    expect(callArgs.baseBranch).toBeUndefined();
    expect(callArgs.headBranch).toBeUndefined();

    consoleSpy.mockRestore();
  });

  it('passes base and head branch arguments', async () => {
    const program = createProgram();
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await program.parseAsync(['node', 'pri', 'risk', 'develop', 'feature']);

    const callArgs = mockAnalyzePR.mock.calls[0][0];
    expect(callArgs.baseBranch).toBe('develop');
    expect(callArgs.headBranch).toBe('feature');

    consoleSpy.mockRestore();
  });

  it('displays text format output by default', async () => {
    const program = createProgram();
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await program.parseAsync(['node', 'pri', 'risk']);

    const output = consoleSpy.mock.calls[0][0] as string;
    expect(output).toContain('Risk Assessment');
    expect(output).toContain('42/100');
    expect(output).toContain('MEDIUM');

    consoleSpy.mockRestore();
  });

  it('displays JSON format when --format json is specified', async () => {
    const program = createProgram();
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await program.parseAsync(['node', 'pri', 'risk', '--format', 'json']);

    const output = consoleSpy.mock.calls[0][0] as string;
    const parsed = JSON.parse(output);
    expect(parsed.score).toBe(42);
    expect(parsed.level).toBe('medium');
    expect(parsed.factors).toHaveLength(1);

    consoleSpy.mockRestore();
  });

  it('includes factor breakdown in text output', async () => {
    const program = createProgram();
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await program.parseAsync(['node', 'pri', 'risk']);

    const output = consoleSpy.mock.calls[0][0] as string;
    expect(output).toContain('Factor Breakdown');
    expect(output).toContain('Breaking Changes');
    expect(output).toContain('Some breaking changes detected');
    expect(output).toContain('removed export helper');

    consoleSpy.mockRestore();
  });

  it('does not exit with code 1 when score is below threshold', async () => {
    mockAnalyzePR.mockResolvedValue(makePRAnalysis({ score: 30 }));

    const program = createProgram();
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit');
    });

    // Should NOT throw (no process.exit called)
    await program.parseAsync(['node', 'pri', 'risk', '--threshold', '50']);

    expect(exitSpy).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it('exits with code 1 when score meets threshold', async () => {
    mockAnalyzePR.mockResolvedValue(makePRAnalysis({ score: 50, level: 'high' }));

    const program = createProgram();
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit');
    });

    await expect(
      program.parseAsync(['node', 'pri', 'risk', '--threshold', '50']),
    ).rejects.toThrow('process.exit');

    expect(exitSpy).toHaveBeenCalledWith(1);
    // Should print message about threshold
    const allLogs = consoleSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(allLogs).toContain('meets or exceeds threshold');

    consoleSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it('exits with code 1 when score exceeds threshold', async () => {
    mockAnalyzePR.mockResolvedValue(makePRAnalysis({ score: 80, level: 'critical' }));

    const program = createProgram();
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit');
    });

    await expect(
      program.parseAsync(['node', 'pri', 'risk', '--threshold', '50']),
    ).rejects.toThrow('process.exit');

    expect(exitSpy).toHaveBeenCalledWith(1);

    consoleSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it('starts and stops the spinner on success', async () => {
    const program = createProgram();
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await program.parseAsync(['node', 'pri', 'risk']);

    expect(mockStart).toHaveBeenCalledTimes(1);
    expect(mockStop).toHaveBeenCalledTimes(1);

    consoleSpy.mockRestore();
  });

  it('calls spinner.fail and exits with code 2 on error', async () => {
    mockAnalyzePR.mockRejectedValue(new Error('calculation error'));

    const program = createProgram();
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit');
    });

    await expect(
      program.parseAsync(['node', 'pri', 'risk']),
    ).rejects.toThrow('process.exit');

    expect(mockFail).toHaveBeenCalledWith('Risk calculation failed');
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('calculation error'));
    expect(exitSpy).toHaveBeenCalledWith(2);

    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it('passes --repo option to analyzePR', async () => {
    const program = createProgram();
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await program.parseAsync(['node', 'pri', 'risk', '--repo', '/custom/repo']);

    const callArgs = mockAnalyzePR.mock.calls[0][0];
    expect(callArgs.repoPath).toBe('/custom/repo');

    consoleSpy.mockRestore();
  });

  it('handles risk assessment with no factors', async () => {
    mockAnalyzePR.mockResolvedValue(makePRAnalysis({ factors: [] }));

    const program = createProgram();
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await program.parseAsync(['node', 'pri', 'risk']);

    const output = consoleSpy.mock.calls[0][0] as string;
    expect(output).toContain('Risk Assessment');
    // Should not contain Factor Breakdown section
    expect(output).not.toContain('Factor Breakdown');

    consoleSpy.mockRestore();
  });

  it('handles factors without details', async () => {
    mockAnalyzePR.mockResolvedValue(
      makePRAnalysis({
        factors: [makeRiskFactor({ details: undefined })],
      }),
    );

    const program = createProgram();
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await program.parseAsync(['node', 'pri', 'risk']);

    const output = consoleSpy.mock.calls[0][0] as string;
    expect(output).toContain('Breaking Changes');

    consoleSpy.mockRestore();
  });
});
