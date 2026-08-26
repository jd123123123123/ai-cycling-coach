import type { Wrapped } from '../../pages/WeeklyWrapped'
import type { W3WrappedSlide, W3WrappedVm } from './W3WrappedView'

/**
 * The week's payload, turned into a deck.
 *
 * THE ORDER IS THE DESIGN. Each slide is bigger than the one before it —
 * distance, then time, then the single hardest thing you did, then whether you
 * did what you said you would, then the summary. A deck that opens on its best
 * number has nowhere left to climb, which is why Wrapped never opens on your
 * top artist.
 *
 * EVERY SLIDE IS GATED ON ITS OWN DATA. A rider with no power meter does not
 * get an empty peak-power slide, they get a shorter deck. A Wrapped that
 * invents a statistic to keep its rhythm is worth less than a four-card one
 * that is true — and this app's honesty rule does not pause for a celebration.
 */

const de = (n: number, dp = 0) =>
  n.toLocaleString('de-DE', { minimumFractionDigits: dp, maximumFractionDigits: dp })

/** "Mo 18. – So 24. August" */
function weekLabel(startISO: string, endISO: string): string {
  const a = new Date(startISO)
  const b = new Date(endISO)
  const f = (d: Date, withMonth: boolean) =>
    d.toLocaleDateString('de-DE', withMonth ? { day: 'numeric', month: 'long' } : { day: 'numeric' })
  return `${f(a, a.getMonth() !== b.getMonth())} – ${f(b, true)}`
}

/** What the rider's own pictures are, when the app has them. Absent images are
 *  simply absent — a slide falls back to its colour field rather than to a
 *  stock photograph, because a Wrapped built on somebody else's bike is worse
 *  than one built on none. */
export interface WrappedArt {
  /** The composed scene for the week's best ride: their machine, that road. */
  bestRideScene?: string | null
  /** Their bike, cut out, from the garage. */
  bike?: string | null
}

export function buildWrappedVm(w: Wrapped, art: WrappedArt = {}): W3WrappedVm {
  const slides: W3WrappedSlide[] = []
  const label = weekLabel(w.week_start, w.week_end)

  // 1 · THE PROMISE. No numbers on purpose — the deck earns them.
  slides.push({
    key: 'open',
    kind: 'open',
    eyebrow: 'Deine Woche',
    lead: 'Sieben Tage.',
    accent: 'Schauen wir sie an.',
    foot: label,
  })

  // 2 · DISTANCE, with the city line the coach wrote for it.
  if (w.totals.km > 0) {
    slides.push({
      key: 'km',
      kind: 'figure',
      eyebrow: 'Gefahren',
      value: de(w.totals.km, 1),
      unit: 'km',
      lead: w.totals.sessions === 1 ? 'In einer Fahrt.' : `Über ${de(w.totals.sessions)} Fahrten.`,
      foot: w.distance_comparison ?? undefined,
      series: w.daily_effort.map((d) => d.km),
      // The week's shape, behind the number that measures it.
      route: w.route?.points ?? null,
    })
  }

  // 3 · TIME. The "minutes listened" of cycling — the number that sounds like
  //     an investment rather than a measurement.
  if (w.totals.hours > 0) {
    slides.push({
      key: 'saddle',
      kind: 'figure',
      eyebrow: 'Im Sattel',
      value: w.totals.saddle_hm,
      unit: '',
      lead: 'So lange warst du',
      accent: 'draußen.',
      foot: w.saddle_line ?? undefined,
      image: art.bike ?? null,
    })
  }

  // 4 · THE SINGLE HARDEST THING. One moment, not an average — this is the
  //     slide people screenshot.
  if (w.peak_power) {
    const beaten = w.peak_power.comparison.filter((c) => !c.you && c.watts < w.peak_power!.watts)
    slides.push({
      key: 'peak',
      kind: 'effort',
      eyebrow: 'Dein stärkster Moment',
      value: de(w.peak_power.watts),
      unit: 'W',
      lead: w.peak_power.wkg != null ? `${de(w.peak_power.wkg, 1)} W/kg.` : 'Volle Leistung.',
      accent: beaten.length > 0 ? `Mehr als ${beaten[0].label}.` : undefined,
      foot: w.peak_power.wkg != null ? 'Spitzenleistung dieser Woche' : undefined,
    })
  }

  // 5 · THE NAMED RIDE, in the broadsheet register — a title set large is how
  //     a ride becomes a story rather than a row.
  if (w.best_ride) {
    slides.push({
      key: 'best',
      kind: 'broadsheet',
      eyebrow: 'Die Fahrt der Woche',
      lead: w.best_ride.title,
      foot: `${de(w.best_ride.km, 1)} km · ${w.best_ride.moving} · ${de(w.best_ride.tss)} TSS`,
      // Their machine, on the road this ride actually took.
      image: art.bestRideScene ?? null,
    })
  }

  // 6 · YOU AGAINST WHAT YOU SAID YOU WOULD DO. The only fair opponent this
  //     payload carries — there is no last-week total in it, and inventing one
  //     to make a nicer slide is exactly what this app does not do.
  if (w.planned_tss != null && w.planned_tss > 0) {
    const frac = w.totals.tss / w.planned_tss
    slides.push({
      key: 'plan',
      kind: 'compare',
      eyebrow: 'Gegen deinen Plan',
      value: `${Math.round(frac * 100)}`,
      unit: '%',
      lead: frac >= 1 ? 'Du hast geliefert,' : 'Du warst unterwegs,',
      accent: frac >= 1 ? 'und mehr.' : 'wenn auch nicht ganz.',
      versus: {
        thisWeek: `${de(Math.round(w.totals.tss))} TSS gefahren`,
        lastWeek: `${de(Math.round(w.planned_tss))} geplant`,
        frac,
      },
    })
  }

  // 7 · THE END CARD, built to leave.
  const bits = [
    `${de(w.totals.km, 1)} km`,
    w.totals.saddle_hm,
    w.elevation_m != null && w.elevation_m > 0 ? `${de(Math.round(w.elevation_m))} hm` : null,
  ].filter(Boolean).join('  ·  ')
  slides.push({
    key: 'finale',
    kind: 'finale',
    eyebrow: label,
    value: de(w.totals.sessions),
    unit: w.totals.sessions === 1 ? 'Fahrt' : 'Fahrten',
    lead: w.zero_missed ? 'Keine ausgelassen.' : 'Das war deine Woche.',
    accent: w.ctl_delta != null && w.ctl_delta > 0 ? `Fitness +${de(w.ctl_delta, 1)}.` : undefined,
    foot: bits,
    series: w.daily_effort.map((d) => d.tss),
    image: art.bestRideScene ?? art.bike ?? null,
    route: w.route?.points ?? null,
  })

  return { weekLabel: label, slides, shareLabel: 'Woche teilen' }
}
