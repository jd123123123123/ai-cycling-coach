/**
 * The honest-dash primitive. Every adapter returns Value<T>; every display
 * component knows how to render both arms. A component that receives a raw
 * number where a Value belongs is a bug, not a shortcut — the frame always
 * stays, and a reading we do not have renders "—" plus a reason.
 */
export type Value<T> = { value: T } | { missing: string }

export function present<T>(value: T): Value<T> {
  return { value }
}

export function missing<T>(reason: string): Value<T> {
  return { missing: reason }
}

export function fromNullable<T>(v: T | null | undefined, reason: string): Value<T> {
  return v === null || v === undefined ? { missing: reason } : { value: v }
}

export function isPresent<T>(v: Value<T>): v is { value: T } {
  return 'value' in v
}

export function mapValue<A, B>(v: Value<A>, f: (a: A) => B): Value<B> {
  return isPresent(v) ? { value: f(v.value) } : v
}
