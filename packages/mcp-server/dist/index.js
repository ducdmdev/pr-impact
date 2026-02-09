#!/usr/bin/env node

// src/index.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

// src/tools/analyze-diff.ts
import { z } from "zod";
import { analyzePR, formatMarkdown } from "@pr-impact/core";
function registerAnalyzeDiffTool(server2) {
  server2.tool(
    "analyze_diff",
    "Run full PR impact analysis including breaking changes, test coverage, doc staleness, and risk scoring",
    {
      repoPath: z.string().optional().describe("Path to git repo, defaults to cwd"),
      baseBranch: z.string().optional().describe("Base branch, defaults to main"),
      headBranch: z.string().optional().describe("Head branch, defaults to HEAD")
    },
    async ({ repoPath, baseBranch, headBranch }) => {
      try {
        const analysis = await analyzePR({
          repoPath: repoPath || process.cwd(),
          baseBranch,
          headBranch
        });
        return {
          content: [{ type: "text", text: formatMarkdown(analysis) }]
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text", text: `Error analyzing diff: ${message}` }],
          isError: true
        };
      }
    }
  );
}

// src/tools/get-breaking-changes.ts
import { z as z2 } from "zod";
import { parseDiff, detectBreakingChanges } from "@pr-impact/core";
var SEVERITY_ORDER = {
  low: 0,
  medium: 1,
  high: 2
};
function formatBreakingChange(bc) {
  const lines = [];
  lines.push(`- **${bc.symbolName}** in \`${bc.filePath}\``);
  lines.push(`  Type: ${bc.type} | Severity: ${bc.severity}`);
  lines.push(`  Before: \`${bc.before}\``);
  if (bc.after !== null) {
    lines.push(`  After: \`${bc.after}\``);
  } else {
    lines.push(`  After: (removed)`);
  }
  if (bc.consumers.length > 0) {
    lines.push(`  Consumers: ${bc.consumers.map((c) => `\`${c}\``).join(", ")}`);
  }
  return lines.join("\n");
}
function registerGetBreakingChangesTool(server2) {
  server2.tool(
    "get_breaking_changes",
    "Detect breaking changes between two branches with optional severity filtering",
    {
      repoPath: z2.string().optional().describe("Path to git repo, defaults to cwd"),
      baseBranch: z2.string().optional().describe("Base branch, defaults to main"),
      headBranch: z2.string().optional().describe("Head branch, defaults to HEAD"),
      minSeverity: z2.enum(["low", "medium", "high"]).optional().describe("Minimum severity to include, defaults to low (show all)")
    },
    async ({ repoPath, baseBranch, headBranch, minSeverity }) => {
      try {
        const repo = repoPath || process.cwd();
        const base = baseBranch || "main";
        const head = headBranch || "HEAD";
        const changedFiles = await parseDiff(repo, base, head);
        const breakingChanges = await detectBreakingChanges(repo, base, head, changedFiles);
        const minLevel = SEVERITY_ORDER[minSeverity || "low"] ?? 0;
        const filtered = breakingChanges.filter(
          (bc) => (SEVERITY_ORDER[bc.severity] ?? 0) >= minLevel
        );
        if (filtered.length === 0) {
          const qualifier = minSeverity ? ` at or above ${minSeverity} severity` : "";
          return {
            content: [
              {
                type: "text",
                text: `No breaking changes detected${qualifier}.`
              }
            ]
          };
        }
        const header = `Found ${filtered.length} breaking change${filtered.length === 1 ? "" : "s"}:
`;
        const body = filtered.map(formatBreakingChange).join("\n\n");
        return {
          content: [{ type: "text", text: header + "\n" + body }]
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [
            { type: "text", text: `Error detecting breaking changes: ${message}` }
          ],
          isError: true
        };
      }
    }
  );
}

// src/tools/get-risk-score.ts
import { z as z3 } from "zod";
import { analyzePR as analyzePR2 } from "@pr-impact/core";
function formatRiskFactor(factor) {
  const weighted = (factor.score * factor.weight).toFixed(1);
  let line = `- **${factor.name}** (score: ${factor.score}, weight: ${factor.weight}, weighted: ${weighted})`;
  line += `
  ${factor.description}`;
  if (factor.details && factor.details.length > 0) {
    for (const detail of factor.details) {
      line += `
    - ${detail}`;
    }
  }
  return line;
}
function formatRiskAssessment(risk) {
  const lines = [];
  lines.push(`## Risk Assessment`);
  lines.push("");
  lines.push(`**Overall Score:** ${risk.score}/100`);
  lines.push(`**Risk Level:** ${risk.level.toUpperCase()}`);
  lines.push("");
  if (risk.factors.length > 0) {
    lines.push(`### Contributing Factors`);
    lines.push("");
    for (const factor of risk.factors) {
      lines.push(formatRiskFactor(factor));
    }
  } else {
    lines.push("No risk factors identified.");
  }
  return lines.join("\n");
}
function registerGetRiskScoreTool(server2) {
  server2.tool(
    "get_risk_score",
    "Calculate risk score and breakdown for a PR, showing overall score, level, and contributing factors",
    {
      repoPath: z3.string().optional().describe("Path to git repo, defaults to cwd"),
      baseBranch: z3.string().optional().describe("Base branch, defaults to main"),
      headBranch: z3.string().optional().describe("Head branch, defaults to HEAD")
    },
    async ({ repoPath, baseBranch, headBranch }) => {
      try {
        const analysis = await analyzePR2({
          repoPath: repoPath || process.cwd(),
          baseBranch,
          headBranch
        });
        const text = formatRiskAssessment(analysis.riskScore);
        return {
          content: [{ type: "text", text }]
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [
            { type: "text", text: `Error calculating risk score: ${message}` }
          ],
          isError: true
        };
      }
    }
  );
}

// src/tools/get-impact-graph.ts
import { z as z4 } from "zod";
import { parseDiff as parseDiff2, buildImpactGraph } from "@pr-impact/core";
function formatImpactGraph(graph, filePath) {
  const lines = [];
  if (filePath) {
    const isDirectlyChanged = graph.directlyChanged.includes(filePath);
    const isIndirectlyAffected = graph.indirectlyAffected.includes(filePath);
    lines.push(`## Impact Graph for \`${filePath}\``);
    lines.push("");
    if (isDirectlyChanged) {
      lines.push(`This file is **directly changed** in the PR.`);
    } else if (isIndirectlyAffected) {
      lines.push(`This file is **indirectly affected** by the PR changes.`);
    } else {
      lines.push(`This file is not affected by the PR changes.`);
      return lines.join("\n");
    }
    lines.push("");
    const relevantEdges = graph.edges.filter(
      (edge) => edge.from === filePath || edge.to === filePath
    );
    if (relevantEdges.length > 0) {
      lines.push(`### Dependencies`);
      lines.push("");
      for (const edge of relevantEdges) {
        if (edge.from === filePath) {
          lines.push(`- \`${filePath}\` ${edge.type} \`${edge.to}\``);
        } else {
          lines.push(`- \`${edge.from}\` ${edge.type} \`${filePath}\``);
        }
      }
    }
    return lines.join("\n");
  }
  lines.push(`## Impact Graph`);
  lines.push("");
  lines.push(`### Directly Changed (${graph.directlyChanged.length})`);
  lines.push("");
  if (graph.directlyChanged.length > 0) {
    for (const file of graph.directlyChanged) {
      lines.push(`- \`${file}\``);
    }
  } else {
    lines.push("No files directly changed.");
  }
  lines.push("");
  lines.push(`### Indirectly Affected (${graph.indirectlyAffected.length})`);
  lines.push("");
  if (graph.indirectlyAffected.length > 0) {
    for (const file of graph.indirectlyAffected) {
      lines.push(`- \`${file}\``);
    }
  } else {
    lines.push("No files indirectly affected.");
  }
  if (graph.edges.length > 0) {
    lines.push("");
    lines.push(`### Dependency Edges (${graph.edges.length})`);
    lines.push("");
    for (const edge of graph.edges) {
      lines.push(`- \`${edge.from}\` ${edge.type} \`${edge.to}\``);
    }
  }
  return lines.join("\n");
}
function registerGetImpactGraphTool(server2) {
  server2.tool(
    "get_impact_graph",
    "Build an import dependency graph showing directly changed and indirectly affected files",
    {
      repoPath: z4.string().optional().describe("Path to git repo, defaults to cwd"),
      baseBranch: z4.string().optional().describe("Base branch, defaults to main"),
      headBranch: z4.string().optional().describe("Head branch, defaults to HEAD"),
      filePath: z4.string().optional().describe("Focus on a specific file in the graph"),
      depth: z4.number().optional().describe("Max depth for graph traversal, defaults to 3")
    },
    async ({ repoPath, baseBranch, headBranch, filePath, depth }) => {
      try {
        const repo = repoPath || process.cwd();
        const base = baseBranch || "main";
        const head = headBranch || "HEAD";
        const changedFiles = await parseDiff2(repo, base, head);
        const graph = await buildImpactGraph(repo, changedFiles, depth ?? 3);
        const text = formatImpactGraph(graph, filePath);
        return {
          content: [{ type: "text", text }]
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [
            { type: "text", text: `Error building impact graph: ${message}` }
          ],
          isError: true
        };
      }
    }
  );
}

// src/index.ts
var server = new McpServer({
  name: "pr-impact",
  version: "0.1.0"
});
registerAnalyzeDiffTool(server);
registerGetBreakingChangesTool(server);
registerGetRiskScoreTool(server);
registerGetImpactGraphTool(server);
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
main().catch(console.error);
//# sourceMappingURL=index.js.map