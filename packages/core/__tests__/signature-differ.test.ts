import { describe, it, expect } from 'vitest';
import { diffSignatures, SignatureDiffResult } from '../src/breaking/signature-differ.js';

describe('diffSignatures', () => {
  // ── Identical signatures ──────────────────────────────────────────────────

  describe('identical signatures', () => {
    it('should report no change for identical simple signatures', () => {
      const result = diffSignatures('(a: string): void', '(a: string): void');
      expect(result.changed).toBe(false);
      expect(result.details).toBe('signatures are identical');
    });

    it('should report no change when only extra inner whitespace differs', () => {
      const result = diffSignatures(
        '(a:  string,  b:  number):  void',
        '(a: string, b: number): void',
      );
      expect(result.changed).toBe(false);
      expect(result.details).toBe('signatures are identical');
    });

    it('should report no change for empty parameter lists', () => {
      const result = diffSignatures('(): void', '(): void');
      expect(result.changed).toBe(false);
    });
  });

  // ── Parameter count changes ───────────────────────────────────────────────

  describe('different parameter count', () => {
    it('should detect added parameter', () => {
      const result = diffSignatures(
        '(a: string): void',
        '(a: string, b: number): void',
      );
      expect(result.changed).toBe(true);
      expect(result.details).toContain('parameter count changed from 1 to 2');
    });

    it('should detect removed parameter', () => {
      const result = diffSignatures(
        '(a: string, b: number): void',
        '(a: string): void',
      );
      expect(result.changed).toBe(true);
      expect(result.details).toContain('parameter count changed from 2 to 1');
    });

    it('should detect going from no parameters to some', () => {
      const result = diffSignatures('(): void', '(x: number): void');
      expect(result.changed).toBe(true);
      expect(result.details).toContain('parameter count changed from 0 to 1');
    });

    it('should detect going from some parameters to none', () => {
      const result = diffSignatures('(x: number): void', '(): void');
      expect(result.changed).toBe(true);
      expect(result.details).toContain('parameter count changed from 1 to 0');
    });
  });

  // ── Parameter type changes ────────────────────────────────────────────────

  describe('different parameter types', () => {
    it('should detect a changed parameter type', () => {
      const result = diffSignatures(
        '(name: string): void',
        '(name: number): void',
      );
      expect(result.changed).toBe(true);
      expect(result.details).toContain("parameter 'name' type changed");
      expect(result.details).toContain("'string'");
      expect(result.details).toContain("'number'");
    });

    it('should detect multiple parameter type changes', () => {
      const result = diffSignatures(
        '(a: string, b: number): void',
        '(a: boolean, b: string): void',
      );
      expect(result.changed).toBe(true);
      expect(result.details).toContain("parameter 'a' type changed");
      expect(result.details).toContain("parameter 'b' type changed");
    });

    it('should not report unchanged parameters', () => {
      const result = diffSignatures(
        '(a: string, b: number): void',
        '(a: string, b: boolean): void',
      );
      expect(result.changed).toBe(true);
      // Only b changed
      expect(result.details).toContain("parameter 'b' type changed");
      expect(result.details).not.toContain("parameter 'a' type changed");
    });
  });

  // ── Return type changes ───────────────────────────────────────────────────

  describe('different return types', () => {
    it('should detect a changed return type', () => {
      const result = diffSignatures(
        '(a: string): string',
        '(a: string): number',
      );
      expect(result.changed).toBe(true);
      expect(result.details).toContain("return type changed from 'string' to 'number'");
    });

    it('should detect return type added', () => {
      const result = diffSignatures(
        '(a: string)',
        '(a: string): void',
      );
      expect(result.changed).toBe(true);
      expect(result.details).toContain("return type added: 'void'");
    });

    it('should detect return type removed', () => {
      const result = diffSignatures(
        '(a: string): void',
        '(a: string)',
      );
      expect(result.changed).toBe(true);
      expect(result.details).toContain("return type removed (was 'void')");
    });
  });

  // ── Undefined signatures ──────────────────────────────────────────────────

  describe('undefined signatures', () => {
    it('should report no change when both are undefined', () => {
      const result = diffSignatures(undefined, undefined);
      expect(result.changed).toBe(false);
      expect(result.details).toBe('no signatures to compare');
    });

    it('should report change when base is undefined and head is defined', () => {
      const result = diffSignatures(undefined, '(x: number): void');
      expect(result.changed).toBe(true);
      expect(result.details).toBe('signature added');
    });

    it('should report change when base is defined and head is undefined', () => {
      const result = diffSignatures('(x: number): void', undefined);
      expect(result.changed).toBe(true);
      expect(result.details).toBe('signature removed');
    });
  });

  // ── Complex signatures ────────────────────────────────────────────────────

  describe('complex signatures', () => {
    it('should handle generic types correctly (no false split on inner commas)', () => {
      const result = diffSignatures(
        '(map: Map<string, number>): void',
        '(map: Map<string, number>): void',
      );
      expect(result.changed).toBe(false);
    });

    it('should detect changes in generic type parameters', () => {
      const result = diffSignatures(
        '(items: Array<string>): void',
        '(items: Array<number>): void',
      );
      expect(result.changed).toBe(true);
      expect(result.details).toContain("parameter 'items' type changed");
    });

    it('should handle optional parameters', () => {
      const result = diffSignatures(
        '(a: string, b?: number): void',
        '(a: string, b?: number): void',
      );
      expect(result.changed).toBe(false);
    });

    it('should handle rest parameters', () => {
      const result = diffSignatures(
        '(...args: string[]): void',
        '(...args: number[]): void',
      );
      expect(result.changed).toBe(true);
    });

    it('should handle Promise return types', () => {
      const result = diffSignatures(
        '(url: string): Promise<Response>',
        '(url: string): Promise<string>',
      );
      expect(result.changed).toBe(true);
      expect(result.details).toContain('return type changed');
    });

    it('should handle combined parameter and return type changes', () => {
      const result = diffSignatures(
        '(a: string): number',
        '(a: boolean): string',
      );
      expect(result.changed).toBe(true);
      expect(result.details).toContain("parameter 'a' type changed");
      expect(result.details).toContain('return type changed');
    });
  });

  // ── Untyped parameters ──────────────────────────────────────────────────

  describe('untyped parameters', () => {
    it('should compare untyped params by raw parameter string', () => {
      // a and b are untyped - extractParamType returns the raw name as the "type"
      const result = diffSignatures(
        '(a, b): void',
        '(a, c): void',
      );
      expect(result.changed).toBe(true);
      // b -> c changed (param at index 1)
      expect(result.details).toContain("parameter 'b' type changed");
    });

    it('should report no change for identical untyped params', () => {
      const result = diffSignatures(
        '(a, b): void',
        '(a, b): void',
      );
      expect(result.changed).toBe(false);
    });
  });

  // ── Generic signature change fallback ──────────────────────────────────

  describe('generic signature change', () => {
    it('should report generic signature changed when structural comparison finds no specific differences', () => {
      // These signatures differ textually after normalization but the
      // structural comparison (param types, return type) finds the same values.
      // This triggers the "signature changed" fallback at line 210-211.
      const result = diffSignatures(
        '(a: string):void',
        '(a : string): void',
      );
      expect(result.changed).toBe(true);
      expect(result.details).toBe('signature changed');
    });

    it('should handle malformed signature without opening paren', () => {
      const result = diffSignatures('noParens', '(a: string): void');
      expect(result.changed).toBe(true);
    });
  });

  // ── Return type interface ─────────────────────────────────────────────────

  describe('SignatureDiffResult interface', () => {
    it('should always return an object with changed and details', () => {
      const result: SignatureDiffResult = diffSignatures('(): void', '(): void');
      expect(result).toHaveProperty('changed');
      expect(result).toHaveProperty('details');
      expect(typeof result.changed).toBe('boolean');
      expect(typeof result.details).toBe('string');
    });
  });
});
