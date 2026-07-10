---
name: soap-calc-development
description: Use when changing Soap Calc monorepo code, tests, workspace scripts, Vite React UI, TypeScript core math, Railway build config, package boundaries, or npm workspace behavior.
---

# Soap Calc Development

## Overview

Soap Calc is an npm-workspaces monorepo. Read `AGENTS.md` for full project instructions, then use this short workflow for implementation tasks.

## Workflow

1. Run commands from the repo root: `/Users/str/soap-calc`.
2. Keep the patch minimal. Avoid drive-by refactors and metadata churn.
3. Respect package boundaries: `@soap-calc/core` is pure math, `@soap-calc/oils-data` owns generated oil data, and `@soap-calc/web` owns the React UI.
4. Use existing TypeScript, React, Vite, and workspace patterns before adding abstractions.
5. Keep recipe state local-only unless the task explicitly changes persistence.
6. Keep secrets out of code and commits. `.env` is gitignored.
7. Do not auto-commit or auto-push unless the user asks.

## Commands

Use package-scoped tests when the change is narrow:

```bash
npm run test -w @soap-calc/core
npm run test -w @soap-calc/oils-data
npm run test -w @soap-calc/web
```

Before finishing, run:

```bash
npm test
```

For web build verification:

```bash
npm run build:web
```
