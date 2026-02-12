---
id: c3-4
c3-version: 4
title: skill
type: container
boundary: app
parent: c3-0
goal: Provide the /pr-impact slash command for interactive Claude Code analysis
summary: Claude Code plugin assembled from shared templates; no runtime dependencies
---

# skill

## Goal

Provide the `/pr-impact` slash command for interactive Claude Code analysis. Users invoke the skill directly in Claude Code for branch-level PR impact analysis with conversational follow-up.

## Responsibilities

- Define Claude Code plugin metadata (name, description, skills)
- Register the MCP tools server for tool access during analysis
- Assemble the skill prompt from shared templates at build time
- Accept optional base/head branch arguments

## Complexity Assessment

**Level:** trivial
**Why:** No runtime code — entirely static files assembled at build time. The skill prompt is a concatenation of system-prompt.md and report-template.md with a YAML frontmatter header.

## Components

| ID | Name | Category | Status | Goal Contribution |
|----|------|----------|--------|-------------------|
| c3-401 | plugin-config | foundation | implemented | Plugin metadata and MCP server registration |
| c3-410 | skill-prompt | feature | implemented | Assembled analysis prompt defining the /pr-impact experience |
