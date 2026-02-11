# @pr-impact/tools-core

Pure tool handler functions for git and repository operations. This is the shared foundation used by both the MCP server (`@pr-impact/tools`) and the GitHub Action (`@pr-impact/action`).

## Tools

| Function | Description |
|---|---|
| `gitDiff` | Get raw git diff between two refs, optionally for a single file |
| `readFileAtRef` | Read a file's content at a specific git ref (branch/commit/tag) |
| `listChangedFiles` | List changed files between two refs with status and addition/deletion stats |
| `searchCode` | Search for a regex pattern across the codebase via `git grep` |
| `findImporters` | Find all source files that import a given module (session-cached) |
| `listTestFiles` | Find test files associated with a source file using naming conventions |

## Usage

```typescript
import { gitDiff, listChangedFiles, findImporters } from '@pr-impact/tools-core';

const diff = await gitDiff({ base: 'main', head: 'feature-branch', file: 'src/index.ts' });
const files = await listChangedFiles({ base: 'main', head: 'feature-branch' });
const consumers = await findImporters({ modulePath: 'src/utils/parser.ts' });
```

All functions accept an optional `repoPath` parameter (defaults to `process.cwd()`).

## License

[MIT](../../LICENSE)
