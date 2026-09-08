/**
 * W3 · THE COACH'S VOICE — the register the brief is written in.
 *
 * MIRROR, NOT A SECOND CATALOGUE. The voices are defined server-side in
 * `services/coach_prompt.COACH_VOICES`, because that is where they change the
 * only thing that matters — the system prompt. This file exists so the picker
 * can render four labels without a request, and
 * `backend/tests/test_coach_voices.py` re-parses it and fails the build if the
 * two lists ever drift, which is the same guard `w3catalog` uses for the shop.
 *
 * A voice changes HOW a finding is said, never WHAT is said: no voice may add
 * a number, soften a safety call, or invent enthusiasm the data does not
 * support. That rule is enforced in the prompt, not here.
 */

export interface W3CoachVoice {
  id: string
  label: string
  note: string
}

export const COACH_VOICES: W3CoachVoice[] = [
  { id: 'sachlich', label: 'Sachlich', note: 'Sagt, was die Zahl ist. Kein Wort zu viel.' },
  { id: 'kumpel', label: 'Kumpel', note: 'Wie ein Trainingspartner, der dich kennt.' },
  { id: 'kapitaen', label: 'Kapitän', note: 'Klare Ansage. Kurze Sätze.' },
  { id: 'nerd', label: 'Datennerd', note: 'Nennt die Größen beim Namen.' },
]

export const DEFAULT_COACH_VOICE = 'sachlich'

export function coachVoiceById(id: string | null | undefined): W3CoachVoice {
  return COACH_VOICES.find((v) => v.id === id) ?? COACH_VOICES[0]
}
