<script lang="ts">
  import { onMount, onDestroy } from "svelte"
  import * as d3 from "d3"
  import type { IndexSeries } from "@market-notes/core"

  export let series: IndexSeries
  export let title: string

  let container: HTMLDivElement
  let svg: SVGSVGElement

  const margin = { top: 20, right: 20, bottom: 40, left: 60 }
  let width = 800
  let height = 400

  let resizeObserver: ResizeObserver | undefined

  $: innerWidth = width - margin.left - margin.right
  $: innerHeight = height - margin.top - margin.bottom

  function draw() {
    if (!svg || series.length === 0) return

    d3.select(svg).selectAll("*").remove()

    const data = series.map((row) => ({
      date: new Date(row.date),
      value: row.value,
    }))

    const xScale = d3
      .scaleTime()
      .domain(d3.extent(data, (d) => d.date) as [Date, Date])
      .range([0, innerWidth])

    const allValues = data.map((d) => d.value).filter(isFinite)
    const yMin = d3.min(allValues) ?? 0
    const yMax = d3.max(allValues) ?? 1
    const yPad = (yMax - yMin) * 0.05

    const yScale = d3
      .scaleLinear()
      .domain([yMin - yPad, yMax + yPad])
      .range([innerHeight, 0])
      .nice()

    const root = d3
      .select(svg)
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`)

    root
      .append("g")
      .attr("transform", `translate(0,${innerHeight})`)
      .call(
        d3.axisBottom(xScale)
          .ticks(d3.timeYear.every(2))
          .tickFormat((d) => d3.timeFormat("%Y")(d as Date))
      )
      .selectAll("text")
      .attr("font-size", "11px")

    root
      .append("g")
      .call(d3.axisLeft(yScale).ticks(6))
      .selectAll("text")
      .attr("font-size", "11px")

    root
      .append("text")
      .attr("transform", "rotate(-90)")
      .attr("y", -margin.left + 14)
      .attr("x", -innerHeight / 2)
      .attr("text-anchor", "middle")
      .attr("font-size", "11px")
      .attr("fill", "#666")
      .text("Index Value")

    root
      .append("g")
      .attr("class", "grid")
      .call(
        d3.axisLeft(yScale).ticks(6).tickSize(-innerWidth).tickFormat(() => "")
      )
      .selectAll("line")
      .attr("stroke", "#e5e7eb")
      .attr("stroke-dasharray", "3,3")

    root.select(".grid .domain").remove()

    const line = d3
      .line<{ date: Date; value: number }>()
      .x((d) => xScale(d.date))
      .y((d) => yScale(d.value))
      .defined((d) => isFinite(d.value))

    root
      .append("path")
      .datum(data)
      .attr("fill", "none")
      .attr("stroke", "#16a34a")
      .attr("stroke-width", 2)
      .attr("d", line)
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
    <p class="no-data">No data available.</p>
  {:else}
    <svg
      bind:this={svg}
      {width}
      {height}
      role="img"
      aria-label={`Index chart for ${title}`}
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
