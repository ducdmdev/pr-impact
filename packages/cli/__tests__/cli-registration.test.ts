import { describe, it, expect, vi } from 'vitest';

// ── Track command registrations ──
const registeredCommands: string[] = [];

// ── Mock command registration modules ──
vi.mock('../src/commands/analyze.js', () => ({
  registerAnalyzeCommand: () => { registeredCommands.push('analyze'); },
}));
vi.mock('../src/commands/breaking.js', () => ({
  registerBreakingCommand: () => { registeredCommands.push('breaking'); },
}));
vi.mock('../src/commands/risk.js', () => ({
  registerRiskCommand: () => { registeredCommands.push('risk'); },
}));
vi.mock('../src/commands/impact.js', () => ({
  registerImpactCommand: () => { registeredCommands.push('impact'); },
}));
vi.mock('../src/commands/comment.js', () => ({
  registerCommentCommand: () => { registeredCommands.push('comment'); },
}));

// ── Mock commander to avoid calling parse() ──
const mockProgram = {
  name: vi.fn().mockReturnThis(),
  description: vi.fn().mockReturnThis(),
  version: vi.fn().mockReturnThis(),
  parse: vi.fn(),
};
vi.mock('commander', () => ({
  Command: vi.fn().mockImplementation(() => mockProgram),
}));

// ── Mock createRequire for version reading ──
vi.mock('module', () => ({
  createRequire: () => () => ({ version: '0.1.0' }),
}));

describe('CLI registration', () => {
  it('registers all five commands and configures the program', async () => {
    // Dynamically import to trigger module-level code
    await import('../src/index.js');

    expect(mockProgram.name).toHaveBeenCalledWith('pri');
    expect(mockProgram.description).toHaveBeenCalledWith(
      expect.stringContaining('PR Impact Analyzer'),
    );
    expect(mockProgram.version).toHaveBeenCalledWith('0.1.0');

    expect(registeredCommands).toContain('analyze');
    expect(registeredCommands).toContain('breaking');
    expect(registeredCommands).toContain('risk');
    expect(registeredCommands).toContain('impact');
    expect(registeredCommands).toContain('comment');
    expect(registeredCommands).toHaveLength(5);

    expect(mockProgram.parse).toHaveBeenCalled();
  });
});
