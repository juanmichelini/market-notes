# Country outlines for `/map`

`/map` draws country outlines from `frontend/static/geo/countries.geojson` if that file exists, and draws only the graticule and markers if not. The file is not committed yet: no source with a clear licence could be downloaded when `/map` was written.

To add it, convert Natural Earth (public domain) through the `world-atlas` package, for example:

```bash
npx --yes -p world-atlas -p topojson-client sh -c \
  'topo2geo countries=frontend/static/geo/countries.geojson < node_modules/world-atlas/countries-110m.json'
```

The result must be one GeoJSON `FeatureCollection` of country polygons (the 110m resolution is about 250 KB). These commands have not been run; adjust the paths if they differ in your environment.
