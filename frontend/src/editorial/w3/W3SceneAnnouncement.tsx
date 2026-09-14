import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Bike, Flag, RefreshCw, X } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import RidrMark, { RIDR_LIME } from '../../components/RidrMark'
import { useAuth } from '../../contexts/AuthContext'
import { useGarage } from '../../hooks/useGarage'
import { claimGate, gateHolder, releaseGate } from './w3gates'
import './W3SceneAnnouncement.css'

const GATE = 'scene-announcement-v1'
const attempted = new Set<string>()
export const sceneAnnouncementKey = (riderId: string | number) => `ridr:scene-announcement:v1:${encodeURIComponent(String(riderId))}`
const MAIN_ROUTES = new Set(['/e/w3-today', '/e/w3-rides', '/e/w3-biker', '/e/w3-plan', '/e/w3-garage'])

export function SceneAnnouncementView({ onClose, onExplore }: { onClose: () => void; onExplore: () => void }) {
  return <div className="w3-scene-announcement-content">
    <header><span className="w3-scene-announcement-brand"><RidrMark size={27} color={RIDR_LIME} /> RIDR</span><button aria-label="Ankündigung schließen" onClick={onClose} autoFocus><X size={20} /></button></header>
    <div className="w3-scene-announcement-copy"><span>Neu in deinen Erfolgen</span><h2 id="w3-scene-announcement-title">Deine Fahrten.<br />Andere Welten.</h2><p>Erreiche Meilensteine und schalte neue Kulissen für dein eigenes Bike frei.</p></div>
    <figure><img src="/w3/scenes/startrampe.webp" alt="Beispielkulisse: Ein Rennrad auf einer Startrampe" /><figcaption><strong>Houston, wir haben Waden</strong><span>200 km in einer Fahrt</span><small>Beispielbild mit Referenzrad</small></figcaption></figure>
    <ol aria-label="So funktioniert es"><li><RefreshCw size={19} /><span>Fahrt syncen</span></li><li><Flag size={19} /><span>Meilenstein erreichen</span></li><li><Bike size={19} /><span>Kulisse freischalten</span></li></ol>
    <footer><button className="w3-scene-announcement-primary" onClick={onExplore}>Erfolge entdecken<ArrowRight size={21} /></button><button className="w3-scene-announcement-later" onClick={onClose}>Später</button></footer>
  </div>
}

function AnnouncementGate({ riderId }: { riderId: number }) {
  const navigate = useNavigate()
  const garage = useGarage()
  const dialog = useRef<HTMLDialogElement>(null)
  const [open, setOpen] = useState(false)
  const key = sceneAnnouncementKey(riderId)

  useEffect(() => {
    // Garage setup owns the launch until both original collectibles exist.
    if (garage.isLoading || !garage.data?.rider?.image_base64 || !garage.data?.bike?.image_base64 || attempted.has(key)) return
    try { if (localStorage.getItem(key) === 'seen') return } catch { /* Session memory still prevents repeat prompts. */ }
    const timer = window.setTimeout(() => {
      attempted.add(key)
      if (document.visibilityState === 'hidden' || document.querySelector('dialog[open], [aria-modal="true"]') || !claimGate(GATE)) return
      try { if (localStorage.getItem(key) === 'seen') { releaseGate(GATE); return } } catch { /* Storage may be disabled. */ }
      setOpen(true)
    }, 3200)
    return () => window.clearTimeout(timer)
  }, [garage.isLoading, garage.data, key])

  useEffect(() => {
    if (!open || !dialog.current) return
    const element = dialog.current
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const overflow = document.body.style.overflow
    element.showModal()
    try { localStorage.setItem(key, 'seen') } catch { /* Local-only announcement state, never an unlock authority. */ }
    document.body.style.overflow = 'hidden'
    // Required setup can seize the gate after an async refresh; user-opened
    // rewards/other dialogs also take precedence over this announcement.
    const check = window.setInterval(() => {
      const other = Array.from(document.querySelectorAll('dialog[open], [aria-modal="true"]')).some(node => node !== element && !element.contains(node))
      if (gateHolder() !== GATE || other) setOpen(false)
    }, 200)
    return () => {
      window.clearInterval(check)
      element.close()
      document.body.style.overflow = overflow
      releaseGate(GATE)
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true })
    }
  }, [open, key])

  return open ? <dialog ref={dialog} className="w3-scene-announcement" aria-labelledby="w3-scene-announcement-title" onCancel={event => { event.preventDefault(); setOpen(false) }}>
    <SceneAnnouncementView onClose={() => setOpen(false)} onExplore={() => { setOpen(false); navigate('/e/w3-wins') }} />
  </dialog> : null
}

/** One introduction per authenticated rider/version on this browser. */
export default function W3SceneAnnouncement() {
  const { user, isLoading } = useAuth()
  const location = useLocation()
  if (isLoading || !user || !MAIN_ROUTES.has(location.pathname)) return null
  return <AnnouncementGate key={user.id} riderId={user.id} />
}
