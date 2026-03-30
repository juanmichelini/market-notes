<script lang="ts">
  import { onMount } from "svelte"
  import type { Manifest, DatasetMeta, PriceSeries } from "@market-notes/core"
  import { loadManifest, loadPriceSeries } from "$lib/data.js"
  import PriceChart from "$lib/charts/PriceChart.svelte"

  let manifest: Manifest | null = null
  let selectedDataset: DatasetMeta | null = null
  let priceSeries: PriceSeries = []
  let loadingManifest = true
  let loadingData = false
  let manifestError: string | null = null
  let dataError: string | null = null

  onMount(async () => {
    try {
      manifest = await loadManifest()
    } catch (err) {
      manifestError = err instanceof Error ? err.message : String(err)
    } finally {
      loadingManifest = false
    }
  })

  async function selectDataset(dataset: DatasetMeta) {
    if (dataset.seriesType !== "price") {
      // Index series are not displayed as price charts in v0.1
      return
    }
    selectedDataset = dataset
    priceSeries = []
    dataError = null
    loadingData = true
    try {
      priceSeries = await loadPriceSeries(dataset.path)
    } catch (err) {
      dataError = err instanceof Error ? err.message : String(err)
    } finally {
      loadingData = false
    }
  }
</script>

<svelte:head>
  <title>Market Notes</title>
</svelte:head>

<main>
  <header>
    <h1>Market Notes</h1>
    <p class="tagline">Financial market data and visualization</p>
  </header>

  <section class="instruments">
    <h2>Instruments</h2>

    {#if loadingManifest}
      <p class="status">Loading...</p>
    {:else if manifestError}
      <p class="error">Failed to load instrument list: {manifestError}</p>
    {:else if manifest}
      <div class="button-group" role="group" aria-label="Select an instrument">
        {#each manifest.datasets as dataset (dataset.ticker)}
          <button
            class="instrument-btn"
            class:active={selectedDataset?.ticker === dataset.ticker}
            class:index-type={dataset.seriesType === "index"}
            on:click={() => selectDataset(dataset)}
            disabled={dataset.seriesType === "index"}
            title={dataset.description}
          >
            <span class="ticker">{dataset.ticker}</span>
            <span class="name">{dataset.name}</span>
          </button>
        {/each}
      </div>
    {/if}
  </section>

  <section class="chart-section">
    {#if loadingData}
      <p class="status">Loading...</p>
    {:else if dataError}
      <p class="error">{dataError}</p>
    {:else if selectedDataset && priceSeries.length > 0}
      <PriceChart
        series={priceSeries}
        title="{selectedDataset.name} ({selectedDataset.ticker})"
      />
      <p class="meta">
        {priceSeries.length} trading days &middot;
        {priceSeries[0]?.date ?? ""} to {priceSeries[priceSeries.length - 1]?.date ?? ""}
        &middot; Source: {selectedDataset.source === "yahoo" ? "Yahoo Finance" : "FRED"}
      </p>
    {:else if selectedDataset && priceSeries.length === 0 && !loadingData}
      <p class="status">
        No data available for {selectedDataset.ticker}. Run <code>pnpm fetch</code> to populate the data files.
      </p>
    {:else}
      <p class="placeholder">Select an instrument above to view its price chart.</p>
    {/if}
  </section>
</main>

<style>
  main {
    max-width: 960px;
    margin: 0 auto;
    padding: 2rem 1.5rem;
    font-family: system-ui, -apple-system, sans-serif;
    color: #111827;
  }

  header {
    margin-bottom: 2rem;
  }

  h1 {
    font-size: 1.75rem;
    font-weight: 700;
    margin: 0 0 0.25rem 0;
  }

  h2 {
    font-size: 1rem;
    font-weight: 600;
    color: #374151;
    margin: 0 0 0.75rem 0;
  }

  .tagline {
    color: #6b7280;
    margin: 0;
    font-size: 0.95rem;
  }

  .instruments {
    margin-bottom: 2rem;
  }

  .button-group {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .instrument-btn {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    padding: 0.5rem 0.75rem;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    background: #fff;
    cursor: pointer;
    transition: border-color 0.15s, background 0.15s;
    min-width: 100px;
  }

  .instrument-btn:hover:not(:disabled) {
    border-color: #2563eb;
    background: #eff6ff;
  }

  .instrument-btn.active {
    border-color: #2563eb;
    background: #dbeafe;
  }

  .instrument-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .ticker {
    font-size: 0.85rem;
    font-weight: 700;
    color: #1d4ed8;
    font-family: monospace;
  }

  .name {
    font-size: 0.75rem;
    color: #6b7280;
    margin-top: 0.125rem;
  }

  .chart-section {
    min-height: 200px;
  }

  .status {
    color: #6b7280;
    font-size: 0.875rem;
  }

  .error {
    color: #dc2626;
    font-size: 0.875rem;
    padding: 0.75rem;
    background: #fef2f2;
    border-radius: 6px;
    border: 1px solid #fecaca;
  }

  .placeholder {
    color: #9ca3af;
    font-size: 0.875rem;
    padding: 3rem 0;
    text-align: center;
  }

  .meta {
    font-size: 0.75rem;
    color: #9ca3af;
    margin-top: 0.5rem;
  }

  code {
    font-family: monospace;
    background: #f3f4f6;
    padding: 0.1em 0.3em;
    border-radius: 3px;
  }
</style>
