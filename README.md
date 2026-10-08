# market-notes

> Open-source financial market data, analysis, and visualization

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

---

## Overview

market-notes is a monorepo for collecting, processing, and visualizing historical financial market data. It tracks equities, commodity futures, and macroeconomic indices from 2006 to the present, with a focus on correctness, reproducibility, and academic rigor in the core analysis layer.

Data is fetched nightly via GitHub Actions, stored as plain CSV files under version control, and served through a static SvelteKit frontend with D3-based charts.

---

## Instruments

| Ticker   | Name                                        | Source        | From |
|----------|---------------------------------------------|---------------|------|
| AAPL     | Apple Inc.                                  | Yahoo Finance | 2006 |
| GOOGL    | Alphabet Inc.                               | Yahoo Finance | 2006 |
| KO       | Coca-Cola Co.                               | Yahoo Finance | 2006 |
| PEP      | PepsiCo Inc.                                | Yahoo Finance | 2006 |
| GC=F     | Gold Futures                                | Yahoo Finance | 2006 |
| CL=F     | WTI Crude Oil                               | Yahoo Finance | 2006 |
| ZC=F     | Corn Futures (CBOT, US cents/bushel)        | Yahoo Finance | 2000 |
| PMAIZMTUSDM | Maize, US Gulf export price (USD/t, monthly) | FRED       | 1992 |
| ZR=F     | Rough Rice Futures (CBOT, USD/cwt)          | Yahoo Finance | 1999 |
| ZW=F     | Wheat Futures, SRW (CBOT, US cents/bushel)  | Yahoo Finance | 2000 |
| KE=F     | Wheat Futures, KC HRW (CBOT, US cents/bushel) | Yahoo Finance | 2000 |
| PWHEAMTUSDM | Wheat, IMF global price (USD/t, monthly)  | FRED          | 1992 |
| ZS=F     | Soybean Futures (CBOT, US cents/bushel)     | Yahoo Finance | 2000 |
| PSOYBUSDM | Soybeans, IMF global price (USD/t, monthly) | FRED         | 1992 |
| WPU012205 | Sorghum, US producer price index (Dec 1991=100, monthly) | FRED | 1991 |
| APU0000712112 | Potatoes, US average retail price (USD/lb, monthly) | FRED | 1986 |
| WPU01130603 | Potatoes (russet), US producer price index (Dec 1991=100, monthly) | FRED | 1991 |
| WPU011303 | Sweet potatoes, US producer price index (1982=100, monthly) | FRED | 1947 |
| WFP:COD:CASSAVA_FLOUR:LUBUMBASHI | Cassava flour, DR Congo, Lubumbashi retail (CDF/kg, monthly) | WFP via HDX | 2008 |
| WFP:NGA:YAM:POTISKUM | Yam, Nigeria, Potiskum retail (NGN/2.5 kg, monthly) | WFP via HDX | 2015 |
| WFP:COL:PLANTAIN:MEDELLIN | Plantain, Colombia, Medellín wholesale (COP/kg, monthly) | WFP via HDX | 2013 |
| CPIAUCSL | US CPI (All Urban Consumers, Seas. Adj.)    | FRED          | 2006 |

---

## Getting Started

**Prerequisites:** Node.js >= 20, pnpm >= 9.

```bash
# Install all workspace dependencies
pnpm install

# Fetch latest market data (requires FRED_API_KEY env var)
FRED_API_KEY=your_key pnpm fetch

# Start the development server
pnpm dev
```

The frontend will be available at `http://localhost:5173`.

---

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for a detailed description of the module structure, data flow, and design decisions.

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the contribution philosophy, code style guide, commit format, and agent checklist.

---

## License

MIT — see [LICENSE](./LICENSE).
