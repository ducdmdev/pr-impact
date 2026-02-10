import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { registerCommentCommand } from '../../src/commands/comment.js';

// ── Mock @pr-impact/core ──
const mockAnalyzePR = vi.fn();
const mockFormatMarkdown = vi.fn();
vi.mock('@pr-impact/core', () => ({
  analyzePR: (...args: unknown[]) => mockAnalyzePR(...args),
  formatMarkdown: (...args: unknown[]) => mockFormatMarkdown(...args),
}));

// ── Mock ora ──
const mockStop = vi.fn();
const mockFail = vi.fn();
const mockSucceed = vi.fn();
const mockSpinner = {
  stop: mockStop,
  fail: mockFail,
  succeed: mockSucceed,
  text: '',
};
vi.mock('ora', () => ({
  default: () => ({
    start: () => {
      return mockSpinner;
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

// ── Mock ci-env ──
const mockDetectCIEnv = vi.fn();
vi.mock('../../src/github/ci-env.js', () => ({
  detectCIEnv: () => mockDetectCIEnv(),
}));

// ── Mock comment-poster ──
const mockPostOrUpdateComment = vi.fn();
vi.mock('../../src/github/comment-poster.js', () => ({
  postOrUpdateComment: (...args: unknown[]) => mockPostOrUpdateComment(...args),
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
  program.exitOverride();
  registerCommentCommand(program);
  return program;
}

describe('comment command', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv, GITHUB_TOKEN: 'ghp_test' };
    mockAnalyzePR.mockResolvedValue(makePRAnalysis());
    mockFormatMarkdown.mockReturnValue('# Report');
    mockPostOrUpdateComment.mockResolvedValue('https://github.com/owner/repo/pull/42#issuecomment-1');
    mockDetectCIEnv.mockReturnValue({ prNumber: '42', repo: 'owner/repo' });
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('runs analysis and posts comment with auto-detected CI env', async () => {
    const program = createProgram();
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await program.parseAsync(['node', 'pri', 'comment']);

    expect(mockAnalyzePR).toHaveBeenCalledTimes(1);
    expect(mockFormatMarkdown).toHaveBeenCalledWith(makePRAnalysis());
    expect(mockPostOrUpdateComment).toHaveBeenCalledWith({
      token: 'ghp_test',
      repo: 'owner/repo',
      prNumber: '42',
      body: '# Report',
    });
    expect(mockSucceed).toHaveBeenCalledWith('Comment posted');
    expect(consoleSpy).toHaveBeenCalledWith('https://github.com/owner/repo/pull/42#issuecomment-1');

    consoleSpy.mockRestore();
  });

  it('uses explicit --pr and --github-repo over CI env', async () => {
    const program = createProgram();
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await program.parseAsync([
      'node', 'pri', 'comment',
      '--pr', '99',
      '--github-repo', 'other/repo',
    ]);

    expect(mockPostOrUpdateComment).toHaveBeenCalledWith(
      expect.objectContaining({
        prNumber: '99',
        repo: 'other/repo',
      }),
    );
    // Should not even need CI env detection since both are explicit
    expect(mockDetectCIEnv).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it('uses --token over GITHUB_TOKEN env var', async () => {
    const program = createProgram();
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await program.parseAsync([
      'node', 'pri', 'comment',
      '--token', 'explicit_token',
    ]);

    expect(mockPostOrUpdateComment).toHaveBeenCalledWith(
      expect.objectContaining({
        token: 'explicit_token',
      }),
    );

    consoleSpy.mockRestore();
  });

  it('exits with code 2 when no token is available', async () => {
    delete process.env.GITHUB_TOKEN;
    const program = createProgram();
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit');
    });

    await expect(
      program.parseAsync(['node', 'pri', 'comment']),
    ).rejects.toThrow('process.exit');

    expect(mockFail).toHaveBeenCalledWith('Missing GitHub token');
    expect(exitSpy).toHaveBeenCalledWith(2);

    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it('exits with code 2 when PR number cannot be determined', async () => {
    mockDetectCIEnv.mockReturnValue(null);
    const program = createProgram();
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit');
    });

    await expect(
      program.parseAsync(['node', 'pri', 'comment']),
    ).rejects.toThrow('process.exit');

    expect(mockFail).toHaveBeenCalledWith('Cannot determine PR number');
    expect(exitSpy).toHaveBeenCalledWith(2);

    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it('exits with code 2 when GitHub repo cannot be determined', async () => {
    mockDetectCIEnv.mockReturnValue({ prNumber: '42', repo: undefined });
    const program = createProgram();
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit');
    });

    await expect(
      program.parseAsync(['node', 'pri', 'comment', '--pr', '42']),
    ).rejects.toThrow('process.exit');

    expect(mockFail).toHaveBeenCalledWith('Cannot determine GitHub repository');
    expect(exitSpy).toHaveBeenCalledWith(2);

    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it('passes base and head arguments to analyzePR', async () => {
    const program = createProgram();
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await program.parseAsync(['node', 'pri', 'comment', 'develop', 'feature']);

    const callArgs = mockAnalyzePR.mock.calls[0][0];
    expect(callArgs.baseBranch).toBe('develop');
    expect(callArgs.headBranch).toBe('feature');

    consoleSpy.mockRestore();
  });

  it('handles analysis error gracefully', async () => {
    mockAnalyzePR.mockRejectedValue(new Error('git failed'));
    const program = createProgram();
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit');
    });

    await expect(
      program.parseAsync(['node', 'pri', 'comment']),
    ).rejects.toThrow('process.exit');

    expect(mockFail).toHaveBeenCalledWith('Failed to post comment');
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('git failed'));
    expect(exitSpy).toHaveBeenCalledWith(2);

    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it('handles postOrUpdateComment error gracefully', async () => {
    mockPostOrUpdateComment.mockRejectedValue(new Error('API rate limited'));
    const program = createProgram();
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit');
    });

    await expect(
      program.parseAsync(['node', 'pri', 'comment']),
    ).rejects.toThrow('process.exit');

    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('API rate limited'));
    expect(exitSpy).toHaveBeenCalledWith(2);

    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    exitSpy.mockRestore();
  });
});
