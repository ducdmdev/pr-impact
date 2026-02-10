import { describe, it, expect } from 'vitest';
import { extractImportPaths, isRelativeImport, resolveImport } from '../src/imports/import-resolver.js';

describe('extractImportPaths', () => {
  it('should extract static import paths', () => {
    const content = `
      import { foo } from './foo';
      import bar from '../bar';
    `;
    const paths = extractImportPaths(content);

    expect(paths).toContain('./foo');
    expect(paths).toContain('../bar');
  });

  it('should extract dynamic import paths', () => {
    const content = `
      const mod = import('./dynamic-module');
      const other = import('../lazy/component');
    `;
    const paths = extractImportPaths(content);

    expect(paths).toContain('./dynamic-module');
    expect(paths).toContain('../lazy/component');
  });

  it('should extract require paths', () => {
    const content = `
      const fs = require('fs');
      const helper = require('./helper');
    `;
    const paths = extractImportPaths(content);

    expect(paths).toContain('fs');
    expect(paths).toContain('./helper');
  });

  it('should extract paths from mixed import styles', () => {
    const content = `
      import { alpha } from './alpha';
      const beta = import('./beta');
      const gamma = require('./gamma');
      export { delta } from './delta';
    `;
    const paths = extractImportPaths(content);

    expect(paths).toContain('./alpha');
    expect(paths).toContain('./beta');
    expect(paths).toContain('./gamma');
    expect(paths).toContain('./delta');
    expect(paths).toHaveLength(4);
  });

  it('should return an empty array for content with no imports', () => {
    const content = `
      const x = 42;
      function hello() { return 'world'; }
    `;
    const paths = extractImportPaths(content);

    expect(paths).toHaveLength(0);
  });

  it('should return an empty array for empty content', () => {
    const paths = extractImportPaths('');
    expect(paths).toHaveLength(0);
  });

  it('should extract export-from paths', () => {
    const content = `
      export { foo } from './foo';
      export * from './bar';
      export type { Baz } from './baz';
    `;
    const paths = extractImportPaths(content);

    expect(paths).toContain('./foo');
    expect(paths).toContain('./bar');
    expect(paths).toContain('./baz');
  });

  it('should extract bare specifier imports', () => {
    const content = `
      import express from 'express';
      import { resolve } from 'path';
    `;
    const paths = extractImportPaths(content);

    expect(paths).toContain('express');
    expect(paths).toContain('path');
  });
});

describe('isRelativeImport', () => {
  it('should return true for ./ imports', () => {
    expect(isRelativeImport('./foo')).toBe(true);
    expect(isRelativeImport('./deeply/nested/module')).toBe(true);
  });

  it('should return true for ../ imports', () => {
    expect(isRelativeImport('../foo')).toBe(true);
    expect(isRelativeImport('../../bar/baz')).toBe(true);
  });

  it('should return false for bare specifier imports', () => {
    expect(isRelativeImport('express')).toBe(false);
    expect(isRelativeImport('fs')).toBe(false);
    expect(isRelativeImport('@scope/package')).toBe(false);
  });

  it('should return false for absolute paths', () => {
    expect(isRelativeImport('/absolute/path')).toBe(false);
  });
});

describe('resolveImport', () => {
  it('should resolve an exact file match', () => {
    const allFiles = new Set(['src/utils/helper.ts', 'src/index.ts']);
    const result = resolveImport('./helper.ts', 'src/utils/consumer.ts', allFiles);

    expect(result).toBe('src/utils/helper.ts');
  });

  it('should resolve by appending .ts extension', () => {
    const allFiles = new Set(['src/utils/helper.ts', 'src/index.ts']);
    const result = resolveImport('./helper', 'src/utils/consumer.ts', allFiles);

    expect(result).toBe('src/utils/helper.ts');
  });

  it('should resolve by appending .tsx extension', () => {
    const allFiles = new Set(['src/components/Button.tsx']);
    const result = resolveImport('./Button', 'src/components/App.tsx', allFiles);

    expect(result).toBe('src/components/Button.tsx');
  });

  it('should resolve by appending .js extension', () => {
    const allFiles = new Set(['lib/utils.js']);
    const result = resolveImport('./utils', 'lib/main.ts', allFiles);

    expect(result).toBe('lib/utils.js');
  });

  it('should resolve by appending .jsx extension', () => {
    const allFiles = new Set(['src/Widget.jsx']);
    const result = resolveImport('./Widget', 'src/App.tsx', allFiles);

    expect(result).toBe('src/Widget.jsx');
  });

  it('should resolve directory with index.ts', () => {
    const allFiles = new Set(['src/utils/index.ts']);
    const result = resolveImport('./utils', 'src/main.ts', allFiles);

    expect(result).toBe('src/utils/index.ts');
  });

  it('should resolve directory with index.tsx', () => {
    const allFiles = new Set(['src/components/index.tsx']);
    const result = resolveImport('./components', 'src/app.ts', allFiles);

    expect(result).toBe('src/components/index.tsx');
  });

  it('should resolve directory with index.js', () => {
    const allFiles = new Set(['lib/helpers/index.js']);
    const result = resolveImport('./helpers', 'lib/main.ts', allFiles);

    expect(result).toBe('lib/helpers/index.js');
  });

  it('should resolve directory with index.jsx', () => {
    const allFiles = new Set(['src/views/index.jsx']);
    const result = resolveImport('./views', 'src/app.ts', allFiles);

    expect(result).toBe('src/views/index.jsx');
  });

  it('should return null for unresolvable imports', () => {
    const allFiles = new Set(['src/other.ts']);
    const result = resolveImport('./nonexistent', 'src/main.ts', allFiles);

    expect(result).toBeNull();
  });

  it('should resolve ../ relative imports', () => {
    const allFiles = new Set(['src/shared/types.ts']);
    const result = resolveImport('../shared/types', 'src/utils/helper.ts', allFiles);

    expect(result).toBe('src/shared/types.ts');
  });

  it('should prioritize exact match over extension resolution', () => {
    const allFiles = new Set(['src/utils.js', 'src/utils.ts']);
    const result = resolveImport('./utils.js', 'src/main.ts', allFiles);

    expect(result).toBe('src/utils.js');
  });

  it('should prioritize .ts extension over .tsx when both exist', () => {
    const allFiles = new Set(['src/mod.ts', 'src/mod.tsx']);
    const result = resolveImport('./mod', 'src/main.ts', allFiles);

    // RESOLVE_EXTENSIONS order: ['.ts', '.tsx', '.js', '.jsx']
    expect(result).toBe('src/mod.ts');
  });

  it('should prioritize extension resolution over index file resolution', () => {
    const allFiles = new Set(['src/utils.ts', 'src/utils/index.ts']);
    const result = resolveImport('./utils', 'src/main.ts', allFiles);

    // Extension resolution (.ts) is tried before index file resolution
    expect(result).toBe('src/utils.ts');
  });

  it('should handle deeply nested relative imports', () => {
    const allFiles = new Set(['lib/core/engine.ts']);
    const result = resolveImport('../../../lib/core/engine', 'src/deep/nested/file.ts', allFiles);

    expect(result).toBe('lib/core/engine.ts');
  });
});
