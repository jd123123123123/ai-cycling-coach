import type { Value } from './value'

export interface BlockLike { label: string; minutes: number; watts: Value<number>; delta: number | null }
