import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import stylistic from '@stylistic/eslint-plugin';
import vitest from 'eslint-plugin-vitest';

export default tseslint.config(
  // ── Global ignores ───────────────────────────────────────────────────────
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      'coverage/**',
    ],
  },

  // ── Base JS rules ────────────────────────────────────────────────────────
  eslint.configs.recommended,

  // ── TypeScript rules (type-checked) ──────────────────────────────────────
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      }],
    },
  },

  // ── Stylistic rules ─────────────────────────────────────────────────────
  {
    plugins: {
      '@stylistic': stylistic,
    },
    rules: {
      '@stylistic/indent': ['error', 2],
      '@stylistic/quotes': ['error', 'single', { avoidEscape: true }],
      '@stylistic/semi': ['error', 'always'],
      '@stylistic/comma-dangle': ['error', 'always-multiline'],
      '@stylistic/eol-last': ['error', 'always'],
      '@stylistic/no-trailing-spaces': 'error',
      '@stylistic/no-multiple-empty-lines': ['error', { max: 1, maxBOF: 0, maxEOF: 1 }],
    },
  },

  // ── Test files: disable type-checked rules + enable vitest ───────────────
  {
    files: ['**/__tests__/**/*.ts'],
    ...tseslint.configs.disableTypeChecked,
    plugins: {
      vitest,
    },
    rules: {
      ...tseslint.configs.disableTypeChecked.rules,
      ...vitest.configs.recommended.rules,
    },
  },

  // ── Config files outside tsconfig (tsup, vitest configs, build scripts) ──
  {
    files: ['**/tsup.config.ts', '**/vitest.config.ts', 'vitest.config.ts', 'scripts/*.ts'],
    ...tseslint.configs.disableTypeChecked,
  },

  // ── JS/MJS config files ──────────────────────────────────────────────────
  {
    files: ['**/*.mjs', '**/*.js'],
    ...tseslint.configs.disableTypeChecked,
  },
);
