import { useState } from 'react'
import W3Gear from './W3Gear'
import W3PlacesView from './W3PlacesView'
import type { Backdrop, Place } from '../../api/garage'
import W3StatusBar from './W3StatusBar'
import W3TabBar from './W3TabBar'
import { T, FONT } from './w3tokens'
import './w3.css'
import type { Gear, GearItem, GearRarity } from '../../api/gear'

/**
 * Design route for the gear shop: /e/w3-gear-preview.
 *
 * The fixture puts every tile STATE on screen at once, which is the only way to
 * check that the grid is readable without reading it: equipped, owned, buyable,
 * and locked-because-too-poor all have to be distinguishable at a glance and at
 * tile size.
 *
 * Prices and percentages mirror `services/earn_modifiers` exactly, so this
 * route doubles as a check that client and server agree about the catalogue.
 */
const SLOTS: Record<string, string> = {
  tyres: 'REIFEN', wheels: 'LAUFRÄDER', mounted: 'ANBAU',
  cockpit: 'COCKPIT', charm: 'GLÜCK',
}
const PRICE: Record<GearRarity, number> = { common: 600, rare: 1800, legendary: 4500 }
const BALANCE = 2140

/** The ten hand-written stages, in catalogue order, with the states a rider
 *  actually sees: one selected, several earned, the rest still to ride. */
const PREVIEW_BACKDROPS: Backdrop[] = [
  { id: 'studio_black', name_de: 'Studio', unlock_de: '', unlocked: true, selected: false },
  { id: 'starter_road', name_de: 'Startstraße', unlock_de: '', unlocked: true, selected: true },
  { id: 'night_road', name_de: 'Nachtstraße', unlock_de: '', unlocked: true, selected: false },
  { id: 'dawn_road', name_de: 'Morgengrauen', unlock_de: 'Fahrt vor 7 Uhr gestartet', unlocked: true, selected: false },
  { id: 'mountain_pass', name_de: 'Passhöhe', unlock_de: '1 000 hm an einem Tag', unlocked: false, selected: false },
  { id: 'coast_road', name_de: 'Küstenstraße', unlock_de: '100 km am Stück', unlocked: true, selected: false },
  { id: 'rain_road', name_de: 'Regenstraße', unlock_de: 'Eine Fahrt im Regen', unlocked: false, selected: false },
  { id: 'gravel_track', name_de: 'Schotterweg', unlock_de: 'Eine Schotterfahrt', unlocked: false, selected: false },
  { id: 'winter_road', name_de: 'Winterstraße', unlock_de: 'Eine Fahrt bei 0 °C oder kälter', unlocked: false, selected: false },
  { id: 'velodrome', name_de: 'Bahn', unlock_de: 'Eine Fahrt mit IF 0,95 oder höher', unlocked: false, selected: false },
]

/** Empty on purpose: a rider who has discovered no places still has to be able
 *  to change the room their bike stands in, and that path must be visible here. */
const PREVIEW_PLACES: Place[] = []

function item(
  id: string, name_de: string, slot: string, rarity: GearRarity, pct: number,
  why: string, flavour_de: string,
  state: 'equipped' | 'owned' | 'shop' = 'shop',
): GearItem {
  const price_rc = PRICE[rarity]
  return {
    id, name_de, slot, slot_label: SLOTS[slot], rarity, pct, price_rc, why, flavour_de,
    owned: state !== 'shop',
    equipped: state === 'equipped',
    affordable: BALANCE >= price_rc,
  }
}

const FIXTURE: Gear = {
  balance: BALANCE,
  slots: SLOTS,
  items: [
    item('gravel_tyres', 'Gravel-Stollen', 'tyres', 'common', 15,
      'Zählt auf Schotter und Trails.',
      'Grober Stollen, breite Karkasse. Asphalt ist optional.', 'equipped'),
    item('slicks', 'Slicks', 'tyres', 'common', 12,
      'Zählt trocken auf der Straße ab 28 km/h Schnitt.',
      'Kein Profil, kein Widerstand, keine Ausreden.', 'owned'),
    item('winter_tyres', 'Spike-Reifen', 'tyres', 'rare', 28,
      'Zählt unter 3 °C.',
      'Für Tage, an denen vernünftige Menschen den Bus nehmen.'),
    item('balloon_tyres', 'Ballonreifen', 'tyres', 'common', 18,
      'Zählt auf ruhigen Fahrten unter 20 km/h ab 25 km.',
      'Fährt über alles drüber. Hat es nie eilig.'),
    item('climbing_wheels', 'Kletter-Laufräder', 'wheels', 'common', 18,
      'Zählt ab 1 000 Höhenmetern.',
      'Jedes eingesparte Gramm zählt — behauptet jedenfalls die Werbung.', 'equipped'),
    item('disc_wheel', 'Scheibenrad', 'wheels', 'legendary', 32,
      'Zählt nur im echten Zeitfahren: flach, ab 34 km/h, IF ab 0,85.',
      'Ein Rad ohne Speichen und ohne Sinn für Kompromisse.'),
    item('steel_rims', 'Stahlfelgen', 'wheels', 'rare', 16,
      'Zählt auf ruhigen Fahrten unter 20 km/h ab 25 km.',
      'Schwer wie Blei, hält länger als du.'),
    item('mudguards', 'Schutzbleche', 'mounted', 'common', 20,
      'Zählt, wenn es geregnet hat.',
      'Der Unterschied zwischen einem Regenstreifen und einer Dusche.', 'owned'),
    item('dynamo_light', 'Nabendynamo', 'mounted', 'rare', 25,
      'Zählt im Dunkeln.',
      'Geht nie aus. Braucht nie Akku. Summt ein bisschen.', 'equipped'),
    item('bikepacking_bags', 'Bikepacking-Taschen', 'mounted', 'common', 22,
      'Zählt ab 100 km.',
      'Alles dabei, was du brauchst. Und drei Dinge, die du nie auspackst.'),
    item('frame_pump', 'Rahmenpumpe', 'mounted', 'common', 14,
      'Zählt ab 3 Stunden im Sattel.',
      'Wiegt nichts, bis du sie brauchst. Dann wiegt sie alles.'),
    item('bell', 'Messingklingel', 'cockpit', 'common', 12,
      'Zählt auf Fahrten mit deiner Crew.',
      'Ein freundliches Ding. Klingt teurer, als sie war.', 'equipped'),
    item('aero_bars', 'Zeitfahraufsatz', 'cockpit', 'rare', 24,
      'Zählt flach und schnell — ab 28 km/h Schnitt.',
      'Bequem ist etwas anderes. Schnell ist genau das hier.'),
    item('power_meter', 'Powermeter', 'cockpit', 'common', 8,
      'Zählt auf jeder Fahrt mit Wattmessung.',
      'Die Zahl, die nicht lügt. Leider.', 'owned'),
    item('regel_neun', 'Regel-9-Aufkleber', 'charm', 'legendary', 35,
      'Zählt bei Regen unter 8 °C ab 50 km.',
      'Wer bei diesem Wetter fährt, ist Hardcore. Punkt.'),
    item('lanterne_rouge', 'Lanterne Rouge', 'charm', 'legendary', 30,
      'Zählt, wenn du einen geplanten Ruhetag wirklich ruhig gefahren bist.',
      'Die rote Laterne des Letzten — und die schwerste Disziplin überhaupt: langsam fahren, wenn langsam draufsteht.'),
    item('espresso_token', 'Espresso-Marke', 'charm', 'common', 15,
      'Zählt auf Fahrten, die vor 8 Uhr starten.',
      'Eine Fahrt vor dem ersten Kaffee zählt doppelt. Gefühlt.', 'equipped'),
    item('goat_charm', 'Bergziege', 'charm', 'rare', 26,
      'Zählt an Rampen ab 15 % Steigung.',
      'Ein kleiner Messinganhänger. Behauptet, sie sei schon steiler gefahren.'),
    item('banana', 'Bananenschale am Sattel', 'charm', 'common', 18,
      'Zählt ab 3 Stunden im Sattel.',
      'Klassiker. Funktioniert seit hundert Jahren.', 'owned'),
    item('club_socks', 'Zu hohe Socken', 'charm', 'common', 14,
      'Zählt auf Fahrten mit deiner Crew.',
      'Die Sockenhöhe ist Ausdruck des Charakters. Deiner ist grenzwertig.'),
  ],
}

export default function W3GearPreview() {
  const [gear, setGear] = useState<Gear>(FIXTURE)
  const [selectedStage, setSelectedStage] = useState('starter_road')

  /** The real reducers, locally — including slot displacement, which is the
   *  behaviour most worth seeing before it ships. */
  const setItem = (id: string, patch: Partial<GearItem>) =>
    setGear((g) => ({ ...g, items: g.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) }))

  const onEquip = (id: string) => setGear((g) => {
    const target = g.items.find((i) => i.id === id)
    if (!target) return g
    return {
      ...g,
      items: g.items.map((i) =>
        i.id === id ? { ...i, equipped: true }
          : i.slot === target.slot ? { ...i, equipped: false } : i),
    }
  })

  const onBuy = (id: string) => setGear((g) => {
    const target = g.items.find((i) => i.id === id)
    if (!target || target.owned || !target.affordable) return g
    const balance = g.balance - target.price_rc
    return {
      ...g,
      balance,
      items: g.items.map((i) =>
        i.id === id ? { ...i, owned: true } : { ...i, affordable: balance >= i.price_rc }),
    }
  })

  return (
    <div className="w3-root">
      <div className="w3-frame" style={{ fontFamily: FONT, minHeight: '100dvh', background: T.heroBg }}>
        <W3StatusBar />
        <div style={{ padding: '8px 20px 16px', display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span style={{ fontSize: 26, fontWeight: 700, letterSpacing: -0.8, color: T.ink }}>Ausrüstung</span>
          <span style={{ marginLeft: 'auto', fontSize: 15, fontWeight: 700, color: T.ink, fontVariantNumeric: 'tabular-nums' }}>
            ✳ {gear.balance.toLocaleString('de-DE')}
          </span>
        </div>
        <W3Gear
          gear={gear} loading={false} busyId={null}
          onBuy={onBuy} onEquip={onEquip}
          onUnequip={(id) => setItem(id, { equipped: false })} />
        {/* THE PLACES AND THE KULISSEN, because the shipped screen has them.
            This preview drew the parts grid alone while `W3GearScreen` renders
            `W3PlacesPanel` underneath it, so the design route disagreed with the
            page — and a preview that disagrees with its page sends design work
            after problems that do not exist, or hides ones that do. The
            backdrop grid was invisible here for exactly that reason. */}
        <W3PlacesView
          embedded
          balance={gear.balance}
          places={PREVIEW_PLACES}
          backdrops={PREVIEW_BACKDROPS.map((b) => ({ ...b, selected: b.id === selectedStage }))}
          selected={selectedStage}
          busySlug={null}
          onBuy={() => {}}
          onSelect={setSelectedStage}
          onBack={() => {}} />
        <W3TabBar />
      </div>
    </div>
  )
}
