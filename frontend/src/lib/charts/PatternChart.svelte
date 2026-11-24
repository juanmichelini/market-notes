<script lang="ts">
  import { onMount, onDestroy } from "svelte"
  import * as d3 from "d3"
  import { extendLine, type Detection, type PriceSeries } from "@market-notes/core"

  /** The prices to draw. */
  export let series: PriceSeries
  /** Detected formations to draw over the prices. */
  export let detections: ReadonlyArray<Detection> = []
  /** Index into `detections` of the formation to emphasise, or null. */
  export let selected: number | null = null
  export let title = ""

  let container: HTMLDivElement
  let svg: SVGSVGElement
  let width = 800
  const height = 420
  const margin = { top: 20, right: 20, bottom: 36, left: 60 }
  let resizeObserver: ResizeObserver | undefined

  $: innerWidth = Math.max(100, width - margin.left - margin.right)
  $: innerHeight = height - margin.top - margin.bottom

  const BULLISH = "#16a34a"
  const BEARISH = "#dc2626"
  const NEUTRAL = "#d97706"

  /** Green for bullish formations, red for bearish, amber for the neutral hill and valley. */
  function colourOf(d: Detection): string {
    if (d.pattern === "inverseHeadAndShoulders" || d.pattern === "doubleBottom") return BULLISH
    if (d.pattern === "headAndShoulders" || d.pattern === "doubleTop") return BEARISH
    return NEUTRAL
  }

  function draw() {
    if (!svg || series.length === 0) return
    d3.select(svg).selectAll("*").remove()

    const dates = series.map((r) => new Date(r.date))
    const prices = series.map((r) => r.ohlcv.adjClose)
    const finite = prices.filter(Number.isFinite)
    const lastBar = series.length - 1

    const x = d3
      .scaleTime()
      .domain([dates[0]!, dates[lastBar]!])
      .range([0, innerWidth])
    const lo = d3.min(finite) ?? 0
    const hi = d3.max(finite) ?? 1
    const pad = (hi - lo) * 0.05
    const y = d3
      .scaleLinear()
      .domain([lo - pad, hi + pad])
      .range([innerHeight, 0])
      .nice()

    const root = d3
      .select(svg)
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`)

    root
      .append("g")
      .attr("transform", `translate(0,${innerHeight})`)
      .call(d3.axisBottom(x).ticks(6))
      .selectAll("text")
      .attr("font-size", "11px")
    root.append("g").call(d3.axisLeft(y).ticks(6)).selectAll("text").attr("font-size", "11px")

    const line = d3
      .line<number>()
      .defined((_, i) => Number.isFinite(prices[i]))
      .x((_, i) => x(dates[i]!))
      .y((p) => y(p))
    root
      .append("path")
      .datum(prices)
      .attr("fill", "none")
      .attr("stroke", "#2563eb")
      .attr("stroke-width", 1.5)
      .attr("d", line)

    const dim = selected !== null
    detections.forEach((d, k) => {
      const isSelected = selected === k
      const opacity = dim && !isSelected ? 0.25 : 1
      const colour = colourOf(d)
      const at = (p: { bar: number; price: number }): [number, number] => [x(dates[p.bar]!), y(p.price)]

      // The shape: a polyline through the anchor points.
      root
        .append("path")
        .datum(d.points.map(at))
        .attr("fill", "none")
        .attr("stroke", colour)
        .attr("stroke-width", isSelected ? 3 : 2)
        .attr("opacity", opacity)
        .attr("d", d3.line())

      // Dashed neckline, continued to the last bar of the series.
      if (d.neckline) {
        const [a, b] = extendLine(d.neckline.line, d.neckline.from.bar, Math.max(d.neckline.from.bar, lastBar))
        root
          .append("line")
          .attr("x1", x(dates[a.bar]!))
          .attr("y1", y(a.price))
          .attr("x2", x(dates[b.bar]!))
          .attr("y2", y(b.price))
          .attr("stroke", colour)
          .attr("stroke-width", 1.5)
          .attr("stroke-dasharray", "6,4")
          .attr("opacity", opacity)
      }

      root
        .selectAll(null)
        .data(d.points)
        .enter()
        .append("circle")
        .attr("cx", (p) => at(p)[0])
        .attr("cy", (p) => at(p)[1])
        .attr("r", isSelected ? 4.5 : 3.5)
        .attr("fill", colour)
        .attr("opacity", opacity)
    })
  }

  $: if (svg && series) {
    detections
    selected
    innerWidth
    draw()
  }

  onMount(() => {
    if (!container) return
    width = container.clientWidth || 800
    resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) width = entry.contentRect.width || 800
    })
    resizeObserver.observe(container)
  })

  onDestroy(() => resizeObserver?.disconnect())
</script>

<div class="chart-wrapper" bind:this={container}>
  {#if title}<h2 class="chart-title">{title}</h2>{/if}
  {#if series.length === 0}
    <p class="no-data">No data available for this instrument.</p>
  {:else}
    <svg bind:this={svg} {width} {height} role="img" aria-label={`Price chart with detected patterns for ${title}`}></svg>
  {/if}
</div>

<style>
  .chart-wrapper { width: 100%; font-family: system-ui, sans-serif; }
  .chart-title { font-size: 1rem; font-weight: 600; color: #111827; margin: 0 0 0.5rem 0; }
  .no-data { color: #6b7280; font-size: 0.875rem; padding: 2rem; text-align: center; }
  svg { display: block; overflow: visible; }
</style>
