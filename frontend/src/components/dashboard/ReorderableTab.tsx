import { useEffect, useState } from 'react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Eye, EyeOff, Settings2 } from 'lucide-react'
import { useT } from '../../contexts/LocaleContext'
import { useTabOrder } from '../../hooks/useTabOrder'
import type { CardDef, CardPref, ResolvedCard } from './cardRegistry'

function toPrefs(cards: ResolvedCard[]): CardPref[] {
  return cards.map((c) => ({ id: c.id, hidden: c.hidden }))
}

export default function ReorderableTab({ tabId, cards }: { tabId: string; cards: CardDef[] }) {
  const t = useT()
  const { resolved, persist } = useTabOrder(tabId, cards)
  const [editing, setEditing] = useState(false)
  // Local working copy while editing; re-seed whenever the resolved list changes.
  const [working, setWorking] = useState<ResolvedCard[]>(resolved)
  useEffect(() => setWorking(resolved), [resolved])

  const list = editing ? working : resolved

  if (!editing) {
    return (
      <div className="flex flex-col gap-4 sm:gap-5 min-w-0">
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1.5 text-[12px] font-medium"
            style={{ color: 'var(--color-muted)' }}
          >
            <Settings2 size={13} strokeWidth={2} />
            <span className="underline underline-offset-2 decoration-[var(--color-rule)]">
              {t('customize')}
            </span>
          </button>
        </div>
        {list
          .filter((c) => !c.hidden)
          .map((c) => (
            <div key={c.id}>{c.render()}</div>
          ))}
      </div>
    )
  }

  return (
    <ReorderEditor
      cards={working}
      onChange={(next) => {
        setWorking(next)
        persist(toPrefs(next))
      }}
      onReset={() => {
        const def = cards.map((c) => ({ ...c, hidden: false }))
        setWorking(def)
        persist(toPrefs(def))
      }}
      onDone={() => setEditing(false)}
    />
  )
}

function ReorderEditor({
  cards,
  onChange,
  onReset,
  onDone,
}: {
  cards: ResolvedCard[]
  onChange: (next: ResolvedCard[]) => void
  onReset: () => void
  onDone: () => void
}) {
  const t = useT()
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const from = cards.findIndex((c) => c.id === active.id)
    const to = cards.findIndex((c) => c.id === over.id)
    if (from < 0 || to < 0) return
    onChange(arrayMove(cards, from, to))
  }

  const toggleHidden = (id: string) =>
    onChange(cards.map((c) => (c.id === id ? { ...c, hidden: !c.hidden } : c)))

  return (
    <div className="flex flex-col gap-3 min-w-0">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span className="eyebrow" style={{ color: 'var(--color-muted)', fontSize: 10 }}>
          {t('customize_hint')}
        </span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onReset}
            className="text-[12px] font-medium"
            style={{ color: 'var(--color-muted)' }}
          >
            {t('customize_reset')}
          </button>
          <button
            type="button"
            onClick={onDone}
            className="inline-flex items-center rounded-full px-4 py-2 text-[13px] font-medium min-h-[40px]"
            style={{ backgroundColor: 'var(--color-ink)', color: 'var(--color-paper)' }}
          >
            {t('customize_done')}
          </button>
        </div>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-2">
            {cards.map((c) => (
              <EditorRow key={c.id} card={c} onToggleHidden={() => toggleHidden(c.id)} />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  )
}

function EditorRow({ card, onToggleHidden }: { card: ResolvedCard; onToggleHidden: () => void }) {
  const t = useT()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
  })
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
        backgroundColor: 'var(--color-paper-2)',
        border: '1px solid var(--color-rule)',
      }}
      className="flex items-center gap-3 rounded-[12px] px-3 py-2.5"
    >
      <button
        type="button"
        className="cursor-grab touch-none"
        style={{ color: 'var(--color-muted)' }}
        aria-label="Drag to reorder"
        {...attributes}
        {...listeners}
      >
        <GripVertical size={16} strokeWidth={2} />
      </button>
      <span
        className="flex-1 text-[14px]"
        style={{ color: card.hidden ? 'var(--color-muted)' : 'var(--color-ink)' }}
      >
        {card.label}
        {card.hidden && (
          <span className="ml-2 num-mono" style={{ fontSize: 10, color: 'var(--color-muted)' }}>
            · {t('card_hidden')}
          </span>
        )}
      </span>
      <button
        type="button"
        onClick={onToggleHidden}
        aria-label={card.hidden ? 'Show card' : 'Hide card'}
        style={{ color: card.hidden ? 'var(--color-muted)' : 'var(--color-ink-2)' }}
      >
        {card.hidden ? <EyeOff size={15} strokeWidth={2} /> : <Eye size={15} strokeWidth={2} />}
      </button>
    </div>
  )
}
