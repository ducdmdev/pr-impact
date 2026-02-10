# Analysis Pipeline

The `analyzePR()` function in `packages/core/src/analyzer.ts` is the top-level orchestrator. It runs a six-step pipeline that produces a complete `PRAnalysis` result.

---

## Pipeline Overview

```mermaid
flowchart TD
    START([analyzePR called]) --> RESOLVE[1. Resolve branches]
    RESOLVE --> VERIFY[2. Verify repository]
    VERIFY --> PARSE[3. Parse git diff]
    PARSE --> PARALLEL

    subgraph PARALLEL["4. Parallel analysis (Promise.all)"]
        direction LR
        BC["Breaking change<br/>detection"]
        TC["Test coverage<br/>analysis"]
        DS["Doc staleness<br/>checking"]
        IG["Impact graph<br/>building"]
    end

    PARALLEL --> RISK[5. Calculate risk score]
    RISK --> SUMMARY[6. Generate summary]
    SUMMARY --> RESULT([Return PRAnalysis])

    style START fill:#4f46e5,color:#fff
    style RESULT fill:#4f46e5,color:#fff
    style PARALLEL fill:#f0f9ff,stroke:#0891b2
    style BC fill:#dc2626,color:#fff
    style TC fill:#059669,color:#fff
    style DS fill:#ca8a04,color:#fff
    style IG fill:#7c3aed,color:#fff
    style RISK fill:#e11d48,color:#fff
```

---

## Step-by-Step Breakdown

### Step 1 -- Resolve Branches

The base branch defaults to `main` or `master` (auto-detected from local branches). The head branch defaults to `HEAD`. Both can be overridden via `AnalysisOptions`.

### Step 2 -- Verify Repository

Uses `simple-git` to confirm:
- The path is a valid git repository (`git.checkIsRepo()`)
- The base branch ref is valid (`git.revparse([baseBranch])`)
- The head branch ref is valid (`git.revparse([headBranch])`)

### Step 3 -- Parse Diff

`parseDiff()` calls `git.diffSummary()` (via simple-git) between base and head, then categorizes each changed file (source, test, doc, config, other).

### Step 4 -- Parallel Analysis

Four independent analyses run concurrently. Each can be individually skipped via options (`skipBreaking`, `skipCoverage`, `skipDocs`):

| Analysis | Function | Skippable | What it produces |
|---|---|---|---|
| Breaking changes | `detectBreakingChanges()` | Yes | `BreakingChange[]` |
| Test coverage | `checkTestCoverage()` | Yes | `TestCoverageReport` |
| Doc staleness | `checkDocStaleness()` | Yes | `DocStalenessReport` |
| Impact graph | `buildImpactGraph()` | No | `ImpactGraph` |

### Step 5 -- Calculate Risk

`calculateRisk()` evaluates six weighted factors from the combined results and produces a 0-100 score with a severity level.

### Step 6 -- Generate Summary

A human-readable summary string is built from the results (file count, additions/deletions, risk level, breaking change count, coverage gaps).

---

## Sequence Diagram

```mermaid
sequenceDiagram
    participant User
    participant CLI as pri CLI
    participant Analyzer as analyzePR()
    participant Git as simple-git
    participant Diff as parseDiff()
    participant Breaking as detectBreakingChanges()
    participant Coverage as checkTestCoverage()
    participant Docs as checkDocStaleness()
    participant Impact as buildImpactGraph()
    participant Risk as calculateRisk()
    participant Output as formatMarkdown()

    User->>CLI: pri analyze [base] [head]
    CLI->>Analyzer: analyzePR(options)

    Note over Analyzer: Step 1 — Resolve branches
    Analyzer->>Git: git.branch()
    Git-->>Analyzer: branch list

    Note over Analyzer: Step 2 — Verify repo
    Analyzer->>Git: checkIsRepo()
    Analyzer->>Git: revparse(base)
    Analyzer->>Git: revparse(head)

    Note over Analyzer: Step 3 — Parse diff
    Analyzer->>Diff: parseDiff(repo, base, head)
    Diff->>Git: git.diffSummary()
    Git-->>Diff: diff summary
    Diff-->>Analyzer: ChangedFile[]

    Note over Analyzer: Step 4 — Parallel analysis
    par Breaking changes
        Analyzer->>Breaking: detectBreakingChanges(...)
        Breaking->>Git: git show (base/head file content)
        Breaking-->>Analyzer: BreakingChange[]
    and Test coverage
        Analyzer->>Coverage: checkTestCoverage(...)
        Coverage-->>Analyzer: TestCoverageReport
    and Doc staleness
        Analyzer->>Docs: checkDocStaleness(...)
        Docs->>Git: git show (file content)
        Docs-->>Analyzer: DocStalenessReport
    and Impact graph
        Analyzer->>Impact: buildImpactGraph(...)
        Impact-->>Analyzer: ImpactGraph
    end

    Note over Analyzer: Step 5 — Risk scoring
    Analyzer->>Risk: calculateRisk(all results)
    Risk-->>Analyzer: RiskAssessment

    Note over Analyzer: Step 6 — Summary
    Analyzer-->>CLI: PRAnalysis
    CLI->>Output: formatMarkdown(analysis)
    Output-->>CLI: Markdown string
    CLI-->>User: Report output
```

---

## Skip Behavior

When an analysis step is skipped, `analyzePR()` returns a neutral default:

| Step | Default when skipped |
|---|---|
| Breaking changes | Empty array `[]` |
| Test coverage | `{ changedSourceFiles: 0, sourceFilesWithTestChanges: 0, coverageRatio: 0, gaps: [] }` |
| Doc staleness | `{ staleReferences: [], checkedFiles: [] }` |

The impact graph is always built (not skippable) because it feeds into the risk score and provides the blast radius view.

---

## Entry Points

The pipeline is invoked from three surfaces:

```mermaid
graph LR
    CLI["pri CLI<br/>(Commander)"] --> A["analyzePR()"]
    MCP["MCP Server<br/>(stdio)"] --> A
    API["Programmatic<br/>import"] --> A

    style A fill:#4f46e5,color:#fff
    style CLI fill:#059669,color:#fff
    style MCP fill:#d97706,color:#fff
    style API fill:#6b7280,color:#fff
```

- **CLI** -- `pri analyze` command calls `analyzePR()` then formats output.
- **MCP Server** -- `analyze_diff` tool calls `analyzePR()` and returns a Markdown-formatted report.
- **Programmatic API** -- direct import from `@pr-impact/core`.
