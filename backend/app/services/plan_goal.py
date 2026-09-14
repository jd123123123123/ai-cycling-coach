"""Transparent demand mapping. These are planning heuristics, not predictions."""
import math
from datetime import date, timedelta
from app.schemas.plan_goal import CustomGoalInput, CustomGoalPreview
from app.services.program_builder import set_program


def preview_goal(goal: CustomGoalInput, today: date) -> CustomGoalPreview:
    if goal.target_date is None:
        goal = goal.model_copy(update={"target_date": today + timedelta(weeks=8)})
    days = (goal.target_date - today).days
    if days < 1 or days > 730:
        raise ValueError("Choose a target date between tomorrow and two years from today")
    # Only when no duration was supplied: explicit conservative planning estimate,
    # not the rider's predicted completion time. Climbing adds demand.
    duration = goal.duration_hours or ((goal.distance_km or 0) / 25 + (goal.ascent_m or 0) / 1200)
    climbing = (goal.ascent_m or 0) >= 1000 and (
        goal.distance_km is None or (goal.ascent_m or 0) / goal.distance_km >= 12
    )
    if duration >= 4 or (goal.distance_km or 0) >= 120:
        focus, label, program = "endurance", "Ausdauer", "endurance_200k"
        reason = "Lange Belastungsdauer: Ausdauer und längere Grundlagenfahrten stehen im Mittelpunkt."
    elif goal.intent == "race" and duration <= 2 and not climbing:
        focus, label, program = "vo2", "VO₂max", "vo2_builder"
        reason = "Kurzes Rennen: wiederholte intensive Belastungen ergänzen die Ausdauerbasis."
    else:
        focus, label, program = "threshold", "FTP & Bergkraft" if climbing else "FTP", "ftp_builder"
        reason = "Anstiege: länger gleichmäßige Leistung halten." if climbing else "Mittlere Belastungsdauer: länger hohe Leistung halten."
    if goal.intent == "finish" and focus == "threshold" and not climbing:
        focus, label, program = "endurance", "Ausdauer", "endurance_200k"
        reason = "Sicher ankommen: belastbare Ausdauer vor zusätzlicher Intensität."
    if climbing and focus == "endurance":
        reason += " Dazu kommen passende Bergvarianten."
    if goal.focus != "auto":
        focus = goal.focus
        label, program = {"endurance": ("Ausdauer", "endurance_200k"), "threshold": ("FTP", "ftp_builder"), "vo2": ("VO₂max", "vo2_builder")}[focus]
        reason = "Dein gewählter Schwerpunkt bestimmt die passenden Qualitätseinheiten; Umfang und Erholung richten sich nach deinem aktuellen Training."
        duration = duration or min(4, goal.weekly_hours * 0.45)
    event_type = "race" if goal.intent == "race" else ("fondo" if climbing else "audax")
    # This is a ceiling on event-specific long rides, never a load increase.
    target_min = max(30, int(min(duration * 0.75, goal.weekly_hours * 0.45, 4) * 60))
    return CustomGoalPreview(goal=goal, focus=focus, focus_label=label, rationale=reason,
        program=program, event_type=event_type, event_duration_hours=round(duration, 2),
        duration_estimated=goal.duration_hours is None, long_ride_target_minutes=target_min,
        weeks_remaining=math.ceil(days / 7), climbing=climbing)


def apply_goal_to_profile(profile, preview: CustomGoalPreview, today: date) -> None:
    goal = preview.goal
    goals = set_program(profile.goals, "bike", None)
    goals.update(custom_goal=goal.model_dump(mode="json"),
        custom_goal_recommendation=preview.model_dump(mode="json", exclude={"goal"}),
        custom_goal_started=today.isoformat(), target_event_date=goal.target_date.isoformat(),
        target_event_name=goal.name, weekly_hours=goal.weekly_hours,
        training_model={"endurance": "pyramidal", "threshold": "sweetspot", "vo2": "polarized"}[preview.focus],
        push_intensity={"finish": "steady", "faster": "balanced", "race": "aggressive"}[goal.intent])
    if goal.days_per_week is not None:
        goals["days_per_week"] = goal.days_per_week
        # Keep existing unavailable days; limit the remaining days deterministically.
        keys = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
        current = dict(profile.days_available or {})
        allowed = list(goal.days_available) if goal.days_available is not None else [key for key in keys if current.get(key, True)]
        long_day = current.get("long_day")
        if long_day not in allowed:
            long_day = next((key for key in ("sun", "sat") if key in allowed), allowed[-1] if allowed else "sun")
        priority = [long_day] + [key for key in ("wed", "sat", "tue", "fri", "thu", "mon", "sun") if key != long_day]
        chosen = [key for key in priority if key in allowed][:goal.days_per_week]
        if not chosen:
            raise ValueError("At least one available training day is required")
        profile.days_available = {**{key: key in chosen for key in keys}, "long_day": long_day}
    profile.goals = goals
    profile.weekly_hours_available = goal.weekly_hours
    profile.target_event_date = goal.target_date
    profile.target_event_type = preview.event_type
    profile.target_priority = "A"
