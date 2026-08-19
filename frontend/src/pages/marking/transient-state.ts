import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'

export type MarkingTransientScope = 'turnover' | 'aggregation'

export interface MarkingTransientRow {
  documentId?: string
  orderName?: string
  fullName?: string
  gtin?: string
  createdAt?: string
  updatedAt?: string
  codesCount?: number
  requestedCodesCount?: number | null
  status?: string
  statusSummary?: string
  tsdStatus?: string
  aggregateCode?: string
  comment?: string
  createdAtLabel?: string
  includesUnitsCount?: number
  codesCheckErrorsCount?: number
}

export interface MarkingTransientStatus {
  label: string
  spinning?: boolean
  matchValue?: string | null
  row?: MarkingTransientRow
  expiresAt?: number | null
}

export type MarkingTransientStatusMap = Record<string, MarkingTransientStatus>

function transientStatusKey(scope: MarkingTransientScope, agentUrl: string) {
  return ['marking-transient-statuses', scope, agentUrl] as const
}

function filterActiveStatuses(
  current: MarkingTransientStatusMap | undefined,
  now = Date.now(),
): MarkingTransientStatusMap {
  if (!current) return {}

  return Object.fromEntries(
    Object.entries(current).filter(([, status]) => {
      return typeof status.expiresAt !== 'number' || status.expiresAt > now
    }),
  )
}

export function useMarkingTransientStatuses(
  scope: MarkingTransientScope,
  agentUrl: string,
) {
  const queryClient = useQueryClient()
  const [now, setNow] = useState(() => Date.now())

  const query = useQuery<MarkingTransientStatusMap>({
    queryKey: transientStatusKey(scope, agentUrl),
    queryFn: async () => ({}),
    initialData: {},
    staleTime: Infinity,
    gcTime: Infinity,
    enabled: false,
  })

  useEffect(() => {
    const statuses = query.data || {}
    const nextExpiry = Object.values(statuses).reduce<number | null>((closest, status) => {
      if (typeof status.expiresAt !== 'number') return closest
      if (closest === null) return status.expiresAt
      return Math.min(closest, status.expiresAt)
    }, null)

    if (nextExpiry === null) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      queryClient.setQueryData<MarkingTransientStatusMap>(
        transientStatusKey(scope, agentUrl),
        (current) => filterActiveStatuses(current),
      )
      setNow(Date.now())
    }, Math.max(nextExpiry - Date.now(), 50))

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [agentUrl, query.data, queryClient, scope])

  return {
    ...query,
    data: useMemo(() => filterActiveStatuses(query.data, now), [now, query.data]),
  }
}

export function setMarkingTransientStatuses(
  queryClient: QueryClient,
  scope: MarkingTransientScope,
  agentUrl: string,
  documentIds: string[],
  status: MarkingTransientStatus,
) {
  if (documentIds.length === 0) return

  queryClient.setQueryData<MarkingTransientStatusMap>(
    transientStatusKey(scope, agentUrl),
    (current) => {
      const next = { ...(current || {}) }
      documentIds.forEach((documentId) => {
        next[documentId] = status
      })
      return next
    },
  )
}

export function clearMarkingTransientStatuses(
  queryClient: QueryClient,
  scope: MarkingTransientScope,
  agentUrl: string,
  documentIds?: string[],
) {
  queryClient.setQueryData<MarkingTransientStatusMap>(
    transientStatusKey(scope, agentUrl),
    (current) => {
      if (!current) return {}
      if (!documentIds || documentIds.length === 0) return {}

      const next = { ...current }
      documentIds.forEach((documentId) => {
        delete next[documentId]
      })
      return next
    },
  )
}
