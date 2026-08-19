import { useState } from 'react'
import W3GarageStage from './W3GarageStage'
import W3StatusBar from './W3StatusBar'
import W3TabBar from './W3TabBar'
import { T, FONT } from './w3tokens'
import './w3.css'
import type { Gear, GearItem, GearRarity } from '../../api/gear'

/**
 * Design route for the garage: /e/w3-garage-stage-preview.
 *
 * Uses the REAL build render rather than the plain bike, because the whole
 * point of this screen is that the photograph shows what the rider equipped —
 * a preview on the base bike would verify the layout and hide the feature.
 * That image is the actual output of `bike_build.edit_prompt` for the loadout
 * below: gravel tyres, mudguards, bags and a bell on the rider's own frame.
 */
const SLOTS: Record<string, string> = {
  tyres: 'REIFEN', wheels: 'LAUFRÄDER', mounted: 'ANBAU',
  cockpit: 'COCKPIT', charm: 'GLÜCK',
}

function item(
  id: string, name_de: string, slot: string, rarity: GearRarity,
  pct: number, why: string, equipped: boolean,
): GearItem {
  return {
    id, name_de, slot, slot_label: SLOTS[slot], rarity, pct,
    price_rc: 600, why, flavour_de: '', owned: true, equipped, affordable: true,
  }
}

const GEAR: Gear = {
  balance: 2140,
  slots: SLOTS,
  items: [
    item('gravel_tyres', 'Gravel-Stollen', 'tyres', 'common', 15,
      'Zählt auf Schotter und Trails.', true),
    item('climbing_wheels', 'Kletter-Laufräder', 'wheels', 'common', 18,
      'Zählt ab 1 000 Höhenmetern.', true),
    item('mudguards', 'Schutzbleche', 'mounted', 'common', 20,
      'Zählt, wenn es geregnet hat.', true),
    item('bell', 'Messingklingel', 'cockpit', 'common', 12,
      'Zählt auf Fahrten mit deiner Crew.', true),
    item('goat_charm', 'Bergziege', 'charm', 'rare', 26,
      'Zählt an Rampen ab 15 % Steigung.', false),
  ],
}

export default function W3GarageStagePreview() {
  const [building, setBuilding] = useState(false)
  return (
    <div className="w3-root">
      <div className="w3-frame" style={{ fontFamily: FONT, minHeight: '100dvh', background: T.heroBg }}>
        <W3StatusBar />
        <div style={{ padding: '8px 20px 10px', display: 'flex', alignItems: 'baseline' }}>
          <span style={{ fontSize: 26, fontWeight: 700, letterSpacing: -0.8, color: T.ink }}>Garage</span>
          <span style={{ marginLeft: 'auto', fontSize: 15, fontWeight: 700, color: T.ink }}>✳ 2.140</span>
        </div>
        <W3GarageStage
          gear={GEAR}
          bikeImage="/w3/bike-build-example.webp"
          bikeName="Dein Rad"
          building={building}
          workshopBonus={925}
          onOpenSlot={() => { setBuilding(true); setTimeout(() => setBuilding(false), 1200) }}
          onOpenWorkshop={() => {}} />
        <W3TabBar />
      </div>
    </div>
  )
}
