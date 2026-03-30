# ADR-001: Use CSV for price data with JSON manifest

**Status:** Accepted
**Date:** 2024-01-01

## Context

We need a format for daily OHLCV data. Options considered: CSV, JSON, NDJSON, Parquet.

## Decision

CSV for all time series rows. JSON for the manifest (metadata registry).

## Rationale

- Clean git diffs: one line = one trading day
- Universal tooling: parseable in any language without libraries
- Industry standard for OHLCV data (Bloomberg, Yahoo Finance, Quandl all export CSV)
- Self-description gap is fully covered by `manifest.json` + per-file schema comments

## Consequences

- Column order is a contract — changing it is a breaking change (see CONTRIBUTING.md)
- Missing values represented as empty string, never omitted columns
- Header row is always present
