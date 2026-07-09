# Adaptive Training Engine — evidence grounding

Deep-research pass (107 agents, adversarial 2/3-refute verification, 24/25 claims confirmed).
This is the grounding for the daily/weekly autoregulation engine. **Every rule below is
tagged with its evidence grade. Do not add thresholds that aren't traceable here.**

## What is genuinely supported

### HRV-guided autoregulation — STRONG (RCT)
- Morning/nocturnal HRV (lnRMSSD) guiding daily intensity beats fixed plans for
  *individual* response, though the *group* effect is small.
  - Javaloyes 2019 (RCT, n=17 well-trained cyclists, 8 wk): HRV-guided **+7.3% 40-min TT**
    (P=.005), +5.1% peak power; traditional periodization → no significant gains.
  - Nuuttila 2022 (RCT, n=30 runners, 15 wk): individualized 10-km **-6.2% vs -2.9%**
    (between-group P=.002, ES=1.23); high-responders **81% vs 23%**, negative-responders 0% vs 8%.
  - Meta-analyses temper magnitude: TT SMD ~0.20 (often NS), VO2max ES ~0.40 ("small").
- **Validated decision rule (Nuuttila 2022):** baseline = **4-week rolling average of
  lnRMSSD**; band = **± 0.5 × SD**. Inside band → proceed / progress. Below band → reduce
  or hold intensity. This is the one concrete, tested threshold — it is the engine's
  primary daily lever.

### ACWR — DISCREDITED as a threshold oracle (STRONG critique)
- Impellizzeri/Lolli/Wang (Sports Medicine 2020-21): ACWR is a mathematical rescaling of
  acute load; a **random or fixed chronic denominator predicts injury as well** as the real
  one; adds no predictive value over acute load / intercept-only. Authors call to dismiss it.
- A directional "higher acute ramp = higher risk" association survives, and a rough
  0.8–1.3 low-risk band appears in observational reviews (but the review itself cautions
  it's unreliable).
- **Engine rule:** use acute:chronic **only as a soft ramp-rate guardrail** (flag very fast
  load spikes), NEVER as a causal danger-zone threshold. Do not hard-code ">1.5 = danger".

## What is NOT well-supported (did not survive verification here) — EXPERT-OPINION only
Treat these as conservative, overridable defaults, clearly labelled, never RCT-grade:
- **PMC / TSB ranges** for freshness vs overreach, and CTL ramp-rate limits (e.g. "≤5–8
  CTL/wk"). Widely used in practice; not RCT-validated. Use as soft context, not gates.
- **Polarized 80/20 vs pyramidal.** Both work; no clean winner. Bias session mix gently.
- **NFOR / overtraining red-flag combinations.** Monitoring markers (HRV, RHR, sleep, sRPE,
  performance decrement) are plausible but no validated combination rule survived. Use a
  conservative multi-signal "concern" flag, not a diagnosis.
- **Within-ride decoupling** as an individual adaptation signal. Plausible durability proxy;
  not RCT-validated for prescription. Use as a corroborating signal only.

## Engine design (aggressive autoregulation, grounded)
Goal: ride the edge of **functional overreaching → supercompensation**, escalate when
adaptation is *confirmed*, deload on *genuine* maladaptation.

1. **Primary gate = HRV band** (RCT): below 4-wk ±0.5 SD → cap intensity (easy/recovery),
   trim volume. In-band → green to load. Above band + fresh → green to push.
2. **Escalate on confirmed adaptation:** if HRV holds in-band while load has been rising AND
   durability is improving (decoupling trend down) AND sleep intact → raise the ceiling and
   the ramp target (push harder next block). This is the "go crazier as I adapt" loop.
3. **Deload on maladaptation:** HRV below band ≥2 of last 3 days, OR multi-signal concern
   (HRV down + sleep debt + RHR up + performance/decoupling worse) → forced easy/recovery
   and volume cut.
4. **Safety rails:** soft ramp guardrail (acute vs chronic load spike) as a *warning*, not a
   hard gate (ACWR discredited). Never escalate through an HRV-below-band day.
5. **Ambition dial:** default AGGRESSIVE (target the top of the tolerable band); it widens as
   the athlete demonstrates repeated clean adaptation, narrows after any deload.

Narrative/explanation layer uses Opus 4.8 (`claude-opus-4-8`); the *decisions* are
deterministic from the rules above so the output is grounded, not LLM guesswork.
