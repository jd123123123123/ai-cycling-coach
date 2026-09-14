import { useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import { ArrowRight, Check, Flag, Play, X } from 'lucide-react'
import { FONT, T } from './w3tokens'
import './w3PlanIntro.css'

export interface W3PlanIntroProps {
  /** Stable authenticated rider ID. Never use the display name. */
  userId: string | number
  /** Open the walkthrough again, including after it has been dismissed. */
  force?: boolean
  onClose?: () => void
}

const STEPS = [
  { title: 'Dein Ziel. Dein Weg.', body: 'FTP, Ausdauer oder dein nächstes Event. Du gibst die Richtung vor.' },
  { title: 'Eine Woche, die passt.', body: 'Training und Erholung im Überblick. Jede Einheit hat ihren Platz.' },
  { title: 'Bereit für draußen.', body: 'Einheit öffnen, Strecke prüfen und dein Training exportieren.' },
]
const HEIGHTS = [42, 102, 28, 130, 34, 160, 68]

function IntroVisual({ step }: { step: number }) {
  return <div className="w3-plan-intro-art" aria-hidden="true" key={step}>
    {step === 0 ? <>
      <svg className="w3-plan-intro-route" viewBox="0 0 340 260" fill="none">
        <path className="w3-plan-intro-route-shadow" d="M45 231C45 180 255 194 255 145S92 145 92 96S218 82 218 35" />
        <path className="w3-plan-intro-route-line" pathLength="1" d="M45 231C45 180 255 194 255 145S92 145 92 96S218 82 218 35" />
        <circle cx="45" cy="231" r="7" fill="currentColor" />
        <circle cx="218" cy="35" r="16" className="w3-plan-intro-target" />
        <circle cx="218" cy="35" r="5" fill="currentColor" />
      </svg>
      <span className="w3-plan-intro-goal"><Flag size={17} /> Dein Ziel</span>
      <span className="w3-plan-intro-start">Heute</span>
    </> : step === 1 ? <div className="w3-plan-intro-week">
      {HEIGHTS.map((height, index) => <div className="w3-plan-intro-day" key={index} style={{ '--bar-height': `${height}px`, '--delay': `${index * 65}ms` } as CSSProperties}>
        <i className={index === 3 ? 'is-current' : index === 2 || index === 4 ? 'is-rest' : ''} />
        <span className={index === 3 ? 'is-current' : ''}>{['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'][index]}</span>
      </div>)}
      <span className="w3-plan-intro-week-tag">Deine Woche</span>
    </div> : <div className="w3-plan-intro-workout">
      <div className="w3-plan-intro-workout-heading"><span>Deine nächste Einheit</span><Check size={20} /></div>
      <div className="w3-plan-intro-intervals">{[28, 33, 38, 43, 84, 84, 84, 32, 32, 84, 84, 84, 32, 32, 84, 84, 84, 36, 30, 24].map((height, index) => <i key={index} style={{ height, '--delay': `${index * 25}ms` } as CSSProperties} data-work={height === 84} />)}</div>
      <div className="w3-plan-intro-export"><span><Play size={13} fill="currentColor" /> Einheit ansehen</span><ArrowRight size={19} /></div>
    </div>}
  </div>
}

/** A small animated walkthrough, shown once per rider and feature version. */
export default function W3PlanIntro({ userId, force = false, onClose }: W3PlanIntroProps) {
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const descriptionId = useId()
  const [step, setStep] = useState(0)
  const [open, setOpen] = useState(false)
  const storageKey = `ridr:plan-intro:v1:${encodeURIComponent(String(userId))}`

  useEffect(() => {
    if (userId === '' || userId == null) return
    let seen = false
    try { seen = localStorage.getItem(storageKey) === 'seen' } catch { /* Private mode may disable storage. */ }
    if (!force && seen) return
    setStep(0)
    setOpen(true)
    const element = dialog.current
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    if (element && !element.open) element.showModal()
    return () => {
      element?.close()
      previousFocus?.focus({ preventScroll: true })
    }
  }, [storageKey, force, userId])

  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previousOverflow }
  }, [open])

  function close() {
    try { localStorage.setItem(storageKey, 'seen') } catch { /* Dismissal still works when storage is unavailable. */ }
    dialog.current?.close()
    setOpen(false)
    onClose?.()
  }

  const colors = {
    '--intro-bg': T.heroBg, '--intro-panel': T.heroDock, '--intro-ink': T.ink,
    '--intro-mid': T.mid, '--intro-acid': T.acid, '--intro-on-acid': '#0B0B0B',
    '--intro-stroke': T.stroke, '--intro-off': T.heroOff, '--intro-font': FONT,
  } as CSSProperties

  return <dialog ref={dialog} className="w3-plan-intro" style={colors} aria-labelledby={titleId} aria-describedby={descriptionId}
    onCancel={event => { event.preventDefault(); close() }}
    onClick={event => { if (event.target === event.currentTarget) { const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close() } }}>
    <div className="w3-plan-intro-content">
      <header><span>Neu · Dein Trainingsplan</span><button className="w3-plan-intro-close" aria-label="Einführung schließen" onClick={close} autoFocus><X size={19} /></button></header>
      {open && <IntroVisual step={step} />}
      <div className="w3-plan-intro-copy" aria-live="polite" aria-atomic="true">
        <h2 id={titleId}>{STEPS[step].title}</h2>
        <p id={descriptionId}>{STEPS[step].body}</p>
      </div>
      <nav className="w3-plan-intro-pagination" aria-label="Einführungsschritte">
        {STEPS.map((item, index) => <button key={item.title} onClick={() => setStep(index)} aria-label={`Schritt ${index + 1}: ${item.title}`} aria-current={step === index ? 'step' : undefined}><span /></button>)}
      </nav>
      <button className="w3-plan-intro-next" onClick={() => step === STEPS.length - 1 ? close() : setStep(step + 1)}>{step === STEPS.length - 1 ? 'Los geht’s' : 'Weiter'}<ArrowRight size={20} /></button>
    </div>
  </dialog>
}
