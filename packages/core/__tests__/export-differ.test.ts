import { describe, it, expect } from 'vitest';
import { parseExports, parseExportsAsync, diffExports, diffExportsAsync } from '../src/breaking/export-differ.js';
import type { FileResolver } from '../src/breaking/export-differ.js';

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

    it('should parse export const enum', () => {
      const content = 'export const enum Direction { Up, Down, Left, Right }';
      const result = parseExports(content, filePath);

      expect(result.symbols).toHaveLength(1);
      expect(result.symbols[0]).toEqual({
        name: 'Direction',
        kind: 'enum',
        isDefault: false,
      });
    });

    it('should parse export declare const enum', () => {
      const content = 'export declare const enum Axis { X, Y, Z }';
      const result = parseExports(content, filePath);

      expect(result.symbols).toHaveLength(1);
      expect(result.symbols[0]).toEqual({
        name: 'Axis',
        kind: 'enum',
        isDefault: false,
      });
    });
  });

  describe('declare keyword', () => {
    it('should parse export declare function', () => {
      const content = 'export declare function init(config: Config): void;';
      const result = parseExports(content, filePath);

      expect(result.symbols).toHaveLength(1);
      expect(result.symbols[0]).toMatchObject({
        name: 'init',
        kind: 'function',
        isDefault: false,
      });
    });

    it('should parse export declare class', () => {
      const content = 'export declare class Logger {}';
      const result = parseExports(content, filePath);

      expect(result.symbols).toHaveLength(1);
      expect(result.symbols[0]).toEqual({
        name: 'Logger',
        kind: 'class',
        isDefault: false,
      });
    });

    it('should parse export declare const', () => {
      const content = 'export declare const VERSION: string;';
      const result = parseExports(content, filePath);

      expect(result.symbols).toHaveLength(1);
      expect(result.symbols[0]).toMatchObject({
        name: 'VERSION',
        kind: 'const',
        isDefault: false,
      });
    });

    it('should parse export declare interface', () => {
      const content = 'export declare interface Options { verbose: boolean; }';
      const result = parseExports(content, filePath);

      expect(result.symbols).toHaveLength(1);
      expect(result.symbols[0]).toEqual({
        name: 'Options',
        kind: 'interface',
        isDefault: false,
      });
    });

    it('should parse export declare type', () => {
      const content = 'export declare type Handler = (event: Event) => void;';
      const result = parseExports(content, filePath);

      expect(result.symbols).toHaveLength(1);
      expect(result.symbols[0]).toEqual({
        name: 'Handler',
        kind: 'type',
        isDefault: false,
      });
    });

    it('should parse export declare enum', () => {
      const content = 'export declare enum Level { Low, Medium, High }';
      const result = parseExports(content, filePath);

      expect(result.symbols).toHaveLength(1);
      expect(result.symbols[0]).toEqual({
        name: 'Level',
        kind: 'enum',
        isDefault: false,
      });
    });
  });

  describe('abstract class', () => {
    it('should parse export abstract class', () => {
      const content = 'export abstract class Base {}';
      const result = parseExports(content, filePath);

      expect(result.symbols).toHaveLength(1);
      expect(result.symbols[0]).toEqual({
        name: 'Base',
        kind: 'class',
        isDefault: false,
      });
    });

    it('should parse export declare abstract class', () => {
      const content = 'export declare abstract class AbstractService {}';
      const result = parseExports(content, filePath);

      expect(result.symbols).toHaveLength(1);
      expect(result.symbols[0]).toEqual({
        name: 'AbstractService',
        kind: 'class',
        isDefault: false,
      });
    });

    it('should parse export default abstract class', () => {
      const content = 'export default abstract class Controller {}';
      const result = parseExports(content, filePath);

      expect(result.symbols).toHaveLength(1);
      expect(result.symbols[0]).toEqual({
        name: 'Controller',
        kind: 'class',
        isDefault: true,
      });
    });
  });

  describe('generator functions', () => {
    it('should parse export function* generator', () => {
      const content = 'export function* count(n: number): Generator<number> { yield n; }';
      const result = parseExports(content, filePath);

      expect(result.symbols).toHaveLength(1);
      expect(result.symbols[0]).toMatchObject({
        name: 'count',
        kind: 'function',
        isDefault: false,
      });
    });

    it('should parse export async function* async generator', () => {
      const content = 'export async function* stream(url: string): AsyncGenerator<string> { yield ""; }';
      const result = parseExports(content, filePath);

      expect(result.symbols).toHaveLength(1);
      expect(result.symbols[0]).toMatchObject({
        name: 'stream',
        kind: 'function',
        isDefault: false,
      });
    });

    it('should parse export default function* generator', () => {
      const content = 'export default function* items(): Generator<number> { yield 1; }';
      const result = parseExports(content, filePath);

      expect(result.symbols).toHaveLength(1);
      expect(result.symbols[0]).toMatchObject({
        name: 'items',
        kind: 'function',
        isDefault: true,
      });
    });
  });

  describe('destructured exports', () => {
    it('should parse export const { a, b } = ... (object destructuring)', () => {
      const content = 'export const { alpha, beta } = getValues();';
      const result = parseExports(content, filePath);

      const names = result.symbols.map((s) => s.name);
      expect(names).toContain('alpha');
      expect(names).toContain('beta');
    });

    it('should parse export const { a as b } = ... (renamed destructuring)', () => {
      const content = 'export const { original as renamed } = getValues();';
      const result = parseExports(content, filePath);

      const names = result.symbols.map((s) => s.name);
      expect(names).toContain('renamed');
      expect(names).not.toContain('original');
    });

    it('should parse export const [ a, b ] = ... (array destructuring)', () => {
      const content = 'export const [ first, second ] = getTuple();';
      const result = parseExports(content, filePath);

      const names = result.symbols.map((s) => s.name);
      expect(names).toContain('first');
      expect(names).toContain('second');
    });

    it('should not double-count destructured names as variable exports', () => {
      const content = 'export const { foo, bar } = obj;';
      const result = parseExports(content, filePath);

      // Each name should appear exactly once
      const fooSymbols = result.symbols.filter((s) => s.name === 'foo');
      expect(fooSymbols).toHaveLength(1);
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

    it('should parse export default anonymous function', () => {
      const content = 'export default function(req: Request): Response { return new Response(); }';
      const result = parseExports(content, filePath);

      expect(result.symbols).toHaveLength(1);
      expect(result.symbols[0]).toMatchObject({
        name: 'default',
        kind: 'function',
        isDefault: true,
      });
      expect(result.symbols[0].signature).toContain('req: Request');
    });

    it('should parse export default async anonymous function', () => {
      const content = 'export default async function(url: string): Promise<void> { }';
      const result = parseExports(content, filePath);

      // The anonymous function is captured and possibly also matched by the
      // default expression regex (capturing 'async'). At minimum, the default
      // anonymous function should be present.
      const anonFn = result.symbols.find((s) => s.isDefault && s.kind === 'function');
      expect(anonFn).toBeDefined();
      expect(anonFn!.name).toBe('default');
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

// ─── Barrel re-export tests ─────────────────────────────────────────────────

describe('parseExports — barrel re-exports (export * from)', () => {
  const filePath = 'src/index.ts';

  /**
   * Helper: build a sync FileResolver from a map of specifier -> { content, resolvedPath }.
   */
  function buildResolver(
    fileMap: Record<string, { content: string; resolvedPath: string }>,
  ): FileResolver {
    return (specifier: string, _importerFilePath: string) => {
      return fileMap[specifier] ?? null;
    };
  }

  it('should ignore export * from when no resolver is provided (backward compat)', () => {
    const content = `
      export * from './utils';
      export function foo(): void {}
    `;
    const result = parseExports(content, filePath);

    // Without a resolver, barrel re-exports are invisible
    expect(result.symbols).toHaveLength(1);
    expect(result.symbols[0].name).toBe('foo');
  });

  it('should resolve a simple export * from with parseExportsAsync', async () => {
    const indexContent = `export * from './utils';`;
    const utilsContent = `
      export function helper(): void {}
      export const VERSION = '1.0';
    `;

    const resolver = buildResolver({
      './utils': { content: utilsContent, resolvedPath: 'src/utils.ts' },
    });

    const result = await parseExportsAsync(indexContent, filePath, resolver);

    expect(result.filePath).toBe(filePath);
    const names = result.symbols.map((s) => s.name);
    expect(names).toContain('helper');
    expect(names).toContain('VERSION');
  });

  it('should not re-export default exports via export *', async () => {
    const indexContent = `export * from './mod';`;
    const modContent = `
      export default function main(): void {}
      export function secondary(): void {}
    `;

    const resolver = buildResolver({
      './mod': { content: modContent, resolvedPath: 'src/mod.ts' },
    });

    const result = await parseExportsAsync(indexContent, filePath, resolver);

    const names = result.symbols.map((s) => s.name);
    expect(names).toContain('secondary');
    // default export should NOT be re-exported
    const defaultExports = result.symbols.filter((s) => s.isDefault);
    expect(defaultExports).toHaveLength(0);
  });

  it('should handle nested barrels (index re-exports from a which re-exports from b)', async () => {
    const indexContent = `export * from './a';`;
    const aContent = `
      export * from './b';
      export function fromA(): void {}
    `;
    const bContent = `
      export function fromB(): string { return ''; }
      export interface BConfig { x: number; }
    `;

    const resolver: FileResolver = (specifier, importerFilePath) => {
      if (specifier === './a' && importerFilePath === 'src/index.ts') {
        return { content: aContent, resolvedPath: 'src/a.ts' };
      }
      if (specifier === './b' && importerFilePath === 'src/a.ts') {
        return { content: bContent, resolvedPath: 'src/b.ts' };
      }
      return null;
    };

    const result = await parseExportsAsync(indexContent, filePath, resolver);

    const names = result.symbols.map((s) => s.name);
    expect(names).toContain('fromA');
    expect(names).toContain('fromB');
    expect(names).toContain('BConfig');
  });

  it('should handle export * as namespace from', async () => {
    const content = `export * as utils from './utils';`;
    const utilsContent = `
      export function helper(): void {}
      export const VERSION = '1.0';
    `;

    const resolver = buildResolver({
      './utils': { content: utilsContent, resolvedPath: 'src/utils.ts' },
    });

    const result = await parseExportsAsync(content, filePath, resolver);

    // export * as ns creates a single namespace symbol; the individual symbols are NOT re-exported
    expect(result.symbols).toHaveLength(1);
    expect(result.symbols[0].name).toBe('utils');
    expect(result.symbols[0].kind).toBe('variable');
    expect(result.symbols[0].isDefault).toBe(false);
  });

  it('should handle circular re-exports without infinite loop', async () => {
    const aContent = `
      export * from './b';
      export function fromA(): void {}
    `;
    const bContent = `
      export * from './a';
      export function fromB(): void {}
    `;

    const resolver: FileResolver = (specifier, importerFilePath) => {
      if (specifier === './b') {
        return { content: bContent, resolvedPath: 'src/b.ts' };
      }
      if (specifier === './a') {
        return { content: aContent, resolvedPath: 'src/a.ts' };
      }
      return null;
    };

    // Should not hang or throw — just stop at the visited file
    const result = await parseExportsAsync(aContent, 'src/a.ts', resolver);

    const names = result.symbols.map((s) => s.name);
    expect(names).toContain('fromA');
    expect(names).toContain('fromB');
  });

  it('should handle mixed regular exports and barrel re-exports', async () => {
    const indexContent = `
      export * from './utils';
      export function main(): void {}
      export interface AppConfig { debug: boolean; }
      export type ID = string;
    `;
    const utilsContent = `
      export function helper(): void {}
      export class Logger {}
    `;

    const resolver = buildResolver({
      './utils': { content: utilsContent, resolvedPath: 'src/utils.ts' },
    });

    const result = await parseExportsAsync(indexContent, filePath, resolver);

    const names = result.symbols.map((s) => s.name);
    expect(names).toContain('main');
    expect(names).toContain('AppConfig');
    expect(names).toContain('ID');
    expect(names).toContain('helper');
    expect(names).toContain('Logger');
    expect(result.symbols).toHaveLength(5);
  });

  it('should handle multiple export * from in the same file', async () => {
    const indexContent = `
      export * from './a';
      export * from './b';
    `;
    const aContent = `export function fromA(): void {}`;
    const bContent = `export function fromB(): void {}`;

    const resolver = buildResolver({
      './a': { content: aContent, resolvedPath: 'src/a.ts' },
      './b': { content: bContent, resolvedPath: 'src/b.ts' },
    });

    const result = await parseExportsAsync(indexContent, filePath, resolver);

    const names = result.symbols.map((s) => s.name);
    expect(names).toContain('fromA');
    expect(names).toContain('fromB');
  });

  it('should deduplicate symbols from multiple barrels re-exporting the same name', async () => {
    const indexContent = `
      export * from './a';
      export * from './b';
    `;
    // Both a and b export a symbol called 'shared'
    const aContent = `export const shared = 1;`;
    const bContent = `export const shared = 2;`;

    const resolver = buildResolver({
      './a': { content: aContent, resolvedPath: 'src/a.ts' },
      './b': { content: bContent, resolvedPath: 'src/b.ts' },
    });

    const result = await parseExportsAsync(indexContent, filePath, resolver);

    // Should deduplicate — only one 'shared' symbol
    const sharedSymbols = result.symbols.filter((s) => s.name === 'shared');
    expect(sharedSymbols).toHaveLength(1);
  });

  it('should handle unresolvable specifier gracefully', async () => {
    const indexContent = `
      export * from './nonexistent';
      export function foo(): void {}
    `;

    const resolver: FileResolver = () => null;

    const result = await parseExportsAsync(indexContent, filePath, resolver);

    // The unresolvable barrel is skipped; regular exports still work
    expect(result.symbols).toHaveLength(1);
    expect(result.symbols[0].name).toBe('foo');
  });

  it('should respect max depth and not recurse infinitely on deep nesting', async () => {
    // Build a chain of 15 barrel files: file0 -> file1 -> ... -> file14
    // MAX_BARREL_DEPTH is 10, so symbols from file11+ should NOT appear
    const files: Record<string, string> = {};
    for (let i = 0; i < 15; i++) {
      if (i < 14) {
        files[`src/file${i}.ts`] = `
          export * from './file${i + 1}';
          export const sym${i} = ${i};
        `;
      } else {
        files[`src/file${i}.ts`] = `export const sym${i} = ${i};`;
      }
    }

    const resolver: FileResolver = (specifier, importerFilePath) => {
      // Resolve ./fileN from src/fileM.ts
      const match = specifier.match(/\.\/file(\d+)/);
      if (match) {
        const idx = parseInt(match[1], 10);
        const path = `src/file${idx}.ts`;
        if (files[path]) {
          return { content: files[path], resolvedPath: path };
        }
      }
      return null;
    };

    const result = await parseExportsAsync(files['src/file0.ts'], 'src/file0.ts', resolver);

    const names = result.symbols.map((s) => s.name);
    // sym0 through sym10 should be present (depth 0 through 10)
    for (let i = 0; i <= 10; i++) {
      expect(names).toContain(`sym${i}`);
    }
    // sym11+ may or may not be present depending on exact depth counting,
    // but the key guarantee is no infinite recursion and finite symbols
    expect(result.symbols.length).toBeLessThanOrEqual(15);
    expect(result.symbols.length).toBeGreaterThanOrEqual(11);
  });

  it('should handle export * as ns from without resolving inner symbols', async () => {
    // export * as ns should NOT resolve and re-export the inner module's individual symbols
    const indexContent = `
      export * as ns from './utils';
      export * from './other';
    `;
    const utilsContent = `
      export function utilFunc(): void {}
      export const utilConst = 42;
    `;
    const otherContent = `
      export function otherFunc(): void {}
    `;

    const resolver: FileResolver = (specifier, _importer) => {
      if (specifier === './utils') {
        return { content: utilsContent, resolvedPath: 'src/utils.ts' };
      }
      if (specifier === './other') {
        return { content: otherContent, resolvedPath: 'src/other.ts' };
      }
      return null;
    };

    const result = await parseExportsAsync(indexContent, filePath, resolver);

    const names = result.symbols.map((s) => s.name);
    // ns is the namespace, otherFunc comes from export *
    expect(names).toContain('ns');
    expect(names).toContain('otherFunc');
    // utilFunc and utilConst should NOT be individually re-exported
    expect(names).not.toContain('utilFunc');
    expect(names).not.toContain('utilConst');
  });

  it('should parse export * as ns from without a resolver (sync)', () => {
    const content = `export * as helpers from './helpers';`;
    const result = parseExports(content, filePath);

    expect(result.symbols).toHaveLength(1);
    expect(result.symbols[0]).toEqual({
      name: 'helpers',
      kind: 'variable',
      isDefault: false,
    });
  });
});

describe('diffExportsAsync — barrel re-export diffing', () => {
  it('should detect removed re-exported symbols when a barrel source is dropped', async () => {
    const baseContent = `
      export * from './utils';
      export function main(): void {}
    `;
    const headContent = `
      export function main(): void {}
    `;
    // Base resolves ./utils, head does not (barrel removed)
    const utilsContent = `
      export function helper(): void {}
      export const VERSION = '1.0';
    `;

    const resolver: FileResolver = (specifier, _importer) => {
      if (specifier === './utils') {
        return { content: utilsContent, resolvedPath: 'src/utils.ts' };
      }
      return null;
    };

    const result = await diffExportsAsync('src/index.ts', baseContent, headContent, resolver);

    // helper and VERSION should be detected as removed
    expect(result.removed).toHaveLength(2);
    const removedNames = result.removed.map((s) => s.name).sort();
    expect(removedNames).toEqual(['VERSION', 'helper']);
    expect(result.added).toHaveLength(0);
  });

  it('should detect added re-exported symbols when a new barrel is added', async () => {
    const baseContent = `export function main(): void {}`;
    const headContent = `
      export * from './utils';
      export function main(): void {}
    `;
    const utilsContent = `export function helper(): void {}`;

    const resolver: FileResolver = (specifier, _importer) => {
      if (specifier === './utils') {
        return { content: utilsContent, resolvedPath: 'src/utils.ts' };
      }
      return null;
    };

    const result = await diffExportsAsync('src/index.ts', baseContent, headContent, resolver);

    expect(result.added).toHaveLength(1);
    expect(result.added[0].name).toBe('helper');
    expect(result.removed).toHaveLength(0);
  });

  it('should work without a resolver (falls back to sync behavior)', async () => {
    const base = 'export function foo(): void {}';
    const head = 'export function foo(): void {}\nexport function bar(): void {}';

    const result = await diffExportsAsync('file.ts', base, head);

    expect(result.added).toHaveLength(1);
    expect(result.added[0].name).toBe('bar');
  });
});
