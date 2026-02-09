import { describe, it, expect } from 'vitest';
import { categorizeFile } from '../src/diff/file-categorizer.js';

describe('categorizeFile', () => {
  // ── Test files ──────────────────────────────────────────────────────────────

  describe('test files', () => {
    it('should categorize .test.ts files as test', () => {
      expect(categorizeFile('src/utils/parser.test.ts')).toBe('test');
    });

    it('should categorize .test.js files as test', () => {
      expect(categorizeFile('lib/helpers.test.js')).toBe('test');
    });

    it('should categorize .spec.ts files as test', () => {
      expect(categorizeFile('src/components/Button.spec.ts')).toBe('test');
    });

    it('should categorize .spec.js files as test', () => {
      expect(categorizeFile('src/components/Button.spec.js')).toBe('test');
    });

    it('should categorize .test.tsx files as test', () => {
      expect(categorizeFile('src/App.test.tsx')).toBe('test');
    });

    it('should categorize .spec.jsx files as test', () => {
      expect(categorizeFile('src/App.spec.jsx')).toBe('test');
    });

    it('should categorize files in __tests__/ directory as test', () => {
      expect(categorizeFile('src/__tests__/parser.ts')).toBe('test');
    });

    it('should categorize files in __tests__ with nested path as test', () => {
      expect(categorizeFile('packages/core/__tests__/utils/helper.ts')).toBe('test');
    });

    it('should categorize files in /test/ directory as test', () => {
      expect(categorizeFile('src/test/parser.ts')).toBe('test');
    });

    it('should categorize files in /tests/ directory as test', () => {
      expect(categorizeFile('src/tests/parser.ts')).toBe('test');
    });

    it('should categorize files starting with "test" as test', () => {
      expect(categorizeFile('src/testHelper.ts')).toBe('test');
    });

    it('should categorize files in __tests__ using backslash paths as test', () => {
      expect(categorizeFile('src\\__tests__\\parser.ts')).toBe('test');
    });
  });

  // ── Doc files ───────────────────────────────────────────────────────────────

  describe('doc files', () => {
    it('should categorize .md files as doc', () => {
      expect(categorizeFile('README.md')).toBe('doc');
    });

    it('should categorize .mdx files as doc', () => {
      expect(categorizeFile('docs/guide.mdx')).toBe('doc');
    });

    it('should categorize .txt files as doc', () => {
      expect(categorizeFile('CHANGELOG.txt')).toBe('doc');
    });

    it('should categorize .rst files as doc', () => {
      expect(categorizeFile('docs/index.rst')).toBe('doc');
    });

    it('should categorize files in docs/ directory as doc', () => {
      expect(categorizeFile('docs/api/reference.html')).toBe('doc');
    });

    it('should categorize files in doc/ directory as doc', () => {
      expect(categorizeFile('doc/usage.html')).toBe('doc');
    });
  });

  // ── Config files ────────────────────────────────────────────────────────────

  describe('config files', () => {
    it('should categorize package.json as config', () => {
      expect(categorizeFile('package.json')).toBe('config');
    });

    it('should categorize tsconfig.json as config', () => {
      expect(categorizeFile('tsconfig.json')).toBe('config');
    });

    it('should categorize turbo.json as config', () => {
      expect(categorizeFile('turbo.json')).toBe('config');
    });

    it('should categorize .gitignore as config', () => {
      expect(categorizeFile('.gitignore')).toBe('config');
    });

    it('should categorize .npmrc as config', () => {
      expect(categorizeFile('.npmrc')).toBe('config');
    });

    it('should categorize pnpm-workspace.yaml as config', () => {
      expect(categorizeFile('pnpm-workspace.yaml')).toBe('config');
    });

    it('should categorize pnpm-lock.yaml as config', () => {
      expect(categorizeFile('pnpm-lock.yaml')).toBe('config');
    });

    it('should categorize yarn.lock as config', () => {
      expect(categorizeFile('yarn.lock')).toBe('config');
    });

    it('should categorize package-lock.json as config', () => {
      expect(categorizeFile('package-lock.json')).toBe('config');
    });

    it('should categorize Dockerfile as config', () => {
      expect(categorizeFile('dockerfile')).toBe('config');
    });

    it('should categorize Makefile as config', () => {
      expect(categorizeFile('makefile')).toBe('config');
    });

    it('should categorize .github/ files as config', () => {
      expect(categorizeFile('.github/workflows/ci.yml')).toBe('config');
    });

    it('should categorize .github/CODEOWNERS as config', () => {
      expect(categorizeFile('.github/CODEOWNERS')).toBe('config');
    });

    it('should categorize .eslintrc prefixed files as config', () => {
      expect(categorizeFile('.eslintrc.json')).toBe('config');
    });

    it('should categorize .prettierrc prefixed files as config', () => {
      expect(categorizeFile('.prettierrc.yml')).toBe('config');
    });

    it('should categorize webpack.config.* as config', () => {
      expect(categorizeFile('webpack.config.js')).toBe('config');
    });

    it('should categorize vite.config.* as config', () => {
      expect(categorizeFile('vite.config.ts')).toBe('config');
    });

    it('should categorize jest.config.* as config', () => {
      expect(categorizeFile('jest.config.ts')).toBe('config');
    });

    it('should categorize vitest.config.* as config', () => {
      expect(categorizeFile('vitest.config.ts')).toBe('config');
    });

    it('should categorize docker-compose.* as config', () => {
      expect(categorizeFile('docker-compose.yml')).toBe('config');
    });

    it('should categorize .env files as config', () => {
      expect(categorizeFile('.env')).toBe('config');
    });

    it('should categorize .env.local as config', () => {
      expect(categorizeFile('.env.local')).toBe('config');
    });

    it('should categorize nested config files as config', () => {
      expect(categorizeFile('packages/core/package.json')).toBe('config');
    });
  });

  // ── Source files ────────────────────────────────────────────────────────────

  describe('source files', () => {
    it('should categorize .ts files as source', () => {
      expect(categorizeFile('src/index.ts')).toBe('source');
    });

    it('should categorize .tsx files as source', () => {
      expect(categorizeFile('src/App.tsx')).toBe('source');
    });

    it('should categorize .js files as source', () => {
      expect(categorizeFile('src/utils.js')).toBe('source');
    });

    it('should categorize .jsx files as source', () => {
      expect(categorizeFile('src/Component.jsx')).toBe('source');
    });

    it('should categorize .py files as source', () => {
      expect(categorizeFile('scripts/deploy.py')).toBe('source');
    });

    it('should categorize .go files as source', () => {
      expect(categorizeFile('cmd/main.go')).toBe('source');
    });

    it('should categorize .rs files as source', () => {
      expect(categorizeFile('src/lib.rs')).toBe('source');
    });

    it('should categorize .java files as source', () => {
      expect(categorizeFile('src/Main.java')).toBe('source');
    });

    it('should categorize .c files as source', () => {
      expect(categorizeFile('src/main.c')).toBe('source');
    });

    it('should categorize .cpp files as source', () => {
      expect(categorizeFile('src/main.cpp')).toBe('source');
    });

    it('should categorize .h files as source', () => {
      expect(categorizeFile('include/header.h')).toBe('source');
    });

    it('should categorize .rb files as source', () => {
      expect(categorizeFile('lib/app.rb')).toBe('source');
    });

    it('should categorize .php files as source', () => {
      expect(categorizeFile('src/index.php')).toBe('source');
    });

    it('should categorize .swift files as source', () => {
      expect(categorizeFile('Sources/App.swift')).toBe('source');
    });

    it('should categorize .kt files as source', () => {
      expect(categorizeFile('src/main.kt')).toBe('source');
    });

    it('should categorize .scala files as source', () => {
      expect(categorizeFile('src/Main.scala')).toBe('source');
    });

    it('should categorize .cs files as source', () => {
      expect(categorizeFile('src/Program.cs')).toBe('source');
    });

    it('should categorize .vue files as source', () => {
      expect(categorizeFile('src/App.vue')).toBe('source');
    });

    it('should categorize .svelte files as source', () => {
      expect(categorizeFile('src/App.svelte')).toBe('source');
    });
  });

  // ── Other files ─────────────────────────────────────────────────────────────

  describe('other files (fallback)', () => {
    it('should categorize .png files as other', () => {
      expect(categorizeFile('assets/logo.png')).toBe('other');
    });

    it('should categorize .svg files as other', () => {
      expect(categorizeFile('icons/arrow.svg')).toBe('other');
    });

    it('should categorize .jpg files as other', () => {
      expect(categorizeFile('images/photo.jpg')).toBe('other');
    });

    it('should categorize .woff files as other', () => {
      expect(categorizeFile('fonts/inter.woff')).toBe('other');
    });

    it('should categorize unknown extensions as other', () => {
      expect(categorizeFile('data/something.xyz')).toBe('other');
    });

    it('should categorize files with no extension as other', () => {
      expect(categorizeFile('LICENSE')).toBe('other');
    });

    it('should categorize .css files as other', () => {
      expect(categorizeFile('styles/main.css')).toBe('other');
    });

    it('should categorize .json files (non-config) as other', () => {
      expect(categorizeFile('data/fixtures.json')).toBe('other');
    });
  });

  // ── Priority / precedence ──────────────────────────────────────────────────

  describe('priority: test > doc > config > source > other', () => {
    it('should prioritize test over source (.test.ts is test, not source)', () => {
      expect(categorizeFile('src/utils.test.ts')).toBe('test');
    });

    it('should prioritize test over doc (test file in docs dir with .spec.ts)', () => {
      // A .spec.ts file even inside docs/ should be categorized as test
      // because isTestFile is checked first
      expect(categorizeFile('docs/api.spec.ts')).toBe('test');
    });

    it('should prioritize test over config (__tests__/package.json is test because __tests__ dir)', () => {
      expect(categorizeFile('__tests__/package.json')).toBe('test');
    });

    it('should prioritize doc over source (README.md is doc)', () => {
      expect(categorizeFile('README.md')).toBe('doc');
    });

    it('should prioritize doc over config (docs/ directory takes priority over config patterns)', () => {
      // A file in docs/ should be doc even if it has no doc extension
      expect(categorizeFile('docs/setup.html')).toBe('doc');
    });

    it('should prioritize config over source (.github/workflows/build.ts is config, not source)', () => {
      expect(categorizeFile('.github/workflows/build.ts')).toBe('config');
      // Wait - .github/ is config, but isTestFile runs first.
      // Actually .github/workflows/build.ts is not a test file, and .github/ makes it config.
      // But it also has .ts extension making it source. Config is checked before source, so config wins.
    });
  });
});
