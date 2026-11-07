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
- Same-market staples (#105, #106): thirteen WFP retail series in four markets that price several foods side by side (Niarela in Mali, Maradi in Niger, Nyawera in DR Congo, Gitega in Burundi), nutrition entries for maize, wheat and cassava flour and sweet potatoes, and an "In one market" comparison on `/calories`. Data arrives with the next data update.
- Price stage on the map (#105): `priceStage` in `core/` names a dataset's stage (exchange, export, wholesale, retail, national) from its location and WFP price type, and `/map` draws one stage at a time by default, with a warning when stages are mixed.

