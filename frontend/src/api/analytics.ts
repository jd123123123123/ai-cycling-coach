import { apiClient } from './client'
import type { QueryResult, QuerySpec } from '../types/chartSpec'
import type { ChartSpec } from '../types/chartSpec'

export interface DatasetIntrospection {
  datasets: Record<
    string,
    {
      table: string
      time_column: string
      columns: { name: string; type: 'number' | 'string' | 'date' | 'boolean' }[]
    }
  >
}

export async function fetchDatasets(): Promise<DatasetIntrospection> {
  const res = await apiClient.get<DatasetIntrospection>('/analytics/datasets')
  return res.data
}

export async function executeQuery(spec: QuerySpec): Promise<QueryResult> {
  const res = await apiClient.post<QueryResult>('/analytics/query', spec)
  return res.data
}

export interface SummarizeRequest {
  chart_title?: string | null
  chart_mark: string
  rows: Array<Record<string, string | number | boolean | null>>
  x_field: string
  y_field: string
  series_field?: string | null
}

export interface SummarizeResponse {
  narrative: string
  model_used: string
}

export async function summarizeChart(
  payload: SummarizeRequest,
): Promise<SummarizeResponse> {
  const res = await apiClient.post<SummarizeResponse>('/analytics/summarize', payload)
  return res.data
}

export async function interpretChart(text: string): Promise<ChartSpec> {
  const res = await apiClient.post<ChartSpec>('/analytics/interpret', { text })
  return res.data
}
