

# ── indoors flips which routes are rideable at all ──────────────────────────

def _library():
    road = {
        "name": "Müggelsee Nord", "times_ridden": 8, "distance_km": 48,
        "elevation_m": 320, "avg_time_s": 5_940, "avg_tss": 118,
        "last_ridden": None, "is_virtual": False,
    }
    trainer = {
        "name": "Watopia · Volcano Flat", "times_ridden": 8, "distance_km": 46,
        "elevation_m": 300, "avg_time_s": 5_940, "avg_tss": 118,
        "last_ridden": None, "is_virtual": True,
    }
    return [road, trainer]


def test_outdoors_the_road_wins():
    """Unchanged behaviour, and the reason the penalty existed: recommending
    Watopia as "today's road" when the plan says nothing about indoors is a
    confident answer to a question nobody asked."""
    from app.services.route_recommendation import recommend_routes

    ranked = recommend_routes(_library(), target_duration_minutes=99, target_tss=118)
    assert ranked is not None
    assert ranked[0].route["is_virtual"] is False


def test_indoors_the_trainer_route_wins():
    """THE INVERSION. Suggesting a mountain road for a 2x20 on the trainer is
    the same mistake in the other direction, and the more annoying one — the
    rider cannot act on it at all."""
    from app.services.route_recommendation import recommend_routes

    ranked = recommend_routes(_library(), target_duration_minutes=99,
                              target_tss=118, indoor=True)
    assert ranked is not None
    assert ranked[0].route["is_virtual"] is True


def test_neither_is_ever_hidden():
    """Demoted, never dropped: an athlete with exactly one suitable route must
    still be shown it, whichever kind it is."""
    from app.services.route_recommendation import recommend_routes

    for indoor in (True, False, None):
        ranked = recommend_routes(_library(), target_duration_minutes=99,
                                  target_tss=118, indoor=indoor)
        assert ranked is not None and len(ranked) == 2


def test_the_endpoint_can_be_asked_about_a_day_that_is_not_today():
    """The plan card asks once per day of the week, so the target has to be a
    parameter — and without one the endpoint must still answer about today,
    because that is what every existing caller wants."""
    import inspect

    from app.api.routes import get_recommended_routes

    src = inspect.getsource(get_recommended_routes)
    assert "duration_minutes" in src and "target_tss" in src and "indoor" in src
    assert "load_today_context" in src
