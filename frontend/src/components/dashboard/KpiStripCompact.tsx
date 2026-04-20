/**
 * KpiStripCompact — STUB (filled in task 9).
 *
 * Phase 5.1 task 8 wires this slot into DashboardShell so the fold 2 layout
 * is complete; task 9 replaces this stub with the live KPI row.
 */
export default function KpiStripCompact() {
  return (
    <div
      className="rounded-[12px] p-4 flex items-center justify-center"
      style={{
        backgroundColor: 'var(--color-paper-2)',
        border: '1px dashed var(--color-rule)',
        minHeight: 72,
      }}
    >
      <span className="eyebrow" style={{ color: 'var(--color-muted)' }}>
        KPI strip — coming up
      </span>
    </div>
  )
}
