# ADR-006: Product metadata and a nutrition table for comparing staples

**Status:** Accepted
**Date:** 2026-10-09

## Context

Issue #104 asks to compare prices across products, markets and time. Issue #106 asks for the price of a calorie. The staple series in the manifest are quoted per bushel, per hundredweight, per tonne, per pound or per 2.5 kg pack, in dollars, US cents or local currency, for grain, paddy, flour or fresh roots. Nothing in `DatasetMeta` records any of this beyond the free-text description and the currency code, so the unit of a quote cannot be read by code.

## Decision

1. `DatasetMeta` gains three optional fields, set only for food series quoted as a price per unit of mass:
   - `product`: the staple (`"rice"`, `"maize"`, ...).
   - `form`: the form it is priced in (`"rough"`, `"grain"`, `"flour"`, ...).
   - `kgPerUnit`: kilograms in the unit the quote is per.
2. A new committed data file, `data/nutrition.json`, gives for each (`product`, `form`) its energy density (`kcalPer100g`, of the edible food) and `edibleFraction` (edible mass ÷ purchased mass), with a `source` and a `status` (`issue` for values taken from the table in issue #106, `estimate` for approximate values still to be checked).
3. `core/src/nutrition.ts` holds the conversion (`pricePerCalorie`, `cheapestCalorie`) and `core/src/units.ts` gains `toPricePerKg` and `majorCurrency`. The frontend and fetcher call these and do not reimplement them.

## Rationale

- Putting the unit in the manifest makes the unit of every series machine-readable and keeps conversions in `core/`, per ARCHITECTURE.md §4.
- Energy density and edible fraction depend on the *form* a food is priced in (rough versus milled rice differs by the milling yield), so the table is keyed by product and form, not product alone.
- `kgPerUnit` is stored as a number rather than a unit name so that unusual packs (a WFP quote "per 2.5 KG") need no new code.
- A data file rather than constants in code keeps the sources cited next to the numbers and lets them be corrected without a code change.

## Consequences

- This is a manifest structure change, recorded here per ARCHITECTURE.md §7. The new fields are optional, so existing readers are unaffected, and the fetcher passes unknown fields through unchanged when it rewrites the manifest.
- Series quoted as an index (the BLS sorghum and sweet potato PPIs) have no unit price and carry none of the new fields.
- Price per calorie is currency-agnostic. Comparing across currencies still needs FX conversion (`convertCurrency`) and an FX series, which is not part of this decision.
- Entries marked `estimate` in `data/nutrition.json` are approximate; the page marks them.
