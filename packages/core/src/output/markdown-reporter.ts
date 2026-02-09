import { PRAnalysis } from '../types.js';

/**
 * Format a PRAnalysis result as a readable Markdown report suitable for
 * posting as a PR comment or writing to a file.
 */
export function formatMarkdown(analysis: PRAnalysis): string {
  const sections: string[] = [];

  // ── Header ──────────────────────────────────────────────────────────────────
  sections.push('# PR Impact Analysis');
  sections.push('');
  sections.push(`**Repository:** ${analysis.repoPath}`);
  sections.push(`**Comparing:** \`${analysis.baseBranch}\` ← \`${analysis.headBranch}\``);

  // ── Risk Score ──────────────────────────────────────────────────────────────
  sections.push('');
  sections.push(`## Risk Score: ${analysis.riskScore.score}/100 (${analysis.riskScore.level})`);
  sections.push('');

  if (analysis.riskScore.factors.length > 0) {
    sections.push('| Factor | Score | Weight |');
    sections.push('|--------|------:|-------:|');

    for (const factor of analysis.riskScore.factors) {
      sections.push(`| ${factor.name} | ${factor.score} | ${factor.weight} |`);
    }
  } else {
    sections.push('No risk factors identified.');
  }

  // ── Summary ─────────────────────────────────────────────────────────────────
  sections.push('');
  sections.push('## Summary');
  sections.push('');
  sections.push(analysis.summary);

  // ── Changed Files ───────────────────────────────────────────────────────────
  sections.push('');
  sections.push(`## Changed Files (${analysis.changedFiles.length})`);
  sections.push('');

  if (analysis.changedFiles.length > 0) {
    sections.push('| File | Status | +/- | Category |');
    sections.push('|------|--------|-----|----------|');

    for (const file of analysis.changedFiles) {
      const change = `+${file.additions}/-${file.deletions}`;
      sections.push(`| ${file.path} | ${file.status} | ${change} | ${file.category} |`);
    }
  } else {
    sections.push('No files changed.');
  }

  // ── Breaking Changes ────────────────────────────────────────────────────────
  sections.push('');
  sections.push(`## Breaking Changes (${analysis.breakingChanges.length})`);
  sections.push('');

  if (analysis.breakingChanges.length > 0) {
    sections.push('| Symbol | Type | Severity | File |');
    sections.push('|--------|------|----------|------|');

    for (const bc of analysis.breakingChanges) {
      const typeLabel = formatBreakingChangeType(bc.type);
      sections.push(`| ${bc.symbolName} | ${typeLabel} | ${bc.severity} | ${bc.filePath} |`);
    }
  } else {
    sections.push('No breaking changes detected.');
  }

  // ── Test Coverage ───────────────────────────────────────────────────────────
  sections.push('');
  sections.push('## Test Coverage');
  sections.push('');

  const coveragePercent = Math.round(analysis.testCoverage.coverageRatio * 100);
  sections.push(`- **Changed source files:** ${analysis.testCoverage.changedSourceFiles}`);
  sections.push(`- **Files with test changes:** ${analysis.testCoverage.sourceFilesWithTestChanges}`);
  sections.push(`- **Coverage ratio:** ${coveragePercent}%`);

  if (analysis.testCoverage.gaps.length > 0) {
    sections.push('');
    sections.push('### Gaps');
    sections.push('');

    for (const gap of analysis.testCoverage.gaps) {
      const testStatus = gap.testFileExists
        ? 'test file exists but was not changed'
        : 'no test file found';
      sections.push(`- **${gap.sourceFile}** — ${testStatus}`);

      if (gap.expectedTestFiles.length > 0) {
        for (const tf of gap.expectedTestFiles) {
          sections.push(`  - ${tf}`);
        }
      }
    }
  }

  // ── Documentation Staleness ─────────────────────────────────────────────────
  sections.push('');
  sections.push('## Documentation Staleness');
  sections.push('');

  if (analysis.docStaleness.staleReferences.length > 0) {
    for (const ref of analysis.docStaleness.staleReferences) {
      sections.push(`- **${ref.docFile}** (line ${ref.line}): \`${ref.reference}\` — ${ref.reason}`);
    }
  } else {
    sections.push('No stale references found.');
  }

  // ── Impact Graph ────────────────────────────────────────────────────────────
  sections.push('');
  sections.push('## Impact Graph');
  sections.push('');
  sections.push(`- **Directly changed:** ${analysis.impactGraph.directlyChanged.length} file${analysis.impactGraph.directlyChanged.length === 1 ? '' : 's'}`);
  sections.push(`- **Indirectly affected:** ${analysis.impactGraph.indirectlyAffected.length} file${analysis.impactGraph.indirectlyAffected.length === 1 ? '' : 's'}`);

  if (analysis.impactGraph.edges.length > 0) {
    sections.push('');
    sections.push('### Dependency Edges');
    sections.push('');

    for (const edge of analysis.impactGraph.edges) {
      sections.push(`- ${edge.from} → ${edge.to} (\`${edge.type}\`)`);
    }
  }

  // Final newline
  sections.push('');

  return sections.join('\n');
}

/**
 * Convert a breaking change type enum value into a human-readable label.
 */
function formatBreakingChangeType(
  type: 'removed_export' | 'changed_signature' | 'changed_type' | 'renamed_export',
): string {
  switch (type) {
    case 'removed_export':
      return 'removed export';
    case 'changed_signature':
      return 'changed signature';
    case 'changed_type':
      return 'changed type';
    case 'renamed_export':
      return 'renamed export';
  }
}
