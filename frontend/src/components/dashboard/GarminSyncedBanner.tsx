import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'motion/react'
import { useLocale } from '../../contexts/LocaleContext'
import Confetti from '../ui/Confetti'

// Real post-connect confirmation: reads the counts the /garmin/connect call
// actually returned (activities + metric-days) and shows them — the honest
// "it worked" proof, not a cosmetic bar. Auto-dismisses; clears history state
// so a refresh doesn't re-trigger it.
interface JustConnected { activities_synced: number; metrics_days: number }

export default function GarminSyncedBanner() {
  const location = useLocation()
  const { locale } = useLocale()
  const de = locale === 'de'
  const info = (location.state as { garminJustConnected?: JustConnected } | null)?.garminJustConnected
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (!info) return
    setShow(true)
    window.history.replaceState({}, '') // don't re-show on refresh/back
    const t = setTimeout(() => setShow(false), 6500)
    return () => clearTimeout(t)
  }, [info])

  if (!info) return null

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="relative rounded-[16px] px-5 py-4 overflow-hidden"
          style={{
            background: 'color-mix(in srgb, var(--color-forest-2) 12%, var(--color-paper-2))',
            border: '1px solid color-mix(in srgb, var(--color-forest-2) 45%, transparent)',
          }}
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
        >
          <Confetti count={24} />
          <div className="relative flex items-center gap-3">
            <span style={{ fontSize: 22 }}>✅</span>
            <div>
              <div className="eyebrow" style={{ color: 'var(--color-forest-2)', letterSpacing: '0.16em', fontSize: 10.5 }}>
                {de ? 'GARMIN VERBUNDEN' : 'GARMIN CONNECTED'}
              </div>
              <p style={{ color: 'var(--color-ink)', fontSize: 14.5, marginTop: 2 }}>
                {de
                  ? `${info.activities_synced} Aktivitäten und ${info.metrics_days} Tage an Werten synchronisiert.`
                  : `Synced ${info.activities_synced} activities and ${info.metrics_days} days of metrics.`}
              </p>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
