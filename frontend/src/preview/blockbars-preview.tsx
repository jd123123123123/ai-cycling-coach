/** Scratch visual harness for BlockBars — NOT part of the app; delete after
 *  screenshotting. Renders the corrected composite-set stripes with real
 *  user-5 numbers (FTP 240 → Antritts-Intervalle 30×15/45 @ 150%). */
import { createRoot } from 'react-dom/client'
import BlockBars from '../components/workout/BlockBars'
import type { ResolvedBlock } from '../api/coach'
import '../index.css'

const b = (over: Partial<ResolvedBlock>): ResolvedBlock => ({
  name: '', duration_s: 600, target_watts_low: 108, target_watts_high: 132,
  target_pct_ftp: 0.5, zone: 1, rpe: 2, cadence_low: null, cadence_high: null,
  target_hr_low: null, target_hr_high: null, ...over,
})

const microbursts: ResolvedBlock[] = [
  b({ name: 'Warm-up', duration_s: 900, target_pct_ftp: 0.55, zone: 1 }),
  b({
    name: 'Microburst set (30×15/45s)', duration_s: 1800,
    target_watts_low: 342, target_watts_high: 378, target_pct_ftp: 1.5, zone: 6, rpe: 9,
    reps: 30, on_s: 15, off_s: 45, off_pct_ftp: 0.5, off_watts_low: 114, off_watts_high: 126,
  }),
  b({ name: 'Cool-down', duration_s: 600 }),
]

const ronnestad: ResolvedBlock[] = [
  b({ name: 'Warm-up', duration_s: 900, target_pct_ftp: 0.55 }),
  ...[1, 2, 3].flatMap((i) => [
    b({
      name: `Set ${i} — 13×30/15s @ 110% FTP`, duration_s: 585,
      target_watts_low: 251, target_watts_high: 277, target_pct_ftp: 1.1, zone: 5, rpe: 9,
      reps: 13, on_s: 30, off_s: 15, off_pct_ftp: 0.5,
    }),
    b({ name: 'Recovery', duration_s: 180 }),
  ]).slice(0, 5),
  b({ name: 'Cool-down', duration_s: 600 }),
]

const overUnders: ResolvedBlock[] = [
  b({ name: 'Warm-up', duration_s: 900, target_pct_ftp: 0.55 }),
  ...[1, 2, 3].flatMap((i) => [
    b({
      name: `OU set ${i} (5×1/1min)`, duration_s: 600,
      target_watts_low: 239, target_watts_high: 265, target_pct_ftp: 1.05, zone: 4, rpe: 8,
      reps: 5, on_s: 60, off_s: 60, off_pct_ftp: 0.95,
    }),
    b({ name: 'Recovery', duration_s: 300 }),
  ]).slice(0, 5),
  b({ name: 'Cool-down', duration_s: 600 }),
]

function Card({ title, sub, blocks }: { title: string; sub: string; blocks: ResolvedBlock[] }) {
  return (
    <div style={{ background: 'var(--color-surface, #16181d)', borderRadius: 16, padding: 16, marginBottom: 16 }}>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 2 }}>{title}</div>
      <div style={{ fontSize: 12, opacity: 0.6, marginBottom: 12 }}>{sub}</div>
      <BlockBars blocks={blocks} height={96} />
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <div style={{ padding: 16, minHeight: '100vh', background: 'var(--color-bg, #0b0c0f)', color: 'var(--color-text, #fff)', fontFamily: 'system-ui' }}>
    <Card title="Antritts-Intervalle — 30×15/45 s" sub="ON 30×15 s @ 342–378 W (150%) · OFF 45 s @ 114–126 W" blocks={microbursts} />
    <Card title="VO2 kurz-kurz — 3×(13×30/15 s)" sub="ON @ 110% · OFF @ 50%" blocks={ronnestad} />
    <Card title="Über-Unter — 3×(5×1/1 min)" sub="Over 105% / Under 95% — off stripes stay Z4-colored" blocks={overUnders} />
  </div>,
)
