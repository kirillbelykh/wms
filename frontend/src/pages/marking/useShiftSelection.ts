import { useRef } from 'react'
import type { Dispatch, SetStateAction } from 'react'

type SelectableId = string | number

interface UseShiftSelectionParams<T extends SelectableId> {
  setSelected: Dispatch<SetStateAction<Set<T>>>
}

export function useShiftSelection<T extends SelectableId>({
  setSelected,
}: UseShiftSelectionParams<T>) {
  const lastIndexRef = useRef<number | null>(null)

  const toggleOne = (ids: T[], id: T, index: number, shiftKey = false) => {
    const safeIndex = ids.length ? Math.max(0, Math.min(index, ids.length - 1)) : -1

    setSelected((current) => {
      const next = new Set(current)

      if (shiftKey && lastIndexRef.current !== null && safeIndex >= 0) {
        const start = Math.min(lastIndexRef.current, safeIndex)
        const end = Math.max(lastIndexRef.current, safeIndex)
        const shouldSelect = !current.has(id)

        for (let cursor = start; cursor <= end; cursor += 1) {
          const rangeId = ids[cursor]
          if (rangeId === undefined) continue

          if (shouldSelect) {
            next.add(rangeId)
          } else {
            next.delete(rangeId)
          }
        }
      } else if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }

      return next
    })

    lastIndexRef.current = safeIndex >= 0 ? safeIndex : null
  }

  const toggleAll = (ids: T[]) => {
    setSelected((current) => {
      const allSelected = ids.length > 0 && ids.every((id) => current.has(id))
      const next = new Set(current)

      ids.forEach((id) => {
        if (allSelected) {
          next.delete(id)
        } else {
          next.add(id)
        }
      })

      return next
    })
  }

  const clearSelection = () => {
    setSelected(new Set())
    lastIndexRef.current = null
  }

  const setSelection = (ids: T[]) => {
    setSelected(new Set(ids))
    lastIndexRef.current = ids.length ? 0 : null
  }

  return {
    clearSelection,
    setSelection,
    toggleAll,
    toggleOne,
  }
}
