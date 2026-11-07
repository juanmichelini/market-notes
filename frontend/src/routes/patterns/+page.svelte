<script lang="ts">
  import { onMount } from "svelte"
  import {
    PATTERNS,
    detectPatterns,
    type DatasetMeta,
    type Detection,
    type PatternName,
    type PriceSeries,
  } from "@market-notes/core"
  import { loadManifest, loadPriceSeries } from "$lib/data.js"
  import PatternChart from "$lib/charts/PatternChart.svelte"

  let datasets: DatasetMeta[] = []
  let dataset: DatasetMeta | null = null
  let series: PriceSeries = []
  let loading = true
  let error: string | null = null

  let patternName: PatternName = "headAndShoulders"
  let thresholdPercent = 8
  let minScorePercent = 50
  let windowBars = 750 // 0 means the whole series

  let detections: ReadonlyArray<Detection> = []
  let detectError: string | null = null
  let selected: number | null = null

  $: info = PATTERNS.find((p) => p.name === patternName)

  // Re-run detection whenever the data or any setting changes.
  $: {
    detectError = null
    selected = null
    try {
      detections =
        series.length === 0
          ? []
          : detectPatterns(series, patternName, {
              threshold: thresholdPercent / 100,
              minScore: minScorePercent / 100,
              window: windowBars === 0 ? undefined : windowBars,
            })
    } catch (err) {
      detections = []
      detectError = err instanceof Error ? err.message : String(err)
    }
  }

  onMount(async () => {
    try {
      const manifest = await loadManifest()
      datasets = manifest.datasets.filter((d) => d.seriesType === "price")
      if (datasets[0]) await choose(datasets[0])
    } catch (err) {
      error = err instanceof Error ? err.message : String(err)
    } finally {
      loading = false
    }
  })

  async function choose(d: DatasetMeta) {
    dataset = d
    series = []
    error = null
    loading = true
    try {
      series = await loadPriceSeries(d.path)
    } catch (err) {
      error = err instanceof Error ? err.message : String(err)
    } finally {
      loading = false
    }
  }

  function describe(d: Detection): string {
    const first = d.points[0]
    const last = d.points[d.points.length - 1]
    if (!first || !last) return ""
    return `${series[first.bar]?.date ?? ""} → ${series[last.bar]?.date ?? ""}`
  }
</script>

<svelte:head>
  <title>Pattern Detection – Market Notes</title>
</svelte:head>

<main>
  <header>
    <a class="back" href="/">← Market Notes</a>
    <h1>Pattern detection</h1>
    <p class="tagline">
      Finds classic chart formations in historical prices. It describes shapes that already happened; it
      does not predict anything.
    </p>
  </header>

  <section class="controls">
    <label>
      Instrument
      <select
        on:change={(e) => {
          const d = datasets.find((x) => x.ticker === e.currentTarget.value)
          if (d) choose(d)
        }}
      >
        {#each datasets as d (d.ticker)}
          <option value={d.ticker} selected={dataset?.ticker === d.ticker}>{d.ticker} – {d.name}</option>
        {/each}
      </select>
    </label>

    <label>
      Pattern
      <select bind:value={patternName}>
        {#each PATTERNS as p (p.name)}
          <option value={p.name}>{p.label}</option>
        {/each}
      </select>
    </label>

    <label>
      Look back
      <select bind:value={windowBars}>
        <option value={250}>Last year (250 days)</option>
        <option value={500}>Last 2 years</option>
        <option value={750}>Last 3 years</option>
        <option value={1250}>Last 5 years</option>
        <option value={0}>Whole series</option>
      </select>
    </label>

    <label>
      Smallest swing: {thresholdPercent}%
      <input type="range" min="2" max="25" step="1" bind:value={thresholdPercent} />
    </label>

    <label>
      Minimum match: {minScorePercent}%
      <input type="range" min="0" max="100" step="5" bind:value={minScorePercent} />
    </label>
  </section>

  {#if info}<p class="description"><strong>{info.label}.</strong> {info.description}</p>{/if}

  <section>
    {#if loading}
      <p class="status">Loading...</p>
    {:else if error}
      <p class="error">{error}</p>
    {:else if detectError}
      <p class="error">{detectError}</p>
    {:else if series.length === 0}
      <p class="status">No data for this instrument. Run <code>pnpm fetch</code> to populate the data files.</p>
    {:else}
      <PatternChart {series} {detections} {selected} title={dataset ? `${dataset.name} (${dataset.ticker})` : ""} />
      <p class="meta">
        {detections.length} {detections.length === 1 ? "match" : "matches"} ·
        solid line: the formation · dashed line: its neckline, continued to the latest day
      </p>

      {#if detections.length === 0}
        <p class="status">
          Nothing found. Try a smaller swing size, a lower minimum match, or a longer look-back.
        </p>
      {:else}
        <ul class="matches">
          {#each detections as d, k (d.points[0]?.bar)}
            <li>
              <button class:active={selected === k} on:click={() => (selected = selected === k ? null : k)}>
                <span class="when">{describe(d)}</span>
                <span class="score">{Math.round(d.score * 100)}% match</span>
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    {/if}
  </section>
</main>

<style>
  main { max-width: 960px; margin: 0 auto; padding: 2rem 1.5rem; font-family: system-ui, -apple-system, sans-serif; color: #111827; }
  h1 { margin: 0.25rem 0; }
  .back { color: #2563eb; font-size: 0.875rem; text-decoration: none; }
  .tagline, .description, .meta, .status { color: #6b7280; font-size: 0.9rem; }
  .controls { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 1rem; margin: 1.5rem 0 1rem; }
  label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.8rem; font-weight: 600; color: #374151; }
  select { padding: 0.4rem; border: 1px solid #d1d5db; border-radius: 6px; font-size: 0.9rem; }
  .error { color: #b91c1c; }
  .matches { list-style: none; padding: 0; margin: 1rem 0; display: flex; flex-wrap: wrap; gap: 0.5rem; }
  .matches button { display: flex; gap: 0.75rem; padding: 0.4rem 0.75rem; border: 1px solid #d1d5db; border-radius: 6px; background: white; cursor: pointer; font-size: 0.85rem; }
  .matches button.active { border-color: #2563eb; background: #eff6ff; }
  .score { color: #6b7280; }
</style>
