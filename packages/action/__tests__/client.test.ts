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

  it('sends is_error tool result when executeTool throws', async () => {
    const mockCreate = vi.fn()
      .mockResolvedValueOnce({
        content: [
          { type: 'tool_use', id: 'call_1', name: 'git_diff', input: { base: 'main', head: 'HEAD' } },
        ],
        stop_reason: 'tool_use',
      })
      .mockResolvedValueOnce({
        content: [{ type: 'text', text: 'recovered' }],
        stop_reason: 'end_turn',
      });

    vi.mocked(Anthropic).mockImplementation(() => ({
      messages: { create: mockCreate },
    }) as never);

    vi.mocked(executeTool).mockRejectedValue(new Error('git not found'));

    vi.useRealTimers();
    const result = await runAnalysis({
      apiKey: 'test-key',
      repoPath: '/repo',
      baseBranch: 'main',
      headBranch: 'HEAD',
      model: 'claude-sonnet-4-5-20250929',
    });

    expect(result).toBe('recovered');
    // Verify the error was sent back as a tool_result with is_error
    const secondCallMessages = mockCreate.mock.calls[1][0].messages;
    const toolResultMsg = secondCallMessages[secondCallMessages.length - 1];
    expect(toolResultMsg.content[0]).toMatchObject({
      type: 'tool_result',
      tool_use_id: 'call_1',
      is_error: true,
      content: 'Error: git not found',
    });
  });

  it('executes multiple tool_use blocks in parallel', async () => {
    const mockCreate = vi.fn()
      .mockResolvedValueOnce({
        content: [
          { type: 'tool_use', id: 'call_1', name: 'git_diff', input: { base: 'main', head: 'HEAD' } },
          { type: 'tool_use', id: 'call_2', name: 'list_changed_files', input: { base: 'main', head: 'HEAD' } },
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

    vi.mocked(executeTool).mockResolvedValue('tool output');

    vi.useRealTimers();
    await runAnalysis({
      apiKey: 'test-key',
      repoPath: '/repo',
      baseBranch: 'main',
      headBranch: 'HEAD',
      model: 'claude-sonnet-4-5-20250929',
    });

    // Both tools should have been called
    expect(executeTool).toHaveBeenCalledTimes(2);
    expect(executeTool).toHaveBeenCalledWith('git_diff', expect.objectContaining({ base: 'main' }));
    expect(executeTool).toHaveBeenCalledWith('list_changed_files', expect.objectContaining({ base: 'main' }));

    // Both tool results should be in the second API call
    const secondCallMessages = mockCreate.mock.calls[1][0].messages;
    const toolResults = secondCallMessages[secondCallMessages.length - 1].content;
    expect(toolResults).toHaveLength(2);
    expect(toolResults[0].tool_use_id).toBe('call_1');
    expect(toolResults[1].tool_use_id).toBe('call_2');
  });

  it('returns partial text when wall-clock timeout is exceeded', async () => {
    vi.useRealTimers();
    const realNow = Date.now();
    const dateNowSpy = vi.spyOn(Date, 'now');
    // startTime capture
    dateNowSpy.mockReturnValueOnce(realNow);
    // First iteration check — within timeout
    dateNowSpy.mockReturnValueOnce(realNow);
    // Second iteration check — past timeout (200s > 180s)
    dateNowSpy.mockReturnValueOnce(realNow + 200_000);

    const mockCreate = vi.fn()
      .mockResolvedValueOnce({
        content: [
          { type: 'text', text: 'partial report so far' },
          { type: 'tool_use', id: 'call_1', name: 'git_diff', input: { base: 'main', head: 'HEAD' } },
        ],
        stop_reason: 'tool_use',
      })
      // Should never reach this — timeout triggers first
      .mockResolvedValueOnce({
        content: [{ type: 'text', text: 'should not reach' }],
        stop_reason: 'end_turn',
      });

    vi.mocked(Anthropic).mockImplementation(() => ({
      messages: { create: mockCreate },
    }) as never);

    vi.mocked(executeTool).mockResolvedValue('diff');

    const result = await runAnalysis({
      apiKey: 'test-key',
      repoPath: '/repo',
      baseBranch: 'main',
      headBranch: 'HEAD',
      model: 'claude-sonnet-4-5-20250929',
    });

    expect(result).toBe('partial report so far');
    // Only one API call — timeout prevents the second
    expect(mockCreate).toHaveBeenCalledTimes(1);
    dateNowSpy.mockRestore();
  });

  it('throws when timeout is exceeded with no text output', async () => {
    vi.useRealTimers();
    const realNow = Date.now();
    const dateNowSpy = vi.spyOn(Date, 'now');
    // startTime capture
    dateNowSpy.mockReturnValueOnce(realNow);
    // First iteration — immediately past timeout
    dateNowSpy.mockReturnValueOnce(realNow + 200_000);

    vi.mocked(Anthropic).mockImplementation(() => ({
      messages: { create: vi.fn() },
    }) as never);

    await expect(
      runAnalysis({
        apiKey: 'test-key',
        repoPath: '/repo',
        baseBranch: 'main',
        headBranch: 'HEAD',
        model: 'claude-sonnet-4-5-20250929',
      }),
    ).rejects.toThrow('Analysis timed out');

    dateNowSpy.mockRestore();
  });

  it('returns partial text when max iterations are exhausted', async () => {
    // Mock create to always return tool_use with some text
    const mockCreate = vi.fn().mockResolvedValue({
      content: [
        { type: 'text', text: 'iteration text' },
        { type: 'tool_use', id: 'call_1', name: 'git_diff', input: { base: 'main', head: 'HEAD' } },
      ],
      stop_reason: 'tool_use',
    });

    vi.mocked(Anthropic).mockImplementation(() => ({
      messages: { create: mockCreate },
    }) as never);

    vi.mocked(executeTool).mockResolvedValue('result');

    vi.useRealTimers();
    const result = await runAnalysis({
      apiKey: 'test-key',
      repoPath: '/repo',
      baseBranch: 'main',
      headBranch: 'HEAD',
      model: 'claude-sonnet-4-5-20250929',
    });

    expect(result).toBe('iteration text');
    // Should have been called exactly 30 times (MAX_ITERATIONS)
    expect(mockCreate).toHaveBeenCalledTimes(30);
  });

  it('throws when max iterations exhausted with no text output', async () => {
    // Mock create to always return only tool_use (no text blocks)
    const mockCreate = vi.fn().mockResolvedValue({
      content: [
        { type: 'tool_use', id: 'call_1', name: 'git_diff', input: { base: 'main', head: 'HEAD' } },
      ],
      stop_reason: 'tool_use',
    });

    vi.mocked(Anthropic).mockImplementation(() => ({
      messages: { create: mockCreate },
    }) as never);

    vi.mocked(executeTool).mockResolvedValue('result');

    vi.useRealTimers();
    await expect(
      runAnalysis({
        apiKey: 'test-key',
        repoPath: '/repo',
        baseBranch: 'main',
        headBranch: 'HEAD',
        model: 'claude-sonnet-4-5-20250929',
      }),
    ).rejects.toThrow('maximum iterations');

    expect(mockCreate).toHaveBeenCalledTimes(30);
  });
});
