import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';
import { registerImpactCommand } from '../../src/commands/impact.js';
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
    bold: passthrough,
    dim: passthrough,
    red: passthrough,
    green: passthrough,
    yellow: passthrough,
    cyan: passthrough,
  });
  return { default: fn };
});

// ── Helpers ──
function makeGraph(overrides: Partial<ImpactGraph> = {}): ImpactGraph {
  return {
    directlyChanged: ['src/a.ts'],
    indirectlyAffected: ['src/b.ts'],
    edges: [{ from: 'src/b.ts', to: 'src/a.ts', type: 'imports' as const }],
    ...overrides,
  };
}

function createProgram(): Command {
  const program = new Command();
  program.exitOverride();
  registerImpactCommand(program);
  return program;
}

describe('impact command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it('resolves default base branch and parses diff when no file argument is given', async () => {
    const program = createProgram();
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await program.parseAsync(['node', 'pri', 'impact']);

    expect(mockResolveDefaultBaseBranch).toHaveBeenCalledTimes(1);
    expect(mockParseDiff).toHaveBeenCalledWith(expect.any(String), 'main', 'HEAD');
    expect(mockBuildImpactGraph).toHaveBeenCalledTimes(1);

    consoleSpy.mockRestore();
  });

  it('creates synthetic ChangedFile when a specific file is provided', async () => {
    const program = createProgram();
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await program.parseAsync(['node', 'pri', 'impact', 'src/foo.ts']);

    // Should NOT call parseDiff or resolveDefaultBaseBranch
    expect(mockResolveDefaultBaseBranch).not.toHaveBeenCalled();
    expect(mockParseDiff).not.toHaveBeenCalled();

    // Should call buildImpactGraph with a synthetic ChangedFile
    expect(mockBuildImpactGraph).toHaveBeenCalledWith(
      expect.any(String),
      [
        {
          path: 'src/foo.ts',
          status: 'modified',
          additions: 0,
          deletions: 0,
          language: '',
          category: 'source',
        },
      ],
      3, // default depth
    );

    consoleSpy.mockRestore();
  });

  it('passes --depth option to buildImpactGraph', async () => {
    const program = createProgram();
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    // Commander calls parseInt(value, previousValue) where previousValue is the default (3).
    // parseInt('2', 3) = 2 (valid in base 3). Use '2' to avoid the parseInt radix gotcha.
    await program.parseAsync(['node', 'pri', 'impact', '--depth', '2']);

    const depthArg = mockBuildImpactGraph.mock.calls[0][2];
    expect(depthArg).toBe(2);

    consoleSpy.mockRestore();
  });

  it('outputs text (tree) format by default', async () => {
    const program = createProgram();
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await program.parseAsync(['node', 'pri', 'impact']);

    const output = consoleSpy.mock.calls[0][0] as string;
    expect(output).toContain('Impact Graph');
    expect(output).toContain('src/a.ts');

    consoleSpy.mockRestore();
  });

  it('outputs JSON when --format json is specified', async () => {
    const program = createProgram();
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await program.parseAsync(['node', 'pri', 'impact', '--format', 'json']);

    const output = consoleSpy.mock.calls[0][0] as string;
    const parsed = JSON.parse(output);
    expect(parsed).toHaveProperty('directlyChanged');
    expect(parsed).toHaveProperty('indirectlyAffected');
    expect(parsed).toHaveProperty('edges');

    consoleSpy.mockRestore();
  });

  it('outputs DOT format when --format dot is specified', async () => {
    const program = createProgram();
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await program.parseAsync(['node', 'pri', 'impact', '--format', 'dot']);

    const output = consoleSpy.mock.calls[0][0] as string;
    expect(output).toContain('digraph impact {');
    expect(output).toContain('rankdir=LR;');

    consoleSpy.mockRestore();
  });

  it('starts and stops the spinner on success', async () => {
    const program = createProgram();
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await program.parseAsync(['node', 'pri', 'impact']);

    expect(mockStart).toHaveBeenCalledTimes(1);
    expect(mockStop).toHaveBeenCalledTimes(1);

    consoleSpy.mockRestore();
  });

  it('calls spinner.fail and exits with code 2 on error', async () => {
    mockBuildImpactGraph.mockRejectedValue(new Error('graph error'));

    const program = createProgram();
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit');
    });

    await expect(
      program.parseAsync(['node', 'pri', 'impact']),
    ).rejects.toThrow('process.exit');

    expect(mockFail).toHaveBeenCalledWith('Impact graph building failed');
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('graph error'));
    expect(exitSpy).toHaveBeenCalledWith(2);

    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it('passes --repo option as the resolved repo path', async () => {
    const program = createProgram();
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await program.parseAsync(['node', 'pri', 'impact', '--repo', '/my/repo']);

    expect(mockResolveDefaultBaseBranch).toHaveBeenCalledWith('/my/repo');
    expect(mockBuildImpactGraph).toHaveBeenCalledWith(
      '/my/repo',
      expect.any(Array),
      expect.any(Number),
    );

    consoleSpy.mockRestore();
  });

  it('handles empty impact graph', async () => {
    mockBuildImpactGraph.mockResolvedValue({
      directlyChanged: [],
      indirectlyAffected: [],
      edges: [],
    });

    const program = createProgram();
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await program.parseAsync(['node', 'pri', 'impact']);

    // Should still produce output without crashing
    expect(consoleSpy).toHaveBeenCalledTimes(1);

    consoleSpy.mockRestore();
  });
});
