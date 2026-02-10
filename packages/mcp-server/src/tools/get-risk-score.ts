import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { analyzePR } from '@pr-impact/core';
import type { RiskAssessment, RiskFactor } from '@pr-impact/core';

function formatRiskFactor(factor: RiskFactor): string {
  const weighted = (factor.score * factor.weight).toFixed(1);
  let line = `- **${factor.name}** (score: ${factor.score}, weight: ${factor.weight}, weighted: ${weighted})`;
  line += `\n  ${factor.description}`;
  if (factor.details && factor.details.length > 0) {
    for (const detail of factor.details) {
      line += `\n    - ${detail}`;
    }
  }
  return line;
}

function formatRiskAssessment(risk: RiskAssessment): string {
  const lines: string[] = [];
  lines.push('## Risk Assessment');
  lines.push('');
  lines.push(`**Overall Score:** ${risk.score}/100`);
  lines.push(`**Risk Level:** ${risk.level.toUpperCase()}`);
  lines.push('');

  if (risk.factors.length > 0) {
    lines.push('### Contributing Factors');
    lines.push('');
    for (const factor of risk.factors) {
      lines.push(formatRiskFactor(factor));
    }
  } else {
    lines.push('No risk factors identified.');
  }

  return lines.join('\n');
}

export function registerGetRiskScoreTool(server: McpServer): void {
  server.tool(
    'get_risk_score',
    'Calculate risk score and breakdown for a PR, showing overall score, level, and contributing factors',
    {
      repoPath: z.string().optional().describe('Path to git repo, defaults to cwd'),
      baseBranch: z.string().optional().describe('Base branch, defaults to main'),
      headBranch: z.string().optional().describe('Head branch, defaults to HEAD'),
    },
    async ({ repoPath, baseBranch, headBranch }) => {
      try {
        const analysis = await analyzePR({
          repoPath: repoPath || process.cwd(),
          baseBranch,
          headBranch,
        });

        const text = formatRiskAssessment(analysis.riskScore);
        return {
          content: [{ type: 'text' as const, text }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [
            { type: 'text' as const, text: `Error calculating risk score: ${message}` },
          ],
          isError: true,
        };
      }
    },
  );
}
