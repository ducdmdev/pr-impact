import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { detectCIEnv } from '../../src/github/ci-env.js';

describe('detectCIEnv', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset env to a clean state
    process.env = { ...originalEnv };
    // Remove all CI-related vars
    delete process.env.GITHUB_ACTIONS;
    delete process.env.GITHUB_REPOSITORY;
    delete process.env.GITHUB_REF;
    delete process.env.GITLAB_CI;
    delete process.env.CI_MERGE_REQUEST_IID;
    delete process.env.CI_PROJECT_PATH;
    delete process.env.CIRCLECI;
    delete process.env.CIRCLE_PULL_REQUEST;
    delete process.env.CIRCLE_PROJECT_USERNAME;
    delete process.env.CIRCLE_PROJECT_REPONAME;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns null when not in any CI environment', () => {
    expect(detectCIEnv()).toBeNull();
  });

  describe('GitHub Actions', () => {
    it('detects PR number and repo from GitHub Actions env', () => {
      process.env.GITHUB_ACTIONS = 'true';
      process.env.GITHUB_REPOSITORY = 'owner/repo';
      process.env.GITHUB_REF = 'refs/pull/42/merge';

      const result = detectCIEnv();
      expect(result).toEqual({
        prNumber: '42',
        repo: 'owner/repo',
      });
    });

    it('returns null when GITHUB_REF is not a PR ref', () => {
      process.env.GITHUB_ACTIONS = 'true';
      process.env.GITHUB_REPOSITORY = 'owner/repo';
      process.env.GITHUB_REF = 'refs/heads/main';

      expect(detectCIEnv()).toBeNull();
    });

    it('returns null when GITHUB_REPOSITORY is missing', () => {
      process.env.GITHUB_ACTIONS = 'true';
      process.env.GITHUB_REF = 'refs/pull/42/merge';

      expect(detectCIEnv()).toBeNull();
    });

    it('returns null when GITHUB_REF is missing', () => {
      process.env.GITHUB_ACTIONS = 'true';
      process.env.GITHUB_REPOSITORY = 'owner/repo';

      expect(detectCIEnv()).toBeNull();
    });
  });

  describe('GitLab CI', () => {
    it('detects MR number and project from GitLab CI env', () => {
      process.env.GITLAB_CI = 'true';
      process.env.CI_MERGE_REQUEST_IID = '15';
      process.env.CI_PROJECT_PATH = 'group/project';

      const result = detectCIEnv();
      expect(result).toEqual({
        prNumber: '15',
        repo: 'group/project',
      });
    });

    it('returns null when CI_MERGE_REQUEST_IID is missing', () => {
      process.env.GITLAB_CI = 'true';
      process.env.CI_PROJECT_PATH = 'group/project';

      expect(detectCIEnv()).toBeNull();
    });

    it('returns null when CI_PROJECT_PATH is missing', () => {
      process.env.GITLAB_CI = 'true';
      process.env.CI_MERGE_REQUEST_IID = '15';

      expect(detectCIEnv()).toBeNull();
    });
  });

  describe('CircleCI', () => {
    it('detects PR number and repo from CircleCI env', () => {
      process.env.CIRCLECI = 'true';
      process.env.CIRCLE_PULL_REQUEST = 'https://github.com/owner/repo/pull/99';
      process.env.CIRCLE_PROJECT_USERNAME = 'owner';
      process.env.CIRCLE_PROJECT_REPONAME = 'repo';

      const result = detectCIEnv();
      expect(result).toEqual({
        prNumber: '99',
        repo: 'owner/repo',
      });
    });

    it('returns null when CIRCLE_PULL_REQUEST is missing', () => {
      process.env.CIRCLECI = 'true';
      process.env.CIRCLE_PROJECT_USERNAME = 'owner';
      process.env.CIRCLE_PROJECT_REPONAME = 'repo';

      expect(detectCIEnv()).toBeNull();
    });

    it('returns null when project info is missing', () => {
      process.env.CIRCLECI = 'true';
      process.env.CIRCLE_PULL_REQUEST = 'https://github.com/owner/repo/pull/99';

      expect(detectCIEnv()).toBeNull();
    });
  });
});
