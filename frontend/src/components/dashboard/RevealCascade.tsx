import React from 'react'
import { useReducedMotion } from 'motion/react'

/**
 * RevealCascade — staggered card-enter animation primitive.
 *
 * Wraps children and assigns each a staggered `animation` inline style so
 * card grids and section lists inherit a consistent mount cadence.
 *
 * Honors `prefers-reduced-motion`: when the user has reduced-motion enabled,
 * children are rendered unchanged with no animation injection.
 *
 * Only keyframes already defined in index.css are accepted:
 *   'card-enter' | 'fade-in' | 'slide-up' | 'tabpanel-in'
 *
 * @example
 * <RevealCascade>
 *   <MetricCard />
 *   <MetricCard />
 *   <MetricCard />
 * </RevealCascade>
 * // Each card receives animation-delay of 0ms, 150ms, 300ms respectively.
 */

interface RevealCascadeProps {
  /** Step delay in ms between siblings. Default 150 (research §2.6). */
  stepMs?: number
  /** Initial offset before first child reveals. Default 0. */
  startMs?: number
  /**
   * Animation name from index.css.
   * Must be one of the keyframes already defined:
   * 'card-enter' | 'fade-in' | 'slide-up' | 'tabpanel-in'
   */
  animation?: 'card-enter' | 'fade-in' | 'slide-up' | 'tabpanel-in'
  /** Duration in ms. Default 400 (matches --duration-medium). */
  durationMs?: number
  children: React.ReactNode
}

export function RevealCascade({
  stepMs = 150,
  startMs = 0,
  animation = 'card-enter',
  durationMs = 400,
  children,
}: RevealCascadeProps): React.ReactElement {
  const reducedMotion = useReducedMotion()

  // When reduced motion is preferred, render children unchanged.
  if (reducedMotion) {
    return <>{children}</>
  }

  const childArray = React.Children.toArray(children)

  const staggered = childArray.map((child, i) => {
    // Skip non-element children (strings, numbers, fragments)
    if (!React.isValidElement(child)) return child

    const delayMs = startMs + i * stepMs
    const animationValue = `${animation} ${durationMs}ms var(--ease-apple-default) ${delayMs}ms both`

    // Merge with any existing style on the child
    const existingStyle = (child.props as { style?: React.CSSProperties }).style ?? {}

    return React.cloneElement(child as React.ReactElement<{ style?: React.CSSProperties }>, {
      style: {
        ...existingStyle,
        animation: animationValue,
      },
    })
  })

  return <>{staggered}</>
}
