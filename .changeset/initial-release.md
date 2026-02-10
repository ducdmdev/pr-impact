---
'@pr-impact/core': minor
'@pr-impact/cli': minor
'@pr-impact/mcp-server': minor
---

Initial release of pr-impact — static analysis for pull requests.

- Breaking change detection (removed exports, changed signatures, renamed exports)
- Import-dependency impact graph with blast radius mapping
- Test coverage gap analysis
- Documentation staleness checking
- Weighted risk scoring (6 factors, 0-100 scale)
- CLI with analyze, breaking, risk, impact, and comment commands
- MCP server exposing all analysis tools to AI assistants
