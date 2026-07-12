import { useState } from 'react'
import { Search, UserPlus, Check, Users } from 'lucide-react'
import { useDiscoverMembers, useInviteMemberByUser } from '../../hooks/useCrew'
import type { Locale } from '../../i18n/strings'

// MemberFinder — discover other athletes on the app and add them to your crew.
// Handles only (no emails). Invite is enabled once you have a crew; without one
// it points you to create a crew first. Members already in a crew are shown but
// not invitable.
export default function MemberFinder({ crewId, locale }: { crewId: number | null; locale: Locale }) {
  const de = locale === 'de'
  const [q, setQ] = useState('')
  const { data: members, isLoading } = useDiscoverMembers(q)
  const invite = useInviteMemberByUser()
  const [invited, setInvited] = useState<Set<number>>(new Set())

  const onInvite = (userId: number) => {
    if (!crewId) return
    invite.mutate({ crewId, userId }, { onSuccess: () => setInvited((s) => new Set(s).add(userId)) })
  }

  const list = members ?? []

  return (
    <div className="paper-grain rounded-[20px] px-5 py-5 sm:px-6" style={{ backgroundColor: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' }}>
      <div className="flex items-start gap-3 mb-3">
        <div className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: 'color-mix(in srgb, var(--color-forest-2) 12%, transparent)' }}>
          <Users size={18} strokeWidth={2} style={{ color: 'var(--color-forest-2)' }} />
        </div>
        <div>
          <p className="text-[15px] font-medium" style={{ color: 'var(--color-ink)' }}>
            {de ? 'Mitglieder finden' : 'Find members'}
          </p>
          <p className="text-[12px] leading-relaxed mt-0.5" style={{ color: 'var(--color-muted)' }}>
            {de
              ? 'Andere Fahrer auf der App suchen und in deine Crew holen. Nur Handles — keine E-Mails.'
              : 'Search other riders on the app and add them to your crew. Handles only — no emails.'}
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="flex items-center gap-2 px-3 py-2 rounded-[12px] mb-3" style={{ backgroundColor: 'var(--color-paper)', border: '1px solid var(--color-rule)' }}>
        <Search size={15} strokeWidth={2} style={{ color: 'var(--color-muted)' }} />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={de ? 'Nach Namen suchen…' : 'Search by name…'}
          className="flex-1 bg-transparent text-[14px]"
          style={{ color: 'var(--color-ink)', outline: 'none', border: 'none' }}
          aria-label={de ? 'Mitglieder suchen' : 'Search members'}
        />
      </div>

      {!crewId && (
        <p className="text-[11.5px] mb-2" style={{ color: 'var(--color-amber)' }}>
          {de ? 'Erstelle unten zuerst eine Crew, um Fahrer einzuladen.' : 'Create a crew below first to invite riders.'}
        </p>
      )}

      {/* Results */}
      <div className="flex flex-col gap-2">
        {isLoading ? (
          <p className="text-[13px] py-2" style={{ color: 'var(--color-muted)' }}>{de ? 'Suche…' : 'Searching…'}</p>
        ) : list.length === 0 ? (
          <p className="text-[13px] py-2" style={{ color: 'var(--color-muted)' }}>
            {de ? 'Keine weiteren Mitglieder gefunden.' : 'No other members found.'}
          </p>
        ) : (
          list.map((m) => {
            const isInvited = invited.has(m.user_id)
            return (
              <div key={m.user_id} className="flex items-center gap-3 px-3 py-2.5 rounded-[12px]" style={{ backgroundColor: 'var(--color-paper)', border: '1px solid var(--color-rule)' }}>
                <div className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' }}>
                  <span className="num-mono text-[11px] font-semibold" style={{ color: 'var(--color-muted)' }}>{m.handle.slice(0, 2).toUpperCase()}</span>
                </div>
                <span className="flex-1 min-w-0 truncate text-[14px]" style={{ color: 'var(--color-ink)' }}>{m.handle}</span>
                {m.in_crew ? (
                  <span className="num-mono text-[10px] px-2 py-1 rounded-full" style={{ color: 'var(--color-muted)', border: '1px solid var(--color-rule)' }}>
                    {de ? 'Im Team' : 'In a crew'}
                  </span>
                ) : isInvited ? (
                  <span className="inline-flex items-center gap-1 text-[12px] font-medium" style={{ color: 'var(--color-forest-2)' }}>
                    <Check size={13} strokeWidth={2.4} />{de ? 'Eingeladen' : 'Invited'}
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={!crewId || invite.isPending}
                    onClick={() => onInvite(m.user_id)}
                    className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium transition-opacity disabled:opacity-40"
                    style={{ backgroundColor: 'var(--color-forest-2)', color: 'var(--color-paper)' }}
                    title={!crewId ? (de ? 'Erst eine Crew erstellen' : 'Create a crew first') : undefined}
                  >
                    <UserPlus size={13} strokeWidth={2} />{de ? 'Einladen' : 'Invite'}
                  </button>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
