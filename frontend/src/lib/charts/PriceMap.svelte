<script lang="ts">
  import { onMount, onDestroy } from "svelte"
  import * as d3 from "d3"
  import type { MapMarker } from "$lib/mapTypes.js"

  export let markers: MapMarker[]
  export let unitLabel: string = ""
  /** Optional country outlines (GeoJSON). The map still draws without them. */
  export let countries: d3.GeoPermissibleObjects | null = null
  /** Colour scale domain; defaults to the range of the shown values. */
  export let domain: [number, number] | null = null
  /** Draw a diverging scale centred on zero (for spreads) instead of a sequential one. */
  export let diverging: boolean = false

  let container: HTMLDivElement
  let svg: SVGSVGElement
  let hovered: MapMarker | null = null
  let tipX = 0
  let tipY = 0

  let width = 900
  $: height = Math.round(width * 0.5)

  let resizeObserver: ResizeObserver | undefined

  function draw() {
    if (!svg) return
    const root = d3.select(svg)
    root.selectAll("*").remove()

    const sphere = { type: "Sphere" } as d3.GeoPermissibleObjects
    const projection = d3.geoNaturalEarth1().fitSize([width, height], sphere)
    const path = d3.geoPath(projection)

    root.append("path").datum(sphere).attr("d", path).attr("fill", "#f3f4f6").attr("stroke", "#d1d5db")
    root
      .append("path")
      .datum(d3.geoGraticule10())
      .attr("d", path)
      .attr("fill", "none")
      .attr("stroke", "#e5e7eb")
      .attr("stroke-width", 0.5)

    if (countries) {
      root
        .append("path")
        .datum(countries)
        .attr("d", path)
        .attr("fill", "#e5e7eb")
        .attr("stroke", "#ffffff")
        .attr("stroke-width", 0.5)
    }

    const values = markers.map((m) => m.value).filter((v): v is number => v !== null && isFinite(v))
    // Sequential: low → high. Diverging: red above the reference, blue below, symmetric about zero.
    const interpolate = diverging ? (t: number) => d3.interpolateRdBu(1 - t) : d3.interpolateYlOrRd
    let lo: number
    let hi: number
    let color: (v: number) => string
    if (diverging) {
      const reach = domain ? Math.max(Math.abs(domain[0]), Math.abs(domain[1])) : (d3.max(values, (v: number) => Math.abs(v)) ?? 1)
      lo = -(reach || 1)
      hi = reach || 1
      color = d3.scaleDiverging(interpolate).domain([lo, 0, hi])
    } else {
      ;[lo, hi] = domain ?? [d3.min(values) ?? 0, d3.max(values) ?? 1]
      // When every market has the same price the scale would collapse; widen it.
      color = d3.scaleSequential(interpolate).domain(lo === hi ? [lo * 0.9, hi * 1.1 || 1] : [lo, hi])
    }
    const fmt = diverging ? d3.format("+,.1f") : d3.format(",.3~f")

    const placed = markers
      .map((m) => ({ m, xy: projection([m.lon, m.lat]) }))
      .filter((p): p is { m: MapMarker; xy: [number, number] } => p.xy !== null)

    root
      .append("g")
      .selectAll("circle")
      .data(placed)
      .join("circle")
      .attr("cx", (p) => p.xy[0])
      .attr("cy", (p) => p.xy[1])
      .attr("r", 9)
      .attr("fill", (p) => (p.m.value === null ? "#ffffff" : color(p.m.value)))
      .attr("stroke", (p) => (p.m.value === null ? "#9ca3af" : "#111827"))
      .attr("stroke-width", 1.25)
      .attr("stroke-dasharray", (p) => (p.m.value === null ? "2,2" : null))
      .style("cursor", "pointer")
      .on("mouseenter", (event: MouseEvent, p) => {
        hovered = p.m
        place(event)
      })
      .on("mousemove", (event: MouseEvent) => place(event))
      .on("mouseleave", () => {
        hovered = null
      })

    // Colour legend.
    if (values.length > 0) {
      const defs = root.append("defs")
      const grad = defs.append("linearGradient").attr("id", "map-legend-grad")
      for (let i = 0; i <= 10; i++) {
        grad
          .append("stop")
          .attr("offset", `${i * 10}%`)
          .attr("stop-color", interpolate(i / 10))
      }
      const lx = 16
      const ly = height - 28
      root.append("rect").attr("x", lx).attr("y", ly).attr("width", 160).attr("height", 8).attr("fill", "url(#map-legend-grad)")
      root.append("text").attr("x", lx).attr("y", ly - 4).attr("font-size", "10px").attr("fill", "#374151").text(unitLabel)
      root.append("text").attr("x", lx).attr("y", ly + 20).attr("font-size", "10px").attr("fill", "#374151").text(fmt(lo))
      root
        .append("text")
        .attr("x", lx + 160)
        .attr("y", ly + 20)
        .attr("text-anchor", "end")
        .attr("font-size", "10px")
        .attr("fill", "#374151")
        .text(fmt(hi))
    }
  }

  function place(event: MouseEvent) {
    const box = container.getBoundingClientRect()
    tipX = event.clientX - box.left + 12
    tipY = event.clientY - box.top + 12
  }

  $: if (svg && markers && countries !== undefined && unitLabel !== undefined && diverging !== undefined && width) draw()

  onMount(() => {
    if (!container) return
    resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) width = entry.contentRect.width || 900
    })
    resizeObserver.observe(container)
    width = container.clientWidth || 900
  })

  onDestroy(() => {
    resizeObserver?.disconnect()
  })
</script>

<div class="map-wrapper" bind:this={container}>
  <svg bind:this={svg} {width} {height} role="img" aria-label="Map of prices by market"></svg>
  {#if hovered}
    <div class="tip" style="left:{tipX}px; top:{tipY}px">
      <strong>{hovered.label}</strong>
      <div>{hovered.valueText}</div>
      <div class="detail">{hovered.detail}</div>
    </div>
  {/if}
</div>

<style>
  .map-wrapper {
    position: relative;
    width: 100%;
    font-family: system-ui, sans-serif;
  }
  .tip {
    position: absolute;
    pointer-events: none;
    background: #111827;
    color: #f9fafb;
    font-size: 0.75rem;
    padding: 0.5rem 0.65rem;
    border-radius: 6px;
    max-width: 260px;
    z-index: 10;
  }
  .detail { color: #d1d5db; margin-top: 0.15rem; }
</style>
