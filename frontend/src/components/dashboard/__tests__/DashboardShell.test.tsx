import { describe, it, expect, afterEach } from 'vitest'
import { isOnCardOrControl } from '../DashboardShell'

// Pure DOM fixtures — no render() needed since isOnCardOrControl takes a
// target + boundary Element pair, not a component tree.
function build(html: string): HTMLDivElement {
  const boundary = document.createElement('div')
  boundary.innerHTML = html
  document.body.appendChild(boundary)
  return boundary
}

afterEach(() => { document.body.innerHTML = '' })

describe('isOnCardOrControl', () => {
  it('a <button> ancestor returns true — tapping a card control never starts a scrub', () => {
    const boundary = build('<div><button id="target">Adjust</button></div>')
    const target = boundary.querySelector('#target') as HTMLElement
    expect(isOnCardOrControl(target, boundary)).toBe(true)
  })

  it('a data-glass-card ancestor returns true — the explicit glass-card marker is honored', () => {
    const boundary = build('<div data-glass-card="true"><span id="target">Fitness &amp; Freshness</span></div>')
    const target = boundary.querySelector('#target') as HTMLElement
    expect(isOnCardOrControl(target, boundary)).toBe(true)
  })

  it('an <a> ancestor and a role="button" ancestor both return true', () => {
    const boundary = build(`
      <div>
        <a href="/plan"><span id="link-target">Adjust plan</span></a>
        <div role="button"><span id="role-target">Custom control</span></div>
      </div>
    `)
    expect(isOnCardOrControl(boundary.querySelector('#link-target'), boundary)).toBe(true)
    expect(isOnCardOrControl(boundary.querySelector('#role-target'), boundary)).toBe(true)
  })

  it('an inline-background ancestor returns true — every real card paints via inline style, not a Tailwind class', () => {
    const boundary = build('<div><span id="target">Card text</span></div>')
    const card = boundary.firstElementChild as HTMLElement
    card.style.background = 'var(--color-paper-2)'
    const target = boundary.querySelector('#target') as HTMLElement
    expect(isOnCardOrControl(target, boundary)).toBe(true)
  })

  it('a bare gap element (no control, no marker, no background) returns false — this is empty page, safe to start a scrub', () => {
    const boundary = build('<div><span id="target">plain text, no card</span></div>')
    const target = boundary.querySelector('#target') as HTMLElement
    expect(isOnCardOrControl(target, boundary)).toBe(false)
  })

  it('the walk terminates at the boundary — a background OUTSIDE <main> must not leak in', () => {
    // An ancestor of `boundary` itself (e.g. <body>, or DashboardShell's own
    // outer wrapper) carrying a background must NOT count, or literally
    // every pointerdown inside <main> would resolve to "on a card" and the
    // scrub gesture would never be reachable at all.
    const outer = document.createElement('div')
    outer.style.background = 'var(--color-paper)'
    document.body.appendChild(outer)
    const boundary = document.createElement('div')
    boundary.innerHTML = '<span id="target">gap</span>'
    outer.appendChild(boundary)
    const target = boundary.querySelector('#target') as HTMLElement
    expect(isOnCardOrControl(target, boundary)).toBe(false)
  })

  it('a null target is empty page (false), never throws', () => {
    const boundary = document.createElement('div')
    expect(isOnCardOrControl(null, boundary)).toBe(false)
  })
})
