import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';
import { registerBreakingCommand } from '../../src/commands/breaking.js';
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
  });
  return { default: fn };
});

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

function createProgram(): Command {
  const program = new Command();
  program.exitOverride();
  registerBreakingCommand(program);
  return program;
}

describe('breaking command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveDefaultBaseBranch.mockResolvedValue('main');
    mockParseDiff.mockResolvedValue([makeChangedFile()]);
    mockDetectBreakingChanges.mockResolvedValue([]);
  });

  it('resolves default base branch when none is provided', async () => {
    const program = createProgram();
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await program.parseAsync(['node', 'pri', 'breaking']);

    expect(mockResolveDefaultBaseBranch).toHaveBeenCalledTimes(1);
    expect(mockParseDiff).toHaveBeenCalledWith(
      expect.any(String),
      'main',
      'HEAD',
    );

    consoleSpy.mockRestore();
  });

  it('uses provided base and head branches', async () => {
    const program = createProgram();
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await program.parseAsync(['node', 'pri', 'breaking', 'develop', 'feature']);

    expect(mockResolveDefaultBaseBranch).not.toHaveBeenCalled();
    expect(mockParseDiff).toHaveBeenCalledWith(
      expect.any(String),
      'develop',
      'feature',
    );

    consoleSpy.mockRestore();
  });

  it('calls parseDiff and detectBreakingChanges with correct arguments', async () => {
    const changedFiles = [makeChangedFile()];
    mockParseDiff.mockResolvedValue(changedFiles);

    const program = createProgram();
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await program.parseAsync(['node', 'pri', 'breaking', 'main', 'HEAD']);

    expect(mockParseDiff).toHaveBeenCalledWith(expect.any(String), 'main', 'HEAD');
    expect(mockDetectBreakingChanges).toHaveBeenCalledWith(
      expect.any(String),
      'main',
      'HEAD',
      changedFiles,
    );

    consoleSpy.mockRestore();
  });

  it('prints no-breaking-changes message when none found', async () => {
    mockDetectBreakingChanges.mockResolvedValue([]);

    const program = createProgram();
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await program.parseAsync(['node', 'pri', 'breaking', 'main', 'HEAD']);

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('No breaking changes detected'),
    );

    consoleSpy.mockRestore();
  });

  it('exits with code 1 when breaking changes are found', async () => {
    mockDetectBreakingChanges.mockResolvedValue([makeBreakingChange()]);

    const program = createProgram();
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit');
    });

    await expect(
      program.parseAsync(['node', 'pri', 'breaking', 'main', 'HEAD']),
    ).rejects.toThrow('process.exit');

    expect(exitSpy).toHaveBeenCalledWith(1);

    consoleSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it('filters by severity when --severity is provided', async () => {
    const changes: BreakingChange[] = [
      makeBreakingChange({ severity: 'low', symbolName: 'lowFn' }),
      makeBreakingChange({ severity: 'medium', symbolName: 'medFn' }),
      makeBreakingChange({ severity: 'high', symbolName: 'highFn' }),
    ];
    mockDetectBreakingChanges.mockResolvedValue(changes);

    const program = createProgram();
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit');
    });

    await expect(
      program.parseAsync(['node', 'pri', 'breaking', 'main', 'HEAD', '--severity', 'high']),
    ).rejects.toThrow('process.exit');

    // Only high severity should be in the output
    const output = consoleSpy.mock.calls[0][0] as string;
    expect(output).toContain('highFn');
    expect(output).not.toContain('lowFn');
    expect(output).not.toContain('medFn');

    consoleSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it('includes medium and high severity when --severity medium is used', async () => {
    const changes: BreakingChange[] = [
      makeBreakingChange({ severity: 'low', symbolName: 'lowFn' }),
      makeBreakingChange({ severity: 'medium', symbolName: 'medFn' }),
      makeBreakingChange({ severity: 'high', symbolName: 'highFn' }),
    ];
    mockDetectBreakingChanges.mockResolvedValue(changes);

    const program = createProgram();
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit');
    });

    await expect(
      program.parseAsync(['node', 'pri', 'breaking', 'main', 'HEAD', '--severity', 'medium']),
    ).rejects.toThrow('process.exit');

    // Medium and high severity should be in the output
    const output = consoleSpy.mock.calls[0][0] as string;
    expect(output).toContain('medFn');
    expect(output).toContain('highFn');
    expect(output).not.toContain('lowFn');

    consoleSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it('outputs JSON when --format json is specified', async () => {
    const changes = [makeBreakingChange()];
    mockDetectBreakingChanges.mockResolvedValue(changes);

    const program = createProgram();
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit');
    });

    await expect(
      program.parseAsync(['node', 'pri', 'breaking', 'main', 'HEAD', '--format', 'json']),
    ).rejects.toThrow('process.exit');

    const output = consoleSpy.mock.calls[0][0] as string;
    const parsed = JSON.parse(output);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].symbolName).toBe('helper');

    consoleSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it('outputs markdown table when --format md is specified', async () => {
    const changes = [makeBreakingChange()];
    mockDetectBreakingChanges.mockResolvedValue(changes);

    const program = createProgram();
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit');
    });

    await expect(
      program.parseAsync(['node', 'pri', 'breaking', 'main', 'HEAD', '--format', 'md']),
    ).rejects.toThrow('process.exit');

    const output = consoleSpy.mock.calls[0][0] as string;
    expect(output).toContain('# Breaking Changes');
    expect(output).toContain('| File | Symbol |');

    consoleSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it('starts and stops the spinner on success', async () => {
    mockDetectBreakingChanges.mockResolvedValue([]);

    const program = createProgram();
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await program.parseAsync(['node', 'pri', 'breaking', 'main', 'HEAD']);

    expect(mockStart).toHaveBeenCalledTimes(1);
    expect(mockStop).toHaveBeenCalledTimes(1);

    consoleSpy.mockRestore();
  });

  it('calls spinner.fail and exits with code 2 on error', async () => {
    mockParseDiff.mockRejectedValue(new Error('parse error'));

    const program = createProgram();
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit');
    });

    await expect(
      program.parseAsync(['node', 'pri', 'breaking', 'main', 'HEAD']),
    ).rejects.toThrow('process.exit');

    expect(mockFail).toHaveBeenCalledWith('Breaking change detection failed');
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('parse error'));
    expect(exitSpy).toHaveBeenCalledWith(2);

    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it('passes the --repo option as resolved repo path', async () => {
    const program = createProgram();
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await program.parseAsync(['node', 'pri', 'breaking', '--repo', '/my/repo', 'main', 'HEAD']);

    expect(mockParseDiff).toHaveBeenCalledWith('/my/repo', 'main', 'HEAD');

    consoleSpy.mockRestore();
  });
});
