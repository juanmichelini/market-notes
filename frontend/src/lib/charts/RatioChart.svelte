<script lang="ts">
  import { onMount, onDestroy } from "svelte"
  import * as d3 from "d3"
  import type { IndexSeries } from "@market-notes/core"
  import { polarityChanges } from "@market-notes/core"

  export let ratios: Array<{ label: string; series: IndexSeries; color: string }>
  export let window: number = 20  // rolling mean window for polarity detection

  let container: HTMLDivElement
  let svg: SVGSVGElement

  const margin = { top: 20, right: 140, bottom: 40, left: 60 }
  let width = 800
  let height = 440

  let resizeObserver: ResizeObserver | undefined

  $: innerWidth = width - margin.left - margin.right
  $: innerHeight = height - margin.top - margin.bottom

  function draw() {
    if (!svg || ratios.length === 0) return
    d3.select(svg).selectAll("*").remove()

    // Build per-ratio data — normalize each to 100 at first shared date
    const allDates = new Set(ratios.flatMap(r => r.series.map(row => row.date)))
    const sharedDates = [...allDates].filter(d =>
      ratios.every(r => r.series.some(row => row.date === d))
    ).sort()

    if (sharedDates.length === 0) return

    const baseDate = sharedDates[0]!

    const normalized = ratios.map(({ label, series, color }) => {
      const byDate = new Map(series.map(r => [r.date, r.value]))
      const base = byDate.get(baseDate) ?? NaN
      const data = sharedDates
        .map(d => ({ date: new Date(d), value: isFinite(base) && base !== 0 ? (byDate.get(d) ?? NaN) / base * 100 : NaN }))
        .filter(d => isFinite(d.value))

      // Polarity changes on the shared subset
      const sharedSeries = sharedDates.map(d => ({ date: d as any, value: byDate.get(d) ?? NaN }))
      const polarity = polarityChanges(sharedSeries, window)
      const flips = sharedDates
        .map((d, i) => ({ date: new Date(d), signal: polarity[i]?.value ?? 0 }))
        .filter(p => p.signal === 1 || p.signal === -1)

      return { label, color, data, flips }
    })

    const xScale = d3.scaleTime()
      .domain(d3.extent(sharedDates.map(d => new Date(d))) as [Date, Date])
      .range([0, innerWidth])

    const allValues = normalized.flatMap(r => r.data.map(d => d.value)).filter(isFinite)
    const yMin = d3.min(allValues) ?? 0
    const yMax = d3.max(allValues) ?? 100
    const yPad = (yMax - yMin) * 0.05

    const yScale = d3.scaleLinear()
      .domain([yMin - yPad, yMax + yPad])
      .range([innerHeight, 0])
      .nice()

    const root = d3.select(svg)
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`)

    // Grid
    root.append("g")
      .call(d3.axisLeft(yScale).ticks(6).tickSize(-innerWidth).tickFormat(() => ""))
      .selectAll("line").attr("stroke", "#e5e7eb").attr("stroke-dasharray", "3,3")
    root.select(".domain").remove()

    // Axes
    root.append("g")
      .attr("transform", `translate(0,${innerHeight})`)
      .call(d3.axisBottom(xScale).ticks(d3.timeYear.every(2)).tickFormat(d => d3.timeFormat("%Y")(d as Date)))
      .selectAll("text").attr("font-size", "11px")

    root.append("g")
      .call(d3.axisLeft(yScale).ticks(6).tickFormat(d => `${d}`))
      .selectAll("text").attr("font-size", "11px")

    root.append("text")
      .attr("transform", "rotate(-90)")
      .attr("y", -margin.left + 14).attr("x", -innerHeight / 2)
      .attr("text-anchor", "middle").attr("font-size", "11px").attr("fill", "#666")
      .text("Ratio (rebased to 100)")

    // Baseline at 100
    root.append("line")
      .attr("x1", 0).attr("x2", innerWidth)
      .attr("y1", yScale(100)).attr("y2", yScale(100))
      .attr("stroke", "#d1d5db").attr("stroke-dasharray", "4,4")

    // Draw polarity flip markers and lines per ratio
    normalized.forEach(({ label, color, data, flips }) => {
      // Flip markers
      flips.forEach(({ date, signal }) => {
        root.append("line")
          .attr("x1", xScale(date)).attr("x2", xScale(date))
          .attr("y1", 0).attr("y2", innerHeight)
          .attr("stroke", signal === 1 ? "#16a34a" : "#dc2626")
          .attr("stroke-width", 1)
          .attr("stroke-opacity", 0.25)
      })

      // Line
      const line = d3.line<{ date: Date; value: number }>()
        .x(d => xScale(d.date))
        .y(d => yScale(d.value))
        .defined(d => isFinite(d.value))

      root.append("path")
        .datum(data)
        .attr("fill", "none")
        .attr("stroke", color)
        .attr("stroke-width", 1.5)
        .attr("d", line)
    })

    // Legend
    const legend = root.append("g").attr("transform", `translate(${innerWidth + 12}, 8)`)
    normalized.forEach(({ label, color }, i) => {
      const g = legend.append("g").attr("transform", `translate(0, ${i * 28})`)
      g.append("line").attr("x1", 0).attr("x2", 20).attr("y1", 6).attr("y2", 6)
        .attr("stroke", color).attr("stroke-width", 2)
      g.append("text").attr("x", 26).attr("y", 10)
        .attr("font-size", "11px").attr("fill", "#374151").text(label)
    })

    // Polarity legend
    const pLegend = legend.append("g").attr("transform", `translate(0, ${normalized.length * 28 + 12})`)
    pLegend.append("line").attr("x1", 0).attr("x2", 20).attr("y1", 6).attr("y2", 6)
      .attr("stroke", "#16a34a").attr("stroke-width", 1.5).attr("stroke-opacity", 0.6)
    pLegend.append("text").attr("x", 26).attr("y", 10).attr("font-size", "10px").attr("fill", "#6b7280").text("bullish flip")
    const pLegend2 = legend.append("g").attr("transform", `translate(0, ${normalized.length * 28 + 28})`)
    pLegend2.append("line").attr("x1", 0).attr("x2", 20).attr("y1", 6).attr("y2", 6)
      .attr("stroke", "#dc2626").attr("stroke-width", 1.5).attr("stroke-opacity", 0.6)
    pLegend2.append("text").attr("x", 26).attr("y", 10).attr("font-size", "10px").attr("fill", "#6b7280").text("bearish flip")
  }

  $: if (ratios && svg) draw()
  $: if (window && svg) draw()

  onMount(() => {
    if (!container) return
    resizeObserver = new ResizeObserver(entries => {
      const entry = entries[0]
      if (entry) { width = entry.contentRect.width || 800; draw() }
    })
    resizeObserver.observe(container)
    width = container.clientWidth || 800
  })

  onDestroy(() => resizeObserver?.disconnect())
</script>

<div class="chart-wrapper" bind:this={container}>
  {#if ratios.length === 0 || ratios.every(r => r.series.length === 0)}
    <p class="no-data">No ratio data available.</p>
  {:else}
    <div class="controls">
      <label>
        Polarity window:
        <input type="range" min="5" max="200" step="5" bind:value={window} />
        <span>{window} days</span>
      </label>
    </div>
    <svg bind:this={svg} {width} {height} role="img" aria-label="Ratio chart"></svg>
  {/if}
</div>

<style>
  .chart-wrapper { width: 100%; font-family: system-ui, sans-serif; }
  .no-data { color: #6b7280; font-size: 0.875rem; padding: 2rem; text-align: center; }
  svg { display: block; overflow: visible; }
  .controls {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.8rem;
    color: #6b7280;
    margin-bottom: 0.5rem;
  }
  .controls label { display: flex; align-items: center; gap: 0.5rem; }
  .controls input[type=range] { width: 120px; }
</style>
