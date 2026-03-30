<script lang="ts">
  import { onMount, onDestroy } from "svelte"
  import * as d3 from "d3"
  import type { PriceSeries } from "@market-notes/core"

  export let series: PriceSeries
  export let title: string

  // Container element bound via use:directive
  let container: HTMLDivElement
  let svg: SVGSVGElement

  // Dimensions
  const margin = { top: 20, right: 20, bottom: 40, left: 60 }
  let width = 800
  let height = 400

  let resizeObserver: ResizeObserver | undefined

  // Derived chart dimensions
  $: innerWidth = width - margin.left - margin.right
  $: innerHeight = height - margin.top - margin.bottom

  function draw() {
    if (!svg || series.length === 0) return

    // Clear previous render
    d3.select(svg).selectAll("*").remove()

    const parseDate = (s: string) => new Date(s)

    // Build data arrays for D3
    const data = series.map((row) => ({
      date: parseDate(row.date),
      open: row.ohlcv.open,
      close: row.ohlcv.close,
    }))

    // Scales
    const xScale = d3
      .scaleTime()
      .domain(d3.extent(data, (d) => d.date) as [Date, Date])
      .range([0, innerWidth])

    const allPrices = data.flatMap((d) => [d.open, d.close]).filter(isFinite)
    const yMin = d3.min(allPrices) ?? 0
    const yMax = d3.max(allPrices) ?? 1
    const yPad = (yMax - yMin) * 0.05

    const yScale = d3
      .scaleLinear()
      .domain([yMin - yPad, yMax + yPad])
      .range([innerHeight, 0])
      .nice()

    // Root group
    const root = d3
      .select(svg)
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`)

    // X axis
    root
      .append("g")
      .attr("class", "x-axis")
      .attr("transform", `translate(0,${innerHeight})`)
      .call(
        d3
          .axisBottom(xScale)
          .ticks(d3.timeYear.every(2))
          .tickFormat((d) => d3.timeFormat("%Y")(d as Date))
      )
      .selectAll("text")
      .attr("font-size", "11px")

    // Y axis
    root
      .append("g")
      .attr("class", "y-axis")
      .call(d3.axisLeft(yScale).ticks(6).tickFormat((d) => `$${d}`))
      .selectAll("text")
      .attr("font-size", "11px")

    // Y axis label
    root
      .append("text")
      .attr("transform", "rotate(-90)")
      .attr("y", -margin.left + 14)
      .attr("x", -innerHeight / 2)
      .attr("text-anchor", "middle")
      .attr("font-size", "11px")
      .attr("fill", "#666")
      .text("Price (USD)")

    // Horizontal grid lines
    root
      .append("g")
      .attr("class", "grid")
      .call(
        d3
          .axisLeft(yScale)
          .ticks(6)
          .tickSize(-innerWidth)
          .tickFormat(() => "")
      )
      .selectAll("line")
      .attr("stroke", "#e5e7eb")
      .attr("stroke-dasharray", "3,3")

    root.select(".grid .domain").remove()

    // Line generators
    const openLine = d3
      .line<{ date: Date; open: number }>()
      .x((d) => xScale(d.date))
      .y((d) => yScale(d.open))
      .defined((d) => isFinite(d.open))

    const closeLine = d3
      .line<{ date: Date; close: number }>()
      .x((d) => xScale(d.date))
      .y((d) => yScale(d.close))
      .defined((d) => isFinite(d.close))

    // Open price line (dashed, muted)
    root
      .append("path")
      .datum(data)
      .attr("fill", "none")
      .attr("stroke", "#94a3b8")
      .attr("stroke-width", 1.5)
      .attr("stroke-dasharray", "4,3")
      .attr("d", openLine)

    // Close price line (solid, primary)
    root
      .append("path")
      .datum(data)
      .attr("fill", "none")
      .attr("stroke", "#2563eb")
      .attr("stroke-width", 2)
      .attr("d", closeLine)

    // Legend
    const legend = root
      .append("g")
      .attr("transform", `translate(${innerWidth - 120}, 8)`)

    // Close legend entry
    legend
      .append("line")
      .attr("x1", 0)
      .attr("x2", 20)
      .attr("y1", 6)
      .attr("y2", 6)
      .attr("stroke", "#2563eb")
      .attr("stroke-width", 2)

    legend
      .append("text")
      .attr("x", 26)
      .attr("y", 10)
      .attr("font-size", "11px")
      .attr("fill", "#374151")
      .text("Close")

    // Open legend entry
    legend
      .append("line")
      .attr("x1", 0)
      .attr("x2", 20)
      .attr("y1", 22)
      .attr("y2", 22)
      .attr("stroke", "#94a3b8")
      .attr("stroke-width", 1.5)
      .attr("stroke-dasharray", "4,3")

    legend
      .append("text")
      .attr("x", 26)
      .attr("y", 26)
      .attr("font-size", "11px")
      .attr("fill", "#374151")
      .text("Open")
  }

  $: if (series && svg) draw()

  onMount(() => {
    if (!container) return
    resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) {
        width = entry.contentRect.width || 800
        draw()
      }
    })
    resizeObserver.observe(container)
    width = container.clientWidth || 800
  })

  onDestroy(() => {
    resizeObserver?.disconnect()
  })
</script>

<div class="chart-wrapper" bind:this={container}>
  {#if title}
    <h2 class="chart-title">{title}</h2>
  {/if}
  {#if series.length === 0}
    <p class="no-data">No data available for this instrument.</p>
  {:else}
    <svg
      bind:this={svg}
      {width}
      {height}
      role="img"
      aria-label={`Price chart for ${title}`}
    ></svg>
  {/if}
</div>

<style>
  .chart-wrapper {
    width: 100%;
    font-family: system-ui, sans-serif;
  }

  .chart-title {
    font-size: 1rem;
    font-weight: 600;
    color: #111827;
    margin: 0 0 0.5rem 0;
  }

  .no-data {
    color: #6b7280;
    font-size: 0.875rem;
    padding: 2rem;
    text-align: center;
  }

  svg {
    display: block;
    overflow: visible;
  }
</style>
