import { describe, it, expect, vi } from 'vitest';
import { resolveDefaultBaseBranch } from '../src/analyzer.js';

const mockBranch = vi.fn();

// Mock simple-git
vi.mock('simple-git', () => ({
  default: vi.fn(() => ({
    branch: mockBranch,
  })),
}));

describe('resolveDefaultBaseBranch', () => {
  it('returns "main" when main branch exists', async () => {
    mockBranch.mockResolvedValue({ all: ['main', 'feature/test'] });

    const result = await resolveDefaultBaseBranch('/fake/repo');
    expect(result).toBe('main');
  });

  it('returns "master" when only master exists', async () => {
    mockBranch.mockResolvedValue({ all: ['master', 'develop'] });

    const result = await resolveDefaultBaseBranch('/fake/repo');
    expect(result).toBe('master');
  });

  it('prefers "main" over "master" when both exist', async () => {
    mockBranch.mockResolvedValue({ all: ['main', 'master'] });

    const result = await resolveDefaultBaseBranch('/fake/repo');
    expect(result).toBe('main');
  });

  it('falls back to "main" when neither exists', async () => {
    mockBranch.mockResolvedValue({ all: ['develop', 'feature/x'] });

    const result = await resolveDefaultBaseBranch('/fake/repo');
    expect(result).toBe('main');
  });
});
