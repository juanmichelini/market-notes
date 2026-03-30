# ADR-003: Use Yahoo Finance and FRED as data sources

**Status:** Accepted
**Date:** 2024-01-01

## Context

We need reliable, free, programmatically accessible sources for (1) daily OHLCV data for equities and commodity futures, and (2) US CPI data for real-price deflation. Options considered for equities: Yahoo Finance (yahoo-finance2), Alpha Vantage, Polygon.io, Quandl. Options considered for CPI: FRED, BLS direct API, TIP ETF (a CPI-linked ETF as a proxy).

## Decision

`yahoo-finance2` npm package for all traded instruments (equities and futures). FRED public API (series `CPIAUCSL`) for US CPI.

## Rationale

- Both sources are free with no subscription required (FRED requires a free API key; Yahoo Finance requires none).
- FRED is the authoritative source for US CPI, sourced directly from the Bureau of Labor Statistics. Using CPI from FRED is methodologically correct and academically defensible.
- Using a CPI proxy ETF (e.g. TIP) would introduce tracking error, fund expenses, and market-price noise into what should be a clean macroeconomic deflator. TIP is not CPI.
- `yahoo-finance2` is a well-maintained TypeScript-native client for Yahoo Finance with typed responses. It handles rate limiting and cookie management internally.
- The two sources require two fetcher adapters, which is captured in the clean source separation: `fetcher/src/sources/yahoo.ts` and `fetcher/src/sources/fred.ts`.

## Consequences

- Two distinct data types emerge naturally from these sources: `PriceSeries` (OHLCV, from Yahoo) and `IndexSeries` (scalar, from FRED). This type distinction is encoded in `core/src/types.ts` and prevents passing CPI data where OHLCV is expected.
- The FRED API key must be stored as a GitHub Actions secret (`FRED_API_KEY`) and as a local environment variable for development.
- If Yahoo Finance changes its undocumented API (as it has historically), `fetcher/src/sources/yahoo.ts` is the only file that needs updating.
