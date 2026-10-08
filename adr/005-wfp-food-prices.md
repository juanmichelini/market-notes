# ADR-005: Use WFP food prices (via HDX) for non-traded staple foods

**Status:** Accepted
**Date:** 2026-10-08

## Context

Issue #2 tracks the ten most important staple foods. Maize, rice, wheat and soybeans have futures markets (Yahoo Finance) and IMF benchmark prices (FRED), and the US has BLS price series for sorghum, potatoes and sweet potatoes. Cassava, yams and plantain have none of these: they are not exchange-traded, barely grown in the US, and absent from FRED and Yahoo. Their prices matter most in local markets in Sub-Saharan Africa and Latin America.

Options considered: FAO GIEWS FPMA tool, WFP food prices on the Humanitarian Data Exchange (HDX), WFP DataBridges API, FEWS NET, national statistics offices.

## Decision

Add a third source, `wfp`: the World Food Programme's per-country food price datasets on HDX (`wfp-food-prices-for-<country>`). Each dataset is a single CSV of monthly, market-level prices. A manifest entry selects one series with a `wfp` query — `{ country, market, commodity, unit, pricetype }` — so each dataset is one **geographic price point** (one market), not a national aggregate.

## Rationale

- **Free and redistributable.** CC BY-IGO, no API key. Committing the derived CSVs to this repository is permitted with attribution (the frontend labels the source).
- **Broad coverage.** One adapter covers ~90 countries and the staples no other source has (cassava, gari, yams, plantain, sweet potatoes, sorghum), often back to the 2000s. The datasets already merge FAO GIEWS, FEWS NET and national sources.
- **Single market, not an aggregate.** Averaging across markets mixes changing sets of markets over time (composition bias) and is a statistical operation that would belong in `core/`. Selecting one well-covered market keeps the fetcher a pure filter and matches the "geographic point" framing of the staple-food issues.
- **WFP DataBridges** needs an API key and credentials management for the same data. **FAO FPMA** has no stable documented public API.

## Consequences

- `DatasetMeta.source` gains `"wfp"` and an optional `wfp: WfpQuery` field (present iff `source` is `"wfp"`). This is a manifest structure change, recorded here per ARCHITECTURE.md §7.
- WFP series are `seriesType: "index"` (one value per date) in **local currency** (`currency` is the ISO code, e.g. `CDF`, `NGN`, `COP`). Cross-country comparison needs FX conversion, which belongs in `core/` and is not part of this decision.
- Dates follow WFP's convention: the 15th of each month.
- Coverage is uneven: markets start, stop and have gaps, and WFP focuses on food-insecure regions. Each manifest entry's description names the market so the series is not mistaken for a national price.
- Country CSVs are large (up to ~40 MB); the adapter downloads each country once per run.
