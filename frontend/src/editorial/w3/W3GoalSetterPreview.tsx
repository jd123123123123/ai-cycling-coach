import W3GoalSetter, { type GoalDraft } from './W3GoalSetter'

/**
 * Preview harness for the goal setter — unguarded so the flow can be walked and
 * screenshotted without a backend.
 *
 * The fixture carries the SHAPES the server really sends: an FTP in watts and
 * weekly hours as a float, because those are what `athlete_profile.ftp_watts`
 * and `weekly_hours_available` are. A harness that invents a nicer shape than
 * production is how four real bugs stayed invisible in this codebase — see
 * `w3wrapped`'s "8:15 h" against a server that only ever emits "1h 06m".
 */
export default function W3GoalSetterPreview() {
  return (
    <W3GoalSetter
      vm={{ currentFtp: 292, currentHours: 8.5, initialKind: null }}
      onCancel={() => { /* preview: nothing to go back to */ }}
      onSave={async (d: GoalDraft) => {
        // eslint-disable-next-line no-console
        console.log('[preview] would save', d)
        return true
      }}
    />
  )
}
