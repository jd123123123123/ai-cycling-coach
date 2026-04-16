# AI Cycling Coach

## What This Is

An AI-powered multi-sport training platform that aggregates data from Garmin Connect and Yazio, providing personalized daily coaching through a beautiful dashboard and conversational AI interface. It builds and dynamically adapts periodized training plans (cycling, running, gym) targeting FTP improvement, generates structured .FIT workout files for Garmin devices, and includes research-driven social/gamification features to keep athletes engaged and competing with each other.

## Core Value

All your body data — sleep, HRV, nutrition, training load — combined with sports science into one intelligent coach that tells you exactly what to do today and adapts when life happens.

## Requirements

### Validated

(None yet — ship to validate)

### Active

**Dashboard & Body Status**
- [ ] Daily body status dashboard showing sleep score, HRV, body battery, readiness, and recovery state from Garmin
- [ ] Daily training recommendation with multiple options (rest, easy, moderate, push) based on current body state
- [ ] Beautiful, personalized UI — clean and glanceable morning view

**Periodized Training Engine**
- [ ] Full mesocycle periodization (base, build, peak, recovery) with multi-week planning
- [ ] Daily adaptation within the plan based on sleep, recovery, nutrition, and training load
- [ ] Multi-sport support: cycling, running, and gym/strength sessions that complement each other
- [ ] FTP-focused progression tracking with research-backed protocols
- [ ] Training load management across all three sports (CTL/ATL/TSB or equivalent model)

**AI Coaching Chat**
- [ ] Conversational coaching interface powered by Claude API
- [ ] Deep analysis on demand ("why am I tired?", "analyze my last 4 weeks")
- [ ] Workout modification via chat ("I only have 45min", "make it harder")
- [ ] Strategy discussion and plan adjustments through conversation
- [ ] AI uses social context as motivational lever ("your rival trained 3x this week")

**Data Integration**
- [ ] Garmin Connect API: sleep score, HRV, body battery, training load, FTP, VO2max, activities
- [ ] Yazio nutrition data: calorie intake, macros, meal timing
- [ ] Automatic data sync — pull latest data without manual intervention

**Nutrition Coaching**
- [ ] Pre-training fueling recommendations based on today's planned workout (e.g., "high carb day, aim for 3g/kg before intervals")
- [ ] Recovery adjustments based on actual intake tracked in Yazio ("you're under-fueled, reduce intensity")
- [ ] Nutrition awareness factored into readiness/recovery assessment

**Workout Export**
- [ ] .FIT file generation for structured cycling/running workouts with power/pace targets
- [ ] Auto-push workouts to Garmin Connect via API (shows up on device)
- [ ] Manual .FIT download as fallback
- [ ] Workout structure based on current FTP/threshold with appropriate intervals

**Knowledge Base**
- [ ] Encoded training principles (Seiler polarized model, Coggan power zones, periodization science)
- [ ] Updateable knowledge base — add new research papers/studies over time
- [ ] AI references and cites research when explaining recommendations

**Social & Gamification**
- [ ] Research-driven behavioral design — go beyond standard leaderboards using psychology, behavioral science, and gamification expertise
- [ ] Add friends/connections and see their training activity
- [ ] Create and join group ride/run events with location and time
- [ ] AI-powered motivational nudges using social context
- [ ] Innovative engagement mechanics (to be defined through research — not just copying Strava)

**Platform**
- [ ] Multi-user from day one with accounts and separate data
- [ ] User authentication and profile management
- [ ] Python/FastAPI backend
- [ ] React dashboard + chat frontend

### Out of Scope

- Swimming / triathlon-specific training — focus is cycling-primary with running and gym support
- Apple Health integration — Garmin is the primary data source (can add later)
- .ZWO / .MRC / .ERG file formats — .FIT only for v1 (Zwift/TrainerRoad support deferred)
- Mobile native app — web app first, responsive design for mobile access
- Paid subscription/billing — no monetization in v1
- Coach marketplace / hiring real coaches — this IS the coach

## Context

- The frustration driving this: data from Garmin, Apple Health, Yazio, etc. exists in silos. No product combines body metrics + nutrition + training science + social motivation into one AI coach
- Primary goal is FTP improvement for cycling, but the platform should holistically manage training across cycling, running, and strength
- Garmin Connect API provides the richest data source (sleep, HRV, body battery, training status, FTP history)
- Yazio is the nutrition tracker of choice — need to investigate API availability vs. CSV export vs. scraping
- .FIT is the native Garmin format and also widely supported by other platforms
- Training science is well-established (Seiler, Coggan, Friel) but the AI should be updateable as new research emerges
- Social/gamification is explicitly meant to innovate beyond Strava — research phase should investigate behavioral psychology and novel engagement mechanics
- The user wants this to feel like having a world-class coach who knows everything about your body and training history

## Constraints

- **Stack**: Python + FastAPI backend, React frontend — chosen by user
- **AI**: Claude API for coaching intelligence — must use prompt caching for cost efficiency
- **Data Source**: Garmin Connect API is primary — must work within their API limits and OAuth flow
- **Nutrition**: Yazio integration path TBD — API may not be public, may need alternative approach
- **Export**: .FIT file format only for v1 — must be compatible with Garmin Edge cycling computers
- **Multi-user**: Architecture must support multiple users from the start, not retrofitted

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Python + FastAPI over Next.js | User preference + strong ecosystem for data science, fitness APIs, and AI integration | -- Pending |
| Claude API for coaching AI | Best reasoning capability for nuanced training recommendations and conversation | -- Pending |
| Garmin + Yazio as initial data sources | User's actual devices and apps — solve their real problem first | -- Pending |
| .FIT only for v1 | Native Garmin format, covers the primary use case (Garmin Edge outdoor rides) | -- Pending |
| Multi-user from start | Avoids costly retrofit, enables social features, future-proofs architecture | -- Pending |
| Full periodization over reactive daily plans | User wants sophisticated multi-week mesocycle management, not just daily suggestions | -- Pending |
| Research-driven gamification | User explicitly wants to go beyond Strava's model — needs behavioral psychology research | -- Pending |
| Updateable knowledge base | Training science evolves — system should incorporate new research without code changes | -- Pending |

---
*Last updated: 2026-04-16 after initialization*
