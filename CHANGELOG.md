# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial repository structure — monorepo scaffold, core types, fetcher adapters, SvelteKit frontend, GitHub Actions for scheduled data refresh.
- Price of a calorie (#106): `pricePerCalorie` and `cheapestCalorie` in `core/`, `toPricePerKg`, `majorCurrency` and `closeIndex` helpers, `data/nutrition.json`, optional `product`/`form`/`kgPerUnit` on manifest datasets (ADR-006), and a `/calories` page.
- Price map (#105): optional `location` on manifest datasets (ADR-007), `observationAt`, `daysBetween` and `toPricePerTonne` in `core/`, and a `/map` page with product picker, date slider and USD/tonne ↔ USD/1,000 kcal toggle.
- Map spread overlay (#105): `spreadPercent` in `core/` and a "Spread vs" reference-market selector on `/map` that recolours markers by their percentage spread over the reference.
- Rice markets (#105): six WFP rice series (Thailand, India, Bangladesh, Philippines, Indonesia, Pakistan) read in US dollars through the new optional `priceColumn: "usdprice"` on `WfpQuery` (ADR-005 addendum); the map skips datasets that fail to load; the nightly job commits the data that did fetch even if one series fails.
- Pattern recognition DSL (#153, ADR-008): fuzzy logic helpers, the pattern vocabulary (`Pattern`, `Instance`, `landmarks`), the primitives `bar`, `up`, `down`, `horizontal`, `resistanceLine` and `supportLine`, the combinators `constrainedBy`, `followedBy` and `overlay`, pivot segmentation, `findPatterns`, the named shapes hill, valley, head and shoulders (and inverse) and double top and bottom, `lineThrough`/`extendLine`, and `detectPatterns` in `core/`.
- Pattern detection page: `/patterns` runs a chosen formation on any price series, with swing-size, minimum-match and look-back controls, and `PatternChart` draws matches over the price line with the neckline continued as a dashed line.

