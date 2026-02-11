import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn(),
    },
  })),
}));

vi.mock('../src/tools.js', () => ({
  executeTool: vi.fn(),
}));

vi.mock('../src/generated/templates.js', () => ({
  SYSTEM_PROMPT: 'You are a test prompt.',
  REPORT_TEMPLATE: '# Test Report Template',
}));

import Anthropic from '@anthropic-ai/sdk';
import { executeTool } from '../src/tools.js';
import { runAnalysis } from '../src/client.js';

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('runAnalysis', () => {
  it('calls Claude API with temperature 0 and returns the final text response', async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: '# PR Impact Report\n\n## Summary\n...' }],
      stop_reason: 'end_turn',
    });

    vi.mocked(Anthropic).mockImplementation(() => ({
      messages: { create: mockCreate },
    }) as never);

    vi.useRealTimers();
    const result = await runAnalysis({
      apiKey: 'test-key',
      repoPath: '/repo',
      baseBranch: 'main',
      headBranch: 'HEAD',
      model: 'claude-sonnet-4-5-20250929',
    });

    expect(result).toContain('# PR Impact Report');
    expect(mockCreate).toHaveBeenCalledTimes(1);

    // Verify temperature: 0 is passed
    const createArgs = mockCreate.mock.calls[0][0];
    expect(createArgs.temperature).toBe(0);
  });

  it('handles tool_use responses by executing tools and continuing', async () => {
    const mockCreate = vi.fn()
      .mockResolvedValueOnce({
        content: [
          { type: 'tool_use', id: 'call_1', name: 'list_changed_files', input: { base: 'main', head: 'HEAD' } },
        ],
        stop_reason: 'tool_use',
      })
      .mockResolvedValueOnce({
        content: [{ type: 'text', text: '# PR Impact Report\n\nFinal report' }],
        stop_reason: 'end_turn',
      });

    vi.mocked(Anthropic).mockImplementation(() => ({
      messages: { create: mockCreate },
    }) as never);

    vi.mocked(executeTool).mockResolvedValue('{"files": []}');

    vi.useRealTimers();
    const result = await runAnalysis({
      apiKey: 'test-key',
      repoPath: '/repo',
      baseBranch: 'main',
      headBranch: 'HEAD',
      model: 'claude-sonnet-4-5-20250929',
    });

    expect(executeTool).toHaveBeenCalledWith('list_changed_files', expect.objectContaining({ base: 'main', head: 'HEAD' }));
    expect(result).toContain('Final report');
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it('injects repoPath into tool calls', async () => {
    const mockCreate = vi.fn()
      .mockResolvedValueOnce({
        content: [
          { type: 'tool_use', id: 'call_1', name: 'git_diff', input: { base: 'main', head: 'HEAD' } },
        ],
        stop_reason: 'tool_use',
      })
      .mockResolvedValueOnce({
        content: [{ type: 'text', text: 'done' }],
        stop_reason: 'end_turn',
      });

    vi.mocked(Anthropic).mockImplementation(() => ({
      messages: { create: mockCreate },
    }) as never);

    vi.mocked(executeTool).mockResolvedValue('diff output');

    vi.useRealTimers();
    await runAnalysis({
      apiKey: 'test-key',
      repoPath: '/my-repo',
      baseBranch: 'main',
      headBranch: 'HEAD',
      model: 'claude-sonnet-4-5-20250929',
    });

    expect(executeTool).toHaveBeenCalledWith('git_diff', expect.objectContaining({
      repoPath: '/my-repo',
    }));
  });

  it('uses embedded templates (not filesystem)', async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'report' }],
      stop_reason: 'end_turn',
    });

    vi.mocked(Anthropic).mockImplementation(() => ({
      messages: { create: mockCreate },
    }) as never);

    vi.useRealTimers();
    await runAnalysis({
      apiKey: 'test-key',
      repoPath: '/repo',
      baseBranch: 'main',
      headBranch: 'HEAD',
      model: 'claude-sonnet-4-5-20250929',
    });

    const createArgs = mockCreate.mock.calls[0][0];
    expect(createArgs.system).toBe('You are a test prompt.');
    expect(createArgs.messages[0].content).toContain('# Test Report Template');
  });
});
