import * as core from '@actions/core';
import * as github from '@actions/github';
import { runAnalysis } from './client.js';
import { postOrUpdateComment } from './comment.js';

async function main() {
  const apiKey = core.getInput('anthropic-api-key', { required: true });
  const baseBranch = core.getInput('base-branch') || 'main';
  const model = core.getInput('model') || 'claude-sonnet-4-5-20250929';
  const threshold = core.getInput('threshold');
  const githubToken = core.getInput('github-token') || process.env.GITHUB_TOKEN || '';

  const repoPath = process.cwd();

  core.info(`Analyzing PR: ${baseBranch}...HEAD`);
  core.info(`Model: ${model}`);

  const report = await runAnalysis({
    apiKey,
    repoPath,
    baseBranch,
    headBranch: 'HEAD',
    model,
  });

  // Extract risk score from report
  const scoreMatch = report.match(/\*\*Risk Score\*\*:\s*(\d+)\/100\s*\((\w+)\)/);
  const riskScore = scoreMatch ? parseInt(scoreMatch[1], 10) : -1;
  const riskLevel = scoreMatch ? scoreMatch[2] : 'unknown';

  // Set outputs
  core.setOutput('risk-score', String(riskScore));
  core.setOutput('risk-level', riskLevel);
  core.setOutput('report', report);

  if (riskScore === -1) {
    core.warning('Could not parse risk score from report. Skipping threshold check.');
  } else {
    core.info(`Risk Score: ${riskScore}/100 (${riskLevel})`);
  }

  // Post PR comment if in a PR context
  const prNumber = github.context.payload.pull_request?.number;
  if (prNumber && githubToken) {
    const repo = `${github.context.repo.owner}/${github.context.repo.repo}`;
    const commentUrl = await postOrUpdateComment({
      token: githubToken,
      repo,
      prNumber,
      body: report,
    });
    core.info(`Posted PR comment: ${commentUrl}`);
  }

  // Threshold gate — only check if we successfully parsed a score
  if (threshold && riskScore !== -1 && riskScore >= parseInt(threshold, 10)) {
    core.setFailed(`Risk score ${riskScore} exceeds threshold ${threshold}`);
  }
}

main().catch((error) => {
  core.setFailed(error instanceof Error ? error.message : String(error));
});
