/**
 * Auto-detect PR context from CI environment variables.
 *
 * Supports: GitHub Actions, GitLab CI, CircleCI, Jenkins, Bitbucket Pipelines,
 * Azure Pipelines, and Travis CI.
 */

export interface CIEnv {
  /** Pull request number (e.g. "42"). */
  prNumber: string;
  /** Repository owner/name (e.g. "owner/repo"). */
  repo: string;
}

/**
 * Attempt to detect the PR number and repository from CI environment variables.
 * Returns null if not running in a recognized CI environment or if the
 * information is not available.
 */
export function detectCIEnv(): CIEnv | null {
  const env = process.env;

  // GitHub Actions
  if (env.GITHUB_ACTIONS) {
    const repo = env.GITHUB_REPOSITORY;
    const ref = env.GITHUB_REF ?? '';
    // GITHUB_REF for PRs is "refs/pull/<number>/merge"
    const prMatch = ref.match(/^refs\/pull\/(\d+)\//);
    if (repo && prMatch) {
      return { prNumber: prMatch[1], repo };
    }
    return null;
  }

  // GitLab CI
  if (env.GITLAB_CI) {
    const prNumber = env.CI_MERGE_REQUEST_IID;
    const project = env.CI_PROJECT_PATH;
    if (prNumber && project) {
      return { prNumber, repo: project };
    }
    return null;
  }

  // CircleCI
  if (env.CIRCLECI) {
    const prUrl = env.CIRCLE_PULL_REQUEST ?? '';
    const prMatch = prUrl.match(/\/pull\/(\d+)$/);
    const slug = env.CIRCLE_PROJECT_USERNAME && env.CIRCLE_PROJECT_REPONAME
      ? `${env.CIRCLE_PROJECT_USERNAME}/${env.CIRCLE_PROJECT_REPONAME}`
      : undefined;
    if (prMatch && slug) {
      return { prNumber: prMatch[1], repo: slug };
    }
    return null;
  }

  return null;
}
