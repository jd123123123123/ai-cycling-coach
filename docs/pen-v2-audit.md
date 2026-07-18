# pencil-new.pen V2 Audit — missing pages, look upgrade, free-data map

*July 18, 2026. The .pen file has grown beyond the 9-screen catalog (docs/pen-feature-catalog.md): a V2 design generation + 6 never-built screens, plus an embedded design-audit annotation ("Bevel — data-forward minimalism · Gentler Streak — empathy-first viz · OUR 2027 EDGE — ROADBIKE FIRST") and persona layering (amateurs: plain language + green band · racers: zones/PRs/benchmarks · pros: HUD/pacing/season periodization).*

## New V2 tokens (extend `frontend/src/index.css`)

Existing tokens match; NEW: `gold #FFD166` (+`gold-soft #FFD16626`), `violet #8B5CF6` (+soft), zone scale `zone-1 #59C3FF · zone-2 #16E08A · zone-3 #FFB020 · zone-4 #FF5A3C · zone-5 #FA1E55 · zone-6 #8B5CF6`.

## Missing screens (build order, data source per card)

| .pen node | Screen | Status in app | Data (all free) |
|---|---|---|---|
| `wQf0h` | **V2 · AI Coach** | `/coach` is a thin shell | existing chat plumbing (coach_tools, streaming), weekly briefing = period_report, plain-language week = brief narratives. Cards: weekly-briefing bar chart, chat with quick-reply chips, workout-modified card w/ accept-tweak (endpoint exists from P0.4b) |
| `QLszB` | **Screen · Power Profile** | not built | `/analytics/power-profile` LIVE (dense MMP, CP/W′/eFTP, W/kg, durability) + `power_phenotype` ("Puncheur" card) — all computed from own rides |
| `I3Nzs` | **Screen · Climb Companion** | not built | `climbing_analysis.py` (VAM, W/kg, categories) + `ride_segmentation` + GPS streams from own rides; climb catalog v1 = athlete's own ridden climbs (honest); optional free enrichment: OSM/Overpass elevation |
| `pTlXd` | **Screen · Season & Race Day** | not built | target_event + goal_trajectory + performance_projection + mesocycle phases; race-day pacing from CP/W′ |
| `YOpJB` | **V2 · Achievements** | AchievementBadges unmounted (P2.3) | activity+PMC history (already computed); backend persistence per P2.3 |
| `K3PVt` | **V2 · Explore Routes** | not built | needs route source — free: OSM Overpass + Open-Meteo weather + own ridden GPS tracks. Scope decision needed |
| `ci4oi` | **Screen · Live Ride** | **NOT BUILT — decided by Jannis (July 18): "no live functions, it should be a coach but not live during the ride."** The coach owns the before (plan/brief) and after (debrief/story); head units own the ride. | — |
| `ux9vt` | V2 · Home Today | V1 built (today's session heavily upgraded it) | refresh = arc gauge + climber-level progression card (gold) — level mechanic feeds off W/kg bands (BandChip semantics) |
| `Q5zjIH` | V2 · Ride Recap | V1 ride analysis exists | re-skin + absorb P1.2 breakthroughs + matches (P1.9) |
| `doYpx` | V2 · Form & Fitness | `/load-form` exists | re-skin; The Road (P1.1) already covers the forward corridor |

## Free-data coverage notes (task #7)

- Garmin unofficial client already ingests: HRV, RHR, sleep score, body battery, steps, stress, activities+streams. NOT yet ingested but available free on the same client: sleep stages detail, SpO₂, respiration (endpoints exist in Garmin Connect; parser gaps — worth an ingestion pass).
- Weather: Open-Meteo (already integrated, free).
- Segments/climbs: compute from OWN GPS streams (free, no Strava dependency).
- Routes: OSM Overpass API (free, rate-limited) if Explore Routes is scoped.
- Everything on Power Profile / Climb Companion / Season pages: derivable from already-stored data. No paid API required anywhere.

## Sequencing

1. AI Coach page (clearest missing page; plumbing exists)
2. Power Profile (endpoint live)
3. Climb Companion (bike-native flagship)
4. Season & Race Day
5. Achievements (+P2.3 persistence)
6. V2 look refresh (tokens + Today/Recap/Form re-skins)
7. Explore Routes (after scope decision) · Live Ride (after user decision)
