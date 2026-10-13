# Country outlines for `/map`

`/map` draws country outlines from `frontend/static/geo/countries.geojson` if that file exists, and draws only the graticule and markers if not.

To generate it, run the **Build country outlines** workflow (Actions tab → Run workflow). It installs `world-atlas` (Natural Earth, public domain), converts it with `.github/scripts/build-countries-geojson.mjs`, and opens a pull request adding the file.
