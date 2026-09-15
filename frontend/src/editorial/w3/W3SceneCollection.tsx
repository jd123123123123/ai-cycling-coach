import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Check, ChevronRight, Share2, X, LockKeyhole } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { fetchStageGallery, fetchStageImage, type StageCard, type StageGallery } from '../../api/stageGallery'
import { useSelectStage } from '../../hooks/useGarage'
import { useMyReferrals } from '../../hooks/useReferrals'
import { fetchMyReferrals } from '../../api/referral'
import { inviteUrl, inviteDisplay } from './w3invite'
import { backdropArt, backdropImage } from './w3backdropArt'
import { SCENE_COPY, TIER_ORDER } from './w3sceneCopy'
import { motion } from 'motion/react'
import W3RewardCase from './W3RewardCase'
import W3SceneDevelop from './W3SceneDevelop'
import RidrMark from '../../components/RidrMark'
import { FONT, T } from './w3tokens'
import './w3scenes.css'

const RARITY: Record<string,string> = { alltag:'Klassiker', ernsthaft:'Besonders', selten:'Selten', legendaer:'Legendär', mythisch:'Mythisch', kurios:'Kurios' }

export function ScenePortrait({ scene, obscured = false, fill = false }: { scene: Pick<StageCard, 'id' | 'plate_url' | 'image'>; bike: string | null; obscured?: boolean; fill?: boolean }) {
  const image = scene.image || scene.plate_url || backdropImage(scene.id)
  return <div className={`w3-scene-portrait ${obscured ? 'is-obscured' : ''}`} style={{ background: backdropArt(scene.id).css, ...(fill ? { height: '100%', aspectRatio: 'auto' } : {}) }}>
    {image && <img className="w3-scene-world" src={image} alt={scene.image ? "Dein Fahrrad in der Kulisse" : "Kulissenvorschau mit Referenzrad"} loading="lazy" />}

  </div>
}

/** These are earned catalogue thresholds, never a claim about exact ride measurements. */
const REWARD_MILESTONES: Record<string, { value: string; unit: string; context: string }> = {
  startrampe: { value: '200', unit: 'km', context: 'in einer Fahrt' },
  waschanlage: { value: '> 2', unit: 'h', context: 'Fahrt mit Regen' },
  mond: { value: '5.000', unit: 'hm', context: 'in einer Fahrt' },
}

function RewardIdentity({ scene, newlyRevealed }: { scene: StageCard; newlyRevealed: boolean }) {
  const milestone = REWARD_MILESTONES[scene.id]
  const headline = SCENE_COPY[scene.id] ?? scene.name_de.replace(/^Die |^Der |^Das /, '')
  return <div className="w3-reward-identity">
    <div className="w3-reward-kicker"><RidrMark size={21} color="#C6F53C" /><span>{newlyRevealed ? 'Neue Kulisse für dein Bike' : 'Kulisse für dein Bike'}</span></div>
    <h2 id="scene-reward-title">{headline}</h2>
    <span className="w3-rarity-pill">{RARITY[scene.tier] ?? 'Klassiker'}</span>
    <div className="w3-reward-milestone">
      <span className="w3-milestone-status">{scene.owned ? <><Check size={12} strokeWidth={2.3}/>Geschafft</> : 'Dein nächster Meilenstein'}</span>
      {milestone ? <><strong>{milestone.value}<small>{milestone.unit}</small></strong><span>{milestone.context}</span></> : <strong className="is-prose">{scene.unlock_de}</strong>}
    </div>
  </div>
}

function progressText(s: StageCard) {
  const p = s.progress
  if (p?.current == null || p.target == null || p.pct == null) return null
  const isHeight = s.id === 'mond'
  const current = isHeight ? p.current : p.current / 1000
  const target = isHeight ? p.target : p.target / 1000
  return `Längste ${isHeight ? 'Kletterfahrt' : 'Fahrt'}: ${Math.round(current).toLocaleString('de-DE')} / ${target.toLocaleString('de-DE')} ${isHeight ? 'hm' : 'km'}`
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  const img = new Image(); img.src = src; await img.decode(); return img
}
export async function scenePoster(scene: StageCard, _bike?: string | null, referralCode?: string): Promise<Blob> {
  if (!scene.image) throw new Error('Dein Bild ist noch nicht bereit')
  await document.fonts.ready
  const world = await loadImage(scene.image)
  const canvas = document.createElement('canvas'); canvas.width = 1080; canvas.height = 1920
  const c = canvas.getContext('2d')!; c.drawImage(world, 0, 0, 1080, 1920)
  const g = c.createLinearGradient(0, 0, 0, 900); g.addColorStop(0, '#000c'); g.addColorStop(1, '#0000'); c.fillStyle = g; c.fillRect(0, 0, 1080, 900)
  c.fillStyle = '#D2FE5B'; c.font = `700 32px ${FONT}`; c.fillText('RIDR / VERDIENT', 70, 110)
  c.fillStyle = '#fff'; c.font = `700 78px ${FONT}`
  const words = (SCENE_COPY[scene.id] ?? scene.name_de).split(' '); let line = '', yLine = 260
  for (const word of words) { const next = line ? `${line} ${word}` : word; if (c.measureText(next).width > 920) { c.fillText(line, 70, yLine); yLine += 92; line = word } else line = next }
  c.fillText(line, 70, yLine)
  c.font = `500 34px ${FONT}`; c.fillText(scene.unlock_de, 70, yLine + 80)
  const bottom = c.createLinearGradient(0, 1640, 0, 1920); bottom.addColorStop(0, '#0000'); bottom.addColorStop(1, '#000c'); c.fillStyle = bottom; c.fillRect(0, 1640, 1080, 280)
  c.fillStyle = '#fff'; c.font = `600 36px ${FONT}`; c.fillText(scene.name_de, 70, 1790)
  if (scene.unlocked_at) { c.fillStyle = '#ffffffb0'; c.font = `500 28px ${FONT}`; c.fillText(new Date(scene.unlocked_at).toLocaleDateString('de-DE'), 70, 1830) }
  if (referralCode) {
    const label = inviteDisplay(referralCode)
    c.fillStyle = '#080b0de8'; c.fillRect(0, 1858, 1080, 62)
    let size = 27
    c.font = `500 ${size}px ${FONT}`
    while (c.measureText(label).width > 940 && size > 17) { size -= 1; c.font = `500 ${size}px ${FONT}` }
    c.textAlign = 'center'; c.fillStyle = '#e5eadb'; c.fillText(label, 540, 1898); c.textAlign = 'start'
  }
  return new Promise((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('Bildexport fehlgeschlagen')), 'image/png'))
}

export function SceneCollectionView({ data, bike, onSelect, selecting = false, onRide, loadOriginal, referralCode, loadReferralCode, reveal = false, revealOnly = false }: { referralCode?: string; loadReferralCode?: () => Promise<string>; reveal?: boolean; revealOnly?: boolean; data: StageGallery; bike: string | null; onSelect: (id: string) => Promise<unknown>; selecting?: boolean; onRide?: (id: number) => void; loadOriginal?: (id: string) => Promise<string> }) {
  const [filter, setFilter] = useState<'owned' | 'open'>('owned')
  const [selected, setSelected] = useState<StageCard | null>(null)
  const [sealed, setSealed] = useState(false)
  const [opening, setOpening] = useState(false)
  const revealTimers = useRef<ReturnType<typeof setTimeout>[]>([])
  useEffect(() => () => { revealTimers.current.forEach(clearTimeout) }, [])
  const unveil = () => {
    if (opening) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) { setSealed(false); return }
    setOpening(true)
    const at = (ms: number, fn: () => void) => revealTimers.current.push(setTimeout(fn, ms))
    const haptic = (pattern: number[]) => { try { navigator.vibrate?.(pattern) } catch { /* Optional haptics. */ } }
    at(1400, () => haptic([16])); at(2500, () => haptic([16, 40, 16]))
    at(3500, () => haptic([16, 40, 16, 40, 70, 120, 140]))
    at(3600, () => setSealed(false))
    at(6200, () => haptic([16]))
    at(8400, () => setOpening(false))
  }
  const [sharing, setSharing] = useState(false); const [message, setMessage] = useState('')
  const dialog = useRef<HTMLDialogElement>(null)
  const collected = data.stages.filter(s => s.owned && !s.starter)
  const open = data.stages.filter(s => !s.owned && !s.starter).sort((a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier) || (b.progress?.pct ?? -1) - (a.progress?.pct ?? -1))
  const cards = filter === 'owned' ? collected : open
  const openedOnce = useRef(false)
  useEffect(() => {
    if (!openedOnce.current && reveal && data.stages.some(s => s.owned)) {
      openedOnce.current = true
      setSelected(data.stages.find(s => s.owned) ?? null); setSealed(true); dialog.current?.showModal()
    }
  }, [reveal, data])
  useEffect(() => { setSelected(current => current ? data.stages.find(s => s.id === current.id) ?? current : null) }, [data])
  const inspect = (s: StageCard) => { setSealed(false); setSelected(s); setMessage(''); dialog.current?.showModal() }
  const share = async () => {
    if (!selected) return; setSharing(true); setMessage('')
    try {
      const master = loadOriginal ? { ...selected, image: await loadOriginal(selected.id) } : selected
      const code = referralCode || await loadReferralCode?.()
      if (loadReferralCode && !code) throw new Error('Referral code unavailable')
      const blob = await scenePoster(master, bike, code), file = new File([blob], `ridr-${selected.id}.png`, { type: 'image/png' })
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: selected.name_de, ...(code ? {url:inviteUrl(code)} : {}) })
      else { const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = file.name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 30000); setMessage('Story gespeichert') }
    } catch (e) { if (!(e instanceof Error && e.name === 'AbortError')) setMessage('Teilen gerade nicht möglich. Bitte erneut versuchen.') }
    finally { setSharing(false) }
  }
  return <section className={`w3-scenes ${revealOnly ? 'is-reveal-only' : ''}`} style={{ fontFamily: FONT, color: T.ink }}>
    <header className="w3-scenes-heading"><div><h2>Deine<br />Sammlung.</h2></div><div className="w3-scenes-count"><strong>{collected.length}</strong><span>von {data.stages.filter(s => !s.starter).length} Kulissen</span></div></header>
    <div className="w3-scenes-switch" role="group" aria-label="Kulissen filtern"><button aria-pressed={filter === 'owned'} onClick={() => setFilter('owned')}>Verdient <span>{collected.length}</span></button><button aria-pressed={filter === 'open'} onClick={() => setFilter('open')}>Noch offen <span>{open.length}</span></button></div>
    {cards.length === 0 && <div className="w3-scenes-empty"><h3>{filter === 'owned' ? 'Die erste kommt mit deiner Fahrt.' : 'Deine Sammlung ist komplett.'}</h3>{filter === 'owned' && <button onClick={() => setFilter('open')}>Kulissen entdecken <ChevronRight size={16} /></button>}</div>}
    <div className={filter === 'owned' ? 'w3-scenes-grid' : 'w3-scenes-list'}>
      {cards.map(s => <button key={s.id} className={`w3-collectible tier-${s.tier} ${s.owned ? 'is-earned' : 'is-locked'}`} onClick={() => inspect(s)} aria-label={`${s.name_de} · ${RARITY[s.tier] ?? 'Klassiker'} · ${s.unlock_de}`}>
        <div className="w3-collectible-face">
          <ScenePortrait scene={s} bike={bike} />
          <div className="w3-collectible-grain" aria-hidden />
          <div className="w3-collectible-crown"><span className="w3-collectible-rarity"><i aria-hidden />{RARITY[s.tier] ?? 'Klassiker'}</span>{s.selected ? <Check size={14} aria-label="Aktiv" /> : !s.owned ? <LockKeyhole size={13} aria-label="Noch offen" /> : <RidrMark size={18} color="#ffffffb0" />}</div>
          
          <i className="w3-collectible-glint" aria-hidden />
        </div>
        <div className="w3-collectible-title"><strong>{s.name_de.replace(/^Die |^Der |^Das /, '')}</strong><span>{s.unlock_de}</span></div>
        {!s.owned && s.progress?.pct != null && <div className="w3-collectible-progress"><div><i style={{ width: `${s.progress.pct * 100}%` }} /></div><span>{progressText(s)}</span></div>}
      </button>)}
    </div>
    <motion.dialog ref={dialog} animate={opening ? { x:[0,0,-1,1,-2,2,0], rotate:[0,0,-.3,.3,-.45,.45,0], boxShadow:['0 24px 100px #0008','0 24px 100px #0008','0 24px 110px #000a','0 24px 110px #000a','0 24px 110px #000a','0 24px 100px #c6f53c18','0 24px 100px #0008'] } : {x:0,rotate:0,boxShadow:'0 24px 100px #0008'}} transition={{duration:3.6,times:[0,.4,.52,.64,.78,.92,1]}} aria-labelledby="scene-reward-title" className={`w3-scene-dialog tier-${selected?.tier ?? 'alltag'} ${sealed ? 'is-sealed' : ''} ${opening ? 'is-unlocking' : ''}`} onClose={() => { revealTimers.current.forEach(clearTimeout); revealTimers.current = []; setOpening(false); setSealed(false); try { navigator.vibrate?.(0) } catch { /* Optional haptics. */ } }} onClick={e => { if (e.target === e.currentTarget) dialog.current?.close() }}>
      {selected && <>
      {(selected.image || selected.plate_url || backdropImage(selected.id)) && <img src={selected.image || selected.plate_url || backdropImage(selected.id)!} alt="" style={{display:'none'}} />}
      {opening && <div className="w3-reveal-fx" aria-hidden><i className="w3-reveal-halo" /><i className="w3-reveal-ring first" /><i className="w3-reveal-ring second" /><i className="w3-reveal-flash" />{Array.from({length:8},(_,i)=><i key={i} className={`w3-reveal-shard s${i}`} />)}</div>}
      <span className="w3-scene-live-status" role="status" aria-live="polite">{!sealed && reveal ? `${selected.name_de}: Kulisse freigeschaltet. ${selected.unlock_de}.` : ''}</span><button className="w3-scene-close" aria-label="Schließen" onClick={() => dialog.current?.close()}><X size={20} /></button>{sealed ? <div className={`w3-scene-sealed ${opening ? 'is-opening' : ''}`}><span className="w3-sealed-tier">{RARITY[selected.tier] ?? 'Klassiker'}</span><W3RewardCase opening={opening} onOpen={unveil}/><h2 id="scene-reward-title">Diese Fahrt bleibt.</h2><p>{selected.unlock_de}</p><button type="button" className="w3-scene-reveal-action" disabled={opening} onClick={unveil}>Kulisse enthüllen</button></div> : <div className={`w3-scene-unsealed ${opening ? 'is-developing' : ''}`}><ScenePortrait scene={selected} bike={bike} obscured={!selected.owned} />{opening && selected.image && <W3SceneDevelop src={selected.image} />}{['legendaer','mythisch'].includes(selected.tier) && <div className="w3-legendary-atmosphere" aria-hidden><i className="w3-legendary-light"/><i className="w3-legendary-light second"/></div>}<RewardIdentity scene={selected} newlyRevealed={reveal && selected.owned} />{!SCENE_COPY[selected.id] && <div className="w3-reward-caption" />}</div>}<div className="w3-scene-detail" hidden={sealed}>{!selected.owned && progressText(selected) && <p>{progressText(selected)}</p>}
        {selected.owned && <div className="w3-scene-actions"><button disabled={selecting || selected.selected} onClick={async () => { try { await onSelect(selected.id); setSelected({ ...selected, selected: true }); setMessage('Als Hintergrund gesetzt') } catch { setMessage('Hintergrund konnte nicht gesetzt werden') } }}>{selected.selected ? 'Aktiver Hintergrund' : selecting ? 'Wird gesetzt…' : 'Als Hintergrund setzen'}</button>{selected.image && <button aria-label="Als Story teilen" disabled={sharing} onClick={() => void share()}><Share2 size={18} /><span>Teilen</span></button>}</div>}
        {selected.owned && selected.activity_id != null && onRide && <button className="w3-scene-ride" onClick={() => onRide(selected.activity_id!)}>Die Fahrt dazu <ChevronRight size={15} /></button>}
        {selected.owned && !selected.image && <p role="status">{selected.render_status === 'pending' ? 'Dein Rad wird in Szene gesetzt. Die Kulisse gehört dir bereits.' : 'Kulissenvorschau. Beim Auswählen wird dein eigenes Rad eingesetzt.'}</p>}
        {referralCode && <a className="w3-scene-referral" href={inviteUrl(referralCode)} target="_blank" rel="noopener noreferrer" aria-label={`Dein RIDR-Einladungslink: ${inviteDisplay(referralCode)}`}><RidrMark size={16} color="currentColor"/><span>RIDR</span><span>/r/{referralCode}</span></a>}
        {message && <p role="status">{message}</p>}
      </div></>}
    </motion.dialog>
  </section>
}

export default function W3SceneCollection() {
  const q = useQuery({ queryKey: ['garage', 'gallery'], queryFn: fetchStageGallery, staleTime: 60000, refetchInterval: query => query.state.data?.stages.some(s => s.render_status === 'pending') ? 5000 : false })
  const select = useSelectStage(), nav = useNavigate(), referrals = useMyReferrals()
  if (q.isPending) return <div className="w3-scenes" aria-busy="true">Deine Sammlung lädt…</div>
  if (!q.data) return <div className="w3-scenes"><p>Deine Sammlung konnte nicht geladen werden.</p><button onClick={() => void q.refetch()}>Erneut versuchen</button></div>
  return <SceneCollectionView referralCode={referrals.data?.code} loadReferralCode={async () => (await fetchMyReferrals()).code} data={q.data} bike={null} loadOriginal={fetchStageImage} selecting={select.isPending} onSelect={async id => { await select.mutateAsync(id); await q.refetch() }} onRide={id => nav(`/e/w3-ride/${id}`)} />
}
