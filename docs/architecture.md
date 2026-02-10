# Architecture

pr-impact is a TypeScript monorepo that performs static analysis on pull requests. It is managed with **pnpm** workspaces and **Turborepo**.

---

## Monorepo Layout

```
pr-impact/
├── packages/
│   ├── core/           @pr-impact/core
│   ├── cli/            @pr-impact/cli
│   └── mcp-server/     @pr-impact/mcp-server
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

## Package Dependency Graph

```mermaid
graph TD
    CLI["@pr-impact/cli<br/><i>Commander CLI</i>"]
    MCP["@pr-impact/mcp-server<br/><i>MCP stdio server</i>"]
    CORE["@pr-impact/core<br/><i>Analysis engine</i>"]

    CLI -->|workspace:*| CORE
    MCP -->|workspace:*| CORE

    style CORE fill:#4f46e5,color:#fff,stroke:#3730a3
    style CLI fill:#059669,color:#fff,stroke:#047857
    style MCP fill:#d97706,color:#fff,stroke:#b45309
```

Both `cli` and `mcp-server` depend on `core` via pnpm `workspace:*` links. The `core` package has zero internal workspace dependencies.

---

## Build Pipeline (Turborepo)

```mermaid
graph LR
    subgraph "pnpm build"
        B_CORE["build @pr-impact/core"] --> B_CLI["build @pr-impact/cli"]
        B_CORE --> B_MCP["build @pr-impact/mcp-server"]
    end

    subgraph "pnpm test"
        B_CORE --> T["vitest (core only)"]
    end

    style B_CORE fill:#4f46e5,color:#fff
    style B_CLI fill:#059669,color:#fff
    style B_MCP fill:#d97706,color:#fff
    style T fill:#7c3aed,color:#fff
```

- `build` depends on `^build` (dependency packages build first).
- `test` depends on `build` completing.
- All packages use **tsup** for bundling (ESM format, sourcemaps). The `core` package also generates TypeScript declarations (`dts: true`).

---

## Core Package Module Organization

```mermaid
graph TD
    TYPES["types.ts<br/><i>All shared interfaces</i>"]
    INDEX["index.ts<br/><i>Barrel exports (public API)</i>"]
    ANALYZER["analyzer.ts<br/><b>analyzePR()</b><br/>orchestrator"]

    subgraph "Diff Layer"
        DP["diff-parser.ts<br/>parseDiff()"]
        FC["file-categorizer.ts<br/>categorizeFile()"]
    end

    subgraph "Breaking Change Layer"
        DET["detector.ts<br/>detectBreakingChanges()"]
        ED["export-differ.ts<br/>parseExports() / diffExports()"]
        SD["signature-differ.ts<br/>diffSignatures()"]
    end

    subgraph "Coverage Layer"
        CC["coverage-checker.ts<br/>checkTestCoverage()"]
        TM["test-mapper.ts<br/>mapTestFiles()"]
    end

    subgraph "Docs Layer"
        SC["staleness-checker.ts<br/>checkDocStaleness()"]
    end

    subgraph "Impact Layer"
        IG["impact-graph.ts<br/>buildImpactGraph()"]
    end

    subgraph "Risk Layer"
        RC["risk-calculator.ts<br/>calculateRisk()"]
        RF["factors.ts<br/>6 factor evaluators"]
    end

    subgraph "Output Layer"
        MR["markdown-reporter.ts<br/>formatMarkdown()"]
        JR["json-reporter.ts<br/>formatJSON()"]
    end

    INDEX --> ANALYZER
    INDEX --> DP
    INDEX --> DET
    INDEX --> CC
    INDEX --> SC
    INDEX --> IG
    INDEX --> RC
    INDEX --> MR
    INDEX --> JR
    ANALYZER --> DP
    DP --> FC
    ANALYZER --> DET
    DET --> ED
    DET --> SD
    ANALYZER --> CC
    CC --> TM
    ANALYZER --> SC
    ANALYZER --> IG
    ANALYZER --> RC
    RC --> RF

    style TYPES fill:#374151,color:#fff
    style INDEX fill:#374151,color:#fff
    style ANALYZER fill:#4f46e5,color:#fff
    style DP fill:#0891b2,color:#fff
    style FC fill:#0891b2,color:#fff
    style DET fill:#dc2626,color:#fff
    style ED fill:#dc2626,color:#fff
    style SD fill:#dc2626,color:#fff
    style CC fill:#059669,color:#fff
    style TM fill:#059669,color:#fff
    style SC fill:#ca8a04,color:#fff
    style IG fill:#7c3aed,color:#fff
    style RC fill:#e11d48,color:#fff
    style RF fill:#e11d48,color:#fff
    style MR fill:#6b7280,color:#fff
    style JR fill:#6b7280,color:#fff
```

---

## Key External Dependencies

| Package | Dependency | Purpose |
|---|---|---|
| `core` | `simple-git` | Git operations (diff, rev-parse, show, branch) |
| `core` | `fast-glob` | File discovery for test mapping and import scanning |
| `cli` | `commander` | CLI argument parsing and subcommands |
| `cli` | `chalk` | Terminal color output |
| `cli` | `ora` | Spinner for long-running operations |
| `mcp-server` | `@modelcontextprotocol/sdk` | MCP protocol server implementation |
| `mcp-server` | `zod` | Input schema validation for MCP tools |

---

## Design Principles

- **ESM only** -- all packages use `"type": "module"` with `.js` extensions in import paths.
- **Strict TypeScript** -- `tsconfig.base.json` sets `"strict": true`, target ES2022.
- **Barrel exports** -- the public API is defined in `packages/core/src/index.ts`.
- **Regex-based parsing** -- export and import detection use regex, not AST parsing.
- **Parallel analysis** -- `analyzePR()` runs 4 analysis steps concurrently via `Promise.all`.
- **No I/O in core** except git operations through `simple-git` and file reads through `fast-glob` / `fs/promises`.
