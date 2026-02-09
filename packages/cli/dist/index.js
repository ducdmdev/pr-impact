#!/usr/bin/env node

// src/index.ts
import { Command } from "commander";

// src/commands/analyze.ts
import chalk from "chalk";
import ora from "ora";
import { analyzePR, formatMarkdown, formatJSON } from "@pr-impact/core";
import { writeFile } from "fs/promises";
import { resolve } from "path";
function registerAnalyzeCommand(program2) {
  program2.command("analyze").description("Run full PR impact analysis").argument("[base]", "Base branch", void 0).argument("[head]", "Head branch", void 0).option("--format <type>", "Output format: md | json", "md").option("--output <file>", "Write to file instead of stdout").option("--repo <path>", "Repository path", process.cwd()).option("--no-breaking", "Skip breaking change analysis").option("--no-coverage", "Skip test coverage analysis").option("--no-docs", "Skip doc staleness check").action(async (base, head, opts) => {
    const spinner = ora({ text: "Analyzing PR impact...", stream: process.stderr }).start();
    try {
      const analysis = await analyzePR({
        repoPath: resolve(opts.repo),
        baseBranch: base,
        headBranch: head,
        skipBreaking: opts.breaking === false,
        skipCoverage: opts.coverage === false,
        skipDocs: opts.docs === false
      });
      spinner.stop();
      const output = opts.format === "json" ? formatJSON(analysis) : formatMarkdown(analysis);
      if (opts.output) {
        await writeFile(resolve(opts.output), output);
        console.log(chalk.green(`Report written to ${opts.output}`));
      } else {
        console.log(output);
      }
    } catch (err) {
      spinner.fail("Analysis failed");
      console.error(
        chalk.red(err instanceof Error ? err.message : String(err))
      );
      process.exit(1);
    }
  });
}

// src/commands/breaking.ts
import chalk2 from "chalk";
import ora2 from "ora";
import { parseDiff, detectBreakingChanges } from "@pr-impact/core";
import { resolve as resolve2 } from "path";
var SEVERITY_ORDER = {
  low: 0,
  medium: 1,
  high: 2
};
function severityColor(severity) {
  switch (severity) {
    case "high":
      return chalk2.red(severity);
    case "medium":
      return chalk2.yellow(severity);
    case "low":
      return chalk2.green(severity);
  }
}
function formatMarkdownTable(changes) {
  const lines = [];
  lines.push("# Breaking Changes\n");
  lines.push(`Found **${changes.length}** breaking change${changes.length === 1 ? "" : "s"}.
`);
  lines.push("| File | Symbol | Type | Severity | Consumers |");
  lines.push("|------|--------|------|----------|-----------|");
  for (const change of changes) {
    const consumers = change.consumers.length > 0 ? change.consumers.join(", ") : "none";
    lines.push(
      `| ${change.filePath} | ${change.symbolName} | ${change.type} | ${change.severity} | ${consumers} |`
    );
  }
  return lines.join("\n");
}
function formatText(changes) {
  const lines = [];
  lines.push(chalk2.bold(`Found ${changes.length} breaking change${changes.length === 1 ? "" : "s"}:
`));
  for (const change of changes) {
    lines.push(
      `  ${severityColor(change.severity)}  ${chalk2.bold(change.symbolName)} (${change.type})`
    );
    lines.push(`       ${chalk2.dim(change.filePath)}`);
    if (change.before) {
      lines.push(`       ${chalk2.red("- " + change.before)}`);
    }
    if (change.after) {
      lines.push(`       ${chalk2.green("+ " + change.after)}`);
    }
    if (change.consumers.length > 0) {
      lines.push(`       ${chalk2.dim("Consumers:")} ${change.consumers.join(", ")}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}
function registerBreakingCommand(program2) {
  program2.command("breaking").description("Detect breaking changes in the PR").argument("[base]", "Base branch", void 0).argument("[head]", "Head branch", void 0).option("--severity <level>", "Minimum severity: low | medium | high", "low").option("--format <type>", "Output format: md | json", "md").option("--repo <path>", "Repository path", process.cwd()).action(async (base, head, opts) => {
    const spinner = ora2({ text: "Detecting breaking changes...", stream: process.stderr }).start();
    try {
      const repoPath = resolve2(opts.repo);
      const baseBranch = base ?? "main";
      const headBranch = head ?? "HEAD";
      const changedFiles = await parseDiff(repoPath, baseBranch, headBranch);
      const allBreaking = await detectBreakingChanges(
        repoPath,
        baseBranch,
        headBranch,
        changedFiles
      );
      const minSeverity = SEVERITY_ORDER[opts.severity] ?? 0;
      const filtered = allBreaking.filter(
        (change) => SEVERITY_ORDER[change.severity] >= minSeverity
      );
      spinner.stop();
      if (filtered.length === 0) {
        console.log(
          chalk2.green("No breaking changes detected at severity >= " + opts.severity)
        );
        return;
      }
      switch (opts.format) {
        case "json":
          console.log(JSON.stringify(filtered, null, 2));
          break;
        case "md":
          console.log(formatMarkdownTable(filtered));
          break;
        default:
          console.log(formatText(filtered));
          break;
      }
      process.exit(1);
    } catch (err) {
      spinner.fail("Breaking change detection failed");
      console.error(
        chalk2.red(err instanceof Error ? err.message : String(err))
      );
      process.exit(1);
    }
  });
}

// src/commands/risk.ts
import chalk3 from "chalk";
import ora3 from "ora";
import { analyzePR as analyzePR2 } from "@pr-impact/core";
import { resolve as resolve3 } from "path";
function levelColor(level) {
  switch (level) {
    case "low":
      return chalk3.green;
    case "medium":
      return chalk3.yellow;
    case "high":
      return chalk3.red;
    case "critical":
      return chalk3.red.bold;
  }
}
function formatFactorLine(factor) {
  const weighted = (factor.score * factor.weight).toFixed(1);
  const bar = "\u2588".repeat(Math.round(factor.score / 10)) + "\u2591".repeat(10 - Math.round(factor.score / 10));
  return `  ${bar}  ${factor.name.padEnd(24)} ${String(factor.score).padStart(3)}/100  (weight: ${factor.weight}, contribution: ${weighted})`;
}
function formatTextOutput(risk) {
  const colorFn = levelColor(risk.level);
  const lines = [];
  lines.push(chalk3.bold("Risk Assessment"));
  lines.push("");
  lines.push(
    `  Score: ${colorFn(String(risk.score) + "/100")}  Level: ${colorFn(risk.level.toUpperCase())}`
  );
  lines.push("");
  if (risk.factors.length > 0) {
    lines.push(chalk3.bold("Factor Breakdown"));
    lines.push("");
    for (const factor of risk.factors) {
      lines.push(formatFactorLine(factor));
      lines.push(`  ${chalk3.dim(factor.description)}`);
      if (factor.details && factor.details.length > 0) {
        for (const detail of factor.details) {
          lines.push(`    ${chalk3.dim("- " + detail)}`);
        }
      }
      lines.push("");
    }
  }
  return lines.join("\n");
}
function formatJsonOutput(risk) {
  return JSON.stringify(risk, null, 2);
}
function registerRiskCommand(program2) {
  program2.command("risk").description("Calculate and display PR risk score").argument("[base]", "Base branch", void 0).argument("[head]", "Head branch", void 0).option("--threshold <n>", "Fail if risk score >= threshold", parseFloat).option("--format <type>", "Output format: text | json", "text").option("--repo <path>", "Repository path", process.cwd()).action(async (base, head, opts) => {
    const spinner = ora3({ text: "Calculating risk score...", stream: process.stderr }).start();
    try {
      const analysis = await analyzePR2({
        repoPath: resolve3(opts.repo),
        baseBranch: base,
        headBranch: head
      });
      spinner.stop();
      const { riskScore } = analysis;
      if (opts.format === "json") {
        console.log(formatJsonOutput(riskScore));
      } else {
        console.log(formatTextOutput(riskScore));
      }
      if (opts.threshold !== void 0 && riskScore.score >= opts.threshold) {
        const colorFn = levelColor(riskScore.level);
        console.log(
          colorFn(
            `
Risk score ${riskScore.score} meets or exceeds threshold ${opts.threshold}`
          )
        );
        process.exit(1);
      }
    } catch (err) {
      spinner.fail("Risk calculation failed");
      console.error(
        chalk3.red(err instanceof Error ? err.message : String(err))
      );
      process.exit(1);
    }
  });
}

// src/commands/impact.ts
import chalk4 from "chalk";
import ora4 from "ora";
import { parseDiff as parseDiff2, buildImpactGraph } from "@pr-impact/core";
import { resolve as resolve4 } from "path";
function formatTreeOutput(graph) {
  const lines = [];
  lines.push(chalk4.bold("Impact Graph"));
  lines.push("");
  if (graph.directlyChanged.length > 0) {
    lines.push(chalk4.bold("Directly Changed"));
    for (let i = 0; i < graph.directlyChanged.length; i++) {
      const isLast = i === graph.directlyChanged.length - 1;
      const prefix = isLast ? "\u2514\u2500\u2500 " : "\u251C\u2500\u2500 ";
      const file = graph.directlyChanged[i];
      const dependents = graph.edges.filter((e) => e.from === file);
      lines.push(`  ${prefix}${chalk4.cyan(file)}`);
      if (dependents.length > 0) {
        const indent = isLast ? "    " : "\u2502   ";
        for (let j = 0; j < dependents.length; j++) {
          const depIsLast = j === dependents.length - 1;
          const depPrefix = depIsLast ? "\u2514\u2500\u2500 " : "\u251C\u2500\u2500 ";
          lines.push(
            `  ${indent}${depPrefix}${chalk4.dim(dependents[j].to)} ${chalk4.dim("(" + dependents[j].type + ")")}`
          );
        }
      }
    }
  }
  if (graph.indirectlyAffected.length > 0) {
    lines.push("");
    lines.push(chalk4.bold("Indirectly Affected"));
    for (let i = 0; i < graph.indirectlyAffected.length; i++) {
      const isLast = i === graph.indirectlyAffected.length - 1;
      const prefix = isLast ? "\u2514\u2500\u2500 " : "\u251C\u2500\u2500 ";
      lines.push(`  ${prefix}${chalk4.yellow(graph.indirectlyAffected[i])}`);
    }
  }
  lines.push("");
  lines.push(
    chalk4.dim(
      `${graph.directlyChanged.length} directly changed, ${graph.indirectlyAffected.length} indirectly affected, ${graph.edges.length} edge${graph.edges.length === 1 ? "" : "s"}`
    )
  );
  return lines.join("\n");
}
function formatDotOutput(graph) {
  const lines = [];
  lines.push("digraph impact {");
  lines.push("  rankdir=LR;");
  lines.push("  node [shape=box, style=filled];");
  lines.push("");
  for (const file of graph.directlyChanged) {
    lines.push(`  "${file}" [fillcolor="#ff6b6b", fontcolor="white"];`);
  }
  for (const file of graph.indirectlyAffected) {
    lines.push(`  "${file}" [fillcolor="#ffd93d"];`);
  }
  lines.push("");
  for (const edge of graph.edges) {
    lines.push(`  "${edge.from}" -> "${edge.to}" [label="${edge.type}"];`);
  }
  lines.push("}");
  return lines.join("\n");
}
function formatJsonOutput2(graph) {
  return JSON.stringify(graph, null, 2);
}
function registerImpactCommand(program2) {
  program2.command("impact").description("Build and display the impact graph").argument("[file]", "Specific file to trace impact for", void 0).option("--depth <n>", "Max dependency depth", parseInt, 3).option("--format <type>", "Output format: text | json | dot", "text").option("--repo <path>", "Repository path", process.cwd()).action(async (file, opts) => {
    const spinner = ora4({ text: "Building impact graph...", stream: process.stderr }).start();
    try {
      const repoPath = resolve4(opts.repo);
      const depth = opts.depth;
      let changedFiles;
      if (file) {
        changedFiles = [
          {
            path: file,
            status: "modified",
            additions: 0,
            deletions: 0,
            language: "",
            category: "source"
          }
        ];
      } else {
        changedFiles = await parseDiff2(repoPath, "main", "HEAD").catch(
          () => parseDiff2(repoPath, "master", "HEAD")
        );
      }
      const graph = await buildImpactGraph(repoPath, changedFiles, depth);
      spinner.stop();
      switch (opts.format) {
        case "json":
          console.log(formatJsonOutput2(graph));
          break;
        case "dot":
          console.log(formatDotOutput(graph));
          break;
        default:
          console.log(formatTreeOutput(graph));
          break;
      }
    } catch (err) {
      spinner.fail("Impact graph building failed");
      console.error(
        chalk4.red(err instanceof Error ? err.message : String(err))
      );
      process.exit(1);
    }
  });
}

// src/index.ts
var program = new Command();
program.name("pri").description("PR Impact Analyzer \u2014 detect breaking changes, map impact, score risk").version("0.1.0");
registerAnalyzeCommand(program);
registerBreakingCommand(program);
registerRiskCommand(program);
registerImpactCommand(program);
program.parse();
//# sourceMappingURL=index.js.map