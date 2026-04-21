/**
 * Re-export shim — CoachChat's actual implementation lives alongside the
 * other dashboard drawers at components/dashboard/CoachChat.tsx. The Phase
 * 6 Wave 3 plan frontmatter names this path; keeping a thin shim here lets
 * both import patterns work without rippling through DashboardShell.
 */
export { default } from '../dashboard/CoachChat'
