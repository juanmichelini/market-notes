# Architecture

This document describes the structure, principles, and design decisions of the market-notes monorepo. All contributors — human and automated — should read this document before modifying any module.

---

## 1. Principles

**Elegance over cleverness.** Code that reads clearly is preferable to code that is terse. A future contributor should be able to understand what a function does from its name, signature, and JSDoc alone, without tracing through implementation.

**Types as proofs.** TypeScript types are not just documentation — they are lightweight theorems about program behavior. Branded primitives (`ISODate`, `Ticker`) rule out entire classes of bugs at compile time. Readonly arrays and objects prevent accidental mutation. `exactOptionalPropertyTypes` prevents the `undefined`-as-presence confusion.

**Pure core.** The `core/` module contains no I/O, no side effects, and no mutable state. Every exported function is a pure transformation from typed inputs to typed outputs. This makes `core/` trivially testable and safe to use in any context (Node.js, browser, worker, test runner).

**No implicit cross-module dependencies.** Each module's dependency graph is explicit and unidirectional. `core` depends on nothing in this repo. `fetcher` depends on `core`. `frontend` depends on `core`. `fetcher` and `frontend` never depend on each other.

---

## 2. Module Map

| Module     | May Import                         | Must Not Import              |
|------------|------------------------------------|------------------------------|
| `core`     | TypeScript stdlib, no npm deps     | `fetcher`, `frontend`, Node built-ins, DOM APIs |
| `fetcher`  | `core`, Node built-ins, `yahoo-finance2`, `tsx` | `frontend`, DOM APIs |
| `frontend` | `core`, `d3`, SvelteKit, browser APIs | `fetcher`, Node built-ins |

---

## 3. Data Flow

```
Yahoo Finance API ─┐
                   ├─► fetcher/src/sources/  ─► PriceSeries / IndexSeries (typed)
FRED API ──────────┘         │
                             ▼
                    fetcher/src/writer.ts ─► data/prices/*.csv
                                          ─► data/indices/*.csv
                                          ─► data/manifest.json

                    (GitHub Actions runs fetcher nightly)

data/*.csv ──► frontend fetch() ──► parsePriceCSV / parseIndexCSV (core/io)
                                         │
                                         ▼
                              core/series.ts  ─► slicing, alignment, normalization
                              core/operations.ts ─► deflation, returns, rolling stats
                                         │
                                         ▼
                              D3.js ──► SVG charts in browser
```

The data files are committed to the repository and served as static assets alongside the compiled frontend. There is no backend server at runtime.

---

## 4. Core Contract

All operations in `core/` are pure functions over the `PriceSeries` and `IndexSeries` types defined in `core/src/types.ts`. The contract is:

- **No mutation.** Input series are never modified. All functions return new arrays.
- **No I/O.** No `fetch`, no `fs`, no `console.log`.
- **Invariant preservation.** Every function that returns a `PriceSeries` or `IndexSeries` must preserve the three invariants: (1) strictly ascending date order, (2) no duplicate dates, (3) all numeric fields finite or NaN — never ±Infinity.
- **Every export is documented.** Every exported function has a JSDoc comment that states its mathematical meaning, not merely its implementation. If a function computes a formula, that formula is written in the JSDoc.

The `core/` module is the authority on what financial operations mean. If a financial concept needs to be computed somewhere in the system, the computation belongs in `core/`, not in `fetcher/` or `frontend/`.

---

## 5. Data Format

See [ADR-001](./adr/001-csv-format.md) for the full rationale.

**Price series CSV** (`data/prices/<TICKER>.csv`):

```
date,open,high,low,close,volume,adj_close
2006-01-03,10.68,10.85,10.64,10.81,90070000,8.7532
```

Column order is a contract. Missing numeric values are represented as empty strings (never omitted columns). The header row is always present.

**Index series CSV** (`data/indices/<ID>.csv`):

```
date,value
2006-01-01,198.3
```

**Manifest** (`data/manifest.json`): a JSON object conforming to the `Manifest` type in `core/src/types.ts`. Lists every dataset with its ticker, name, description, currency, source, series type, start date, and relative file path.

---

## 6. Version Roadmap

| Version | Scope |
|---------|-------|
| **v0.1** | Daily OHLCV charts for all instruments; static SvelteKit frontend; GitHub Actions data refresh; core types, io, series operations. |
| **v1**   | Pattern recognition DSL in `core/`; extrapolation DSL (trend channels, support/resistance); pattern overlay rendering in D3. |
| **v2**   | Event annotation system: earnings dates, leadership changes, macro events; event markers on charts; annotation data format and fetcher. |

Issues are scoped to the current active version. Do not create v1 or v2 issues while v0.1 is incomplete. See CONTRIBUTING.md.

---

## 7. Working as an Agent

If you are an automated agent (LLM, CI bot, or similar) modifying this repository, follow this checklist before touching any file:

1. Read this document (`ARCHITECTURE.md`) and any relevant ADRs in `adr/`.
2. Never use `any` in TypeScript. Use `unknown` and narrow with type guards.
3. Never import across module boundaries as defined in the Module Map table above.
4. Write tests before implementing new functions in `core/`. Tests read as specifications.
5. Reference the GitHub issue number in every commit message (e.g. `fix(core): correct NaN handling in deflate (#12)`).
6. Do not reorder CSV columns. Column order is a breaking change per ADR-001.
7. Do not modify `data/manifest.json` structure without a corresponding ADR update.
