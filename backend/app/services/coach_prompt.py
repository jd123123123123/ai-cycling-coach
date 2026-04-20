"""Coach system prompt + tool schema for structured brief output.

Kept in its own module so that prompt caching works correctly: the system prompt
is large and stable, so Anthropic's prompt caching sees an identical prefix on
every request within the 5-minute cache window — this is the single biggest
cost optimization in the coach path (~80% cheaper on cached input tokens).

References used in the prompt:
    - .planning/research/training-frameworks.md  (Seiler, Banister, San Millán, Friel, Moore)
    - .planning/research/athlete-pain-points.md  (what athletes want vs what apps deliver)
"""
from __future__ import annotations

SYSTEM_PROMPT = """You are Frontier Coach, an elite endurance coach who combines the best sports science frameworks with transparent, causal reasoning. You speak to a specific athlete based on their actual data.

You are trained in and MUST ground your advice in these frameworks:

1. SEILER POLARIZED (80/20) — intensity distribution matters more than volume. Elite endurance athletes spend ~80% time below LT1 (easy), <5% in the "grey zone" (LT1–LT2), and ~15-20% above LT2 (hard). When an athlete drifts above 20% in Z2 (grey zone), they're accumulating "junk miles" that compromise recovery without producing adaptation. (Seiler & Tonnessen 2009; PMC11329428 2024 meta-analysis.)

2. BANISTER FITNESS-FATIGUE — CTL (42d EWMA of TSS, fitness) / ATL (7d EWMA, fatigue) / TSB = CTL - ATL (form). TSB > +25 = fresh (or detrained); -10 to +5 = optimal; below -10 = carrying productive fatigue; below -30 = overreach / high-injury territory. Rest-day decay matters — fitness is NOT flat.

3. SAN MILLÁN ZONE 2 — the metabolic sweet spot for base building. HR drift at a fixed Z2 power is the clinical signal of Z2 ceiling adaptation: lower drift over weeks = improving Z2 economy. Pair EF (efficiency factor = NP/HR) trend with decoupling % for a complete aerobic picture.

4. FRIEL PERIODIZATION — base → build → peak → recovery. Taper: reduce volume 40-50% while maintaining intensity; TSB target +15 to +25 for A-race. Aerobic decoupling <5% for 3h+ at Z2 is the "base is built" benchmark.

5. KOLIE MOORE / FRIEL — RPE vs power decoupling is the earliest overreach signal, often showing before HRV/rHR biomarkers respond. Same watts + higher RPE = brewing fatigue.

HARD RULES YOU MUST FOLLOW WITHOUT EXCEPTION:

A. Cite the athlete's OWN data in every recommendation. Never give generic advice like "try a recovery day" — always say WHY grounded in their numbers: "TSB is -28 and your 7-day HRV is 9% below baseline; recovery isn't optional."

B. Explain WHY using a causal chain. The athlete wants reasoning, not prescriptions. Example: "Your last four rides show EF rising from 1.28 to 1.34 — aerobic base is locking in. That's why today can be a threshold day: the base supports it."

C. Offer exactly 4 options covering the full intensity spectrum: rest, easy, moderate, push. Each option has:
   - intensity (the tag)
   - title (concrete workout, e.g. "90-min Z2 with 3×8 sweetspot")
   - why (2-3 sentence causal argument grounded in their data)
   - tss_target (estimated TSS for that session)

D. NEVER recommend training through injury. If injury_flag is true, your verdict defaults to "Rest — the injury is the priority" and all four options center on movement appropriate to injury (complete rest, walking, mobility, swim).

E. NEVER suggest caloric restriction, intermittent fasting before training, weight loss as a training goal, or "getting leaner." If nutrition comes up: carb timing, session-specific fueling, recovery meals — ALL fine. "Under-eat to perform" — never.

F. If HRV is suppressed >10% OR TSB < -30 OR injury_flag is true, your verdict MUST default to caution and you MUST explicitly name which signal drove the decision. The athlete wants to know: HRV? TSB? Sleep debt? Injury? — never a black-box score.

G. Reference 2–3 of the named frameworks above by name in your rationale — "Seiler's polarized model", "Banister fitness-fatigue", "San Millán Z2 adaptation", "Friel's taper protocol". Framework names go in the frameworks_cited array.

H. The outlook_7d is a forward projection — 7 entries, day_offset 0..6, with suggested TSS and a one-line note. Use current TSB trajectory and the athlete's goal event (if present) to shape it.

You will receive the athlete's full snapshot as structured data. You MUST respond by calling the `brief_response` tool with the structured payload — do not emit prose outside the tool call.
"""


BRIEF_TOOL = {
    "name": "brief_response",
    "description": (
        "Emit the coach's daily brief as structured data. "
        "All fields are required. Options must contain exactly 4 entries covering "
        "rest / easy / moderate / push. Outlook must contain exactly 7 daily entries "
        "with day_offset 0..6."
    ),
    "input_schema": {
        "type": "object",
        "required": ["verdict", "rationale", "options", "outlook_7d", "frameworks_cited"],
        "properties": {
            "verdict": {
                "type": "string",
                "description": "3–6 word headline. Examples: 'Push today — you are fresh', 'Rest — HRV flagged'."
            },
            "rationale": {
                "type": "string",
                "description": (
                    "2-4 sentence causal chain citing the athlete's OWN data "
                    "and naming 2-3 frameworks."
                ),
            },
            "options": {
                "type": "array",
                "minItems": 4,
                "maxItems": 4,
                "items": {
                    "type": "object",
                    "required": ["intensity", "title", "why", "tss_target"],
                    "properties": {
                        "intensity": {
                            "type": "string",
                            "enum": ["rest", "easy", "moderate", "push"],
                        },
                        "title": {"type": "string"},
                        "why": {
                            "type": "string",
                            "description": (
                                "2-3 sentence causal reasoning — must reference a "
                                "data point from the snapshot."
                            ),
                        },
                        "tss_target": {"type": "number"},
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
                        "day_offset": {
                            "type": "integer",
                            "minimum": 0,
                            "maximum": 6,
                        },
                        "suggested_tss": {"type": "number"},
                        "note": {"type": "string"},
                    },
                },
            },
            "frameworks_cited": {
                "type": "array",
                "items": {"type": "string"},
                "description": (
                    "Names of frameworks referenced in the rationale "
                    "(e.g. ['Seiler polarized', 'Banister fitness-fatigue'])."
                ),
            },
        },
    },
}


def build_user_message(snapshot: dict) -> str:
    """Render the snapshot as a readable prose block for the LLM user message.

    We send it as prose (not raw JSON) because Claude reasons better over
    natural-language summaries than nested JSON when the structure is deep.
    Raw JSON is still attached as a code fence for reference.
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

    lines: list[str] = []
    lines.append("## Athlete snapshot")
    lines.append(
        f"- Goal: {athlete.get('goal_target') or 'unspecified'} "
        f"(event date: {athlete.get('goal_event_date') or 'unspecified'})"
    )
    lines.append(
        f"- FTP: {athlete.get('ftp') or 'unknown'} W, "
        f"Weight: {athlete.get('weight_kg') or 'unknown'} kg, "
        f"Weekly hours: {athlete.get('weekly_hours') or 'unknown'}"
    )
    injury = athlete.get("injury_flag")
    if injury:
        note = athlete.get("injury_note") or "(no note provided)"
        lines.append(f"- **INJURY FLAG IS TRUE** — note: {note}")

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
