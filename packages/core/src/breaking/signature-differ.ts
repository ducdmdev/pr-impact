/**
 * Compare function/method signatures between two versions of a symbol.
 *
 * Signatures are expected in the form: `(param1: Type1, param2: Type2): ReturnType`
 * This module performs structural comparison by splitting parameters and return types.
 */

/**
 * Normalize whitespace in a signature fragment for consistent comparison.
 */
function normalize(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Split a parameter list string into individual parameters, respecting
 * nested angle brackets, parentheses, and square brackets so that
 * generics like `Map<string, number>` are not split on the inner comma.
 */
function splitParameters(paramStr: string): string[] {
  const params: string[] = [];
  let depth = 0;
  let current = '';

  for (const ch of paramStr) {
    if (ch === '<' || ch === '(' || ch === '[' || ch === '{') {
      depth++;
      current += ch;
    } else if (ch === '>' || ch === ')' || ch === ']' || ch === '}') {
      depth--;
      current += ch;
    } else if (ch === ',' && depth === 0) {
      const trimmed = current.trim();
      if (trimmed) params.push(trimmed);
      current = '';
    } else {
      current += ch;
    }
  }

  const trimmed = current.trim();
  if (trimmed) params.push(trimmed);

  return params;
}

/**
 * Extract the parameter list and return type from a signature string.
 *
 * Input:  `(a: string, b: number): boolean`
 * Output: { params: ['a: string', 'b: number'], returnType: 'boolean' }
 */
function parseSignature(sig: string): {
  params: string[];
  returnType: string | null;
} {
  const trimmed = normalize(sig);

  // Find the matching closing paren for the opening paren
  if (!trimmed.startsWith('(')) {
    return { params: [], returnType: null };
  }

  let depth = 0;
  let closeIndex = -1;

  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) {
        closeIndex = i;
        break;
      }
    }
  }

  if (closeIndex === -1) {
    // Malformed signature — treat entire string as params
    return { params: splitParameters(trimmed.slice(1)), returnType: null };
  }

  const paramStr = trimmed.slice(1, closeIndex);
  const params = paramStr.length > 0 ? splitParameters(paramStr) : [];

  // Everything after `)` should be `: ReturnType`
  const rest = trimmed.slice(closeIndex + 1).trim();
  let returnType: string | null = null;

  if (rest.startsWith(':')) {
    returnType = normalize(rest.slice(1));
  }

  return { params, returnType };
}

/**
 * Extract just the type portion from a parameter declaration.
 * `name: Type` → `Type`
 * `name?: Type` → `Type`
 * `...name: Type` → `Type`
 * If there's no `:`, returns the raw parameter string.
 */
function extractParamType(param: string): string {
  // Handle rest parameters
  const cleaned = param.replace(/^\.\.\./, '').trim();

  // Find the colon that separates name from type (not inside angle brackets etc.)
  let depth = 0;
  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (ch === '<' || ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === '>' || ch === ')' || ch === ']' || ch === '}') depth--;
    else if (ch === ':' && depth === 0) {
      return normalize(cleaned.slice(i + 1));
    }
  }

  return normalize(cleaned);
}

export interface SignatureDiffResult {
  changed: boolean;
  details: string;
}

/**
 * Compare two function/method signatures and produce a human-readable
 * description of what changed.
 *
 * @param baseSig - The signature from the base (old) version, e.g. `(a: string): void`
 * @param headSig - The signature from the head (new) version
 * @returns An object with `changed` (boolean) and `details` (string describing the change)
 */
export function diffSignatures(
  baseSig: string | undefined,
  headSig: string | undefined,
): SignatureDiffResult {
  // Both undefined → no signature to compare
  if (baseSig === undefined && headSig === undefined) {
    return { changed: false, details: 'no signatures to compare' };
  }

  // One exists, other doesn't
  if (baseSig === undefined) {
    return { changed: true, details: 'signature added' };
  }
  if (headSig === undefined) {
    return { changed: true, details: 'signature removed' };
  }

  // Quick equality check after normalization
  const normalizedBase = normalize(baseSig);
  const normalizedHead = normalize(headSig);

  if (normalizedBase === normalizedHead) {
    return { changed: false, details: 'signatures are identical' };
  }

  // Parse both signatures for structural comparison
  const baseParsed = parseSignature(normalizedBase);
  const headParsed = parseSignature(normalizedHead);

  const differences: string[] = [];

  // Compare parameter counts
  const baseCount = baseParsed.params.length;
  const headCount = headParsed.params.length;

  if (baseCount !== headCount) {
    differences.push(
      `parameter count changed from ${baseCount} to ${headCount}`,
    );
  }

  // Compare individual parameter types (up to the smaller count)
  const minCount = Math.min(baseCount, headCount);
  for (let i = 0; i < minCount; i++) {
    const baseType = extractParamType(baseParsed.params[i]);
    const headType = extractParamType(headParsed.params[i]);

    if (baseType !== headType) {
      const baseName = baseParsed.params[i].split(':')[0].replace(/[?.]/g, '').trim();
      differences.push(
        `parameter '${baseName}' type changed from '${baseType}' to '${headType}'`,
      );
    }
  }

  // Compare return types
  const baseReturn = baseParsed.returnType;
  const headReturn = headParsed.returnType;

  if (baseReturn !== headReturn) {
    if (baseReturn === null) {
      differences.push(`return type added: '${headReturn}'`);
    } else if (headReturn === null) {
      differences.push(`return type removed (was '${baseReturn}')`);
    } else {
      differences.push(
        `return type changed from '${baseReturn}' to '${headReturn}'`,
      );
    }
  }

  if (differences.length === 0) {
    // The normalized strings differ but our structural comparison didn't catch it;
    // report a generic change.
    return { changed: true, details: 'signature changed' };
  }

  return { changed: true, details: differences.join('; ') };
}
