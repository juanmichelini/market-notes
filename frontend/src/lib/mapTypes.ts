/** One market on the price map. `value` is null when no price can be shown. */
export type MapMarker = {
  id: string
  label: string
  lat: number
  lon: number
  value: number | null
  valueText: string
  detail: string
}
