import { useEffect, useRef, useState, type ReactNode } from 'react'
import { T, FONT } from './w3tokens'

/**
 * W3 · DAS WISCHDECK — Belege nebeneinander statt untereinander.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * WOFUER
 *
 * Die Fahrtseite war 4 701 px lang: fuenfeinhalb Bildschirmhoehen, und jedes
 * Kapitel hatte dieselbe Form wie das davor -- Ueberschrift, Balkenreihe,
 * Fussnote. Wer den Beleg fuer die Wiederholungen sehen wollte, scrollte an
 * drei anderen vorbei. Gemeldet als "less scrolling ... more right and left
 * swiping".
 *
 * Nebeneinander gelegt kostet dieselbe Information EINE Bildschirmhoehe, und
 * das Blaettern wird zur Geste statt zur Strecke.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * WARUM CSS-SNAP UND KEIN PAGER
 *
 * Dasselbe Argument wie im Morgen-Deck und im Fahrten-Deck: `scroll-snap-stop:
 * always` laesst eine Wischbewegung auf genau einer Karte landen, und der
 * Browser behaelt Schwung, Gummiband und Bedienhilfen. React faehrt hier
 * nichts -- es BEOBACHTET die Position, um den Punktanzeiger zu setzen.
 *
 * DIE PUNKTE SIND KEIN ZIERRAT. Ein waagerechtes Deck ohne Anzeiger verbirgt,
 * wie viel noch kommt; der Fahrer weiss nicht, ob er fertig ist. Sie sind
 * anklickbar, weil ein Anzeiger, der aussieht wie ein Knopf, auch einer sein
 * sollte.
 *
 * KEINE PFEILE. Auf einem Telefon ist die Geste das Bedienelement, und zwei
 * 44-px-Knoepfe am Rand wuerden genau die Breite fressen, die die Karte
 * braucht.
 */
export default function W3SwipeDeck({ labels, children }: {
  /** Ein kurzes Wort je Karte -- steht unter den Punkten und sagt, wo man ist. */
  labels: string[]
  children: ReactNode[]
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [i, setI] = useState(0)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    let raf = 0
    const lesen = () => {
      raf = 0
      const breite = el.clientWidth || 1
      setI(Math.max(0, Math.min(children.length - 1, Math.round(el.scrollLeft / breite))))
    }
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(lesen) }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => { el.removeEventListener('scroll', onScroll); if (raf) cancelAnimationFrame(raf) }
  }, [children.length])

  const springen = (n: number) => {
    const el = ref.current
    if (!el) return
    el.scrollTo({ left: n * el.clientWidth, behavior: 'smooth' })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontFamily: FONT }}>
      <div
        ref={ref}
        className="w3-swipe"
        role="group"
        aria-label={`${children.length} Belege, seitlich wischen`}
        style={{
          display: 'flex', overflowX: 'auto', overflowY: 'hidden',
          scrollSnapType: 'x mandatory', scrollbarWidth: 'none',
        }}
      >
        {children.map((kind, n) => (
          <div key={n}
               aria-hidden={n !== i}
               style={{
                 flex: '0 0 100%', minWidth: 0, boxSizing: 'border-box',
                 scrollSnapAlign: 'start', scrollSnapStop: 'always',
                 padding: '0 20px',
               }}>
            {kind}
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 20px' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {children.map((_, n) => (
            <button key={n} type="button" onClick={() => springen(n)}
                    aria-label={`Zu ${labels[n] ?? `Beleg ${n + 1}`}`}
                    aria-current={n === i}
                    style={{
                      width: n === i ? 22 : 7, height: 7, borderRadius: 100, border: 0,
                      padding: 0, cursor: 'pointer',
                      background: n === i ? T.acid : T.d2,
                      transition: 'width .22s cubic-bezier(0.22,1,0.36,1), background .22s',
                    }} />
          ))}
        </div>
        <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 600, color: T.quiet }}>
          {labels[i] ?? ''}
        </span>
      </div>
    </div>
  )
}
