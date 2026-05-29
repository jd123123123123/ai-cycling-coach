/**
 * Starter dashboards — opinionated 2-chart presets the user can clone into
 * their own account on the empty state. Lives client-side so deletion sticks
 * (no server-side resurrection) and so we can iterate without a migration.
 *
 * Each starter has the same shape as a saved dashboard but without IDs;
 * client mints fresh ids on clone, server stores the result like any other.
 */
import type { ChartSpec } from '../types/chartSpec'
import type { GridLayoutItem } from '../api/dashboards'

export interface StarterDashboard {
  key: string
  name: string
  description: string
  charts: Omit<ChartSpec, 'id'>[]
  layout: Omit<GridLayoutItem, 'i'>[]
}

export const STARTER_DASHBOARDS: StarterDashboard[] = [
  {
    key: 'form',
    name: 'Form & training load',
    description: 'Weekly TSS by sport, plus a 90-day distance arc.',
    charts: [
      {
        title: 'Weekly TSS by sport',
        mark: 'bar',
        stacked: true,
        query: {
          dataset: 'activities',
          dimensions: [
            { column: 'started_at', time_grain: 'week', alias: 'date' },
            { column: 'sport' },
          ],
          measures: [{ column: 'tss', aggregation: 'sum', alias: 'sum_tss' }],
          limit: 500,
          order_by: 'date',
          order_dir: 'asc',
        },
        encoding: { x: 'date', y: 'sum_tss', series: 'sport' },
      },
      {
        title: 'Distance, last 90 days',
        mark: 'area',
        smooth: true,
        query: {
          dataset: 'activities',
          dimensions: [{ column: 'started_at', time_grain: 'day', alias: 'date' }],
          measures: [{ column: 'distance_meters', aggregation: 'sum', alias: 'sum_distance_meters' }],
          limit: 500,
          order_by: 'date',
          order_dir: 'asc',
        },
        encoding: { x: 'date', y: 'sum_distance_meters' },
        accent: 'var(--color-amber)',
      },
    ],
    layout: [
      { x: 0, y: 0, w: 12, h: 6, minW: 4, minH: 4 },
      { x: 0, y: 6, w: 12, h: 6, minW: 4, minH: 4 },
    ],
  },
  {
    key: 'recovery',
    name: 'Recovery signal',
    description: 'HRV, resting HR and sleep — the three witnesses.',
    charts: [
      {
        title: 'HRV trend',
        mark: 'line',
        smooth: true,
        query: {
          dataset: 'daily_metrics',
          dimensions: [{ column: 'date', time_grain: 'day', alias: 'date' }],
          measures: [{ column: 'hrv_status', aggregation: 'avg', alias: 'avg_hrv_status' }],
          limit: 500,
          order_by: 'date',
          order_dir: 'asc',
        },
        encoding: { x: 'date', y: 'avg_hrv_status' },
        accent: 'var(--color-forest-2)',
      },
      {
        title: 'Resting heart rate',
        mark: 'line',
        smooth: true,
        query: {
          dataset: 'daily_metrics',
          dimensions: [{ column: 'date', time_grain: 'day', alias: 'date' }],
          measures: [{ column: 'resting_hr', aggregation: 'avg', alias: 'avg_resting_hr' }],
          limit: 500,
          order_by: 'date',
          order_dir: 'asc',
        },
        encoding: { x: 'date', y: 'avg_resting_hr' },
        accent: 'var(--color-alert)',
      },
      {
        title: 'Sleep score',
        mark: 'bar',
        query: {
          dataset: 'daily_metrics',
          dimensions: [{ column: 'date', time_grain: 'day', alias: 'date' }],
          measures: [{ column: 'sleep_score', aggregation: 'avg', alias: 'avg_sleep_score' }],
          limit: 500,
          order_by: 'date',
          order_dir: 'asc',
        },
        encoding: { x: 'date', y: 'avg_sleep_score' },
        accent: 'var(--color-ink-blue)',
      },
    ],
    layout: [
      { x: 0, y: 0, w: 6, h: 6, minW: 3, minH: 4 },
      { x: 6, y: 0, w: 6, h: 6, minW: 3, minH: 4 },
      { x: 0, y: 6, w: 12, h: 5, minW: 4, minH: 4 },
    ],
  },
]
