import { PRAnalysis } from '../types.js';

/**
 * Format a PRAnalysis result as a pretty-printed JSON string.
 */
export function formatJSON(analysis: PRAnalysis): string {
  return JSON.stringify(analysis, null, 2);
}
