# Contributing

This document describes the philosophy, rules, and style guide for contributing to market-notes. Both human contributors and automated agents must follow these guidelines.

---

## 1. Philosophy

**Academic rigor in `core/`, pragmatic efficiency in `fetcher/` and `frontend/`.**

The `core/` module is the mathematical heart of the system. It should read like a well-written academic paper: each function is preceded by prose that explains what it computes and why, followed by a clean, minimal implementation. A reader who does not know TypeScript should be able to understand the mathematical meaning of every exported function from its JSDoc alone.

The `fetcher/` and `frontend/` modules are not held to the same literary standard, but they must be correct, well-typed, and must call into `core/`'s typed API rather than reimplementing any financial logic themselves.

---

## 2. For Agents

Before touching any file, an automated agent must complete this checklist:

- [ ] Read `ARCHITECTURE.md` fully.
- [ ] Read any ADRs in `adr/` that relate to your change.
- [ ] Identify which module(s) your change affects.
- [ ] Confirm your change does not cross module boundaries (see Module Rules below).
- [ ] Confirm you are not using `any` anywhere.
- [ ] If touching `core/`, write or update tests in `core/tests/` first.
- [ ] Reference the GitHub issue number in your commit message.
- [ ] Confirm you are not reordering CSV columns.
- [ ] Confirm your change is in scope for the current active version.

---

## 3. Module Rules

| Module     | May Import                                        | Forbidden Imports                          |
|------------|---------------------------------------------------|--------------------------------------------|
| `core`     | TypeScript standard library only (no npm, no Node)| Anything from `fetcher`, `frontend`, `fs`, `fetch`, DOM |
| `fetcher`  | `@market-notes/core`, Node built-ins, `yahoo-finance2`, `tsx` | Anything from `frontend`; DOM APIs |
| `frontend` | `@market-notes/core`, `d3`, SvelteKit, browser APIs | Anything from `fetcher`; Node built-ins (`fs`, `path`, etc.) |

Violations of these rules are bugs, not style issues.

---

## 4. Core Style Guide

**Every exported function in `core/` must have a JSDoc comment that states its mathematical meaning**, not merely a description of what it does in code. The comment should be readable by someone who does not know TypeScript.

The literate style means: prose first, code second. Before the function definition, there is a paragraph (or more) explaining the concept. The implementation then makes the concept concrete.

Example of correct style:

```typescript
/**
 * Computes the simple (arithmetic) moving average of a scalar series
 * over a window of `w` consecutive observations.
 *
 * For a series x₁, x₂, ..., xₙ and window w, the moving average at
 * position t (where t ≥ w) is:
 *
 *   SMA(t, w) = (1/w) × Σᵢ₌ₜ₋ w₊₁ᵗ xᵢ
 *
 * For positions t < w, the value is NaN (insufficient history).
 * The output series has the same length as the input.
 *
 * @param series - The input scalar series, sorted in ascending date order.
 * @param window - The number of observations to average. Must be ≥ 1.
 */
export function rollingMean(series: IndexSeries, window: number): IndexSeries { ... }
```

Example of incorrect style (do not write this):

```typescript
/** Calculates rolling mean */
export function rollingMean(...) { ... }
```

---

## 5. CSV Discipline

The column order of CSV files is a contract, not a convention. Reordering columns is a breaking change that requires an ADR update and a major version bump.

**Price CSV column order (fixed):**
```
date,open,high,low,close,volume,adj_close
```

**Index CSV column order (fixed):**
```
date,value
```

Missing values are represented as empty strings. A missing value column must never be omitted — all rows must have the same number of columns as the header. The header row is always present on line 1. Lines beginning with `#` are comments and are ignored by parsers. Blank lines are ignored.

---

## 6. Commit Format

Commits must follow the format:

```
type(scope): message
```

Where `type` is one of: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `ci`.

Where `scope` is one of: `core`, `fetcher`, `frontend`, `data`, `ci`, `docs`.

Include the GitHub issue number when applicable:

```
feat(core): add rollingStdDev to operations.ts (#7)
fix(fetcher): handle missing adjClose from yahoo-finance2 (#12)
chore(data): update market data 2024-03-15
```

---

## 7. Issue Scope

Issues are scoped to the current active version only. While v0.1 is active:

- Do not open issues labeled for v1 or v2.
- Do not implement v1 features (pattern DSL, extrapolation) in a v0.1 PR.
- Do not implement v2 features (event annotations) in a v0.1 PR.

When v0.1 is complete and tagged, the maintainer will open v1 scope.

---

## 8. Testing

All functions exported from `core/` must have tests in `core/tests/`. Tests are written with Vitest and must read as specifications of the function's behavior, not just as regression guards.

A good test has:
- A description that states a property of the function (e.g. "returns NaN for the first row" not "test case 1").
- A small, self-contained fixture (3–5 rows is sufficient for most series operations).
- A single assertion per `it` block where possible.

Tests for `core/` are run with `pnpm test` from the repo root. All tests must pass before a PR is merged.
