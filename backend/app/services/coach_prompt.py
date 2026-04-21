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

G. POST-RIDE REVIEW MODE: when `snapshot.post_ride` is present (athlete trained today), your brief MUST include `post_ride_review` with the three narrative fields below. The compliance numbers (grade, duration, TSS, IF, VI, EF) are already computed — you read them from `snapshot.post_ride.compliance` and use the actual numbers in your narratives. You write:

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

E. IF THEY ALREADY RODE TODAY (snapshot.weekly_progress.today_tss >= 25): don't tell them to do another ride. Set `prescribed_workout.template_id = 'rest_day'`, both alternates as `rest_day` or `recovery_30`. Acknowledge it warmly — "Nice, you've already got XX minutes in today" — and tell them to eat well, hydrate, and let the ride do its thing. Never prescribe a second workout on top of a completed one.

F. POST-RIDE REVIEW (when snapshot.post_ride is present): include a `post_ride_review` block with three plain-English narrative fields — NO acronyms, NO framework names, NO watt numbers. The compliance numbers are precomputed (you read them from snapshot.post_ride.compliance); you only write the words:

    - `headline` (3-8 words): warm summary matching the grade. Good: "You nailed it", "Solid work", "That was more than needed", "A bit lighter than planned". Avoid "execution", "compliance", "prescribed".
    - `physiological_read` (2-3 sentences): plain English. Talk about how the ride felt in the body. "Your heart rate stayed low relative to your effort — that's real base fitness showing up. You paced it evenly, which is exactly how this kind of ride does its job." No EF/VI/RPE/Z-numbers.
    - `goal_trajectory` (1-2 sentences): plain English. "Your fitness is trending up steadily — keep this rhythm for a couple weeks and you'll be where you want for race day." Numbers like CTL/TSB/TSS are BANNED in simple mode.
    - `next_session_nudge` (1 sentence): specific, warm, actionable. "Tomorrow: rest is earned — you did today's work." "Next time try to stretch it a little — your legs are ready."

You will receive the athlete's full snapshot as structured data, including the pre-picked template. Respond by calling the `brief_response` tool — no prose outside the tool call.
"""


# Backward-compat alias — `SYSTEM_PROMPT` is the technical prompt.
# /coach/transparency and existing importers still read this name.
SYSTEM_PROMPT = SYSTEM_PROMPT_TECHNICAL


def system_prompt_for_language(
    language: Language,
    context: PromptContext = "brief",
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
    if context == "chat_modification":
        if language == "simple":
            return CHAT_MODIFICATION_PROMPT_SIMPLE
        return CHAT_MODIFICATION_PROMPT_TECHNICAL

    if context == "chat_analytical":
        if language == "simple":
            return CHAT_ANALYTICAL_PROMPT_SIMPLE
        return CHAT_ANALYTICAL_PROMPT_TECHNICAL

    if language == "simple":
        return SYSTEM_PROMPT_SIMPLE
    return SYSTEM_PROMPT_TECHNICAL


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
handles both synchronously. After the final tool_result, write the narrative.
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

WRITE TOOL — modify_planned_workout:

You have ONE write tool available: `modify_planned_workout`. Call it when the
user clearly expresses a modification intent. Map the language to the
modification_type:

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

    lines.append("\n## Raw JSON reference")
    lines.append("```json")
    lines.append(json.dumps(snapshot, default=str, indent=2))
    lines.append("```")

    return "\n".join(lines)
