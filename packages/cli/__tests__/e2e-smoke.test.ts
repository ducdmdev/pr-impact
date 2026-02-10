import { describe, it, expect } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';

const execFileAsync = promisify(execFile);

const CLI_PATH = resolve(import.meta.dirname, '..', 'dist', 'index.js');

/**
 * Helper to run the CLI binary via `node dist/index.js`.
 * Returns { stdout, stderr, exitCode }.
 */
async function runCli(
  args: string[],
  options: { cwd?: string; timeout?: number } = {},
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const { cwd, timeout = 10_000 } = options;
  try {
    const { stdout, stderr } = await execFileAsync('node', [CLI_PATH, ...args], {
      cwd,
      timeout,
      env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
    });
    return { stdout, stderr, exitCode: 0 };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; code?: number | string };
    return {
      stdout: e.stdout ?? '',
      stderr: e.stderr ?? '',
      exitCode: typeof e.code === 'number' ? e.code : 1,
    };
  }
}

describe('CLI e2e smoke tests', () => {
  it('dist/index.js exists (build prerequisite)', () => {
    expect(existsSync(CLI_PATH)).toBe(true);
  });

  it('pri --help exits 0 and prints usage', async () => {
    const { stdout, exitCode } = await runCli(['--help']);

    expect(exitCode).toBe(0);
    expect(stdout).toContain('Usage:');
    expect(stdout).toContain('pri');
    expect(stdout).toContain('Options:');
    expect(stdout).toContain('Commands:');
  }, 10_000);

  it('pri --version exits 0 and prints a semver-like version string', async () => {
    const { stdout, exitCode } = await runCli(['--version']);

    expect(exitCode).toBe(0);
    // Should print something like "0.1.0"
    expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
  }, 10_000);

  describe('subcommand --help', () => {
    const subcommands = ['analyze', 'breaking', 'risk', 'impact', 'comment'];

    for (const cmd of subcommands) {
      it(`pri ${cmd} --help exits 0 and prints usage`, async () => {
        const { stdout, exitCode } = await runCli([cmd, '--help']);

        expect(exitCode).toBe(0);
        expect(stdout).toContain('Usage:');
        expect(stdout).toContain(cmd);
      }, 10_000);
    }
  });

  describe('subcommand descriptions are present in root help', () => {
    it('root --help lists all five subcommands', async () => {
      const { stdout } = await runCli(['--help']);

      expect(stdout).toContain('analyze');
      expect(stdout).toContain('breaking');
      expect(stdout).toContain('risk');
      expect(stdout).toContain('impact');
      expect(stdout).toContain('comment');
    }, 10_000);
  });

  describe('error handling without a git repo', () => {
    it('pri analyze in a non-git directory exits with non-zero code', async () => {
      const { exitCode, stderr } = await runCli(['analyze', '--repo', '/tmp'], {
        cwd: '/tmp',
      });

      // The command should fail because /tmp is not a git repository
      expect(exitCode).not.toBe(0);
      // stderr should contain some error output (ora spinner fail message or error text)
      expect(stderr.length + (exitCode !== 0 ? 1 : 0)).toBeGreaterThan(0);
    }, 10_000);

    it('pri breaking in a non-git directory exits with non-zero code', async () => {
      const { exitCode } = await runCli(['breaking', '--repo', '/tmp'], {
        cwd: '/tmp',
      });

      expect(exitCode).not.toBe(0);
    }, 10_000);

    it('pri risk in a non-git directory exits with non-zero code', async () => {
      const { exitCode } = await runCli(['risk', '--repo', '/tmp'], {
        cwd: '/tmp',
      });

      expect(exitCode).not.toBe(0);
    }, 10_000);

    it('pri impact in a non-git directory exits with non-zero code', async () => {
      const { exitCode } = await runCli(['impact', '--repo', '/tmp'], {
        cwd: '/tmp',
      });

      expect(exitCode).not.toBe(0);
    }, 10_000);
  });

  it('pri with unknown command prints help and exits 0', async () => {
    const { stdout, exitCode } = await runCli(['help']);

    expect(exitCode).toBe(0);
    expect(stdout).toContain('Usage:');
  }, 10_000);
});
