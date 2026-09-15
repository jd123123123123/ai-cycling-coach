# RIDR · Completed Plan Result

## Handoff brief

This document is the product and interaction specification for rebuilding the completed-plan screen from scratch. It intentionally replaces the current implementation. The goal is a premium, calm, data-rich result experience that feels closer to Whoop, Apple Fitness and a high-end editorial sports product than to a dashboard full of cards.

The rider has finished a training plan. The screen must answer four questions in this order:

1. **Did I finish?**
2. **What changed in me?**
3. **Did the work match the plan?**
4. **What should happen next?**

The first viewport is the reward. The second viewport is the explanation. The next plan is a separate action below the result.

## Design direction

Use the existing RIDR dark system:

- near-black canvas, not a new white or grey surface
- RIDR acid lime only for confirmed progress and primary actions
- quiet graphite surfaces with thin, low-contrast rules
- large type for the one emotional statement
- no dashboard grid of equal cards
- no tiny explanatory labels competing with the main result
- no generic “AI insight” copy, badges, confetti or game UI
- motion should feel like a premium instrument powering up: one controlled reveal, a soft ring draw, and a very slow light sweep
- reduced-motion mode must remove all non-essential animation

The result should feel like opening a beautifully made instrument panel: one strong signal, then evidence.

## First viewport: the result hero

### Composition

```text
┌──────────────────────────────────────────────┐
│ BLOCK 08 / 08                         COMPLETE │
│                                                │
│   (100)             Stronger                    │
│  COMPLETE           than at the start.          │
│                     8 weeks. Your body knows    │
│                     this route now.             │
│                                                │
│  FTP          VO₂max          RECORDS          │
│  240 → 258 W  48 → 51         5 improved       │
│  +18 W        +3              personal bests    │
│                                                │
│  PLAN EFFECT                                   │
│  ── plan dosage                                │
│  ━━ actual dosage                              │
│  start ───────────────────────────── finish   │
│  94% executed · what this changed             │
│                                                │
│  1,984 TSS   642 km   26.4 h   18 rides       │
│                                                │
│  PERFORMANCE PROFILE  ›                        │
│  compact radar preview                         │
└──────────────────────────────────────────────┘
```

### Hero rules

- The completion ring is a visual completion signal, not a health score.
- The emotional sentence is one line of meaning, never a paragraph.
- The three comparison measures are the only primary KPIs: FTP, VO₂max, records.
- Total volume is evidence, visually subordinate to adaptation.
- The plan-effect graph is the only load graph in the hero. Do not add a second load card or a duplicate “average TSS” block.
- The radar preview is clickable and opens the complete progress detail view.

Recommended German copy:

- `BLOCK 08 / 08 · ABGESCHLOSSEN`
- `Stärker als am Start.`
- `{weeks} Wochen. Dein Körper kennt den Weg jetzt.`
- `PLANWIRKUNG`
- `Was das verändert`
- `LEISTUNGSPROFIL · Tippen für FTP, VO₂max und Rekorde`

If the plan was not completed, change the emotional statement and the explanation, not the entire layout:

- `Du bist unterwegs abgebogen.`
- `Der Plan wurde zu {adherence}% umgesetzt.`
- `Das ist passiert – und so holen wir den fehlenden Reiz nach.`

Never call a partial plan a success.

## The graphs

### 1. Performance profile preview

Use the existing five-axis radar, but make it a compact preview in the hero:

- Sprint / 5 s
- Antritt / 1 min
- Kurzleistung / 5 min
- Schwellenbereich / 20 min
- Dauerleistung / 60 min

Draw two shapes:

- before: quiet dashed graphite line
- now: RIDR lime line with a restrained fill

The preview has no controls. Tapping anywhere on it opens the detail view.

### 2. Plan effect graph

This is a two-series chart, not a generic trend line:

- `Plan-Soll`: the weekly target TSS from `weekly_tss_targets`
- `Dein Weg`: actual cycling TSS grouped by plan week from activities

Visual rules:

- plan line: quiet dashed line
- actual line: lime, rounded joins, slightly luminous
- thin horizontal guides only; no heavy axes
- label the endpoints `Planstart` and `Abschluss`
- show a small percentage chip: `94 % umgesetzt`
- show missing weeks honestly; do not interpolate missing rides as completed load

This graph describes training dosage. It must not be labelled as a guaranteed FTP forecast.

### 3. Counterfactual goal curve

Only show this when the backend has a real model output. The API must provide:

```ts
type PlanCounterfactual = {
  metric: 'ftp' | 'vo2max' | 'record';
  baseline: number;
  target_if_adherent: number;
  estimated_actual: number | null;
  confidence: 'low' | 'medium' | 'high';
  basis: 'pmc' | 'plan_simulation' | 'insufficient_data';
  explanation_de: string;
}
```

If `basis === 'insufficient_data'`, do not draw a fake dotted target. Show:

`Eine belastbare Zielkurve braucht noch mehr Messpunkte.`

The user must always be able to distinguish:

- measured
- planned
- modelled
- missing

## Detail view opened from the profile preview

The bottom progress module should no longer sit permanently below the result hero. It becomes a full-height detail sheet or expanded card opened by tapping the profile preview.

### Header

```text
Fortschritt
FTP                         schließen
```

### Controls

Metric selector:

- FTP
- VO₂max
- Rekorde

Time selector immediately below:

- Woche
- Monat
- Jahr
- Seit Plan

The selected calendar period must use the existing swipeable period rail. The average and comparison period update with the selection.

### FTP detail

- smooth measured line with actual points only
- baseline marker
- selected-period average / latest value
- delta to baseline
- target marker only if an explicit target exists
- short method note on demand

### VO₂max detail

- same structure, different unit
- show device/source and date of the selected measurement
- no false daily precision when measurements are sparse

### Records detail

- five durations: 5 s, 1 min, 5 min, 20 min, 60 min
- before / now / all-time best
- current selected duration is large; other durations stay quiet
- a record improvement is a measured change, not a score

## Partial-plan explanation

The card needs a clear branch for plans below 80% adherence. The data contract should expose:

```ts
type PlanExecution = {
  planned_tss_total: number;
  actual_tss_total: number;
  adherence_percent: number;
  planned_weeks: number[];
  actual_weeks: (number | null)[];
  missed_sessions: number;
  skipped_high_intensity_sessions: number;
  completed_recovery_sessions: number;
  reason_code: 'under_target' | 'over_target' | 'on_target' | 'insufficient_data';
  explanation_de: string;
  impact_de: string;
}
```

The explanation should be generated from facts:

- under target: `Weniger Schwellen- und VO₂-Reize wurden gesetzt. Deshalb bleibt der Leistungszuwachs hinter der Plan-Sollkurve.`
- over target: `Mehr Belastung als vorgesehen kann zusätzlichen Reiz setzen, erhöht aber auch die Ermüdung. Der nächste Block wird konservativer aufgebaut.`
- on target: `Die Dosis lag nah am Plan. Dadurch ist der Start→Abschluss-Vergleich belastbarer.`
- insufficient data: `Es fehlen noch Aktivitäten oder Messpunkte für eine faire Bewertung.`

Do not blame the rider. Explain the training consequence and the next adaptive action.

## Adaptive plan logic

The result screen is only as good as the engine behind it. The next-plan action should use the following evidence hierarchy:

1. completed activities and actual TSS
2. session type and intensity distribution
3. recovery and readiness signals
4. progress in FTP, VO₂max and records
5. event demands and available training time
6. rider age and training history

Use established training concepts as model inputs, not as decorative language:

- progressive overload
- polarized intensity distribution
- recovery weeks / deloads
- CTL / ATL / TSB or the app’s equivalent load model
- individual response to threshold and VO₂ work
- monotony and acute load guardrails
- HRV and resting-heart-rate deviations as context, never as a single decision

The next plan should adapt automatically:

- missed hard sessions: do not blindly stack them; place the stimulus where recovery permits
- excessive load: reduce intensity or insert recovery before adding volume
- improving threshold with weak endurance: shift the next block toward sustainable volume
- improving endurance with stagnant high-intensity power: add one precise VO₂ or sprint stimulus only if readiness supports it
- low data quality: reduce confidence and ask for the missing device or ride data

## Age-specific behavior

Age is a recovery and risk modifier, not a label shown as a judgement.

- use age to adjust recovery spacing, progression rate and deload sensitivity
- do not simply multiply or divide a plan by age
- combine age with training age, recent load, sleep, HRV, injury history and available hours
- explain the reason in plain language: `Dein nächster Block bekommt etwas mehr Abstand zwischen den harten Reizen, damit der Trainingsreiz ankommt.`
- never expose medical claims or diagnose fatigue

The backend should own these rules. The frontend should display the chosen adaptation, its evidence and confidence.

## Data states

### Completed and well-supported

Show the full result hero, plan-effect graph, profile preview and detail sheet.

### Completed but sparse data

Show measured values that exist. Replace absent values with `—`. Keep the completion statement, but state that the comparison is limited.

### Partially completed

Show actual adherence, missing-session reason and impact. Do not use celebratory “complete” language.

### Plan ended with no saved start baseline

Show the next-goal entry state. Do not invent a Start→Jetzt comparison.

## Interaction and motion

- one 900–1200 ms completion-ring draw
- profile preview gently resolves after the ring
- plan-effect graph draws once from left to right
- no looping confetti, no bouncing badges, no flashing reward effects
- clicking the profile preview opens the detail sheet at FTP + Seit Plan
- closing returns to the same scroll position
- preserve the selected metric and selected period during the sheet session
- support keyboard focus and reduced motion

## Acceptance criteria

- first viewport communicates completion in under two seconds
- FTP, VO₂max and records are readable without scanning a dashboard
- total TSS, km, hours and rides are visible but secondary
- plan-vs-actual graph is mathematically derived from weekly targets and cycling activities
- missing data remains visibly missing
- no bottom progress dashboard duplicates the hero
- one tap opens FTP / VO₂max / records with week / month / year / since-plan selectors
- partial-plan impact is factual, constructive and actionable
- the next plan is created from the actual execution and rider context
- the screen fits a 390 × 844 phone without a broken card or accidental horizontal scroll

## Suggested implementation order

1. Define the `PlanExecution` and `PlanCounterfactual` API contracts.
2. Move plan-vs-actual aggregation into a tested domain helper.
3. Build the new completed-result hero as a standalone component.
4. Reuse `W3ProgressAnalyticsView` inside a dedicated detail sheet.
5. Add visual tests for completed, partial, sparse and no-baseline states.
6. Validate on 390 × 844 and 430 × 932.
7. Only then connect the next-plan adaptive action.

The important product decision is this: the completion screen celebrates what the rider actually achieved, then explains the training evidence, then adapts the next block. It never mixes reward, raw analytics and speculative physiology into one undifferentiated card.
