# ADR-008: Pattern recognition DSL

**Status:** Accepted
**Date:** 2026-11-07

## Context

ARCHITECTURE.md lists a "pattern recognition DSL in `core/`" and an "extrapolation DSL (trend channels, support/resistance)" as the v1 roadmap. Epic #153 breaks that work into one-point issues. This ADR fixes the design so that those issues agree on vocabulary.

Two papers describe languages for chart patterns:

- **CPL**, Anand, Chin and Khoo, *Charting Patterns on Price History*, ICFP 2001. A domain-specific language embedded in Haskell. Patterns are built from six primitives (bar, up, down, horizontal, resistance line, support line) with three combinators: constrained-by, followed-by and overlay. Subjective definitions use fuzzy truth values, and every match carries a score. The paper gives set-theoretic semantics and proves that followed-by and overlay are associative.
- **FCPL**, Zhu, Wan and Si, *A Language for Financial Chart Patterns*, International Journal of Information Technology & Decision Making, 2018. A standalone notation specified in EBNF, with curved primitives, volume rules, segmentation by perceptually important points (PIPs) and an evaluation on index data.

## Decision

1. **The DSL is a set of pure TypeScript functions in `core/`.** There is no parser and no second language. Patterns are values built with function calls, so the type checker validates them and the module rules of ARCHITECTURE.md hold: no I/O, no npm dependencies, no `any`.
2. **Vocabulary.**
   - `Bar` is an index into a `PriceSeries`. Dates stay inside the series; `Date` objects are not used.
   - `Fuzzy` is a truth value in [0, 1].
   - An `Instance` is one occurrence of a pattern: its landmarks (the bars that anchor its shape), its components (the instances it is built from) and a `Fuzzy` score. Instances are immutable.
   - A `Pattern` is a pure function from a series and a bar interval to the list of instances lying entirely inside that interval, in ascending order of (first landmark, last landmark).
3. **Primitives** are those of CPL: `bar`, `up`, `down`, `horizontal`, `resistanceLine`, `supportLine`.
4. **Combinators** are those of CPL, with the same meaning:
   - `constrainedBy(p, constraint)` keeps the instances of `p` whose constraints hold to a non-zero degree, and lowers the score to the minimum of the old score and the constraints. It never adds instances.
   - `followedBy(p, q)` joins an instance of `p` to one of `q` at a single bar. The score is the minimum of the two.
   - `overlay(p, q)` joins instances that span exactly the same interval. The score is the minimum of the two.
   Both `followedBy` and `overlay` are associative.
5. **Fuzzy logic** follows CPL: conjunction is the minimum, disjunction the maximum, negation 1 - x. Comparisons use a triangular membership function with an explicit width. A missing value (NaN) is unknown, never 0: it makes a comparison NaN, and a constraint that evaluates to NaN removes the instance.
6. **Borrowed from FCPL** (each its own issue in the epic): curved primitives, volume as a constrainable quantity, PIP segmentation to ignore small fluctuations, and detection counts on the bundled datasets as an evaluation.
7. **Not adopted from FCPL:** the standalone textual notation. It could later be added as a front end that produces `Pattern` values, without changing the core.
8. **Extrapolation** (trend lines, extension of support and resistance, channels) is geometry over landmarks and lives next to the patterns in `core/`. It describes where a line would be if continued; it makes no forecast.
9. **Rendering** is the frontend's job and uses only the output of `core/`. No pattern logic is duplicated in `frontend/`.

## Rationale

- CPL's operators have clean algebraic properties, which suit the "types as proofs" and "composability" principles of ARCHITECTURE.md. The properties become tests: associativity of `followedBy` and `overlay`, and the filter behaviour of `constrainedBy`.
- Fuzzy scores answer the problem both papers start from: pattern definitions are subjective. Instead of one threshold chosen for everyone, each instance carries how well it matches, and the caller decides the cutoff.
- A function from interval to instances, rather than a predicate on a window, lets combinators share work and makes the sorted-merge optimisation of CPL (section 8) possible later.
- FCPL's notation targets people who do not program. This repository's audience writes TypeScript, so the extra language would add a parser without adding expressive power.

## Consequences

- CPL relies on lazy evaluation and type classes. The TypeScript version uses plain arrays first and explicit comparator functions; laziness can be introduced where measurements show it is needed (see the sorted-merge issue in the epic).
- The six primitives are defined here with exact geometry in each issue. Where CPL leaves a choice open (which line is "the" resistance line of an interval), the issue states the choice.
- CONTRIBUTING.md section 7 reserves v1 for after v0.1 is tagged. Epic #153 and this ADR were opened at the maintainer's request while the CHANGELOG still lists everything under Unreleased; the maintainer decides when to treat v1 as active.
- Adding the pattern types to `core/src/index.ts` is an additive change to the public API of `core`; no CSV or manifest structure changes.
