import { describe, it, expect } from 'vitest';
import { parseExports, diffExports } from '../src/breaking/export-differ.js';

describe('parseExports', () => {
  const filePath = 'src/index.ts';

  describe('export function', () => {
    it('should parse a named export function', () => {
      const content = 'export function greet(name: string): void { }';
      const result = parseExports(content, filePath);

      expect(result.filePath).toBe(filePath);
      expect(result.symbols).toHaveLength(1);
      expect(result.symbols[0]).toEqual({
        name: 'greet',
        kind: 'function',
        signature: '(name: string): void',
        isDefault: false,
      });
    });

    it('should parse an async export function', () => {
      const content = 'export async function fetchData(url: string): Promise<Response> { }';
      const result = parseExports(content, filePath);

      expect(result.symbols).toHaveLength(1);
      expect(result.symbols[0]).toMatchObject({
        name: 'fetchData',
        kind: 'function',
        isDefault: false,
      });
      expect(result.symbols[0].signature).toContain('url: string');
    });

    it('should parse multiple export functions', () => {
      const content = `
        export function foo(a: number): number { return a; }
        export function bar(b: string): string { return b; }
      `;
      const result = parseExports(content, filePath);

      expect(result.symbols).toHaveLength(2);
      expect(result.symbols.map((s) => s.name)).toEqual(['foo', 'bar']);
    });
  });

  describe('export class', () => {
    it('should parse a named export class', () => {
      const content = 'export class MyService { }';
      const result = parseExports(content, filePath);

      expect(result.symbols).toHaveLength(1);
      expect(result.symbols[0]).toEqual({
        name: 'MyService',
        kind: 'class',
        isDefault: false,
      });
    });

    it('should parse export default class', () => {
      const content = 'export default class AppRouter { }';
      const result = parseExports(content, filePath);

      expect(result.symbols).toHaveLength(1);
      expect(result.symbols[0]).toEqual({
        name: 'AppRouter',
        kind: 'class',
        isDefault: true,
      });
    });
  });

  describe('export const / let / var', () => {
    it('should parse export const', () => {
      const content = 'export const MAX_RETRIES = 3;';
      const result = parseExports(content, filePath);

      expect(result.symbols).toHaveLength(1);
      expect(result.symbols[0]).toMatchObject({
        name: 'MAX_RETRIES',
        kind: 'const',
        isDefault: false,
      });
    });

    it('should parse export const with type annotation', () => {
      const content = 'export const config: AppConfig = {};';
      const result = parseExports(content, filePath);

      expect(result.symbols).toHaveLength(1);
      expect(result.symbols[0]).toMatchObject({
        name: 'config',
        kind: 'const',
        signature: 'AppConfig',
        isDefault: false,
      });
    });

    it('should parse export let as variable kind', () => {
      const content = 'export let counter = 0;';
      const result = parseExports(content, filePath);

      expect(result.symbols).toHaveLength(1);
      expect(result.symbols[0]).toMatchObject({
        name: 'counter',
        kind: 'variable',
        isDefault: false,
      });
    });

    it('should parse export var as variable kind', () => {
      const content = 'export var legacy = true;';
      const result = parseExports(content, filePath);

      expect(result.symbols).toHaveLength(1);
      expect(result.symbols[0]).toMatchObject({
        name: 'legacy',
        kind: 'variable',
        isDefault: false,
      });
    });
  });

  describe('export interface', () => {
    it('should parse export interface', () => {
      const content = 'export interface User { name: string; }';
      const result = parseExports(content, filePath);

      expect(result.symbols).toHaveLength(1);
      expect(result.symbols[0]).toEqual({
        name: 'User',
        kind: 'interface',
        isDefault: false,
      });
    });

    it('should parse multiple export interfaces', () => {
      const content = `
        export interface Foo { a: number; }
        export interface Bar { b: string; }
      `;
      const result = parseExports(content, filePath);

      expect(result.symbols).toHaveLength(2);
      expect(result.symbols.map((s) => s.name)).toEqual(['Foo', 'Bar']);
    });
  });

  describe('export type', () => {
    it('should parse export type alias', () => {
      const content = 'export type ID = string | number;';
      const result = parseExports(content, filePath);

      expect(result.symbols).toHaveLength(1);
      expect(result.symbols[0]).toEqual({
        name: 'ID',
        kind: 'type',
        isDefault: false,
      });
    });

    it('should not confuse export type { ... } re-export with type alias', () => {
      const content = 'export type { Foo, Bar } from "./other";';
      const result = parseExports(content, filePath);

      // The export type { ... } block should still be captured as named exports
      // with kind 'type' from the EXPORT_NAMED_RE pattern preceded by 'type'.
      // Let's just verify it does not create a type alias named '{'.
      const typeAliases = result.symbols.filter(
        (s) => s.kind === 'type' && s.name === '{',
      );
      expect(typeAliases).toHaveLength(0);
    });
  });

  describe('export enum', () => {
    it('should parse export enum', () => {
      const content = 'export enum Status { Active, Inactive }';
      const result = parseExports(content, filePath);

      expect(result.symbols).toHaveLength(1);
      expect(result.symbols[0]).toEqual({
        name: 'Status',
        kind: 'enum',
        isDefault: false,
      });
    });
  });

  describe('export default', () => {
    it('should parse export default function with name', () => {
      const content = 'export default function main(): void { }';
      const result = parseExports(content, filePath);

      expect(result.symbols).toHaveLength(1);
      expect(result.symbols[0]).toMatchObject({
        name: 'main',
        kind: 'function',
        isDefault: true,
      });
    });

    it('should parse export default expression (identifier)', () => {
      const content = `
        const app = createApp();
        export default app;
      `;
      const result = parseExports(content, filePath);

      const defaultExport = result.symbols.find((s) => s.isDefault);
      expect(defaultExport).toBeDefined();
      expect(defaultExport!.name).toBe('app');
    });
  });

  describe('export { ... } (named re-exports)', () => {
    it('should parse export { a, b } block', () => {
      const content = 'export { alpha, beta };';
      const result = parseExports(content, filePath);

      expect(result.symbols).toHaveLength(2);
      expect(result.symbols.map((s) => s.name)).toContain('alpha');
      expect(result.symbols.map((s) => s.name)).toContain('beta');
    });

    it('should handle "as" renaming in export { a as b }', () => {
      const content = 'export { foo as bar };';
      const result = parseExports(content, filePath);

      expect(result.symbols).toHaveLength(1);
      // The exported name (bar) is used because it's what consumers see
      expect(result.symbols[0].name).toBe('bar');
    });

    it('should handle "as default" exports', () => {
      const content = 'export { myFunc as default };';
      const result = parseExports(content, filePath);

      expect(result.symbols).toHaveLength(1);
      // When exported "as default", the original name is used for tracking
      expect(result.symbols[0].name).toBe('myFunc');
      expect(result.symbols[0].isDefault).toBe(true);
    });
  });

  describe('comments', () => {
    it('should ignore exports inside single-line comments', () => {
      const content = `
        // export function ignored(): void {}
        export function real(): void {}
      `;
      const result = parseExports(content, filePath);

      expect(result.symbols).toHaveLength(1);
      expect(result.symbols[0].name).toBe('real');
    });

    it('should ignore exports inside block comments', () => {
      const content = `
        /* export function ignored(): void {} */
        export function real(): void {}
      `;
      const result = parseExports(content, filePath);

      expect(result.symbols).toHaveLength(1);
      expect(result.symbols[0].name).toBe('real');
    });
  });

  describe('deduplication', () => {
    it('should not create duplicate symbols for the same export', () => {
      // A named export that appears only once should only appear once
      const content = 'export function unique(x: number): number { return x; }';
      const result = parseExports(content, filePath);

      expect(result.symbols).toHaveLength(1);
    });
  });

  describe('empty content', () => {
    it('should return empty symbols for empty content', () => {
      const result = parseExports('', filePath);
      expect(result.symbols).toHaveLength(0);
      expect(result.filePath).toBe(filePath);
    });

    it('should return empty symbols for content with no exports', () => {
      const content = `
        const internal = 42;
        function helper() {}
      `;
      const result = parseExports(content, filePath);
      expect(result.symbols).toHaveLength(0);
    });
  });
});

describe('diffExports', () => {
  describe('removed exports', () => {
    it('should detect a removed export function', () => {
      const base = 'export function foo(): void {}\nexport function bar(): void {}';
      const head = 'export function foo(): void {}';
      const result = diffExports('file.ts', base, head);

      expect(result.removed).toHaveLength(1);
      expect(result.removed[0].name).toBe('bar');
      expect(result.added).toHaveLength(0);
      expect(result.modified).toHaveLength(0);
    });

    it('should detect a removed class export', () => {
      const base = 'export class Foo {}\nexport class Bar {}';
      const head = 'export class Foo {}';
      const result = diffExports('file.ts', base, head);

      expect(result.removed).toHaveLength(1);
      expect(result.removed[0].name).toBe('Bar');
      expect(result.removed[0].kind).toBe('class');
    });

    it('should detect removal of all exports', () => {
      const base = 'export const A = 1;\nexport const B = 2;';
      const head = 'const A = 1;\nconst B = 2;';
      const result = diffExports('file.ts', base, head);

      expect(result.removed).toHaveLength(2);
      expect(result.added).toHaveLength(0);
    });
  });

  describe('added exports', () => {
    it('should detect an added export function', () => {
      const base = 'export function foo(): void {}';
      const head = 'export function foo(): void {}\nexport function baz(): void {}';
      const result = diffExports('file.ts', base, head);

      expect(result.added).toHaveLength(1);
      expect(result.added[0].name).toBe('baz');
      expect(result.removed).toHaveLength(0);
      expect(result.modified).toHaveLength(0);
    });

    it('should detect adding exports to an empty file', () => {
      const base = '';
      const head = 'export function newFunc(): string { return ""; }';
      const result = diffExports('file.ts', base, head);

      expect(result.added).toHaveLength(1);
      expect(result.added[0].name).toBe('newFunc');
      expect(result.removed).toHaveLength(0);
    });
  });

  describe('modified exports (signature changes)', () => {
    it('should detect a modified function signature', () => {
      const base = 'export function calc(a: number): number { return a; }';
      const head = 'export function calc(a: number, b: number): number { return a + b; }';
      const result = diffExports('file.ts', base, head);

      expect(result.modified).toHaveLength(1);
      expect(result.modified[0].before.name).toBe('calc');
      expect(result.modified[0].after.name).toBe('calc');
      expect(result.modified[0].before.signature).not.toBe(
        result.modified[0].after.signature,
      );
    });

    it('should detect a changed kind (const to variable)', () => {
      const base = 'export const value = 42;';
      const head = 'export let value = 42;';
      const result = diffExports('file.ts', base, head);

      expect(result.modified).toHaveLength(1);
      expect(result.modified[0].before.kind).toBe('const');
      expect(result.modified[0].after.kind).toBe('variable');
    });

    it('should detect a changed type annotation on a const', () => {
      const base = 'export const config: OldType = {};';
      const head = 'export const config: NewType = {};';
      const result = diffExports('file.ts', base, head);

      expect(result.modified).toHaveLength(1);
      expect(result.modified[0].before.signature).toBe('OldType');
      expect(result.modified[0].after.signature).toBe('NewType');
    });
  });

  describe('no changes', () => {
    it('should return empty arrays when exports are identical', () => {
      const content = `
        export function foo(a: number): number { return a; }
        export class Bar {}
        export interface Baz { x: number; }
      `;
      const result = diffExports('file.ts', content, content);

      expect(result.removed).toHaveLength(0);
      expect(result.added).toHaveLength(0);
      expect(result.modified).toHaveLength(0);
    });

    it('should return empty arrays for two empty files', () => {
      const result = diffExports('file.ts', '', '');

      expect(result.removed).toHaveLength(0);
      expect(result.added).toHaveLength(0);
      expect(result.modified).toHaveLength(0);
    });
  });

  describe('complex scenarios', () => {
    it('should handle simultaneous add, remove, and modify', () => {
      const base = `
        export function keep(): void {}
        export function remove(): void {}
        export function modify(a: string): string { return a; }
      `;
      const head = `
        export function keep(): void {}
        export function modify(a: string, b: string): string { return a + b; }
        export function added(): number { return 0; }
      `;
      const result = diffExports('file.ts', base, head);

      expect(result.removed).toHaveLength(1);
      expect(result.removed[0].name).toBe('remove');

      expect(result.added).toHaveLength(1);
      expect(result.added[0].name).toBe('added');

      expect(result.modified).toHaveLength(1);
      expect(result.modified[0].before.name).toBe('modify');
    });

    it('should differentiate default and named exports of same name', () => {
      const base = `
        export function foo(): void {}
        export default function foo(): void {}
      `;
      const head = `
        export function foo(): void {}
      `;
      const result = diffExports('file.ts', base, head);

      // The default foo is removed, the named foo remains
      expect(result.removed).toHaveLength(1);
      expect(result.removed[0].isDefault).toBe(true);
    });
  });
});
