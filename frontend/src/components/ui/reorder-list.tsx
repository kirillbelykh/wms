import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from 'react'
import { Reorder, useDragControls } from 'framer-motion'
import { cn } from '@/lib/utils'

type ReorderListProps<T> = {
  items: T[]
  getId: (item: T) => string
  getLabel: (item: T) => string
  onReorder: (items: T[]) => void
  label?: string
  children?: (item: T) => ReactNode
  className?: string
  itemClassName?: string
}

function GripDots({ className }: { className?: string }) {
  return (
    <span className={cn('grid grid-cols-2 gap-[3px]', className)} aria-hidden>
      {Array.from({ length: 6 }).map((_, index) => (
        <span key={index} className="h-[2.5px] w-[2.5px] rounded-full bg-current" />
      ))}
    </span>
  )
}

function moveIndex<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list
  const next = [...list]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

type ReorderListItemProps<T> = {
  item: T
  id: string
  label: string
  grabbedId: string | null
  onGrab: (id: string | null) => void
  onMove: (id: string, direction: -1 | 1) => void
  announce: (message: string) => void
  children?: (item: T) => ReactNode
  itemClassName?: string
}

function ReorderListItem<T>({
  item,
  id,
  label,
  grabbedId,
  onGrab,
  onMove,
  announce,
  children,
  itemClassName,
}: ReorderListItemProps<T>) {
  const controls = useDragControls()
  const isGrabbed = grabbedId === id

  const onHandlePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    controls.start(event)
  }

  const onHandleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault()
      if (isGrabbed) {
        onGrab(null)
        announce(`${label} отпущен`)
      } else {
        onGrab(id)
        announce(`${label} захвачен. Стрелки — переместить, Space — отпустить, Escape — отмена.`)
      }
      return
    }

    if (!isGrabbed) return

    if (event.key === 'Escape') {
      event.preventDefault()
      onGrab(null)
      announce('Перестановка отменена')
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      onMove(id, -1)
      return
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      onMove(id, 1)
    }
  }

  return (
    <Reorder.Item
      value={id}
      id={id}
      as="li"
      dragListener={false}
      dragControls={controls}
      whileDrag={{
        scale: 1.02,
        boxShadow: '0 12px 28px rgba(15, 23, 42, 0.14)',
        zIndex: 20,
        cursor: 'grabbing',
      }}
      className={cn(
        'flex list-none items-center gap-2.5 rounded-xl border border-border bg-card px-3 py-2.5 shadow-sm',
        'cursor-grab active:cursor-grabbing',
        isGrabbed && 'ring-2 ring-primary/30',
        itemClassName,
      )}
    >
      <button
        type="button"
        tabIndex={0}
        aria-label={`Изменить порядок: ${label}`}
        aria-pressed={isGrabbed}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        onPointerDown={onHandlePointerDown}
        onKeyDown={onHandleKeyDown}
      >
        <GripDots />
      </button>

      <div className="min-w-0 flex-1">
        {children ? (
          children(item)
        ) : (
          <p className="truncate text-[13px] font-medium text-foreground">{label}</p>
        )}
      </div>
    </Reorder.Item>
  )
}

export function ReorderList<T>({
  items,
  getId,
  getLabel,
  onReorder,
  label = 'Reorderable list',
  children,
  className,
  itemClassName,
}: ReorderListProps<T>) {
  const listId = useId()
  const [grabbedId, setGrabbedId] = useState<string | null>(null)
  const [liveMessage, setLiveMessage] = useState('')
  const announceTimer = useRef<number | null>(null)

  const ids = useMemo(() => items.map(getId), [items, getId])
  const itemsById = useMemo(() => {
    const map = new Map<string, T>()
    for (const item of items) map.set(getId(item), item)
    return map
  }, [items, getId])

  const announce = useCallback((message: string) => {
    setLiveMessage(message)
    if (announceTimer.current !== null) window.clearTimeout(announceTimer.current)
    announceTimer.current = window.setTimeout(() => setLiveMessage(''), 1200)
  }, [])

  useEffect(() => {
    return () => {
      if (announceTimer.current !== null) window.clearTimeout(announceTimer.current)
    }
  }, [])

  const handleReorder = (nextIds: string[]) => {
    const nextItems = nextIds
      .map((id) => itemsById.get(id))
      .filter((item): item is T => item !== undefined)
    if (nextItems.length !== items.length) return
    onReorder(nextItems)
  }

  const handleMove = (id: string, direction: -1 | 1) => {
    const from = ids.indexOf(id)
    if (from < 0) return
    const to = from + direction
    if (to < 0 || to >= ids.length) return
    const nextIds = moveIndex(ids, from, to)
    handleReorder(nextIds)
    const item = itemsById.get(id)
    if (item) announce(`${getLabel(item)}: позиция ${to + 1} из ${ids.length}`)
  }

  return (
    <div className="space-y-2">
      <Reorder.Group
        axis="y"
        values={ids}
        onReorder={handleReorder}
        as="ul"
        aria-label={label}
        id={listId}
        className={cn('m-0 flex list-none flex-col gap-2 p-0', className)}
      >
        {ids.map((id) => {
          const item = itemsById.get(id)
          if (!item) return null
          return (
            <ReorderListItem
              key={id}
              item={item}
              id={id}
              label={getLabel(item)}
              grabbedId={grabbedId}
              onGrab={setGrabbedId}
              onMove={handleMove}
              announce={announce}
              itemClassName={itemClassName}
            >
              {children}
            </ReorderListItem>
          )
        })}
      </Reorder.Group>
      <div className="sr-only" aria-live="assertive" aria-atomic="true">
        {liveMessage}
      </div>
    </div>
  )
}
