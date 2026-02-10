import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';
import { registerAnalyzeCommand } from '../../src/commands/analyze.js';

// ── Mock @pr-impact/core ──
const mockAnalyzePR = vi.fn();
const mockFormatMarkdown = vi.fn();
const mockFormatJSON = vi.fn();
vi.mock('@pr-impact/core', () => ({
  analyzePR: (...args: unknown[]) => mockAnalyzePR(...args),
  formatMarkdown: (...args: unknown[]) => mockFormatMarkdown(...args),
  formatJSON: (...args: unknown[]) => mockFormatJSON(...args),
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
vi.mock('chalk', () => ({
  default: {
    green: (s: string) => s,
    red: (s: string) => s,
  },
}));

// ── Mock fs/promises ──
const mockWriteFile = vi.fn();
vi.mock('fs/promises', () => ({
  writeFile: (...args: unknown[]) => mockWriteFile(...args),
}));

// ── Helpers ──
function makePRAnalysis() {
  return {
    repoPath: '/repo',
    baseBranch: 'main',
    headBranch: 'HEAD',
    changedFiles: [],
    breakingChanges: [],
    testCoverage: { changedSourceFiles: 0, sourceFilesWithTestChanges: 0, coverageRatio: 1, gaps: [] },
    docStaleness: { staleReferences: [], checkedFiles: [] },
    impactGraph: { directlyChanged: [], indirectlyAffected: [], edges: [] },
    riskScore: { score: 10, level: 'low' as const, factors: [] },
    summary: 'Test summary',
  };
}

function createProgram(): Command {
  const program = new Command();
  program.exitOverride(); // prevent process.exit
  registerAnalyzeCommand(program);
  return program;
}

describe('analyze command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAnalyzePR.mockResolvedValue(makePRAnalysis());
    mockFormatMarkdown.mockReturnValue('# Markdown Report');
    mockFormatJSON.mockReturnValue('{"json": true}');
    mockWriteFile.mockResolvedValue(undefined);
  });

  it('calls analyzePR with default options when no arguments given', async () => {
    const program = createProgram();
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await program.parseAsync(['node', 'pri', 'analyze']);

    expect(mockAnalyzePR).toHaveBeenCalledTimes(1);
    const callArgs = mockAnalyzePR.mock.calls[0][0];
    expect(callArgs).toHaveProperty('repoPath');
    expect(callArgs.baseBranch).toBeUndefined();
    expect(callArgs.headBranch).toBeUndefined();
    expect(callArgs.skipBreaking).toBeFalsy();
    expect(callArgs.skipCoverage).toBeFalsy();
    expect(callArgs.skipDocs).toBeFalsy();

    consoleSpy.mockRestore();
  });

  it('passes base and head branch arguments to analyzePR', async () => {
    const program = createProgram();
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await program.parseAsync(['node', 'pri', 'analyze', 'develop', 'feature-branch']);

    const callArgs = mockAnalyzePR.mock.calls[0][0];
    expect(callArgs.baseBranch).toBe('develop');
    expect(callArgs.headBranch).toBe('feature-branch');

    consoleSpy.mockRestore();
  });

  it('uses markdown format by default', async () => {
    const program = createProgram();
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await program.parseAsync(['node', 'pri', 'analyze']);

    expect(mockFormatMarkdown).toHaveBeenCalledWith(makePRAnalysis());
    expect(mockFormatJSON).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith('# Markdown Report');

    consoleSpy.mockRestore();
  });

  it('uses JSON format when --format json is specified', async () => {
    const program = createProgram();
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await program.parseAsync(['node', 'pri', 'analyze', '--format', 'json']);

    expect(mockFormatJSON).toHaveBeenCalledWith(makePRAnalysis());
    expect(mockFormatMarkdown).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith('{"json": true}');

    consoleSpy.mockRestore();
  });

  it('writes output to file when --output is specified', async () => {
    const program = createProgram();
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await program.parseAsync(['node', 'pri', 'analyze', '--output', 'report.md']);

    expect(mockWriteFile).toHaveBeenCalledTimes(1);
    const [filePath, content] = mockWriteFile.mock.calls[0];
    expect(filePath).toContain('report.md');
    expect(content).toBe('# Markdown Report');
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('report.md'));

    consoleSpy.mockRestore();
  });

  it('passes skip flags when --no-breaking, --no-coverage, --no-docs are used', async () => {
    const program = createProgram();
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await program.parseAsync([
      'node', 'pri', 'analyze',
      '--no-breaking', '--no-coverage', '--no-docs',
    ]);

    const callArgs = mockAnalyzePR.mock.calls[0][0];
    expect(callArgs.skipBreaking).toBe(true);
    expect(callArgs.skipCoverage).toBe(true);
    expect(callArgs.skipDocs).toBe(true);

    consoleSpy.mockRestore();
  });

  it('starts and stops the spinner', async () => {
    const program = createProgram();
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await program.parseAsync(['node', 'pri', 'analyze']);

    expect(mockStart).toHaveBeenCalledTimes(1);
    expect(mockStop).toHaveBeenCalledTimes(1);

    consoleSpy.mockRestore();
  });

  it('calls spinner.fail and prints error on analysis failure', async () => {
    mockAnalyzePR.mockRejectedValue(new Error('git not found'));

    const program = createProgram();
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit');
    });

    await expect(
      program.parseAsync(['node', 'pri', 'analyze']),
    ).rejects.toThrow('process.exit');

    expect(mockFail).toHaveBeenCalledWith('Analysis failed');
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('git not found'));
    expect(exitSpy).toHaveBeenCalledWith(2);

    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it('handles non-Error thrown values', async () => {
    mockAnalyzePR.mockRejectedValue('string error');

    const program = createProgram();
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit');
    });

    await expect(
      program.parseAsync(['node', 'pri', 'analyze']),
    ).rejects.toThrow('process.exit');

    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('string error'));

    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it('passes --repo option to analyzePR as resolved repoPath', async () => {
    const program = createProgram();
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await program.parseAsync(['node', 'pri', 'analyze', '--repo', '/custom/repo']);

    const callArgs = mockAnalyzePR.mock.calls[0][0];
    expect(callArgs.repoPath).toBe('/custom/repo');

    consoleSpy.mockRestore();
  });
});
