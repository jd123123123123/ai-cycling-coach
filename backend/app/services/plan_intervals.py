"""Read the two persisted workout-block formats without changing a prescription.

Mesocycle drafts use duration_seconds/power_target_pct_ftp. Coach adjustments,
custom workouts and their undo records use duration_s/target_pct_ftp from the
prescribed-workout serializer. Both contain real targets; a missing alias is
not evidence that the rider has no prescription.
"""


def week_interval(block: dict) -> dict:
    """Return a copy with week-API names, preserving explicit nulls and zeros.

    Never derive power from TSS/IF or replace a stored block with a template.
    Keep other fields (sets, cadence, HR, watts, open effort) exactly as stored.
    """
    result = dict(block)
    for canonical, prescribed in (
        ("duration_seconds", "duration_s"),
        ("power_target_pct_ftp", "target_pct_ftp"),
    ):
        if canonical not in result and prescribed in result:
            result[canonical] = result[prescribed]
    return result
