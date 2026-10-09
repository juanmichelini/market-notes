# ADR-007: Dataset locations and the price map

**Status:** Accepted
**Date:** 2026-10-09

## Context

Issue #105 asks for a map of one product's price at every market we track, on a chosen date. For that, every dataset needs a place. Today a dataset's location exists only in its name and description ("Lubumbashi", "US Gulf"). Issue #104 lists this as a shared prerequisite for comparing prices across space and time.

## Decision

1. `DatasetMeta` gains an optional `location: MarketLocation` with `country` (ISO 3166-1 alpha-3), `place`, `lat`, `lon` and a `scope`:
   - `exchange`: a futures contract, placed at the exchange it trades on;
   - `port`: an export (FOB) benchmark, placed at the port region;
   - `market`: a price observed in one local market (the WFP series);
   - `national`: a national average, placed at a representative point.
2. `core/src/markets.ts` gives the price at a date with its provenance: `observationAt(series, date, maxStaleDays?)` returns the latest observation on or before the date together with the date it was observed and its age in days. `daysBetween` is the calendar-day difference it uses.
3. `core/src/units.ts` gains `toPricePerTonne`, the common footing for comparing markets of one product.
4. The frontend adds a `/map` route that draws one marker per located dataset with d3-geo (no new dependency, per ADR-004), coloured by price on a sequential scale, with a product picker, a date slider with play, and a toggle between USD per tonne and USD per 1,000 kcal (ADR-006).
5. Country outlines are loaded from the optional file `frontend/static/geo/countries.geojson`. The map draws a graticule and the markers without it.

## Rationale

- `scope` is recorded because a futures price is a reference price for a delivery region, not a measurement taken at the exchange's address. A map that placed it at Chicago without saying so would overstate what the point means.
- Returning the observation date and age, rather than only a filled value, lets the interface show how stale a carried-forward monthly price is, as asked in #105. A missing latest value yields no price instead of silently reusing an older one.
- Only dollar-quoted series can share the colour scale until an exchange-rate series exists. Others are drawn hollow with their local-currency quote, so they are visible but not compared.
- Country outlines are optional so that the map does not depend on a new package: adding one requires changing `package.json` and the lockfile. Issue #105 suggests `world-atlas` TopoJSON, which needs `topojson-client` to decode; committing GeoJSON converted from it avoids both.

## Consequences

- This is a manifest structure change, recorded here per ARCHITECTURE.md §7. The new field is optional, and the fetcher passes unknown fields through unchanged.
- Rice currently has only one located series (CBOT rough rice), so the "rice with three or more markets" criterion of #105 depends on the per-market rice issues (#27–#34).
- Cross-currency comparison of local-currency series needs FX series and `convertCurrency`; it is not part of this decision.
