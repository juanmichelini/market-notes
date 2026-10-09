<script lang="ts">
  import { onMount, onDestroy } from "svelte"
  import * as d3 from "d3"
  import type { IndexSeries } from "@market-notes/core"

  /** One labelled line. `series` values are plotted as given (no rebasing). */
  export let lines: Array<{ label: string; series: IndexSeries; color: string }>
  export let title: string = ""
  export let yLabel: string = ""
  export let yFormat: string = ",.3f"

  let container: HTMLDivElement
  let svg: SVGSVGElement

  const margin = { top: 20, right: 150, bottom: 40, left: 64 }
  let width = 800
  let height = 420

  let resizeObserver: ResizeObserver | undefined

  $: innerWidth = Math.max(width - margin.left - margin.right, 50)
  $: innerHeight = height - margin.top - margin.bottom

  function draw() {
    if (!svg || lines.length === 0) return
    d3.select(svg).selectAll("*").remove()

    const data = lines.map(({ label, series, color }) => ({
      label,
      color,
      points: series
        .map((row) => ({ date: new Date(row.date), value: row.value }))
        .filter((p) => isFinite(p.value)),
    }))

    const allPoints = data.flatMap((l) => l.points)
    if (allPoints.length === 0) return

    const xScale = d3
      .scaleTime()
      .domain(d3.extent(allPoints, (p) => p.date) as [Date, Date])
      .range([0, innerWidth])

    const yMax = d3.max(allPoints, (p) => p.value) ?? 1
    const yScale = d3.scaleLinear().domain([0, yMax * 1.05]).range([innerHeight, 0]).nice()

    const root = d3
      .select(svg)
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`)

    root
      .append("g")
      .attr("transform", `translate(0,${innerHeight})`)
      .call(
        d3.axisBottom(xScale)
          .ticks(d3.timeYear.every(4))
          .tickFormat((d) => d3.timeFormat("%Y")(d as Date))
      )
      .selectAll("text")
      .attr("font-size", "11px")

    root
      .append("g")
      .call(d3.axisLeft(yScale).ticks(6).tickFormat(d3.format(yFormat)))
      .selectAll("text")
      .attr("font-size", "11px")

    root
      .append("g")
      .call(d3.axisLeft(yScale).ticks(6).tickSize(-innerWidth).tickFormat(() => ""))
      .call((g) => g.select(".domain").remove())
      .selectAll("line")
      .attr("stroke", "#e5e7eb")
      .attr("stroke-dasharray", "3,3")

    if (yLabel) {
      root
        .append("text")
        .attr("transform", "rotate(-90)")
        .attr("y", -margin.left + 14)
        .attr("x", -innerHeight / 2)
        .attr("text-anchor", "middle")
        .attr("font-size", "11px")
        .attr("fill", "#666")
        .text(yLabel)
    }

    const line = d3
      .line<{ date: Date; value: number }>()
      .x((d) => xScale(d.date))
      .y((d) => yScale(d.value))

    for (const l of data) {
      root
        .append("path")
        .datum(l.points)
        .attr("fill", "none")
        .attr("stroke", l.color)
        .attr("stroke-width", 1.75)
        .attr("d", line)
    }

    // Legend, to the right of the plot area.
    const legend = root.append("g").attr("transform", `translate(${innerWidth + 12},0)`)
    data.forEach((l, i) => {
      const row = legend.append("g").attr("transform", `translate(0,${i * 18})`)
      row.append("rect").attr("width", 12).attr("height", 3).attr("y", 5).attr("fill", l.color)
      row.append("text").attr("x", 18).attr("y", 10).attr("font-size", "11px").attr("fill", "#374151").text(l.label)
    })
  }

  $: if (lines && svg) draw()

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
  {#if lines.length === 0}
    <p class="no-data">No data available.</p>
  {:else}
    <svg bind:this={svg} {width} {height} role="img" aria-label={title || "Line chart"}></svg>
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
</style>
