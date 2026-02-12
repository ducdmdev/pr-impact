import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all dependencies before importing
vi.mock('@actions/core', () => ({
  getInput: vi.fn(),
  setOutput: vi.fn(),
  setFailed: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
}));

vi.mock('@actions/github', () => ({
  context: {
    payload: {} as Record<string, unknown>,
    repo: { owner: 'test-owner', repo: 'test-repo' },
  },
}));

vi.mock('../src/client.js', () => ({
  runAnalysis: vi.fn(),
}));

vi.mock('../src/comment.js', () => ({
  postOrUpdateComment: vi.fn(),
}));

import * as core from '@actions/core';
import * as github from '@actions/github';
import { runAnalysis } from '../src/client.js';
import { postOrUpdateComment } from '../src/comment.js';

beforeEach(() => {
  vi.clearAllMocks();
  // Reset context payload
  github.context.payload = {};
  github.context.repo = { owner: 'test-owner', repo: 'test-repo' };
});

// Helper: set up standard mocks for getInput
function setupInputs(overrides: Record<string, string> = {}) {
  const defaults: Record<string, string> = {
    'anthropic-api-key': 'sk-test',
    'base-branch': 'main',
    'model': 'claude-sonnet-4-5-20250929',
    'threshold': '',
    'github-token': '',
  };
  const merged = { ...defaults, ...overrides };
  vi.mocked(core.getInput).mockImplementation((name: string) => merged[name] ?? '');
}

// Helper: load the index module (triggers main())
async function loadIndex() {
  // Use dynamic import with a cache-busting query to get a fresh module each time
  // We need to reset modules to re-trigger the top-level main() call
  vi.resetModules();

  // Re-apply mocks after resetModules
  vi.doMock('@actions/core', () => ({
    getInput: vi.mocked(core.getInput),
    setOutput: vi.mocked(core.setOutput),
    setFailed: vi.mocked(core.setFailed),
    info: vi.mocked(core.info),
    warning: vi.mocked(core.warning),
  }));

  vi.doMock('@actions/github', () => ({
    context: github.context,
  }));

  vi.doMock('../src/client.js', () => ({
    runAnalysis: vi.mocked(runAnalysis),
  }));

  vi.doMock('../src/comment.js', () => ({
    postOrUpdateComment: vi.mocked(postOrUpdateComment),
  }));

  await import('../src/index.js');
  // Allow the top-level main().catch() to settle
  await (vi.dynamicImportSettled?.() ?? new Promise((r) => setTimeout(r, 10)));
}

describe('action entry point', () => {
  it('parses risk score from report and sets outputs', async () => {
    setupInputs();
    vi.mocked(runAnalysis).mockResolvedValue(
      '## Analysis\n**Risk Score**: 42/100 (medium)\nDetails...',
    );

    await loadIndex();

    expect(core.setOutput).toHaveBeenCalledWith('risk-score', '42');
    expect(core.setOutput).toHaveBeenCalledWith('risk-level', 'medium');
    expect(core.setOutput).toHaveBeenCalledWith('report', expect.stringContaining('Risk Score'));
    expect(core.info).toHaveBeenCalledWith('Risk Score: 42/100 (medium)');
  });

  it('sets risk score to -1 and warns when regex does not match', async () => {
    setupInputs();
    vi.mocked(runAnalysis).mockResolvedValue('No score in this report');

    await loadIndex();

    expect(core.setOutput).toHaveBeenCalledWith('risk-score', '-1');
    expect(core.setOutput).toHaveBeenCalledWith('risk-level', 'unknown');
    expect(core.warning).toHaveBeenCalledWith(
      'Could not parse risk score from report. Skipping threshold check.',
    );
  });

  it('calls setFailed when risk score >= threshold', async () => {
    setupInputs({ threshold: '40' });
    vi.mocked(runAnalysis).mockResolvedValue('**Risk Score**: 42/100 (medium)');

    await loadIndex();

    expect(core.setFailed).toHaveBeenCalledWith(
      'Risk score 42 exceeds threshold 40',
    );
  });

  it('does NOT call setFailed when score < threshold', async () => {
    setupInputs({ threshold: '50' });
    vi.mocked(runAnalysis).mockResolvedValue('**Risk Score**: 42/100 (medium)');

    await loadIndex();

    expect(core.setFailed).not.toHaveBeenCalled();
  });

  it('does NOT call setFailed when threshold is not set', async () => {
    setupInputs({ threshold: '' });
    vi.mocked(runAnalysis).mockResolvedValue('**Risk Score**: 85/100 (high)');

    await loadIndex();

    expect(core.setFailed).not.toHaveBeenCalled();
  });

  it('posts PR comment when prNumber and githubToken are present', async () => {
    setupInputs({ 'github-token': 'ghp_token123' });
    github.context.payload = { pull_request: { number: 7 } };
    vi.mocked(runAnalysis).mockResolvedValue('**Risk Score**: 10/100 (low)');
    vi.mocked(postOrUpdateComment).mockResolvedValue('https://github.com/comment-url');

    await loadIndex();

    expect(postOrUpdateComment).toHaveBeenCalledWith({
      token: 'ghp_token123',
      repo: 'test-owner/test-repo',
      prNumber: 7,
      body: '**Risk Score**: 10/100 (low)',
    });
    expect(core.info).toHaveBeenCalledWith('Posted PR comment: https://github.com/comment-url');
  });

  it('skips comment when no prNumber in context', async () => {
    setupInputs({ 'github-token': 'ghp_token123' });
    github.context.payload = {};
    vi.mocked(runAnalysis).mockResolvedValue('**Risk Score**: 10/100 (low)');

    await loadIndex();

    expect(postOrUpdateComment).not.toHaveBeenCalled();
  });

  it('calls setFailed when main() throws an error', async () => {
    setupInputs();
    vi.mocked(runAnalysis).mockRejectedValue(new Error('API connection failed'));

    await loadIndex();

    expect(core.setFailed).toHaveBeenCalledWith('API connection failed');
  });

  describe('risk score parsing edge cases', () => {
    it('parses score at boundary 0/100', async () => {
      setupInputs();
      vi.mocked(runAnalysis).mockResolvedValue('**Risk Score**: 0/100 (low)');

      await loadIndex();

      expect(core.setOutput).toHaveBeenCalledWith('risk-score', '0');
      expect(core.setOutput).toHaveBeenCalledWith('risk-level', 'low');
    });

    it('parses score at boundary 100/100', async () => {
      setupInputs();
      vi.mocked(runAnalysis).mockResolvedValue('**Risk Score**: 100/100 (critical)');

      await loadIndex();

      expect(core.setOutput).toHaveBeenCalledWith('risk-score', '100');
      expect(core.setOutput).toHaveBeenCalledWith('risk-level', 'critical');
    });

    it('does not fail threshold check when score is -1 (unparseable)', async () => {
      setupInputs({ threshold: '50' });
      vi.mocked(runAnalysis).mockResolvedValue('Report without risk score format');

      await loadIndex();

      expect(core.setOutput).toHaveBeenCalledWith('risk-score', '-1');
      expect(core.setFailed).not.toHaveBeenCalled();
    });

    it('handles score equal to threshold (>= comparison)', async () => {
      setupInputs({ threshold: '42' });
      vi.mocked(runAnalysis).mockResolvedValue('**Risk Score**: 42/100 (medium)');

      await loadIndex();

      expect(core.setFailed).toHaveBeenCalledWith('Risk score 42 exceeds threshold 42');
    });

    it('handles non-Error rejection in main()', async () => {
      setupInputs();
      vi.mocked(runAnalysis).mockRejectedValue('string error');

      await loadIndex();

      expect(core.setFailed).toHaveBeenCalledWith('string error');
    });
  });
});
