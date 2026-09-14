# Custom plans · target-group challenge

Design critique, 14 September 2026. Three hypothetical rider perspectives, not interviews, validated coaching advice or scored research. Based on the four-state concept and the requested document/text input and profile comparison.

## Main finding

“Event name + date → plan” omits the rider’s intended outcome, event demands and current evidence. “Upload → activate” omits whether RIDR understood the coach. Add a reviewable brief before any plan draft: **what you want, what the effort requires, what we know about you, and which constraints must hold**. Let people correct each part.

Offer two equally clear custom entry points: **Describe my goal** and **Import an existing plan** (PDF/Word). A natural-language goal may need a generated schedule; an imported schedule may need only faithful translation. Ask which kind of help is wanted before interpreting either as permission to redesign training.

## Three rider perspectives

| Hypothetical rider | Critical questions before a useful draft | Evidence worth surfacing | Main failure to prevent |
| --- | --- | --- | --- |
| First long-distance sportive finisher | Finish comfortably or target a time? Distance, climbing, expected duration and terrain? Longest recent ride and weekly riding? Which day supports a long ride, and what is its hard time limit? | Recent ride duration and consistency; rider-reported comfort late in longer rides; relevant power evidence if available. Show missing endurance evidence explicitly. | Treating low FTP as the whole problem, inventing a universal “endurance score”, or scheduling a five-hour ride when the rider only has two hours. |
| Competitive criterium racer | Race duration, course and likely repeated efforts? Finish with the group, attack, or contest a sprint? What usually limits performance? Other races and priority dates? | Dated short- and longer-duration power observations, repeated-effort evidence where available, race context and rider feedback. A maximal sprint and repeatability are different questions. | Calling a rider “non-explosive” because recent rides contained no sprint, or selecting a threshold block solely from the event date. |
| Time-poor rider importing a coach PDF | Preserve the coach’s exact plan or adapt it? What date does week one begin? Which sessions are fixed? Which units/zones and reference values did the coach use? How should missed sessions be handled? | The imported session text and its original location; explicit dates, duration, intervals, rests, zone definitions and unresolved fields. Existing training history is optional for faithful import. | Quietly changing coach intent, interpreting a range as a target, duplicating repeated weeks, or converting power/heart-rate/RPE without a confirmed mapping. |

These riders can share the same interface, but should not receive the same inferred focus or intake burden. Ask the next question only when its answer could change the draft. Allow “I don’t know”; make the resulting assumption visible.

## Profile comparison and recommended focus

- A radar can summarize an already-supported profile; it cannot establish one. Keep axes and their definitions stable between baseline and current. Label measurement windows and sources, and compare only compatible evidence.
- Separate **observed ability**, **rider’s desired outcome**, and **proposed focus**. A larger future polygon looks like a promised result; show focus as a highlighted axis or adjacent recommendation rather than fabricated future fitness.
- Missing data is “not assessed”, never zero. An incomplete profile should become a partial profile or evidence list, without closing a misleading polygon. No power meter should not prevent a useful plan brief.
- A power observation is not automatically an FTP estimate, endurance capacity or repeated-effort capability. Each axis needs a documented calculation and sufficient evidence before it becomes a number. Do not combine arbitrary 0–100 scales and present them as objective comparability.
- “Before” should mean a saved baseline with its date, not a silently shifting comparison. “Current” should state its evidence window. When data or protocol differs, say comparison unavailable and retain the recorded work.
- Place a plain-language recommendation beside the profile: **“Suggested focus: [focus]. Because: [goal demand + evidence]. Uncertain: [missing evidence].”** Include “Change focus” and “Review evidence”. The rider can correct the interpretation without editing sensor history.
- Avoid diagnosing weaknesses from absence of relevant efforts. For the sportive rider, a longer-ride history may matter more to the brief than a complete power radar; for the racer, repeatability may remain unknown despite a high peak value.

## Import and AI interpretation safeguards

1. **Show interpretation before generation.** Present goal/outcome, demands, availability and assumptions for text input. For imports, first show the extracted schedule and unresolved items, including a source-page or source-section reference.
2. **Resolve consequential ambiguity.** Check week start, date locale, minutes versus seconds, repetitions versus sets, recovery between repetitions/sets, intensity units, duration ranges and missing zones. Never silently fill a missing intensity with a confident workout.
3. **Make correction local.** Edit a single parsed value or session; distinguish “this occurrence” from “all matching sessions”. Preserve the original document and allow reset to the imported interpretation.
4. **Handle realistic documents.** Scanned pages, multi-column tables, headers, footnotes, merged cells and embedded images may prevent complete extraction. Show what was read and what remains unresolved. File acceptance is not successful import.
5. **Keep authorship visible.** Label imported coach content, rider edits and RIDR suggestions. Proposed rescheduling or substitution needs a before/after view and an explicit apply action. Preserve rejected suggestions and fixed sessions correctly in later drafts.
6. **Review the actual calendar.** Expose longest session, busiest week, conflicts and unscheduled items. A valid weekly total can still hide an impossible weekday. Block activation when dates, units or essential prescription fields remain materially ambiguous; an incomplete optional profile should not block a faithful import.
7. **Prevent accidental duplication.** Re-import should offer review of differences or creation of a separate draft. It must not append another copy of every session automatically.

## Changes to the four states

- **No plan:** custom goal supports both description and PDF/Word input. After input, review the interpreted brief or imported schedule; confirm the intended level of adaptation.
- **Draft:** show the evidence/profile and recommendation as expandable context, with the editable schedule as the concrete result. Keep unresolved issues and availability conflicts visible before activation.
- **Active:** show accepted focus and its evidence date. Any change in focus or imported prescription is a reviewable suggestion with reasons. Do not let fresh sensor data silently overwrite a coach-authored block.
- **Ended:** separate completed work, comparable observed changes and the rider’s reported event outcome. An improved radar does not prove the plan caused the change; a finished plan does not prove the event goal was met.

## Prototype checks to run next

- Sportive rider: enter an event name/date with no route or history. The interface asks about demands and outcome, supports unknowns, and does not invent a profile.
- Racer: supply strong recent steady efforts but no sprint data. The profile leaves sprint evidence unassessed and does not prescribe an explosive block as a detected weakness.
- Imported plan: include “5 × 3 min, 2 min easy”, a heart-rate zone footnote, a fixed Saturday session and an undated week. Verify extraction, source traceability, correction and conflict resolution before activation.
- Re-import an edited document and reject one adaptation. Verify no duplicate calendar sessions and no silent reapplication of the rejected change.
- Compare a power-meter baseline with current rides lacking power. The UI retains completed training and clearly declines an unsupported before/current comparison.

This memo proposes interaction requirements. It does not establish training algorithms, physiological scoring or efficacy claims.
