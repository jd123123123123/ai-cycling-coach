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

F. ALREADY-TRAINED-TODAY: if `snapshot.weekly_progress.today_tss >= 25` the athlete has already ridden today. Do NOT prescribe a second session. Set `prescribed_workout.template_id = 'rest_day'`, both alternates to `rest_day` or `recovery_30`, verdict should acknowledge the session (e.g. "Session complete — 68 min logged"), and rationale cites today's duration + TSS + intensity. Explain that stacking another workout fights absorption, not builds fitness.

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

E. IF THEY ALREADY RODE TODAY (snapshot.weekly_progress.today_tss >= 25): don't tell them to do another ride. Set `prescribed_workout.template_id = 'rest_day'`, both alternates as `rest_day` or `recovery_30`. Acknowledge it warmly — "Nice, you've already got XX minutes in today" — and tell them to eat well, hydrate, and let the ride do its thing. Never prescribe a second workout on top of a completed one.

You will receive the athlete's full snapshot as structured data, including the pre-picked template. Respond by calling the `brief_response` tool — no prose outside the tool call.
"""


# Backward-compat alias — `SYSTEM_PROMPT` is the technical prompt.
# /coach/transparency and existing importers still read this name.
SYSTEM_PROMPT = SYSTEM_PROMPT_TECHNICAL


def system_prompt_for_language(language: Language) -> str:
    """Return the system prompt for the requested language mode."""
    if language == "simple":
        return SYSTEM_PROMPT_SIMPLE
    return SYSTEM_PROMPT_TECHNICAL


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

    lines.append("\n## Raw JSON reference")
    lines.append("```json")
    lines.append(json.dumps(snapshot, default=str, indent=2))
    lines.append("```")

    return "\n".join(lines)
