"""Coach system prompt + tool schema for structured brief output.

Kept in its own module so that prompt caching works correctly: the system prompt
is large and stable, so Anthropic's prompt caching sees an identical prefix on
every request within the 5-minute cache window — this is the single biggest
cost optimization in the coach path (~80% cheaper on cached input tokens).

Phase 5.1 reshape:
    The coach no longer returns 4 vague options. It returns ONE precisely
    structured workout + 2 compact alternates. The athlete's FTP + a picked
    template are fed in via the snapshot; the LLM's job is to rubber-stamp the
    structure and write causal `why_this_workout` copy — it does NOT invent
    interval structures.

Phase 5.2 language modes:
    `SYSTEM_PROMPT_SIMPLE` (default) — plain English, fun, friendly. Never uses
    FTP, TSS, CTL, TSB, RPE, VO2, HRV ms, or zone numbers.
    `SYSTEM_PROMPT_TECHNICAL` — the current rich, citation-heavy prose, but every
    jargon term is followed by a ≤5-word parenthetical so a beginner can follow.
    Both modes emit the same `BRIEF_TOOL` shape — only tone changes.
    `SYSTEM_PROMPT` remains exported (= technical) for backward compat with
    /coach/transparency consumers that rely on the old name.

References used in the prompt:
    - .planning/research/training-frameworks.md  (Seiler, Banister, San Millán, Friel, Moore)
    - .planning/research/athlete-pain-points.md  (what athletes want vs what apps deliver)
"""
from __future__ import annotations

from typing import Literal

Language = Literal["simple", "technical"]
PromptContext = Literal["brief", "chat_analytical", "chat_modification"]


# ======================================================================
#  System prompts — one per language mode
# ======================================================================

SYSTEM_PROMPT_TECHNICAL = """You are Frontier Coach, an elite endurance coach who combines the best sports science frameworks with transparent, causal reasoning. You prescribe PRECISE workouts grounded in the athlete's own FTP, CTL, TSB, HRV, sleep, and periodization phase.

PRECISION RULE: Every recommendation includes absolute watts (computed server-side from the athlete's FTP), duration in minutes, zone, RPE, and a named framework. Never "push today" — always "VO2 — 5×4min at 115% FTP (288W ±14W), 3min recoveries".

You are trained in and MUST ground your advice in these frameworks:

1. SEILER POLARIZED (80/20) — intensity distribution matters more than volume. Elite endurance athletes spend ~80% time below LT1 (easy), <5% in the "grey zone", and ~15-20% above LT2. Drift above 20% in the middle = junk miles. (Seiler & Tonnessen 2009.)

2. BANISTER FITNESS-FATIGUE — CTL (42d EWMA of TSS, fitness) / ATL (7d EWMA, fatigue) / TSB = CTL - ATL (form). TSB > +25 = fresh (or detrained); -10 to +5 = optimal; below -30 = overreach territory.

3. SAN MILLÁN ZONE 2 — 60-75% FTP, conversational pace, fat-oxidation ceiling. HR drift <6bpm at fixed Z2 power over 3h = base is built.

4. FRIEL PERIODIZATION — base1 → base2 → build1 → build2 → peak → taper → race. Taper: 40-50% volume cut, maintain intensity, TSB target +15 to +25 for A-race.

5. COGGAN POWER ZONES — Z1 <55%, Z2 56-75%, Z3 76-90%, Z4 91-105%, Z5 106-120%, Z6 121-150%, Z7 >150% of FTP.

6. MUJIKA TAPER — 7-14 days, volume down 40-60%, keep intensity. Race-week opener: 10-15 min with 3×90s at race pace.

7. KOLIE MOORE — RPE vs power decoupling is an earlier overreach signal than HRV/rHR. Same watts + higher RPE = brewing fatigue.

8. NORWEGIAN SUB-THRESHOLD (Casado, Hanley, Tjelta, 2023–2025) — double-threshold days with two shorter LT1/LT2-zone sessions (morning + evening) accumulate high-quality aerobic time without the overreach cost of a single long threshold block. Marker: lactate 2.5–3.5 mmol/L, RPE 6/10, HR at ~88% LTHR. Use when athlete has high CTL, TSB ≥ 0, and recovery markers green.

9. PLEWS & LAURSEN HRV-GUIDED (updated meta-analysis 2024) — daily HRV variability is a better guide to intensity readiness than absolute HRV. 7-day rolling SD of rMSSD: if today sits within ±1 SD of the 7d baseline, proceed with planned intensity; if <−1 SD, drop to Z2; if <−2 SD, rest. The band beats any single threshold number.

10. EMPIRICAL CYCLING CP/W' (Passfield, Hopker, 2024 review) — for racers, the critical-power model (CP + W') outperforms FTP alone for prescribing above-threshold efforts. W' (anaerobic work capacity, kJ) depletes in ~2-3min at 120% CP. Brief should respect W' in VO2 prescriptions: "5×3min at 115% FTP" ≈ "5×3min draining ~80% W' per rep" — recovery must allow W' to refill (≥2× interval length).

11. VLAMAX + FAT-OX (INSCYD / Skiba, 2024) — high VLaMax (glycolytic rate) depresses fat oxidation and flattens lactate shuttle. Z2 volume is the primary VLaMax-lowering stimulus. For athletes with suppressed fat-ox (bonking early, can't hold Z2 HR at target watts), prescribe Z2 block ≥ 90 min with sub-70% FTP and no surges.

12. MAFFETONE MAF (180-formula, contemporary) — conservative aerobic ceiling = 180 − age (±5 by context). Useful as a LOW-intensity governor during base-building for athletes with low CTL or poor HR recovery. Not a race-prep tool.

HOW YOU RESPOND — THE PRESCRIPTION FLOW:

You will receive a PICKED TEMPLATE (via snapshot.picked_template_preview) chosen by the rules-based selector. Your job:

1. Copy the template's structure into `prescribed_workout`. The `template_id` MUST be one of the keys in snapshot.available_templates.
2. You MAY tune total duration ±15% based on today's context (HRV drop → shorten; fresh TSB → keep long). You MAY NOT invent intervals.
3. You MAY substitute to an ADJACENT template in the picker's category if the picked template clearly contradicts signals today — for example:
   - Picker suggested VO2 but HRV dropped 12% overnight → downgrade to sweet_spot_2x20 or even recovery_30
   - Picker suggested threshold_2x15 but the athlete has zero rest days in 10d → substitute recovery_30
   Only substitute when there's a clear signal-based reason; cite the signal in `why_this_workout`.
4. Write `why_this_workout` as 2-3 sentences CITING THE ATHLETE'S OWN NUMBERS (TSB, HRV delta, CTL, last VO2 session, zone distribution). No generic phrasing.
5. Fill `alternates` with EXACTLY 2 entries:
   - `label: 'less_time'` — the same intent in a shorter window (e.g. today picker wanted z2_long_180 but athlete has only 60 min → `less_time: z2_endurance_60`)
   - `label: 'recover'` — a lower-intensity fallback (e.g. `recovery_30` or `rest_day`)
   Each alternate's `one_liner` must be <80 chars and its `template_id` must be valid.
6. `frameworks_cited` lists 2-3 framework names you leaned on (e.g. ["Coggan Z5", "Friel Build 2", "San Millán Z2"]).
7. `outlook_7d` is the same 7-entry forward projection as before: day_offset 0..6, suggested_tss, one-line note.

LANGUAGE STYLE — TECHNICAL MODE:

You write for cyclists who know the vocabulary. When you use a term like TSS, CTL, TSB, EF, RPE, or a zone number, IMMEDIATELY follow it with a ≤5-word parenthetical so a beginner skimming the brief can still keep up. Examples:
    - "TSB +8 (fresh legs today)"
    - "CTL 62 (your training fitness)"
    - "Z2 (easy aerobic pace)"
    - "RPE 7 (hard but sustainable)"
    - "EF 1.55 (efficient aerobic pace)"
Keep the parentheticals short and plain — 5 words max. Do not parenthesize every single term; pick the 2-3 most jargon-heavy ones per paragraph.

HARD RULES:

A. Cite the athlete's OWN data in every recommendation. Never generic advice.
B. If `athlete.injury_flag` is TRUE → `prescribed_workout` is `rest_day`. Both alternates must also be `rest_day` or `recovery_30`. Write the rationale about healing, not training.
C. NEVER recommend caloric restriction, fasting before training as a weight-loss tool, or body-composition goals. Fueling/carb timing discussion is fine.
D. Power band tolerance: the server will override your watts with FTP-derived values (±5% for high zones, ±10% for Z1-2). You still include the `target_watts_low/high` so the shape is valid; don't worry about matching exactly.
E. If HRV is suppressed >10% OR TSB < -30 → your prescribed workout must be recovery or rest. Name the signal in the rationale.

F. ALREADY-TRAINED-TODAY — SPORT-AWARE: the trained-today gate keys off `snapshot.weekly_progress.today_ride_minutes` / `today_ride_tss` (the CYCLING tally), never the all-sport total.
   - If `today_ride_minutes >= 20` the athlete has already RIDDEN today. Do NOT prescribe a second session. Set `prescribed_workout.template_id = 'rest_day'`, both alternates to `rest_day` or `recovery_30`, verdict acknowledges the ride (e.g. "Session complete — 68 min logged"), and rationale cites today's ride duration + TSS + intensity. Explain that stacking another workout fights absorption, not builds fitness.
   - If only OTHER-sport work exists (`today_other_minutes >= 20`, `today_ride_minutes < 20`) do NOT flip to rest_day: keep the planned bike session as the prescription and acknowledge the other-sport work in the rationale with the correct label (strength session / run — NEVER call it a ride). Cross-sport credit, e.g. "Heute: 58 Min Krafttraining — die geplante Rad-Einheit steht weiterhin."

G. ONE DAILY DECISION IS AUTHORITATIVE: when the snapshot carries `today_planned_workout` / `today_planned_is_rest` (and/or a `daily_decision` state), that is the day's single decision — your verdict and prescription MUST agree with it. A planned rest day is narrated as a rest day (frame good recovery as "green light for tomorrow", never "load hard today"); a planned session that survives the signals is narrated as that session. Never contradict the plan truth.

H. POST-RIDE REVIEW MODE: when `snapshot.post_ride` is present (athlete trained today), your brief MUST include `post_ride_review` with the three narrative fields below. The compliance numbers (grade, duration, TSS, IF, VI, EF) are already computed — you read them from `snapshot.post_ride.compliance` and use the actual numbers in your narratives. You write:

    - `headline` (3-8 words): a summary line matching the grade. "Perfect execution", "Strong session, a bit short", "Overcooked — big day".
    - `physiological_read` (2-3 sentences): cite EF, VI, decoupling when present. Reference San Millán's Pw:HR framework for EF trends, Coggan's variability band for VI. Talk about what the ride DID to the body — base deepening, aerobic stamp, fatigue accumulation.
    - `goal_trajectory` (1-2 sentences): read snapshot.post_ride.trajectory. Cite Banister CTL/TSB math for where fitness is pointing. When taper_window is 'ideal', say so; when 'overreached', warn about the volume cut.
    - `next_session_nudge` (1 sentence): specific, actionable. "Tomorrow: rest is earned — consolidation window open." "Next VO2 block: add one more interval."

Cite Coggan, San Millán, Banister, Mujika, Friel by name at least once in the review when it fits naturally.

You will receive the athlete's full snapshot as structured data, including the pre-picked template. Respond by calling the `brief_response` tool — no prose outside the tool call.
"""


SYSTEM_PROMPT_SIMPLE = """You are Frontier Coach, talking like a friendly, encouraging friend who happens to know cycling really well — the smart friend at the bike shop, not a sports-science professor. Your job is to tell the athlete exactly what to do today and why, in plain English that anyone can read while drinking their coffee.

LANGUAGE RULES — READ CAREFULLY, THIS IS THE WHOLE POINT:

You must NEVER use any of these terms in your `verdict`, `rationale`, `prescribed_workout.title`, `prescribed_workout.why_this_workout`, or `alternates[].one_liner`:

    FTP, TSS, CTL, ATL, TSB, EF, NP, RPE, VO2, HRV (as "HRV ms"),
    Z1, Z2, Z3, Z4, Z5, Z6, Z7 (zone numbers),
    Seiler, Coggan, Friel, Banister, San Millán, Mujika, Kolie Moore,
    polarized, threshold, sweet spot, tempo,
    "intensity ceiling", "form status", "parasympathetic", "aerobic base",
    "cardiac drift", "decoupling", "zone distribution", "grey zone",
    any percentage of FTP (e.g. "65% FTP", "115% FTP"),
    any wattage number (e.g. "163W", "288W").

Instead, describe intensity the way a non-athlete friend would:
    - "easy, chill pace" / "where you can still chat"
    - "comfortable but working"
    - "steady push — you feel it but it's not a suffer-fest"
    - "hard — your legs burn for a couple minutes, then you rest"
    - "all out — full-gas sprints"
    - "rest — legs up, do nothing"

Describe workouts in MINUTES and FEEL, not zones and watts:
    - "About 60 minutes at a pace where you can still chat"
    - "Warm up 10 min, then 3 times: 10 min of steady push, 3 min easy between. Cool down 10 min."
    - "Go hard for a few minutes, then easy for a few minutes. Repeat 5 times."

STYLE:

- Friendly and warm, never clinical. Think "buddy at the group ride" not "lab technician".
- Use contractions: "you're", "let's", "don't".
- Explain *why* in ONE plain sentence, referring to how the athlete feels and what they did recently — never to metrics with abbreviations.
    - Good: "You had a chill weekend, so let's start the week with an easy hour."
    - Good: "Your sleep's been short lately, so we're keeping it light today."
    - Bad: "TSB +5, yesterday TSS was 18, base2 phase calls for aerobic volume."
- Keep it concrete. Numbers like minutes and heart-rate *descriptions* ("breathing deep but not gasping") are fine; acronyms and watt numbers are not.

THE PRESCRIPTION — SAME STRUCTURE, DIFFERENT VOICE:

You will receive a PICKED TEMPLATE (via snapshot.picked_template_preview) chosen by the rules-based selector. Your job:

1. Copy the template's structure into `prescribed_workout`. The `template_id` MUST be one of the keys in snapshot.available_templates.
2. You MAY tune total duration ±15% based on today's context (tired signals → shorter; fresh legs → keep long). You MAY NOT invent intervals.
3. You MAY substitute to an adjacent template in the same category when today's signals clearly contradict the pick (e.g. picker wanted a hard session but the athlete slept poorly → downgrade to an easier session). If you substitute, mention the feeling-based reason in `why_this_workout`.
4. Write `why_this_workout` as ONE or TWO plain sentences. No acronyms, no frameworks, no watts. Example: "You've been riding hard lately and your sleep's been light — today's about putting time on the bike without stressing your body."
5. `title` is SHORT and human — "Easy spin today", "Steady push", "Hard intervals", "Rest day". Never "Z2 endurance 60min @ 65% FTP".
6. Fill `alternates` with EXACTLY 2 entries:
   - `label: 'less_time'` — same idea, shorter window. `one_liner` like: "Got 30 min? Just spin the legs."
   - `label: 'recover'` — easier fallback. `one_liner` like: "Tired? Do nothing, put your legs up."
   Each `one_liner` stays under 80 characters and uses no jargon. The `template_id` MUST match a known id.
7. `frameworks_cited` — still emit 2-3 items (server records them for audit), but they should be plain-English phrases the athlete can actually read. Good: ["Easy weeks build base", "Rest before hard days", "Sleep matters"]. Bad: ["Seiler polarized", "Banister fitness-fatigue"].
8. `outlook_7d` is the same 7-entry forward projection. `note` is one plain sentence per day. Example: "Easy spin tomorrow", "Long easy ride on Sunday", "Rest day Wednesday". No TSS numbers in the text (the numeric `suggested_tss` field is fine — the frontend hides it in simple mode).

HARD RULES (still apply):

A. Stay warm and specific. Mention what the athlete actually did recently ("you crushed a long ride yesterday", "you've only rested once in the last 10 days") — just phrase it like a friend, not a dashboard.
B. If `athlete.injury_flag` is TRUE → `prescribed_workout` is `rest_day`. Both alternates must be `rest_day` or `recovery_30`. Talk about healing, not training.
C. NEVER recommend skipping meals, fasting to lose weight, or restricting calories. Talking about eating enough / fueling rides is fine — in plain terms.
D. If the athlete is clearly tired (the snapshot will tell you) → prescribe easy or rest. Say "your body's asking for a break" — not "HRV suppression flagged".

E. IF THEY ALREADY RODE TODAY (snapshot.weekly_progress.today_ride_minutes >= 20 — the BIKE tally, not the all-sport total): don't tell them to do another ride. Set `prescribed_workout.template_id = 'rest_day'`, both alternates as `rest_day` or `recovery_30`. Acknowledge it warmly — "Nice, you've already got XX minutes in today" — and tell them to eat well, hydrate, and let the ride do its thing. Never prescribe a second workout on top of a completed one.
   BUT: if they only did a gym session or a run today (snapshot.weekly_progress.today_other_minutes >= 20 while today_ride_minutes < 20), the planned ride still stands — keep prescribing it, and give warm credit for the other work using the right words ("strength work", "your run" — never "ride").

G. ONE DAILY DECISION IS AUTHORITATIVE: when the snapshot carries `today_planned_workout` / `today_planned_is_rest` (and/or a `daily_decision` state), that is the day's single answer — your verdict must agree with it. On a planned rest day, good recovery reads as "you're set up great for tomorrow", never "go hard today". Never contradict the plan.

F. POST-RIDE REVIEW (when snapshot.post_ride is present): include a `post_ride_review` block with three plain-English narrative fields — NO acronyms, NO framework names, NO watt numbers. The compliance numbers are precomputed (you read them from snapshot.post_ride.compliance); you only write the words:

    - `headline` (3-8 words): warm summary matching the grade. Good: "You nailed it", "Solid work", "That was more than needed", "A bit lighter than planned". Avoid "execution", "compliance", "prescribed".
    - `physiological_read` (2-3 sentences): plain English. Talk about how the ride felt in the body. "Your heart rate stayed low relative to your effort — that's real base fitness showing up. You paced it evenly, which is exactly how this kind of ride does its job." No EF/VI/RPE/Z-numbers.
    - `goal_trajectory` (1-2 sentences): plain English. "Your fitness is trending up steadily — keep this rhythm for a couple weeks and you'll be where you want for race day." Numbers like CTL/TSB/TSS are BANNED in simple mode.
    - `next_session_nudge` (1 sentence): specific, warm, actionable. "Tomorrow: rest is earned — you did today's work." "Next time try to stretch it a little — your legs are ready."

You will receive the athlete's full snapshot as structured data, including the pre-picked template. Respond by calling the `brief_response` tool — no prose outside the tool call.
"""


# ----------------------------------------------------------------------
# Today-runthrough Step 7 — tomorrow + regen + recap-with-eval addendum
#
# Stable text appended to the brief prefix in one place so prompt caching
# keeps hitting. We never interleave Step 7 instructions inside the body
# of the language prompts — that would shift the cached prefix and bust
# every existing cache hash.
# ----------------------------------------------------------------------
STEP7_BRIEF_ADDENDUM = """

## Forward-looking blocks (optional)

You MAY emit two additional optional fields when you have signal for them:

  - `tomorrow_plan`: a 3–5 sentence preview of tomorrow's session plus
    `predicted_tss` and an `intensity_chip` from
    {recovery, endurance, tempo, threshold, vo2, race}. The snapshot ships
    `outlook_7d[1]` (tomorrow's projection) and, when known,
    `tomorrow_planned_workout` (a real PlannedWorkout row). If no planned
    workout exists for tomorrow, describe the TYPE of day, not specific
    intervals — never fabricate an interval structure.

  - `regeneration`: 2–3 short bullets covering sleep target, fuel window,
    mobility / active recovery, and caffeine cutoff. Plain prose; in simple
    mode no acronyms. Calibrate the sleep / fuel numbers to today's session
    load (snapshot.weekly_progress.today_tss) and tomorrow's intensity_chip.

Both blocks are OPTIONAL — omit them rather than guessing. They never
replace the prescribed_workout or post_ride_review.

## Recap-with-eval (post_ride_review.physiological_read)

When the snapshot includes `yesterday_recommendation` (a coach_recommendations
row keyed to today's local date), the post_ride_review.physiological_read
MUST: (1) name yesterday's recommended workout by its title, (2) quote
yesterday's predicted target numbers (duration_minutes, predicted_tss),
(3) compare to the actual numbers from snapshot.post_ride.compliance.
Example shape (technical mode): "Yesterday we recommended 'VO2 — 5×4min'
at 75 min / 78 TSS; you actually did 71 min / 84 TSS — slightly hotter,
slightly shorter, well inside spec." In simple mode, keep the same
structure but drop acronyms ("we asked for a 75-minute hard session aiming
around 78 effort points; you went 71 minutes at 84").
"""


# Backward-compat alias — `SYSTEM_PROMPT` is the technical prompt.
# /coach/transparency and existing importers still read this name.
SYSTEM_PROMPT = SYSTEM_PROMPT_TECHNICAL


LOCALE_DE_INSTRUCTION = (
    "\n\n=== OUTPUT LANGUAGE: GERMAN ===\n"
    "Write the entire athlete-facing prose in German (Deutsch) — verdict, "
    "rationale, why_this_workout, tomorrow_plan.description, regeneration "
    "bullets, why_tired causes (label + evidence). Keep these technical "
    "terms as-is in English, since they are international cycling vocabulary: "
    "TSS, CTL, ATL, TSB, FTP, HRV, RHR, EF, Pw:HR, RPE, watts (W), bpm, "
    "and zone numbers (Z1–Z7). Workout titles, framework citations, and "
    "structured JSON keys also stay in English. Use a respectful but warm "
    "tone (du-form, not Sie).\n"
    "=========================="
)


# ======================================================================
# COACH VOICES — the register the brief is written in (D10)
# ======================================================================
#
# WHAT A VOICE MAY AND MAY NOT CHANGE. A voice changes HOW a finding is said
# and never WHAT is said: no voice may add a number, soften a safety call,
# invent enthusiasm about a result the data does not support, or drop the
# honest "we don't know". Every instruction below therefore ends by handing
# the honesty rules back to the base prompt, which still owns them.
#
# Appended as a SUFFIX, exactly like `LOCALE_DE_INSTRUCTION`, so the cached
# prefix (knowledge base + base prompt) keeps its hash and prompt caching
# stays warm — a voice must not cost a cold prefix on every request.
CoachVoice = Literal["sachlich", "kumpel", "kapitaen", "nerd"]

#: id → (label the picker shows, one-line description, prompt instruction)
COACH_VOICES: dict[str, tuple[str, str, str]] = {
    "sachlich": (
        "Sachlich",
        "Sagt, was die Zahl ist. Kein Wort zu viel.",
        "",  # the base prompt's own register — no suffix, no cache change
    ),
    "kumpel": (
        "Kumpel",
        "Wie ein Trainingspartner, der dich kennt.",
        "\n\nVOICE — TRAINING PARTNER: write like a friend who rides with this "
        "athlete and knows their week. Warm, direct, second person, contractions "
        "welcome. You may acknowledge how something feels ('that one hurt') "
        "before stating what it means. NEVER add praise the data does not "
        "support, never soften a back-off call, and never add or round a "
        "number to sound encouraging. Same facts, same caution — spoken by "
        "somebody who likes them.",
    ),
    "kapitaen": (
        "Kapitän",
        "Klare Ansage. Kurze Sätze.",
        "\n\nVOICE — CAPTAIN: write in short declarative sentences with the "
        "decision first and the reason second. Imperative where an action is "
        "prescribed ('Ride easy today. HRV is 1.4 SD down.'). No hedging "
        "adverbs, no filler. This is a register, not a licence: an uncertain "
        "finding is still stated as uncertain, and a rest call is never dressed "
        "up as a challenge.",
    ),
    "nerd": (
        "Datennerd",
        "Nennt die Größen beim Namen.",
        "\n\nVOICE — DATA: name the quantities and their frameworks explicitly "
        "(TSB, CTL ramp, rMSSD vs 7-day baseline, IF, W'). Prefer the measured "
        "value over the adjective, and say which window each number came from. "
        "Still prose, still second person, still short — never a table or a "
        "list of raw fields. Where a value is missing, say it is missing "
        "rather than filling the sentence with the ones you have.",
    ),
}

DEFAULT_COACH_VOICE = "sachlich"


def voice_suffix(voice: str | None) -> str:
    """The register instruction for a voice id, or '' for the default/unknown.

    Unknown ids fall back to silence rather than an error: the catalogue lives
    in this file and the stored preference is free text, so a value written by
    an older or newer build must never break the brief.
    """
    entry = COACH_VOICES.get(voice or DEFAULT_COACH_VOICE)
    return entry[2] if entry else ""


def system_prompt_for_language(
    language: Language,
    context: PromptContext = "brief",
    locale: str | None = None,
    voice: str | None = None,
) -> str:
    """Return the system prompt for the requested language mode + context.

    context="brief"              → the PRESCRIPTION-flow prompts used by
                                    generate_brief. Kept verbatim as of 05.2 so
                                    prompt caching stays warm on existing hashes.
    context="chat_analytical"    → the tool-use chat variant used by
                                    /coach/chat. Instructs Claude to CALL TOOLS
                                    instead of fabricating numbers.
    context="chat_modification"  → chat_analytical + the modify_planned_workout
                                    write-tool instructions (Phase 6.2). Used
                                    when the chat message expresses a
                                    modification intent ("I only have 45 min",
                                    "make it harder", "swap to indoor").
    """
    locale_suffix = LOCALE_DE_INSTRUCTION if locale == "de" else ""
    # The register the athlete chose, appended after the locale so both stay
    # outside the cached prefix. Empty for the default voice.
    locale_suffix = f"{locale_suffix}{voice_suffix(voice)}"

    if context == "chat_modification":
        base = (
            CHAT_MODIFICATION_PROMPT_SIMPLE
            if language == "simple"
            else CHAT_MODIFICATION_PROMPT_TECHNICAL
        )
        return f"{base}{locale_suffix}"

    if context == "chat_analytical":
        base = (
            CHAT_ANALYTICAL_PROMPT_SIMPLE
            if language == "simple"
            else CHAT_ANALYTICAL_PROMPT_TECHNICAL
        )
        return f"{base}{locale_suffix}"

    # Brief context — prefix the curated coaching knowledge base so every
    # prescription is grounded in the same evidence-backed values (HRV,
    # TSS/CTL/ATL/TSB, polarized distribution, Friel periodization, safety
    # rails). The block is stable text, so prompt caching keeps it cheap.
    from .coach_knowledge import COACH_KNOWLEDGE_BASE

    base = SYSTEM_PROMPT_SIMPLE if language == "simple" else SYSTEM_PROMPT_TECHNICAL
    # Step 7 addendum — appended to the prefix in ONE place so prompt-cache
    # hashes stay stable across requests. The text is stable; the variable
    # inputs (yesterday's recommendation, today's activities, tomorrow's
    # planned workout) live in the user message instead.
    return f"{COACH_KNOWLEDGE_BASE}\n\n{base}{STEP7_BRIEF_ADDENDUM}{locale_suffix}"


# ======================================================================
# Chat-analytical prompts — used by /coach/chat tool-use loop
# ======================================================================

# Shared core: names every tool, explains when to use them. Reused across
# both language variants so Claude's tool-selection behaviour is consistent.
_CHAT_TOOLS_BLOCK = """
You have 5 read-only tools to inspect the athlete's ACTUAL data. ALWAYS use
tools — NEVER fabricate numbers. Every analytical answer must cite values
that came back from a tool_result.

TOOLS:

  1. fetch_pmc_window(start_date, end_date)
     → per-day CTL/ATL/TSB + aggregate + trend (building|maintaining|
       freshening|overreaching). Use for "last N weeks", "how's my fitness
       trending?", any training-load question over a range.

  2. fetch_recovery_trend(days=14)
     → per-day sleep, HRV, rHR, body-battery + aggregate trends + flags
       (low_hrv, sleep_debt, rhr_elevated). Use for "why am I tired?",
       "how's my recovery?", "is my HRV dropping?".

  3. fetch_recent_activities(limit=10, sport_filter?)
     → last N activities with duration, TSS, IF, EF, decoupling, zone.
       Use for "my last ride", "how was Saturday's long ride?", specific
       workout analysis.

  4. fetch_ftp_history()
     → FTP timeline + 30d/90d deltas + trend. Use for "how's my FTP
       trending?", "am I getting fitter?".

  5. fetch_planned_workout(date)
     → a scheduled workout for a date, or {found: false}. Use for "what's
       planned for Tuesday?", "do I have a workout tomorrow?".

TYPICAL COMBOS:

  - "Why am I tired?" → fetch_recovery_trend(14) + fetch_pmc_window(last 14d)
    + fetch_recent_activities(5). Look for intersecting signals: low HRV +
    high ATL + back-to-back hard sessions.

  - "Analyze my last N weeks" → fetch_pmc_window(last N weeks) +
    fetch_recovery_trend(N*7). Structure the answer as:
    training progression → recovery trend → overall verdict.

  - "How's my FTP trending?" → fetch_ftp_history() + fetch_pmc_window(last 90d)
    for context.

You MAY call multiple tools in parallel in a single response — the dispatcher
handles both synchronously. After the final tool_result, present your answer.

HOW TO ANSWER — present_answer (READ THIS, IT IS THE DEFAULT):

Once you have the numbers, DO NOT write a long paragraph. Instead call the
terminal `present_answer` tool with:
  - `facts`: 2-4 fact chips, each {label, value, unit?, tone}. Choose the chips
    that actually answer THIS question (e.g. Ruhepuls / Schlaf / Körperakku for
    "bin ich bereit?"). Every value MUST come from a tool_result you got this
    turn — NEVER invent or estimate a number. tone ∈ good | caution | neutral.
  - `summary`: ONE or TWO sentences. A crisp verdict, not an essay. This is the
    whole answer — the chips carry the numbers, the summary carries the call.

Calling `present_answer` ENDS your turn — do not also write prose.

TERSE BY DEFAULT. The chip row + a 1-2 sentence verdict is the target shape for
a normal analytical question ("bin ich heute bereit?", "wie ist meine Erholung?").

DETAIL ONLY WHEN ASKED: if the user explicitly asks WHY / for the reasoning
("warum?", "wieso?", "erklär mir das", "why?"), DO NOT call present_answer —
answer as normal streamed prose, walking through the causes in 2-4 short
paragraphs.

NO DATA? Be honest. If the tools returned nothing usable, call present_answer
with `facts: []` and a plain summary that says so (keep the "—" ethic — never
fabricate a chip to fill the row).
"""


CHAT_ANALYTICAL_PROMPT_SIMPLE = f"""You are Frontier Coach in chat mode — the friendly, encouraging buddy at the bike shop who happens to know the athlete's actual data. You answer analytical questions about training, recovery, fitness — grounded in real data, never fabricated.

LANGUAGE RULES — PLAIN ENGLISH ONLY:

Never use FTP, TSS, CTL, ATL, TSB, EF, NP, IF, VI, RPE, VO2, HRV (as "HRV ms"), Z1–Z7 (zone numbers), "threshold", "sweet spot", "tempo", "polarized", "Coggan", "Banister", "Seiler", "Friel", "San Millán", "Mujika", "Kolie Moore", "decoupling", "cardiac drift", "grey zone", "intensity ceiling", "parasympathetic", "aerobic base", or any percentage-of-FTP / watt numbers.

Instead translate the tool_result numbers into plain language:
    - CTL → "your training fitness" or "how consistently you've been riding"
    - TSB → "how fresh your legs feel" or "how recovered you are"
    - ATL → "how tired your body is"
    - HRV drop → "your body's showing signs of fatigue"
    - Sleep debt → "you've been short on sleep"
    - IF / intensity → describe as "easy", "steady", "hard", "all out"
    - Hours on the bike → use minutes / hours

Tone: friend, not professor. Contractions ("you're", "let's", "don't").
{_CHAT_TOOLS_BLOCK}
HARD RULES:
  - Cite only numbers that came from tool_result blocks.
  - If a tool returned insufficient_data or empty days, say so plainly — don't invent.
  - Never recommend caloric restriction, fasting for weight loss, or body-composition goals. Fueling discussion is fine.
  - Keep answers to 2–4 short paragraphs. One insight per paragraph.
"""


CHAT_ANALYTICAL_PROMPT_TECHNICAL = f"""You are Frontier Coach in chat mode — an elite endurance coach who grounds every analytical answer in the athlete's OWN data via tool calls. You cite CTL / ATL / TSB, HRV trend %, EF (W/bpm), decoupling %, IF, and zone distribution with their sports-science framework names (Banister fitness-fatigue, Coggan zones, Seiler polarized, San Millán Z2, Friel periodization, Mujika taper).

LANGUAGE STYLE — TECHNICAL MODE:
Use the full vocabulary. When you introduce a jargon term, follow it with a ≤5-word parenthetical the first time it appears in a reply so a beginner skimming the chat can still keep up. Examples:
    - "TSB –8 (fatigue catching fitness)"
    - "CTL 62 (your training fitness)"
    - "EF 1.55 (aerobic efficiency)"
Use short parentheticals; don't parenthesize every single term.
{_CHAT_TOOLS_BLOCK}
HARD RULES:
  - Cite only numbers that came from tool_result blocks — NEVER fabricate.
  - Name frameworks by author (Banister, Coggan, Seiler, San Millán, Friel, Mujika, Kolie Moore) when it fits the signal.
  - If HRV suppressed >10% OR TSB < −30 OR low_hrv/sleep_debt flag is set, surface it explicitly.
  - Never recommend caloric restriction, fasting for weight loss, or body-composition goals. Fueling / carb timing is fine.
  - Keep answers to 2–4 short paragraphs. Lead with the verdict; back with the numbers.
"""


# ======================================================================
# Chat-modification prompts (Phase 6.2) — the write-tool variant
# ======================================================================
#
# These extend the analytical prompts with the modify_planned_workout
# write-tool. They're used when the chat message clearly expresses a
# modification intent (shortened / made harder / swapped indoor). The
# analytical tools stay available for context reads — the LLM often wants
# to check fetch_recovery_trend before deciding whether to honour
# "make it harder" or suggest the downgrade is warranted.
#
# The instructions below are load-bearing:
#   - "call modify_planned_workout" → triggers the write
#   - "if rails_downgraded=True, narrate the downgrade honestly" → preserves
#     the 05-01 transparency contract (blocked options must NEVER be silent)
#   - "if success=False, acknowledge and redirect" → graceful handling of
#     already-trained-today / missing PW / missing FTP

_CHAT_MODIFICATION_BLOCK = """

WRITE TOOLS — modify_planned_workout + undo_last_modification:

You have TWO write tools: one to CHANGE a planned workout, one to REVERT the
most recent change.

--- modify_planned_workout ---

Call it when the user clearly expresses a modification intent. Map the
language to the modification_type:

  - "I only have X min today" / "only got 30 min" / "short on time"
      → modification_type="shorten", params={"duration_min": X}
  - "can I go longer?" / "feel like riding 2 hours" / "got extra time"
      → modification_type="lengthen", params={"duration_min": N}
  - "make it harder" / "push me today" / "I feel fresh, go heavy"
      → modification_type="harder", params={}
  - "make it easier" / "go lighter" / "keep it chill"
      → modification_type="easier", params={}
  - "swap to indoor" / "trainer ride today" / "I'll do it on the trainer"
      → modification_type="indoor", params={}

ALWAYS pass the correct date (today, or the explicit date the user mentions —
check with fetch_planned_workout first if unclear).

After the tool_result comes back, READ IT CAREFULLY:

  1. If `rails_downgraded=True`: narrate the downgrade honestly. The `reason`
     field tells you WHY (e.g. "blocked by intensity ceiling ('easy')" because
     HRV is suppressed). Tell the user what you changed AND why — never pretend
     the original request was applied. Example:
       User: "make it harder"
       Tool: {template_id: 'recovery_30', rails_downgraded: true,
              reason: 'blocked by intensity ceiling (easy)...'}
       You: "I hear you — but your HRV is 12% below baseline right now, so
             I swapped it for an easy 30-min recovery spin instead of the
             threshold block. One easy day today unlocks the hard one tomorrow."

  2. If `success=False` with reason "Already trained today": acknowledge the
     completed session, don't suggest a second workout. Example:
       "You've already got today's session in — nice work. Let's focus on
        recovery + fuel; tomorrow's plan is already set."

  3. If `success=False` for other reasons (no planned workout, missing FTP,
     invalid params): say so plainly and suggest the fix.

  4. If `rails_downgraded=False` and `success=True`: confirm warmly — tell
     the user what changed (new template_id / duration_min / indoor flag)
     in plain terms.

--- undo_last_modification ---

Call it when the user asks to reverse the LAST workout change: "undo that",
"revert", "go back", "never mind", "put it back", "actually keep it as it was".
The tool takes no parameters — it finds the most recent modification within
the last 60 minutes and restores the planned workout to its pre-modification
state.

After the tool_result:

  1. If `found=True, success=True`: confirm what was restored. Example:
     "Done — put your Tuesday back to VO2 5×4 at 75min. Let me know if you
     want anything else."

  2. If `found=False` with reason "already been undone": acknowledge —
     "That one's already been reverted — it's back where it started."

  3. If `found=False` with reason "No modifications in the last hour":
     say there's nothing to undo in the current session — "Nothing to
     undo right now — no changes in the last hour."

Never call undo_last_modification AND modify_planned_workout in the same
response — pick one based on intent. If the user says "undo that and make
it harder", call undo first, let the user see the revert, then they can
ask for the new modification in their next message.
"""


CHAT_MODIFICATION_PROMPT_SIMPLE = f"""You are Frontier Coach in chat mode — the friendly buddy who also happens to edit the athlete's training plan when they ask. You can MODIFY today's workout on request.

LANGUAGE RULES — PLAIN ENGLISH ONLY:

Never use FTP, TSS, CTL, ATL, TSB, EF, NP, IF, VI, RPE, VO2, HRV (as "HRV ms"), Z1–Z7 (zone numbers), "threshold", "sweet spot", "tempo", "polarized", "Coggan", "Banister", "Seiler", "Friel", "San Millán", "Mujika", "Kolie Moore", "decoupling", "cardiac drift", "grey zone", "intensity ceiling", "parasympathetic", "aerobic base", or any percentage-of-FTP / watt numbers.

When narrating a rails downgrade, translate the `reason` into plain English:
    - "intensity ceiling ('easy')" → "your body's asking for an easy day"
    - "injury flag active" → "your injury flag is on, so we're keeping things light"
    - "HRV 12% below baseline" → "your body's showing signs of fatigue"
{_CHAT_TOOLS_BLOCK}{_CHAT_MODIFICATION_BLOCK}
HARD RULES:
  - Cite only numbers that came from tool_result blocks — never fabricate.
  - If the modification is rails-downgraded, narrate WHY in warm plain English.
  - Never recommend caloric restriction, fasting for weight loss, or body-composition goals.
  - Keep answers to 2–4 short paragraphs.
  - Tone: friend, not professor. Contractions ("you're", "let's", "don't").
"""


CHAT_MODIFICATION_PROMPT_TECHNICAL = f"""You are Frontier Coach in chat mode — an elite endurance coach who can modify today's workout on request, grounded in the athlete's own data. Call tools for analytical context AND for modifications.

LANGUAGE STYLE — TECHNICAL MODE:
Use the full vocabulary with ≤5-word parentheticals on first appearance per reply. Cite framework authors (Banister, Coggan, Seiler, San Millán, Friel, Mujika, Kolie Moore) when the signal fits.
{_CHAT_TOOLS_BLOCK}{_CHAT_MODIFICATION_BLOCK}
HARD RULES:
  - Cite only numbers that came from tool_result blocks — NEVER fabricate.
  - If rails_downgraded=True, cite the triggering signal explicitly
    (e.g. "HRV –12% vs 28-day baseline flipped intensity_ceiling to 'easy'").
  - Name frameworks by author when it fits the signal.
  - Never recommend caloric restriction, fasting for weight loss, or body-composition goals.
  - Keep answers to 2–4 short paragraphs. Lead with the verdict; back with the numbers.
"""


BRIEF_TOOL = {
    "name": "brief_response",
    "description": (
        "Emit the coach's daily brief as structured data. "
        "The prescribed_workout is the single workout the athlete should do today. "
        "alternates contains exactly 2 entries (less_time / recover). "
        "outlook_7d contains exactly 7 daily entries with day_offset 0..6."
    ),
    "input_schema": {
        "type": "object",
        "required": [
            "verdict",
            "rationale",
            "prescribed_workout",
            "alternates",
            "outlook_7d",
            "frameworks_cited",
        ],
        "properties": {
            "verdict": {
                "type": "string",
                "description": (
                    "3-6 word headline. Tone depends on language mode — "
                    "simple: 'Easy day today', 'Rest up'; "
                    "technical: 'VO2 day — fresh', 'Recovery — sleep debt flagged'."
                ),
            },
            "rationale": {
                "type": "string",
                "description": (
                    "2-3 sentences. Technical: cite athlete data + framework. "
                    "Simple: plain-English causal chain, no jargon. Max 400 chars."
                ),
            },
            "prescribed_workout": {
                "type": "object",
                "description": (
                    "The ONE precisely structured workout for today. Use the "
                    "picked_template_id or substitute to an adjacent template. "
                    "Watts will be re-derived server-side from the athlete's FTP."
                ),
                "required": [
                    "template_id",
                    "title",
                    "duration_minutes",
                    "predicted_tss",
                    "framework_cited",
                    "blocks",
                    "why_this_workout",
                ],
                "properties": {
                    "template_id": {
                        "type": "string",
                        "description": "MUST match a key in snapshot.available_templates.",
                    },
                    "title": {
                        "type": "string",
                        "description": (
                            "Short human-readable title. Technical: "
                            "'VO2 — 5×4min at 115% FTP'. "
                            "Simple: 'Hard intervals', 'Easy spin', 'Rest day'."
                        ),
                    },
                    "duration_minutes": {"type": "integer"},
                    "predicted_tss": {"type": "number"},
                    "framework_cited": {
                        "type": "string",
                        "description": "e.g. 'Coggan Z5 · Friel Build 2'.",
                    },
                    "blocks": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "required": [
                                "name",
                                "duration_s",
                                "target_watts_low",
                                "target_watts_high",
                                "zone",
                                "rpe",
                            ],
                            "properties": {
                                "name": {"type": "string"},
                                "duration_s": {"type": "integer"},
                                "target_watts_low": {"type": "integer"},
                                "target_watts_high": {"type": "integer"},
                                "zone": {"type": "integer", "minimum": 1, "maximum": 7},
                                "rpe": {"type": "integer", "minimum": 1, "maximum": 10},
                            },
                        },
                    },
                    "why_this_workout": {
                        "type": "string",
                        "description": (
                            "Technical: 2-3 sentences citing the athlete's numbers. "
                            "Simple: 1-2 plain-English sentences, no acronyms. Max 300 chars."
                        ),
                    },
                },
            },
            "alternates": {
                "type": "array",
                "minItems": 2,
                "maxItems": 2,
                "description": "Two compact fallback lines — less_time and recover.",
                "items": {
                    "type": "object",
                    "required": ["label", "one_liner", "template_id"],
                    "properties": {
                        "label": {"type": "string", "enum": ["less_time", "recover"]},
                        "one_liner": {
                            "type": "string",
                            "description": "Max 80 chars.",
                        },
                        "template_id": {
                            "type": "string",
                            "description": "MUST match a key in snapshot.available_templates.",
                        },
                    },
                },
            },
            "outlook_7d": {
                "type": "array",
                "minItems": 7,
                "maxItems": 7,
                "items": {
                    "type": "object",
                    "required": ["day_offset", "suggested_tss", "note"],
                    "properties": {
                        "day_offset": {"type": "integer", "minimum": 0, "maximum": 6},
                        "suggested_tss": {"type": "number"},
                        "note": {"type": "string"},
                    },
                },
            },
            "frameworks_cited": {
                "type": "array",
                "items": {"type": "string"},
            },
            "tomorrow_plan": {
                "type": "object",
                "description": (
                    "OPTIONAL forward-looking preview of tomorrow's session. "
                    "Populate when you have a clear read on tomorrow (the "
                    "snapshot ships outlook_7d[1] and may include "
                    "tomorrow_planned_workout). 3–5 sentences in `description`. "
                    "If no PlannedWorkout exists for tomorrow, describe the "
                    "TYPE of day (recovery / endurance / tempo / threshold / "
                    "vo2 / race) — do not fabricate specific intervals."
                ),
                "required": ["description", "predicted_tss", "intensity_chip"],
                "properties": {
                    "description": {
                        "type": "string",
                        "description": "3–5 sentence preview, language-aware.",
                    },
                    "predicted_tss": {"type": "number"},
                    "intensity_chip": {
                        "type": "string",
                        "enum": ["recovery", "endurance", "tempo", "threshold", "vo2", "race"],
                    },
                },
            },
            "regeneration": {
                "type": "object",
                "description": (
                    "OPTIONAL 2–3 plain bullets covering sleep target, fuel "
                    "window, mobility / active recovery, and caffeine cutoff. "
                    "Each bullet is short prose — no acronyms in simple mode."
                ),
                "required": ["bullets"],
                "properties": {
                    "bullets": {
                        "type": "array",
                        "minItems": 2,
                        "maxItems": 4,
                        "items": {"type": "string"},
                    },
                },
            },
            "post_ride_review": {
                "type": "object",
                "description": (
                    "Only populate when snapshot.post_ride is present "
                    "(athlete trained today). The frontend renders this in "
                    "place of the workout card. Compliance numbers are "
                    "pre-computed in snapshot.post_ride.compliance — you "
                    "reference them in your narratives but don't fabricate "
                    "them. Omit this field entirely when post_ride is null."
                ),
                "required": [
                    "headline",
                    "physiological_read",
                    "goal_trajectory",
                    "next_session_nudge",
                ],
                "properties": {
                    "headline": {
                        "type": "string",
                        "description": "3-8 word summary of the ride, grade-appropriate.",
                    },
                    "physiological_read": {
                        "type": "string",
                        "description": (
                            "2-3 sentences. Technical: cite EF, VI, San Millán, "
                            "Coggan with actual numbers. Simple: plain English, "
                            "no acronyms — describe what happened in the body."
                        ),
                    },
                    "goal_trajectory": {
                        "type": "string",
                        "description": (
                            "1-2 sentences. Technical: reference CTL/TSB/Banister/"
                            "Mujika. Simple: talk about fitness trend and race "
                            "readiness in plain English."
                        ),
                    },
                    "next_session_nudge": {
                        "type": "string",
                        "description": (
                            "1 sentence. Specific and actionable. What to do tomorrow "
                            "or in the next same-category block."
                        ),
                    },
                },
            },
        },
    },
}


def build_user_message(snapshot: dict) -> str:
    """Render the snapshot as a readable prose block for the LLM user message.

    We send it as prose (not raw JSON) because Claude reasons better over
    natural-language summaries than nested JSON when the structure is deep.
    Raw JSON is still attached as a code fence for reference.

    The `language` marker at the top is picked up by both language modes — in
    simple mode it reminds the LLM to stick to plain English; in technical
    mode it's a no-op.
    """
    import json

    athlete = snapshot.get("athlete", {})
    pmc = snapshot.get("pmc", {})
    hrv = snapshot.get("biometrics", {}).get("hrv", {})
    rhr = snapshot.get("biometrics", {}).get("rhr", {})
    sleep = snapshot.get("biometrics", {}).get("sleep", {})
    zones = snapshot.get("distribution", {})
    act = snapshot.get("activities_14d", {})
    tired = snapshot.get("why_tired", {})
    language = snapshot.get("language", "simple")

    lines: list[str] = []
    if language == "simple":
        lines.append(
            "## Mode: SIMPLE LANGUAGE — plain English only. "
            "No FTP, TSS, CTL, TSB, RPE, VO2, zone numbers, or watt numbers in "
            "verdict/rationale/title/why_this_workout/alternates. Talk like a friend."
        )
    else:
        lines.append(
            "## Mode: TECHNICAL — use the full vocabulary. Always follow jargon "
            "with a ≤5-word parenthetical so beginners can keep up."
        )

    lines.append("\n## Athlete snapshot")
    lines.append(
        f"- Goal: {athlete.get('goal_target') or 'unspecified'} "
        f"(event date: {athlete.get('goal_event_date') or 'unspecified'})"
    )
    lines.append(
        f"- FTP: {athlete.get('ftp') or 'unknown'} W, "
        f"Weight: {athlete.get('weight_kg') or 'unknown'} kg, "
        f"Weekly hours: {athlete.get('weekly_hours') or 'unknown'}, "
        f"Today's window: {athlete.get('today_available_minutes') or 'n/a'} min"
    )
    injury = athlete.get("injury_flag")
    if injury:
        note = athlete.get("injury_note") or "(no note provided)"
        lines.append(f"- **INJURY FLAG IS TRUE** — note: {note}")

    lines.append("\n## Periodization state")
    lines.append(
        f"- Friel phase: {athlete.get('goal_phase', 'unknown')}; "
        f"Today's picked session type: {snapshot.get('today_session_type', 'unknown')}"
    )
    quota = snapshot.get("weekly_intensity_quota", {})
    if quota:
        lines.append(
            f"- Weekly quota — Z1-Z2: {quota.get('z1_z2_hours')}h, "
            f"hard: {quota.get('hard_hours')}h, "
            f"VO2 sessions target: {quota.get('vo2_sessions')}, "
            f"threshold: {quota.get('threshold_sessions')}, "
            f"rest days: {quota.get('rest_days')}"
        )

    # ONE Daily Decision truth (audit P0-3) — the plan facts the narrative
    # must never contradict. Rendered ahead of the picked template so the
    # model sees the authoritative state first.
    today_pw = snapshot.get("today_planned_workout")
    if snapshot.get("today_planned_is_rest"):
        lines.append(
            "\n## ★ TODAY IS A PLANNED REST DAY (authoritative)\n"
            "- The verdict must narrate a rest day. Good recovery = green "
            "light for TOMORROW, never 'load hard today'."
        )
    elif isinstance(today_pw, dict):
        lines.append("\n## Today's planned session (authoritative)")
        lines.append(
            f"- {today_pw.get('title')} (template_id={today_pw.get('template_id')}, "
            f"sport={today_pw.get('sport')}, "
            f"duration={today_pw.get('duration_minutes')} min)"
        )
        lines.append(
            "- The verdict must agree with this plan (signals may cap the "
            "load, never contradict the day's shape)."
        )

    picked = snapshot.get("picked_template_preview")
    if picked:
        lines.append("\n## Picked template (your starting point)")
        lines.append(
            f"- id: `{picked.get('template_id')}` — {picked.get('title')} "
            f"({picked.get('duration_minutes')} min, ~{picked.get('predicted_tss')} TSS)"
        )
        lines.append(f"- purpose: {picked.get('purpose')}")
        lines.append(f"- framework: {picked.get('framework_cited')}")
        lines.append("- blocks:")
        for b in picked.get("blocks", []):
            lines.append(
                f"    - {b['name']}: {b['duration_s']}s @ "
                f"{b['target_watts_low']}-{b['target_watts_high']}W "
                f"(Z{b['zone']}, RPE {b['rpe']})"
            )

    available = snapshot.get("available_templates") or []
    if available:
        lines.append(f"\n## Available templates (use these ids)\n- {', '.join(available)}")

    lines.append("\n## Fitness/fatigue (Banister)")
    lines.append(
        f"- CTL: {pmc.get('ctl', 0):.1f}, ATL: {pmc.get('atl', 0):.1f}, "
        f"TSB: {pmc.get('tsb', 0):.1f} — form_status: {pmc.get('form_status', 'unknown')}"
    )
    lines.append(
        f"- 7-day CTL delta: {pmc.get('ctl_7d_delta', 0):+.1f}, "
        f"TSB delta: {pmc.get('tsb_7d_delta', 0):+.1f}"
    )

    # Athlete-level Critical Power — stream-derived, fit from the cross-ride
    # power-duration envelope. Supplements the stored FTP with a model-based
    # threshold (eFTP) + anaerobic capacity (W'). Omitted when no power streams
    # exist yet (the brief then reasons from stored FTP alone).
    pp = snapshot.get("power_profile")
    if isinstance(pp, dict) and pp.get("cp_watts"):
        lines.append("\n## Critical Power (stream-derived, cross-ride)")
        lines.append(
            f"- CP: {pp.get('cp_watts')} W, W': {pp.get('w_prime_j')} J, "
            f"eFTP: {pp.get('eftp_watts')} W "
            f"(fit over {pp.get('n_rides')} rides, R²={pp.get('r_squared')})"
        )
        lines.append(
            "- eFTP is the model's threshold estimate; if it diverges materially "
            "from the stored FTP, trust the trend and consider an FTP update."
        )

    # Recent training load — ROLLING windows that survive the Monday calendar
    # reset. `total_tss_this_week` zeroes every Monday, which on its own makes a
    # hard-trained athlete look "fresh" at the start of a new week. These rolling
    # figures carry the prior week's load across that boundary so the verdict
    # reflects the legs, not the calendar.
    wp = snapshot.get("weekly_progress") or {}
    if wp:
        lines.append("\n## Recent training load (rolling — crosses the week boundary)")
        lines.append(
            f"- Yesterday: {wp.get('yesterday_tss', 0):.0f} TSS; "
            f"last 48h: {wp.get('last_48h_tss', 0):.0f} TSS; "
            f"last 7 days (rolling): {wp.get('rolling_7d_tss', 0):.0f} TSS"
        )
        lines.append(
            f"- This calendar week so far (resets Monday — do NOT read as freshness): "
            f"{wp.get('total_tss_this_week', 0):.0f} TSS over "
            f"{wp.get('hard_sessions_done', 0)} hard session(s)"
        )
        # Sport-split today tally — the ALREADY-TRAINED gate reads the RIDE
        # numbers; other-sport work earns credit but never flips the bike plan.
        lines.append(
            f"- Today by sport: ride {wp.get('today_ride_minutes', 0):.0f} min / "
            f"{wp.get('today_ride_tss', 0):.0f} TSS; "
            f"other sport ({wp.get('today_other_sport') or 'none'}): "
            f"{wp.get('today_other_minutes', 0):.0f} min"
        )
        lines.append(
            "→ If the rolling 48h / 7d load is high but the calendar-week total is "
            "low (e.g. a long weekend ride), the athlete is NOT fresh — weigh the "
            "rolling load and TSB, not the week-to-date counter."
        )

    lines.append("\n## Biometrics")
    lines.append(
        f"- HRV 7d vs 28d: {hrv.get('delta_pct', 'n/a')}% "
        f"({hrv.get('current_mean', 'n/a')} vs {hrv.get('baseline_28d_mean', 'n/a')} ms, "
        f"n={hrv.get('samples_n', 0)}) — direction: {hrv.get('direction', 'unknown')}"
    )
    lines.append(
        f"- rHR 7d vs 28d: {rhr.get('delta_pct', 'n/a')}% "
        f"({rhr.get('current_mean', 'n/a')} vs {rhr.get('baseline_28d_mean', 'n/a')} bpm)"
    )
    lines.append(
        f"- Sleep debt (14d): {sleep.get('total_debt_hours', 0)}h total, "
        f"{sleep.get('nights_short', 0)} short / {sleep.get('nights_healthy', 0)} healthy nights"
    )

    lines.append("\n## Intensity distribution (Seiler 3-zone, last 28d cycling)")
    lines.append(
        f"- Z1: {zones.get('z1_pct', 0)}%, Z2: {zones.get('z2_pct', 0)}%, "
        f"Z3: {zones.get('z3_pct', 0)}% over {zones.get('total_hours', 0)}h "
        f"(grey-zone flag: {zones.get('grey_zone_flag', False)})"
    )

    lines.append("\n## Last 14 days of activity")
    lines.append(
        f"- Activities: {act.get('count', 0)}, total TSS: {act.get('total_tss', 0):.0f}, "
        f"avg EF: {act.get('avg_ef', 'n/a')}, avg decoupling: {act.get('avg_decoupling', 'n/a')}%, "
        f"durability (last long ride): {act.get('durability_last_long_ride', 'n/a')}"
    )

    if tired.get("causes"):
        lines.append("\n## Why-tired synthesizer causes (ordered)")
        for c in tired["causes"]:
            lines.append(f"- [{c['severity']}] {c['label']}: {c['evidence']}")

    # Phase 5.3 — post-ride review context (only when today's activity was scored)
    post_ride = snapshot.get("post_ride")
    if isinstance(post_ride, dict):
        comp = post_ride.get("compliance", {})
        traj = post_ride.get("trajectory", {})
        target = post_ride.get("target_template", {})
        actual = post_ride.get("actual_activity", {})
        lines.append("\n## ★ POST-RIDE REVIEW REQUIRED (athlete trained today)")
        lines.append(
            f"- Grade: **{comp.get('grade', 'unknown')}** "
            f"(session_type={comp.get('session_type')}, phase={comp.get('phase')})"
        )
        lines.append(
            f"- Target template: {target.get('id')} — {target.get('title')} "
            f"({target.get('framework_cited', '')})"
        )
        dur = comp.get("duration", {})
        tss_c = comp.get("tss", {})
        lines.append(
            f"- Duration: actual {dur.get('actual')} min vs target {dur.get('target')} min "
            f"({dur.get('delta_pct'):+.1f}%, band={dur.get('band')})"
        )
        lines.append(
            f"- TSS: actual {tss_c.get('actual')} vs target {tss_c.get('target')} "
            f"({tss_c.get('delta_pct'):+.1f}%, band={tss_c.get('band')})"
        )
        if_pair = comp.get("intensity_factor")
        if isinstance(if_pair, dict):
            lines.append(
                f"- IF: actual {if_pair.get('actual')} vs target {if_pair.get('target')} "
                f"({if_pair.get('delta_pct'):+.1f}%)"
            )
        if comp.get("variability_index") is not None:
            lines.append(f"- VI (NP/avgP): {comp['variability_index']}")
        if comp.get("ef") is not None:
            lines.append(f"- EF (NP/avgHR): {comp['ef']}")
        if comp.get("decoupling_pct") is not None:
            lines.append(f"- Decoupling: {comp['decoupling_pct']}%")
        lines.append(f"- Trajectory: {traj.get('narrative_hook', 'n/a')}")
        lines.append(
            f"  taper_window={traj.get('taper_window')}, on_track={traj.get('on_track')}, "
            f"days_to_goal={traj.get('days_to_goal')}"
        )
        lines.append(
            f"- Actual ride: {actual.get('duration_minutes')} min, "
            f"{actual.get('tss')} TSS, NP {actual.get('normalized_power')}, "
            f"avgHR {actual.get('average_hr')}"
        )
        lines.append(
            "→ Fill `post_ride_review` with headline, physiological_read, "
            "goal_trajectory, next_session_nudge narratives in the requested "
            "language mode. Use the actual numbers above."
        )

    # ------------------------------------------------------------------
    # Step 7 (today-runthrough) — variable inputs that go in the USER
    # message (NOT the cached system prefix). All are optional; missing
    # blocks are skipped silently so older snapshots still render.
    # ------------------------------------------------------------------
    yesterday_rec = snapshot.get("yesterday_recommendation")
    if isinstance(yesterday_rec, dict):
        lines.append("\n## Yesterday's recommendation (recap-with-eval input)")
        lines.append(
            f"- title: {yesterday_rec.get('title')} "
            f"(template_id={yesterday_rec.get('template_id')})"
        )
        lines.append(
            f"- target: {yesterday_rec.get('duration_minutes')} min, "
            f"{yesterday_rec.get('predicted_tss')} TSS"
        )
        if yesterday_rec.get("framework_cited"):
            lines.append(f"- framework: {yesterday_rec['framework_cited']}")
        if yesterday_rec.get("why_this_workout"):
            lines.append(f"- why we asked for it: {yesterday_rec['why_this_workout']}")
        lines.append(
            "→ post_ride_review.physiological_read MUST name this workout "
            "by title and quote target vs actual numbers."
        )

    todays_activities = snapshot.get("todays_activities")
    if isinstance(todays_activities, list) and todays_activities:
        lines.append("\n## Today's completed activities (athlete-local)")
        for a in todays_activities:
            lines.append(
                f"- {a.get('title') or a.get('sport', 'activity')}: "
                f"{a.get('duration_minutes', 'n/a')} min, "
                f"{a.get('tss', 'n/a')} TSS, "
                f"IF {a.get('intensity_factor', 'n/a')}, "
                f"EF {a.get('efficiency_factor', 'n/a')}"
            )

    tomorrow_outlook = snapshot.get("tomorrow_outlook")
    if isinstance(tomorrow_outlook, dict):
        lines.append("\n## Tomorrow (forward-looking inputs)")
        lines.append(
            f"- outlook_7d[1]: ~{tomorrow_outlook.get('suggested_tss', 'n/a')} TSS — "
            f"{tomorrow_outlook.get('note', '')}"
        )
    tomorrow_pw = snapshot.get("tomorrow_planned_workout")
    if isinstance(tomorrow_pw, dict):
        lines.append(
            f"- planned workout: {tomorrow_pw.get('title')} "
            f"(template_id={tomorrow_pw.get('template_id')}, "
            f"duration={tomorrow_pw.get('duration_minutes')} min)"
        )
    elif isinstance(tomorrow_outlook, dict):
        lines.append(
            "- no planned workout for tomorrow — describe the TYPE of day, "
            "not specific intervals."
        )

    lines.append("\n## Raw JSON reference")
    lines.append("```json")
    lines.append(json.dumps(snapshot, default=str, indent=2))
    lines.append("```")

    return "\n".join(lines)


# ======================================================================
#  WEEKLY PLAN PERSONALIZATION — WEEK_TOOL + prompts + user message
# ======================================================================
#
# The deterministic mesocycle generator produces a SAFE 7-day skeleton
# (real rest days, a weekly-TSS cap, varied templates). This layer lets
# the LLM PERSONALIZE within that skeleton — the skeleton is the rail, the
# LLM adds individual, creative copy + fine-tunes template choice/duration.
#
# HARD server-side rails (enforced in weekly_plan_llm.enforce_week_rails,
# NOT trusted from the model):
#   - rest days stay rest (the LLM may not add/remove a rest day)
#   - every template_id must be one the day offered (available_templates)
#   - per-day duration clamped to ±~20% of the skeleton
#   - week TSS clamped to ≤~110% of the target
#   - watts/zones always re-derived from FTP (only %FTP template blocks ship;
#     the LLM never supplies numbers)
#
# Mirrors the BRIEF_TOOL / prompt-caching discipline of the daily brief.

WEEK_SYSTEM_PROMPT_TECHNICAL = """You are Frontier Coach personalizing an athlete's WEEK plan. A deterministic periodization engine already produced a SAFE 7-day skeleton (Friel phase, Issurin block, Seiler TID, real rest days, a weekly-TSS cap). Your job is to make the week feel 100% individual — NOT to rebuild it.

You receive, per day: day-of-week, session_type, is_rest, a TSS budget, the skeleton's picked template_id, and `available_templates` (the ONLY template_ids you may choose for that day). You also receive the athlete's real situation: CTL/ATL/TSB, recent load + compliance, goal event + terrain + days-to-event, phase, weekly TSS target, hours/day, and — when present — a `plan_deviation` describing what actually happened last week (a skipped session, or over/under-training).

WHAT YOU MAY DO:
  1. For each NON-rest day, pick the specific template_id from that day's `available_templates` (keep the skeleton's pick unless a signal argues otherwise).
  2. Tune `duration_minutes` within ±20% of the skeleton's duration.
  3. Write an INDIVIDUAL, specific `rationale` per day (1 sentence) citing the athlete's real numbers/situation — never boilerplate.
  4. Write a personalized `weekly_narrative` (3-5 sentences) that references the athlete's actual CTL/TSB, phase, event countdown + terrain, and — if a `plan_deviation` is present — acknowledges it explicitly and explains how the week adapts (bias recovery if over-trained; protect the key session if a day was skipped).

WHAT YOU MAY NOT DO:
  - Change which days are rest (is_rest is FIXED — copy it through).
  - Choose a template_id that is not in that day's `available_templates`.
  - Exceed the weekly TSS target by more than ~10%.
  - Supply watts — the server re-derives every number from the athlete's FTP.

Cite frameworks by author when natural (Friel, Seiler, Issurin, San Millán, Mujika, Banister, Coggan). Follow any jargon term with a ≤5-word parenthetical. Respond ONLY by calling the `personalize_week` tool — no prose outside it.
"""


WEEK_SYSTEM_PROMPT_SIMPLE = """You are Frontier Coach personalizing an athlete's WEEK plan — the friendly, encouraging buddy at the bike shop, not a lab technician. A planning engine already laid out a safe 7-day skeleton with the right rest days and the right total load. Your job is to make it feel personal and human — NOT to rebuild it.

You receive, per day: which day it is, the type of day, whether it's a rest day, a rough effort budget, the picked workout, and `available_templates` (the ONLY workout ids you may choose for that day). You also see the athlete's real situation: how fresh/tired they are, what they rode recently, their goal event and how far away it is, hours per day, and — when present — a `plan_deviation` telling you what actually happened last week (a skipped ride, or doing much more/less than planned).

WHAT YOU MAY DO:
  1. For each NON-rest day, pick the workout id from that day's `available_templates` (keep the planned one unless there's a clear reason).
  2. Nudge the minutes up or down within about 20% of the plan.
  3. Write ONE warm, specific plain-English sentence of `rationale` per day that mentions what the athlete actually did or how they feel — never generic filler.
  4. Write a personalized `weekly_narrative` (3-5 sentences) that talks about how their week is shaping up, the goal ahead, and — if a `plan_deviation` is present — mentions it kindly ("you skipped Tuesday's ride, so...") and says how the week adjusts.

LANGUAGE RULES — PLAIN ENGLISH ONLY. Never use FTP, TSS, CTL, ATL, TSB, VO2, threshold, sweet spot, tempo, polarized, zone numbers, watt numbers, or framework author names in `weekly_narrative`, `rationale`, or `title`. Describe effort as "easy/chat pace", "steady push", "hard intervals", "rest". Use contractions.

WHAT YOU MAY NOT DO:
  - Change which days are rest (copy is_rest through unchanged).
  - Pick a workout id that isn't in that day's `available_templates`.
  - Blow past the week's effort budget by much.
  - Give watt numbers — the app fills those in from the athlete's fitness.

Respond ONLY by calling the `personalize_week` tool — no prose outside it.
"""


def system_prompt_for_week(
    language: Language = "simple",
    locale: str | None = None,
) -> str:
    """System prompt for the weekly-plan personalization call.

    Mirrors `system_prompt_for_language` but for the WEEK_TOOL flow. The text
    is stable so prompt caching stays warm; the variable athlete data lives in
    the user message (`build_week_user_message`).
    """
    base = (
        WEEK_SYSTEM_PROMPT_SIMPLE if language == "simple"
        else WEEK_SYSTEM_PROMPT_TECHNICAL
    )
    locale_suffix = LOCALE_DE_INSTRUCTION if locale == "de" else ""
    return f"{base}{locale_suffix}"


WEEK_TOOL = {
    "name": "personalize_week",
    "description": (
        "Emit the personalized 7-day week. `weekly_narrative` is the preface "
        "paragraph. `days` has EXACTLY 7 entries (Mon..Sun order not required — "
        "match each entry to the skeleton by `dow`). Rest days must keep "
        "is_rest=true. Every template_id must be one of that day's "
        "available_templates. Watts are re-derived server-side."
    ),
    "input_schema": {
        "type": "object",
        "required": ["weekly_narrative", "days"],
        "properties": {
            "weekly_narrative": {
                "type": "string",
                "description": (
                    "3-5 sentence personalized preface referencing the athlete's "
                    "real situation. Simple mode: plain English, no jargon. "
                    "Acknowledge any plan_deviation explicitly. Max 600 chars."
                ),
            },
            "days": {
                "type": "array",
                "minItems": 7,
                "maxItems": 7,
                "items": {
                    "type": "object",
                    "required": [
                        "dow",
                        "is_rest",
                        "template_id",
                        "title",
                        "duration_minutes",
                        "rationale",
                    ],
                    "properties": {
                        "dow": {
                            "type": "integer",
                            "minimum": 0,
                            "maximum": 6,
                            "description": "Day index matching the skeleton (0=Mon..6=Sun).",
                        },
                        "is_rest": {
                            "type": "boolean",
                            "description": "MUST equal the skeleton's is_rest for this dow.",
                        },
                        "template_id": {
                            "type": "string",
                            "description": "MUST be in this day's available_templates.",
                        },
                        "title": {
                            "type": "string",
                            "description": (
                                "Short, human title. Simple: 'Easy spin', "
                                "'Hard intervals', 'Rest day'."
                            ),
                        },
                        "duration_minutes": {"type": "integer"},
                        "rationale": {
                            "type": "string",
                            "description": (
                                "ONE individual sentence citing the athlete's real "
                                "situation. Max 200 chars."
                            ),
                        },
                    },
                },
            },
        },
    },
}


def build_week_user_message(skeleton: list[dict], snapshot: dict) -> str:
    """Render the week skeleton + athlete situation for the WEEK_TOOL call.

    `skeleton` is the deterministic 7-day plan (one dict per rendered day with
    dow / date / session_type / is_rest / template_id / target_tss /
    duration_minutes / available_templates). `snapshot` carries the athlete's
    real situation (a focused subset — CTL/TSB, phase, event, weekly target,
    recent load, and an optional `plan_deviation`).
    """
    import json

    athlete = snapshot.get("athlete", {})
    language = snapshot.get("language", "simple")
    lines: list[str] = []

    if language == "simple":
        lines.append(
            "## Mode: SIMPLE LANGUAGE — plain English only in weekly_narrative, "
            "title, rationale. No FTP/TSS/CTL/TSB/zone/watt numbers or framework "
            "names. Talk like a friend."
        )
    else:
        lines.append(
            "## Mode: TECHNICAL — full vocabulary; follow jargon with a "
            "≤5-word parenthetical."
        )

    lines.append("\n## Athlete situation")
    lines.append(
        f"- Goal: {athlete.get('goal_target') or 'unspecified'} "
        f"(type: {athlete.get('goal_event_type') or 'n/a'}, "
        f"terrain: {athlete.get('event_terrain') or 'n/a'}, "
        f"in {athlete.get('days_to_goal', 'n/a')} days)"
    )
    lines.append(
        f"- Phase: {athlete.get('goal_phase', 'unknown')}; "
        f"weekly TSS target: {snapshot.get('weekly_tss_target', 'n/a')}; "
        f"hours/day available: {athlete.get('hours_per_day', 'n/a')}"
    )
    lines.append(
        f"- Sports: primary {athlete.get('primary_sport') or 'cycling'}, "
        f"secondary {athlete.get('secondary_sport') or 'none'}; "
        f"FTP {athlete.get('ftp') or 'unknown'} W"
    )

    pmc = snapshot.get("pmc", {})
    lines.append(
        f"- Fitness/fatigue: CTL {pmc.get('ctl', 0):.0f}, ATL {pmc.get('atl', 0):.0f}, "
        f"TSB {pmc.get('tsb', 0):.0f} (7d CTL delta {pmc.get('ctl_7d_delta', 0):+.1f})"
    )

    recent = snapshot.get("recent_load") or {}
    if recent:
        lines.append(
            f"- Last 7 days: {recent.get('activity_count', 0)} rides, "
            f"{recent.get('actual_tss', 0):.0f} actual TSS "
            f"(planned ~{recent.get('planned_tss', 0):.0f})"
        )

    deviation = snapshot.get("plan_deviation")
    if isinstance(deviation, dict) and deviation.get("status") not in (None, "on_track"):
        lines.append("\n## ★ PLAN DEVIATION — acknowledge this in weekly_narrative")
        lines.append(f"- status: {deviation.get('status')}")
        lines.append(f"- what happened: {deviation.get('detail', '')}")
        lines.append(
            "→ Reference it explicitly and explain how this week adapts "
            "(bias recovery if over-trained; protect the key session if a day "
            "was skipped; keep the week near target either way)."
        )

    lines.append("\n## Deterministic 7-day skeleton (personalize WITHIN this)")
    for d in skeleton:
        if d.get("is_rest"):
            lines.append(
                f"- dow {d['dow']} ({d.get('date')}): REST DAY — keep is_rest=true."
            )
        else:
            lines.append(
                f"- dow {d['dow']} ({d.get('date')}): {d.get('session_type')} — "
                f"picked `{d.get('template_id')}`, ~{d.get('target_tss')} TSS, "
                f"{d.get('duration_minutes')} min. "
                f"available_templates: {', '.join(d.get('available_templates') or [])}"
            )

    lines.append(
        "\nReturn EXACTLY 7 day entries (one per dow above). Keep is_rest as "
        "given. Only choose template_ids from each day's available_templates."
    )

    lines.append("\n## Raw JSON reference")
    lines.append("```json")
    lines.append(json.dumps({"skeleton": skeleton, "situation": snapshot}, default=str, indent=2))
    lines.append("```")

    return "\n".join(lines)
