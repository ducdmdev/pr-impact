import { describe, it, expect } from 'vitest';
import { formatBreakingChange } from '../src/tools/get-breaking-changes.js';
import { formatImpactGraph } from '../src/tools/get-impact-graph.js';
import type { BreakingChange, ImpactGraph } from '@pr-impact/core';

describe('MCP server formatting', () => {
  describe('formatBreakingChange', () => {
    it('formats a breaking change with consumers', () => {
      const bc: BreakingChange = {
        filePath: 'src/utils.ts',
        type: 'removed_export',
        symbolName: 'helper',
        before: 'function helper(x: number)',
        after: null,
        severity: 'high',
        consumers: ['src/app.ts', 'src/main.ts'],
      };

      const result = formatBreakingChange(bc);
      expect(result).toContain('**helper**');
      expect(result).toContain('`src/utils.ts`');
      expect(result).toContain('Severity: high');
      expect(result).toContain('Before: `function helper(x: number)`');
      expect(result).toContain('After: (removed)');
      expect(result).toContain('`src/app.ts`');
      expect(result).toContain('`src/main.ts`');
    });

    it('formats a breaking change without consumers', () => {
      const bc: BreakingChange = {
        filePath: 'src/lib.ts',
        type: 'changed_signature',
        symbolName: 'compute',
        before: 'function compute(a: number)',
        after: 'function compute(a: string)',
        severity: 'medium',
        consumers: [],
      };

      const result = formatBreakingChange(bc);
      expect(result).toContain('**compute**');
      expect(result).toContain('After: `function compute(a: string)`');
      expect(result).not.toContain('Consumers:');
    });

    it('includes the type and severity in the output', () => {
      const bc: BreakingChange = {
        filePath: 'src/types.ts',
        type: 'changed_type',
        symbolName: 'Config',
        before: 'type Config = { port: number }',
        after: 'type Config = { port: string }',
        severity: 'low',
        consumers: [],
      };

      const result = formatBreakingChange(bc);
      expect(result).toContain('Type: changed_type');
      expect(result).toContain('Severity: low');
    });

    it('formats the before value in backticks', () => {
      const bc: BreakingChange = {
        filePath: 'src/api.ts',
        type: 'renamed_export',
        symbolName: 'getData',
        before: 'function getData()',
        after: 'function fetchData()',
        severity: 'medium',
        consumers: ['src/client.ts'],
      };

      const result = formatBreakingChange(bc);
      expect(result).toContain('Before: `function getData()`');
      expect(result).toContain('After: `function fetchData()`');
    });

    it('wraps each consumer in backticks', () => {
      const bc: BreakingChange = {
        filePath: 'src/core.ts',
        type: 'removed_export',
        symbolName: 'init',
        before: 'function init()',
        after: null,
        severity: 'high',
        consumers: ['src/a.ts', 'src/b.ts'],
      };

      const result = formatBreakingChange(bc);
      expect(result).toContain('Consumers: `src/a.ts`, `src/b.ts`');
    });
  });

  describe('formatImpactGraph', () => {
    it('formats a full impact graph', () => {
      const graph: ImpactGraph = {
        directlyChanged: ['src/a.ts', 'src/b.ts'],
        indirectlyAffected: ['src/c.ts'],
        edges: [
          { from: 'src/c.ts', to: 'src/a.ts', type: 'imports' },
        ],
      };

      const result = formatImpactGraph(graph);
      expect(result).toContain('## Impact Graph');
      expect(result).toContain('Directly Changed (2)');
      expect(result).toContain('`src/a.ts`');
      expect(result).toContain('`src/b.ts`');
      expect(result).toContain('Indirectly Affected (1)');
      expect(result).toContain('`src/c.ts`');
      expect(result).toContain('Dependency Edges (1)');
    });

    it('formats graph focused on a directly changed file', () => {
      const graph: ImpactGraph = {
        directlyChanged: ['src/a.ts'],
        indirectlyAffected: ['src/b.ts'],
        edges: [
          { from: 'src/b.ts', to: 'src/a.ts', type: 'imports' },
        ],
      };

      const result = formatImpactGraph(graph, 'src/a.ts');
      expect(result).toContain('## Impact Graph for `src/a.ts`');
      expect(result).toContain('**directly changed**');
    });

    it('formats graph focused on an indirectly affected file', () => {
      const graph: ImpactGraph = {
        directlyChanged: ['src/a.ts'],
        indirectlyAffected: ['src/b.ts'],
        edges: [
          { from: 'src/b.ts', to: 'src/a.ts', type: 'imports' },
        ],
      };

      const result = formatImpactGraph(graph, 'src/b.ts');
      expect(result).toContain('## Impact Graph for `src/b.ts`');
      expect(result).toContain('**indirectly affected**');
    });

    it('reports when file is not affected', () => {
      const graph: ImpactGraph = {
        directlyChanged: ['src/a.ts'],
        indirectlyAffected: [],
        edges: [],
      };

      const result = formatImpactGraph(graph, 'src/z.ts');
      expect(result).toContain('not affected');
    });

    it('handles empty graph', () => {
      const graph: ImpactGraph = {
        directlyChanged: [],
        indirectlyAffected: [],
        edges: [],
      };

      const result = formatImpactGraph(graph);
      expect(result).toContain('No files directly changed');
      expect(result).toContain('No files indirectly affected');
    });

    it('shows relevant edges for a focused file', () => {
      const graph: ImpactGraph = {
        directlyChanged: ['src/a.ts'],
        indirectlyAffected: ['src/b.ts'],
        edges: [
          { from: 'src/b.ts', to: 'src/a.ts', type: 'imports' },
          { from: 'src/a.ts', to: 'src/b.ts', type: 'imports' },
        ],
      };

      const result = formatImpactGraph(graph, 'src/a.ts');
      expect(result).toContain('Dependencies');
      expect(result).toContain('`src/b.ts`');
    });

    it('does not show dependency edges section when edges list is empty', () => {
      const graph: ImpactGraph = {
        directlyChanged: ['src/a.ts'],
        indirectlyAffected: [],
        edges: [],
      };

      const result = formatImpactGraph(graph);
      expect(result).not.toContain('Dependency Edges');
    });
  });
});
