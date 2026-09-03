import type { ReactNode } from 'react'
import { T } from './w3tokens'

/**
 * W3 · THE EYEBROW, in the two kinds it actually is.
 *
 * ── THE BUG THIS FIXES IS SHOUTING SOMEBODY'S SENTENCE ───────────────────
 *
 * The feed ran every small line through the same treatment: uppercase, 700,
 * 1.3–1.4 of tracking. That is right for a LABEL — a word the app chose, two
 * syllables long, doing the job of a caption. It is wrong for the rider's own
 * ride title, and German makes the wrongness obvious: "Feierabendrunde am
 * Kanal" became FEIERABENDRUNDE AM KANAL, forty characters of wide-tracked
 * caps, the loudest object on a card whose subject is a photograph.
 *
 * Uppercasing someone's words also destroys information. Compound nouns lose
 * their shape, umlauts get heavier, and a title the rider capitalised on
 * purpose reads the same as one they typed in a hurry.
 *
 * So there are two kinds and they do not look alike:
 *
 *   LABEL — the app's own word. Still uppercase, because at nine pixels caps
 *     are more legible than lowercase and it reads as furniture rather than
 *     content. But tracked at 0.9 rather than 1.4: past about 1.0 a small
 *     uppercase run stops looking deliberate and starts looking like a UI kit.
 *
 *   TITLE — the rider's own words, in the rider's own case, at a size a person
 *     reads rather than scans. The accent moves off the letters and onto a
 *     mark beside them, so the line is coloured by association instead of
 *     being drenched in it — which is also how it stops competing with the
 *     headline directly underneath.
 */

export type W3EyebrowKind = 'label' | 'title'

export default function W3Eyebrow({
  children, kind = 'label', tone, mark = true,
}: {
  children: ReactNode
  kind?: W3EyebrowKind
  /** Defaults to acid for a title, quiet for a label. */
  tone?: string
  /** The dot before a title. Off where the card already carries an icon. */
  mark?: boolean
}) {
  if (kind === 'title') {
    const c = tone ?? T.acid
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 7, minWidth: 0,
        fontSize: 13, fontWeight: 600, letterSpacing: -0.1, lineHeight: 1.25,
        color: T.ink,
      }}>
        {mark && (
          <span aria-hidden style={{
            flex: 'none', width: 5, height: 5, borderRadius: 100, background: c,
          }} />
        )}
        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {children}
        </span>
      </span>
    )
  }

  return (
    <span style={{
      fontSize: 9, fontWeight: 700, letterSpacing: 0.9,
      textTransform: 'uppercase', color: tone ?? T.quiet,
    }}>{children}</span>
  )
}
