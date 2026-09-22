import { createContext, useContext, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useLocation, useNavigate } from 'react-router-dom'
import W3TodayStage, { STAGE_PLATE, type W3StageVm } from './W3TodayStage'
import { stageThemeById } from './w3stageThemes'
import { useGroundColour } from './useGroundColour'
import W3StatusBar from './W3StatusBar'
import W3TopBar from './W3TopBar'
import W3TabBar from './W3TabBar'
import { T, FONT, EASE } from './w3tokens'
import './w3.css'

/**
 * W3 · THE ROOM THAT DOES NOT MOVE.
 *
 * Today and the garage are the same bike in the same room, and until now each
 * screen tore that room down and rebuilt it. The rider watched their own
 * machine flash out and back in to answer a different question about it, which
 * is the moment an app stops feeling like a place and starts feeling like a
 * website.
 *
 * So the stage is hoisted into a LAYOUT. It mounts once and stays mounted
 * across every route nested under it: same element, same image, no reload, no
 * flash. What swaps is the panel over the floor and the content beneath —
 * exactly the two things that are actually about the current screen.
 *
 * ── WHY A CONTEXT AND NOT A ROUTE TABLE ──────────────────────────────────
 * The obvious version maps pathname → panel in this file. It works and it puts
 * every screen's panel in a file that is about none of them: adding a screen
 * would mean editing its own component AND this one, and the two would drift.
 * A page declares its own panel instead, and this only decides WHERE panels go.
 *
 * ── WHY A PORTAL AND NOT PANEL STATE ─────────────────────────────────────
 * The shell could hold the panel in state and let pages push into it. That
 * version HANGS: a page's panel is JSX, so it is a fresh object on every
 * render, so pushing it sets state, which re-renders, which pushes again. A
 * portal has no such loop — the panel stays in the page's own render tree and
 * merely lands somewhere else in the DOM, so it re-renders when the page's data
 * changes and never when the shell's does.
 *
 * ── WHAT DOES NOT PERSIST, ON PURPOSE ────────────────────────────────────
 * The panel and the content belong to the current screen and swap with it. A
 * readiness meter animating into an equipment rack would be a transition
 * between two things that have nothing to do with each other; a fade says
 * "different answer" where a morph would say "same thing, changed".
 */

const Ctx = createContext<HTMLElement | null>(null)

/** The colour the room's plate ends in, resolved by the shell (known by
 *  construction for a procedural theme, sampled for the studio webp). Screens
 *  inside the room read it for their runway instead of re-sampling a plate
 *  that may not even be the one on stage. Null outside the shell. */
const GroundCtx = createContext<string | null>(null)
export function useStageGround(): string | null {
  return useContext(GroundCtx)
}

/**
 * Render this screen's panel — the bar that floats over the floor — into the
 * shared room, and report whether the room took it.
 *
 * `inShell` is false when the caller is NOT inside the shell, which is how a
 * page can be rendered both ways: nested under the layout it hands its panel
 * over, and standalone (a preview route, a deep link that skips the shell) it
 * keeps drawing its own room. Silence rather than an error, because a page
 * outside the room is a legitimate thing to be.
 */
export function useHeroPanel(node: ReactNode): { inShell: boolean; portal: ReactNode } {
  const host = useContext(Ctx)
  const reduce = useReducedMotion()
  if (!host) return { inShell: false, portal: null }
  return {
    inShell: true,
    portal: createPortal(
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.24, ease: EASE }}>
        {node}
      </motion.div>,
      host,
    ),
  }
}

export interface W3HeroShellProps {
  vm: W3StageVm
  children: ReactNode
}

export default function W3HeroShell({ vm, children }: W3HeroShellProps) {
  // The theme knows its own ground; only the studio webp needs sampling.
  const theme = vm.theme ?? stageThemeById(null)
  const sampled = useGroundColour(theme.ground == null ? STAGE_PLATE : null)
  const ground = theme.ground ?? sampled
  const reduce = useReducedMotion()
  const { pathname } = useLocation()
  const nav = useNavigate()
  const [host, setHost] = useState<HTMLElement | null>(null)
  // The machine is the door to its own garage — from every room screen, and
  // not from the garage itself, where the tap would be a loop.
  const compact = pathname === '/e/w3-today'
  const archive = pathname === '/e/w3-rides'
  const onGarage = pathname.startsWith('/e/w3-garage') ? undefined : () => nav('/e/w3-garage')

  return (
    <Ctx.Provider value={host}>
    <GroundCtx.Provider value={ground}>
      <div className="w3-root">
        <div className={`w3-frame${archive ? ' has-archive' : ''}`} style={{ fontFamily: FONT, display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
          <div className={`w3-hero-slot${archive ? ' w3-hero-slot-archive' : ''}`} style={{
            position: 'relative',
            // FAHRTEN RESERVIERTE DEN GANZEN SCHIRM FUER EINE BUEHNE, DIE ES
            // NICHT ZEICHNET. Die Zeile darueber setzt `auto`, und die Zeile
            // hier ueberschrieb es sofort wieder mit `100svh - 92px` samt
            // `minHeight: 560px` -- waehrend die Buehne darin auf
            // `display: none` steht. Zusammen mit `marginTop: 'auto'` am Panel
            // ergab das rund 480 px Nichts zwischen Titel und Dock: man
            // scrollte an einem leeren Bildschirm vorbei, um an die Fahrten zu
            // kommen. Die Ueberschreibung ist raus; `auto` gilt jetzt wirklich.
            height: compact || archive ? 'auto' : 'calc(100dvh - 92px - env(safe-area-inset-bottom))',
            display: 'flex', flexDirection: 'column',
            background: ground ?? T.heroBg,
          }}>
            {!compact && <W3StatusBar />}
            {archive && <W3TopBar title="Fahrten" />}

            {/* MOUNTED ONCE. No key on this — a key here would be the whole
                point thrown away, because React would unmount the stage and the
                bike would flash on every navigation. */}
            <div data-w3-persistent-stage style={{ display: archive ? 'none' : 'contents' }}>
              <W3TodayStage fullBleed={!compact} compact={compact} vm={{ ...vm, onTapBike: onGarage }} />
            </div>

            <div style={{
              // `marginTop: auto` schiebt das Panel an den Fuss einer Buehne,
              // die ueber ihm steht. Auf Fahrten steht dort nichts, also gibt
              // es auch nichts, wovon man sich abstossen muesste.
              position: 'relative', zIndex: 2, marginTop: archive ? undefined : 'auto',
              // The bike stands on a floor line at 76 % of the stage; a panel
              // starting higher cuts across the machine beside it.
              padding: compact || archive ? '0 16px 8px' : '10px 16px 18px', flex: 'none',
            }}
              // The landing site for whatever the current screen portals in.
              ref={setHost} />
          </div>

          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={pathname}
              initial={reduce ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={reduce ? undefined : { opacity: 0 }}
              transition={{ duration: 0.18, ease: EASE }}
              style={{ display: 'flex', flexDirection: 'column' }}>
              {children}
            </motion.div>
          </AnimatePresence>

          <W3TabBar />
        </div>
      </div>
    </GroundCtx.Provider>
    </Ctx.Provider>
  )
}
