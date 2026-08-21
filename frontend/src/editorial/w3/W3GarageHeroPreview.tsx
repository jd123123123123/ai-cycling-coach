import W3GarageHero from './W3GarageHero'
import type { Gear } from '../../api/gear'

/** TEMP preview — the garage as the hero, no backend.
 *  `/e/w3-garage-hero-preview` is unguarded like every other W3 preview.
 *
 *  The ids below are REAL catalogue ids, because `gearArt` resolves art by id
 *  (`/w3/gear/{id}.webp`) — invented ones render broken-image icons and make
 *  the preview lie about how the tiles look. */

const gear: Gear = {
  slots: { tyres: 'REIFEN', wheels: 'LAUFRÄDER', addons: 'ANBAU', cockpit: 'COCKPIT', luck: 'GLÜCK' },
  items: [
    { id: 'gravel_tyres', name_de: 'Gravel-Stollen', slot: 'tyres', slot_label: 'REIFEN', pct: 15, equipped: true, owned: true, price_rc: 0, rarity: 'common', note_de: '' },
    { id: 'climbing_wheels', name_de: 'Kletter-Laufräder', slot: 'wheels', slot_label: 'LAUFRÄDER', pct: 18, equipped: true, owned: true, price_rc: 0, rarity: 'rare', note_de: '' },
    { id: 'mudguards', name_de: 'Schutzbleche', slot: 'addons', slot_label: 'ANBAU', pct: 20, equipped: true, owned: true, price_rc: 0, rarity: 'common', note_de: '' },
    { id: 'bell', name_de: 'Messingklingel', slot: 'cockpit', slot_label: 'COCKPIT', pct: 12, equipped: true, owned: true, price_rc: 0, rarity: 'rare', note_de: '' },
  ],
} as unknown as Gear

export default function W3GarageHeroPreview() {
  return (
    <W3GarageHero
      handle="@jonathan.ghost"
      role="UMFANGSBLOCK · WOCHE 2 VON 4"
      rider={null}
      bike="/w3/starter-bike.webp"
      bikeName="Standert Kreissäge"
      coins="1.448"
      streak={17}
      bonus="1,4×"
      gear={gear}
      workshopBonus={925}
      onOpenSlot={() => {}}
      onOpenWorkshop={() => {}} />
  )
}
