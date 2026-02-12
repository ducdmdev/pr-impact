---
id: c3-310
c3-version: 4
title: Agentic Client
type: component
category: feature
parent: c3-3
goal: Anthropic API agentic loop with safety limits
summary: 30-iteration max, 180s timeout, temperature 0, parallel tool execution via Promise.all
---

# Agentic Client

## Goal

Anthropic API agentic loop with safety limits. Drives the Claude conversation that performs the 6-step analysis methodology, executing tool calls as Claude requests them.

## Container Connection

Core analysis engine. Without this, there is no AI-driven analysis — it orchestrates the Claude API conversation that produces the final report.

## Dependencies

| Direction | What | From/To |
|-----------|------|---------|
| IN (uses) | `SYSTEM_PROMPT`, `REPORT_TEMPLATE` | c3-301 (template-embedding) |
| IN (uses) | `TOOL_DEFS` | c3-101 (tool-definitions) |
| IN (uses) | `executeTool()` | c3-311 (tool-dispatcher) |
| IN (uses) | `@anthropic-ai/sdk` | External: Anthropic API |
| OUT (provides) | `runAnalysis()` returning final report string | c3-313 (action-entrypoint) |

## Behavior

- Builds Anthropic tool definitions from TOOL_DEFS (maps to `input_schema` format)
- Runs iterative message loop: send messages → get response → execute tools → append results → repeat
- **Stop conditions**: `end_turn` stop reason, no tool_use blocks, iteration limit (30), wall-clock timeout (180s)
- **Parallel execution**: All tool_use blocks in a single response executed concurrently via `Promise.all`
- **repoPath injection**: Clones tool input via spread to add repoPath without mutating conversation history
- **Graceful degradation**: On timeout/iteration limit, returns whatever text output is available; throws if no text was ever produced
- **Empty-output guard**: Throws `'Analysis completed without producing a report'` if Claude finishes without generating any text, preventing empty PR comments

## Code References

| File | Purpose |
|------|---------|
| `packages/action/src/client.ts` | `runAnalysis()`, `AnalysisOptions`, `TOOL_DEFINITIONS` (119 lines) |
