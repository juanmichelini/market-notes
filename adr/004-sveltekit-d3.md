# ADR-004: Use SvelteKit with adapter-static and D3.js for the frontend

**Status:** Accepted
**Date:** 2024-01-01

## Context

We need a frontend that can display interactive financial charts. Options considered for the framework: SvelteKit, Next.js, Astro, plain Vite + HTML. Options considered for charting: D3.js, Chart.js, Recharts, Observable Plot, Highcharts.

## Decision

SvelteKit with `@sveltejs/adapter-static` (zero-backend static deployment). D3.js for all chart rendering.

## Rationale

**SvelteKit static:**
- A static deployment (no server) is correct for a data visualization app where all data is pre-fetched and committed. There is no need for a runtime server.
- SvelteKit's file-based routing, component model, and TypeScript support make it productive.
- `adapter-static` produces a `build/` directory that can be deployed to GitHub Pages, Netlify, or any static host with zero configuration.

**D3.js:**
- D3 gives full geometric control over SVG rendering. This is essential for v1 pattern overlays (trend channels, support/resistance lines drawn precisely over price bars) and v2 event annotations (custom markers with tooltips at specific dates).
- Higher-level wrapper libraries (Recharts, Chart.js) abstract away the SVG coordinate system. At v1 and v2, those abstractions would become obstacles that require workarounds.
- The investment in learning D3's scale and line generators pays dividends throughout the roadmap.
- D3's `scaleTime`, `scaleLinear`, and `line` primitives are sufficient for all v0.1 requirements.

## Consequences

- Chart components are written in Svelte with D3 SVG manipulation. The Svelte reactivity system handles re-rendering when data or container size changes.
- Data files are served as static assets alongside the compiled app. The frontend loads them via `fetch('/data/...')` at runtime.
- No server-side rendering of chart data is needed or performed.
- D3 is a peer dependency of `@market-notes/frontend` only; it must not be imported in `core/` or `fetcher/`.
