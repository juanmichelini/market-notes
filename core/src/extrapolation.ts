/**
 * # Line Extrapolation
 *
 * Geometry for extending a line past the bars it was drawn through, such as
 * the neckline of a head and shoulders. It describes where the line would be
 * if continued; it makes no forecast.
 */

import type { Bar } from "./patterns.js"

/** A price at a bar. */
export interface Point {
  readonly bar: Bar
  readonly price: number
}

/** The straight line price(t) = intercept + slope × t, with t a bar and slope in price per bar. */
export interface Line {
  readonly slope: number
  readonly intercept: number
}

/**
 * The line through two points.
 *
 *   slope     = (q.price − p.price) / (q.bar − p.bar)
 *   intercept = p.price − slope × p.bar
 *
 * @throws {Error} if the points are on the same bar, where no function of the bar passes through both.
 */
export function lineThrough(p: Point, q: Point): Line {
  if (p.bar === q.bar) {
    throw new Error(`lineThrough: both points are at bar ${p.bar}.`)
  }
  const slope = (q.price - p.price) / (q.bar - p.bar)
  return { slope: slope + 0, intercept: p.price - slope * p.bar + 0 }
}

/** The price of a line at a bar: intercept + slope × bar. Bars before, between and after the defining points are all allowed. */
export function valueAt(line: Line, bar: Bar): number {
  return line.intercept + line.slope * bar
}

/**
 * The part of a line from one bar to another, as two points, for drawing the
 * line continued beyond the bars it was drawn through.
 *
 * @throws {Error} if `fromBar` is after `toBar`.
 */
export function extendLine(line: Line, fromBar: Bar, toBar: Bar): readonly [Point, Point] {
  if (fromBar > toBar) {
    throw new Error(`extendLine: fromBar ${fromBar} is after toBar ${toBar}.`)
  }
  return [
    { bar: fromBar, price: valueAt(line, fromBar) },
    { bar: toBar, price: valueAt(line, toBar) },
  ]
}
