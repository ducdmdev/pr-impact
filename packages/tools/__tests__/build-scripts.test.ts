import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '../../..');

describe('embed-templates.ts output', () => {
  const generated = readFileSync(
    resolve(rootDir, 'packages/action/src/generated/templates.ts'),
    'utf-8',
  );

  it('contains auto-generated header', () => {
    expect(generated).toContain('// AUTO-GENERATED');
    expect(generated).toContain('do not edit manually');
  });

  it('exports SYSTEM_PROMPT as a string', () => {
    expect(generated).toMatch(/^export const SYSTEM_PROMPT = "/m);
  });

  it('exports REPORT_TEMPLATE as a string', () => {
    expect(generated).toMatch(/^export const REPORT_TEMPLATE = "/m);
  });

  it('SYSTEM_PROMPT contains the 6 analysis steps', () => {
    expect(generated).toContain('Step 1');
    expect(generated).toContain('Step 6');
    expect(generated).toContain('Risk Assessment');
  });

  it('REPORT_TEMPLATE contains the report sections', () => {
    expect(generated).toContain('PR Impact Report');
    expect(generated).toContain('Breaking Changes');
    expect(generated).toContain('Test Coverage Gaps');
    expect(generated).toContain('Risk Factor Breakdown');
  });
});

describe('build-skill.ts output', () => {
  const skillMd = readFileSync(
    resolve(rootDir, 'packages/skill/skills/pr-impact/SKILL.md'),
    'utf-8',
  );

  it('contains YAML frontmatter with skill metadata', () => {
    expect(skillMd).toMatch(/^---\nname: pr-impact/);
    expect(skillMd).toContain('description:');
    expect(skillMd).toContain('argument-hint:');
  });

  it('contains the system prompt content', () => {
    expect(skillMd).toContain('## Available Tools');
    expect(skillMd).toContain('## Analysis Steps');
  });

  it('contains the task instruction', () => {
    expect(skillMd).toContain('## Your Task');
    expect(skillMd).toContain('$ARGUMENTS');
  });

  it('contains the report template', () => {
    expect(skillMd).toContain('PR Impact Report');
    expect(skillMd).toContain('Risk Factor Breakdown');
  });
});
