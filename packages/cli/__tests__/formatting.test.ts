import { describe, it, expect } from 'vitest';
import { formatMarkdownTable } from '../src/commands/breaking.js';
import { formatDotOutput } from '../src/commands/impact.js';
import type { BreakingChange, ImpactGraph } from '@pr-impact/core';

describe('CLI formatting', () => {
  describe('formatMarkdownTable', () => {
    it('formats a single breaking change', () => {
      const changes: BreakingChange[] = [
        {
          filePath: 'src/utils.ts',
          type: 'removed_export',
          symbolName: 'helper',
          before: 'function helper',
          after: null,
          severity: 'high',
          consumers: ['src/app.ts'],
        },
      ];

      const result = formatMarkdownTable(changes);
      expect(result).toContain('# Breaking Changes');
      expect(result).toContain('Found **1** breaking change.');
      expect(result).toContain('| src/utils.ts | helper | removed_export | high | src/app.ts |');
    });

    it('formats multiple breaking changes', () => {
      const changes: BreakingChange[] = [
        {
          filePath: 'src/a.ts',
          type: 'removed_export',
          symbolName: 'foo',
          before: 'function foo',
          after: null,
          severity: 'high',
          consumers: [],
        },
        {
          filePath: 'src/b.ts',
          type: 'changed_signature',
          symbolName: 'bar',
          before: 'function bar(x: number)',
          after: 'function bar(x: string)',
          severity: 'medium',
          consumers: ['src/c.ts', 'src/d.ts'],
        },
      ];

      const result = formatMarkdownTable(changes);
      expect(result).toContain('Found **2** breaking changes.');
      expect(result).toContain('| src/a.ts | foo |');
      expect(result).toContain('| src/b.ts | bar |');
    });

    it('shows "none" when there are no consumers', () => {
      const changes: BreakingChange[] = [
        {
          filePath: 'src/x.ts',
          type: 'removed_export',
          symbolName: 'x',
          before: 'const x',
          after: null,
          severity: 'high',
          consumers: [],
        },
      ];

      const result = formatMarkdownTable(changes);
      expect(result).toContain('| none |');
    });

    it('includes the markdown table header row', () => {
      const changes: BreakingChange[] = [
        {
          filePath: 'src/a.ts',
          type: 'changed_type',
          symbolName: 'MyType',
          before: 'type MyType = string',
          after: 'type MyType = number',
          severity: 'medium',
          consumers: [],
        },
      ];

      const result = formatMarkdownTable(changes);
      expect(result).toContain('| File | Symbol | Type | Severity | Consumers |');
      expect(result).toContain('|------|--------|------|----------|-----------|');
    });

    it('joins multiple consumers with commas', () => {
      const changes: BreakingChange[] = [
        {
          filePath: 'src/lib.ts',
          type: 'removed_export',
          symbolName: 'util',
          before: 'function util',
          after: null,
          severity: 'high',
          consumers: ['src/a.ts', 'src/b.ts', 'src/c.ts'],
        },
      ];

      const result = formatMarkdownTable(changes);
      expect(result).toContain('src/a.ts, src/b.ts, src/c.ts');
    });
  });

  describe('formatDotOutput', () => {
    it('generates valid DOT digraph output', () => {
      const graph: ImpactGraph = {
        directlyChanged: ['src/a.ts'],
        indirectlyAffected: ['src/b.ts'],
        edges: [
          { from: 'src/b.ts', to: 'src/a.ts', type: 'imports' },
        ],
      };

      const result = formatDotOutput(graph);
      expect(result).toContain('digraph impact {');
      expect(result).toContain('rankdir=LR;');
      expect(result).toContain('}');
    });

    it('styles directly changed nodes with red fill', () => {
      const graph: ImpactGraph = {
        directlyChanged: ['src/a.ts'],
        indirectlyAffected: [],
        edges: [],
      };

      const result = formatDotOutput(graph);
      expect(result).toContain('"src/a.ts" [fillcolor="#ff6b6b", fontcolor="white"];');
    });

    it('styles indirectly affected nodes with yellow fill', () => {
      const graph: ImpactGraph = {
        directlyChanged: [],
        indirectlyAffected: ['src/b.ts'],
        edges: [],
      };

      const result = formatDotOutput(graph);
      expect(result).toContain('"src/b.ts" [fillcolor="#ffd93d"];');
    });

    it('includes labeled edges', () => {
      const graph: ImpactGraph = {
        directlyChanged: ['src/a.ts'],
        indirectlyAffected: ['src/b.ts'],
        edges: [
          { from: 'src/b.ts', to: 'src/a.ts', type: 'imports' },
        ],
      };

      const result = formatDotOutput(graph);
      expect(result).toContain('"src/b.ts" -> "src/a.ts" [label="imports"];');
    });

    it('handles empty graph', () => {
      const graph: ImpactGraph = {
        directlyChanged: [],
        indirectlyAffected: [],
        edges: [],
      };

      const result = formatDotOutput(graph);
      expect(result).toContain('digraph impact {');
      expect(result).toContain('}');
      // Should not contain any node or edge definitions
      expect(result).not.toContain('fillcolor');
      expect(result).not.toContain('->');
    });

    it('handles multiple directly changed and indirectly affected files', () => {
      const graph: ImpactGraph = {
        directlyChanged: ['src/a.ts', 'src/b.ts'],
        indirectlyAffected: ['src/c.ts', 'src/d.ts'],
        edges: [
          { from: 'src/c.ts', to: 'src/a.ts', type: 'imports' },
          { from: 'src/d.ts', to: 'src/b.ts', type: 'imports' },
        ],
      };

      const result = formatDotOutput(graph);
      expect(result).toContain('"src/a.ts" [fillcolor="#ff6b6b"');
      expect(result).toContain('"src/b.ts" [fillcolor="#ff6b6b"');
      expect(result).toContain('"src/c.ts" [fillcolor="#ffd93d"');
      expect(result).toContain('"src/d.ts" [fillcolor="#ffd93d"');
      expect(result).toContain('"src/c.ts" -> "src/a.ts"');
      expect(result).toContain('"src/d.ts" -> "src/b.ts"');
    });
  });
});
