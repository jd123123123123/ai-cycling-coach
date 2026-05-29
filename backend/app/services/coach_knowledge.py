"""
Coaching knowledge base — research-backed principles the LLM must respect when
writing daily briefs. Injected as a cached prefix to the system prompt so
prompt caching keeps it cheap (5-min TTL on Anthropic's ephemeral cache).

Scope is intentionally narrow: the principles, thresholds and frameworks the
coach should align with — *not* exhaustive prose. The goal is to anchor the
model's reasoning around values we already track (HRV, rHR, sleep,
TSS/CTL/ATL/TSB, FTP, VO2, polarized distribution) using consensus literature.

Sources cited in shorthand are reputable and load-bearing; the model uses them
as guardrails, not as quotes for the user.
"""

# IMPORTANT: keep this string stable. It is part of the cached prompt prefix —
# editing it invalidates the prompt cache hash and forces a cold token cost.
COACH_KNOWLEDGE_BASE = """
COACHING KNOWLEDGE BASE — apply these principles when writing the brief.
Cite frameworks by short name; do not lecture the athlete.

──── 1. RECOVERY & READINESS (HRV, rHR, sleep) ────
- Daily HRV (RMSSD) trend matters more than absolute value. Use a 7-day
  rolling baseline; flag readiness DOWN when today's HRV is more than ~1
  SD below that baseline for 2+ consecutive days (Plews & Buchheit 2013;
  Stanford / Düking 2020 HRV-guided training studies show 6–10% larger VO2
  gains than fixed plans).
- Resting HR elevated >5 bpm vs. 14-day baseline = pre-fatigue / illness
  signal — pair with HRV before recommending a hard session.
- Sleep <7 h or sleep-debt >2 h over 3 nights cuts power output ~3–5%
  (Fullagar 2015). Treat sleep as an upstream input to all training calls.
- Body Battery <30 at wake → cap session at zone 1–2 unless taper.

──── 2. TRAINING LOAD (Banister fitness–fatigue model) ────
- CTL ≈ chronic fitness (42-day EWMA of TSS). ATL ≈ acute fatigue (7-day
  EWMA). TSB = CTL − ATL = freshness/form.
- Safe weekly CTL ramp = 3–7 TSS/day. >8 TSS/day for 2+ weeks → injury &
  illness risk doubles (Gabbett 2016, ACWR > 1.5).
- TSB interpretation: +5 to −10 productive; −10 to −30 hard training
  block tolerable short-term; <−30 high overreaching risk; +15 to +25
  race-ready / peaked.
- TSS/IF context: IF 0.65–0.75 endurance, 0.76–0.85 tempo, 0.86–0.95
  threshold/SS, >0.95 VO2/race. Decoupling >5% on a long ride flags
  durability gap — prescribe Z2 volume, not more intervals.

──── 3. INTENSITY DISTRIBUTION (Seiler polarized / pyramidal) ────
- Best long-term aerobic gains come from ~80% Z1–Z2 (below VT1) and
  15–20% Z4–Z5 (above VT2), with very little Z3 ("threshold trap")
  (Seiler 2010; Stöggl & Sperlich 2014).
- Norwegian sub-threshold (Ingebrigtsen) is a valid alternative once a
  large Z2 base is in place — double-threshold days, lactate ~2.5–3.5
  mmol/L, twice weekly.
- VO2max blocks (4×4 min @ 90–95% HRmax / 110–115% FTP) drive the
  largest VO2 gains in 6–8 sessions (Helgerud 2007). Recover ≥48 h.

──── 4. PERIODIZATION (Friel / block / reverse) ────
- Phase rhythm: Base → Build → Peak → Race → Transition. Build = 3:1
  load:recovery weeks for most athletes; 2:1 for masters (>45 y) or
  high-stress lifestyles.
- Strength work (2× heavy lifts/week) preserves economy and bone density
  (Rønnestad 2014); do not drop entirely in-season.
- Tapering: 8–14 days, ~40–60% volume cut, intensity preserved (Mujika
  2010). CTL drops; TSB climbs to +15–25 by race day.

──── 5. FTP, VO2 MAX, ECONOMY ────
- FTP ≈ MLSS proxy. Re-test every 4–6 weeks during build; otherwise
  rely on rolling 20-min / 60-min power data. VO2 max via Storer (cycling)
  = (FTP × 10.8 / weight_kg) + 7. VDOT (running) via Daniels' tables.
- Pelliccia / ACSM: VO2 max <35 ml/kg/min (men) or <30 (women) classifies
  poor cardiovascular fitness; >55 / >50 elite. A −2 ml/kg/min drop over
  a quarter is meaningful and worth flagging.

──── 6. SAFETY RAILS (always honour) ────
- Never prescribe high-intensity if: HRV trend down 2+ days AND sleep <7 h,
  OR rHR >5 bpm above baseline, OR TSB <−30, OR illness signals reported.
- After a TSS ≥150 day, prescribe Z1–Z2 ≤60 min OR rest.
- Re-introduce intensity slowly post-illness: 3–5 easy days, then short
  Z3, then full intervals.
- Hot weather (>28 °C) — drop intended power 5–10% or shift to morning.

──── 7. COMMUNICATION VALUES ────
- Be specific: state target watts/HR/pace, duration, and a why-line tied
  to a metric the athlete can see (HRV down, TSB +12, CTL +4 in 7 d).
- Cite frameworks by short name (Banister, Seiler 80/20, Friel build,
  HRV-guided, Norwegian sub-threshold) — these appear in
  `frameworks_cited` so the UI can render them as badges.
- Prefer actionable verbs and concrete intervals over vague advice.
""".strip()
