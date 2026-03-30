# ADR-002: Use pnpm workspaces for monorepo management

**Status:** Accepted
**Date:** 2024-01-01

## Context

The repository contains three logically distinct packages — `core`, `fetcher`, and `frontend` — that need to share types and utilities without publishing to npm. Options considered: pnpm workspaces, Turborepo, Nx, Lerna, plain npm workspaces.

## Decision

pnpm workspaces with no build orchestrator (no Turborepo, no Nx).

## Rationale

- Three packages do not justify the complexity of a build orchestrator. Turborepo and Nx provide value at 10+ packages with complex dependency graphs; at three packages, they add configuration overhead without meaningful benefit.
- The `workspace:*` protocol in pnpm gives clean local linking: `@market-notes/core` is available in `fetcher` and `frontend` as a first-class local dependency, with TypeScript source maps intact.
- A single lockfile (`pnpm-lock.yaml`) at the root ensures deterministic installs across all packages.
- `pnpm -r run typecheck` runs typechecking across all packages in dependency order.

## Consequences

- All packages share one lockfile. A dependency upgrade in one package may surface conflicts in another, which is a feature (visibility) not a bug.
- `pnpm --filter <package> run <script>` is the idiom for targeting a single package's scripts.
- `pnpm -r run typecheck` is the canonical full-repo typecheck command; it is run in CI on every pull request.
