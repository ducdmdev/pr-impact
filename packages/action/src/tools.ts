import {
  gitDiff,
  readFileAtRef,
  listChangedFiles,
  searchCode,
  findImporters,
  listTestFiles,
} from '@pr-impact/tools-core';

export async function executeTool(name: string, input: Record<string, unknown>): Promise<string> {
  switch (name) {
    case 'git_diff': {
      const result = await gitDiff(input as unknown as Parameters<typeof gitDiff>[0]);
      return result.diff;
    }
    case 'read_file_at_ref': {
      const result = await readFileAtRef(input as unknown as Parameters<typeof readFileAtRef>[0]);
      return result.content;
    }
    case 'list_changed_files': {
      const result = await listChangedFiles(input as unknown as Parameters<typeof listChangedFiles>[0]);
      return JSON.stringify(result, null, 2);
    }
    case 'search_code': {
      const result = await searchCode(input as unknown as Parameters<typeof searchCode>[0]);
      return JSON.stringify(result, null, 2);
    }
    case 'find_importers': {
      const result = await findImporters(input as unknown as Parameters<typeof findImporters>[0]);
      return JSON.stringify(result, null, 2);
    }
    case 'list_test_files': {
      const result = await listTestFiles(input as unknown as Parameters<typeof listTestFiles>[0]);
      return JSON.stringify(result, null, 2);
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
