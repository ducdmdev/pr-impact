import { ChangedFile } from '../types.js';

const SOURCE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx',
  '.py', '.go', '.rs', '.java',
  '.c', '.cpp', '.h',
  '.rb', '.php', '.swift',
  '.kt', '.scala', '.cs',
  '.vue', '.svelte',
]);

const DOC_EXTENSIONS = new Set(['.md', '.mdx', '.txt', '.rst']);

const CONFIG_FILENAMES = new Set([
  'package.json',
  'tsconfig.json',
  'turbo.json',
  'dockerfile',
  'makefile',
  '.gitignore',
  '.npmrc',
  'pnpm-workspace.yaml',
  'pnpm-lock.yaml',
  'yarn.lock',
  'package-lock.json',
]);

const CONFIG_PREFIXES = [
  '.eslintrc',
  '.prettierrc',
  'webpack.config.',
  'vite.config.',
  'jest.config.',
  'vitest.config.',
  'docker-compose.',
  '.env',
];

function isTestFile(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  const fileName = normalized.split('/').pop() ?? '';

  return (
    normalized.includes('__tests__/') ||
    normalized.includes('__tests__\\') ||
    normalized.includes('/test/') ||
    normalized.includes('/tests/') ||
    fileName.includes('.test.') ||
    fileName.includes('.spec.') ||
    fileName.startsWith('test')
  );
}

function isDocFile(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  const ext = getExtension(filePath);

  return (
    DOC_EXTENSIONS.has(ext) ||
    normalized.startsWith('docs/') ||
    normalized.startsWith('doc/')
  );
}

function isConfigFile(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  const fileName = (normalized.split('/').pop() ?? '').toLowerCase();

  if (normalized.startsWith('.github/')) {
    return true;
  }

  if (CONFIG_FILENAMES.has(fileName)) {
    return true;
  }

  for (const prefix of CONFIG_PREFIXES) {
    if (fileName.startsWith(prefix)) {
      return true;
    }
  }

  return false;
}

function isSourceFile(filePath: string): boolean {
  const ext = getExtension(filePath);
  return SOURCE_EXTENSIONS.has(ext);
}

function getExtension(filePath: string): string {
  const lastDot = filePath.lastIndexOf('.');
  if (lastDot === -1) return '';
  return filePath.slice(lastDot).toLowerCase();
}

export function categorizeFile(filePath: string): ChangedFile['category'] {
  if (isTestFile(filePath)) return 'test';
  if (isDocFile(filePath)) return 'doc';
  if (isConfigFile(filePath)) return 'config';
  if (isSourceFile(filePath)) return 'source';
  return 'other';
}
