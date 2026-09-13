export interface MorningJourney {
  id: string; name: string; region: string; terrain: string; saying: string; position: string; image: string; author: string; license: string; licenseUrl: string; source: string
}

/** Real places for inspiration, not route guidance or today’s location. */
export const MORNING_JOURNEYS: readonly MorningJourney[] = [
  {
    "id": "cloud-road",
    "name": "Bergstraße",
    "region": "Tourinspiration",
    "terrain": "Berge",
    "saying": "Dafür fahren wir.",
    "position": "50% 62%",
    "image": "/w3/morning/cloud-road.jpg",
    "author": "Tiago Espindola de Oliveira",
    "license": "Pexels License",
    "licenseUrl": "https://www.pexels.com/license/",
    "source": "https://www.pexels.com/photo/cyclist-riding-on-scenic-mountain-road-31312269/"
  },
  {
    "id": "canyon",
    "name": "Bergschlucht",
    "region": "Tourinspiration",
    "terrain": "Berge",
    "saying": "Nur du. Und Weite.",
    "position": "50% 42%",
    "image": "/w3/morning/canyon.jpg",
    "author": "Frank Rolando Romero",
    "license": "Unsplash License",
    "licenseUrl": "https://unsplash.com/license",
    "source": "https://unsplash.com/photos/cyclist-riding-on-a-winding-road-near-mountains-bdVcH9ENxTk"
  },
  {
    "id": "switzerland",
    "name": "Schweizer Alpen",
    "region": "Schweiz · Pass nicht angegeben",
    "terrain": "Berge",
    "saying": "Zusammen weiter.",
    "position": "60% 50%",
    "image": "/w3/morning/switzerland.jpg",
    "author": "Jack White",
    "license": "Unsplash License",
    "licenseUrl": "https://unsplash.com/license",
    "source": "https://unsplash.com/photos/two-cyclists-ride-on-a-mountain-road-51FJUdlM5H0"
  }
]

/** Stable by local calendar day, including across DST changes. */
export function morningJourneyIndex(date = new Date()): number {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000) % MORNING_JOURNEYS.length
}
