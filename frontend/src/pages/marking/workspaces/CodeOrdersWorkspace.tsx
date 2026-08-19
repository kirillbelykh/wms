import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from '@/lib/toast'
import { Archive, Download, ListPlus, PackageOpen, PlusCircle, RefreshCw, RotateCcw, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Input, SelectNative } from '@/components/ui/input'
import { SearchInput } from '@/components/ui/search-input'
import { Progress } from '@/components/ui/progress'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn, formatDate } from '@/lib/utils'
import { MarkingIntroDialog } from '../components/MarkingIntroDialog'
import { MarkingLogPanel } from '../components/MarkingLogPanel'
import { MarkingOrderDetailDrawer } from '../components/MarkingOrderDetailDrawer'
import {
  addOrderItem,
  clearOrderQueue,
  deleteOrder,
  getDownloadState,
  getMarkingOptions,
  getOrdersState,
  manualDownloadOrder,
  printDownloadOrder,
  removeOrderQueueItem,
  restoreDeletedOrder,
  submitOrderQueue,
  syncDownloadStatuses,
  type DownloadItem,
  type MarkingOrderQueueItem,
  type MarkingOrderRecord,
  type OptionsResponse,
  type OrdersState,
} from '../api'
import {
  MarkingField,
  MarkingIconButton,
  MarkingMetric,
  MarkingPagination,
  MarkingPanel,
  MarkingStatusBadge,
  MarkingTableControls,
  MarkingTablePanel,
  MarkingToolbar,
  usePaginatedRows,
} from '../marking-ui'
import {
  clearMarkingTransientStatuses,
  setMarkingTransientStatuses,
  useMarkingTransientStatuses,
  type MarkingTransientStatusMap,
} from '../transient-state'
import { useShiftSelection } from '../useShiftSelection'

interface CodeOrdersWorkspaceProps {
  agentUrl: string
}

interface CodeOrderDraft {
  mode: 'params' | 'gtin'
  orderName: string
  productName: string
  gtin: string
  size: string
  color: string
  venchik: string
  unitsPerPack: string
  codesCount: number
}

interface CombinedOrderRow extends MarkingOrderRecord {
  download_status?: string
}

type NumericLike = number | string | null | undefined

function buildEmptyDraft(): CodeOrderDraft {
  return {
    mode: 'params',
    orderName: '',
    productName: '',
    gtin: '',
    size: '',
    color: '',
    venchik: '',
    unitsPerPack: '',
    codesCount: 1,
  }
}

function getCodesCount(row: Partial<CombinedOrderRow> | undefined) {
  if (!row) return 0
  const values: NumericLike[] = [
    row.requested_codes_count,
    row.codes_count,
    row.received_codes_count,
    (row as { requestedCodesCount?: NumericLike }).requestedCodesCount,
    (row as { codesCount?: NumericLike }).codesCount,
    (row as { receivedCodesCount?: NumericLike }).receivedCodesCount,
  ]

  return values.reduce<number>((max, value) => {
    const next = Number(value)
    return Number.isFinite(next) ? Math.max(max, next) : max
  }, 0)
}

function rowTime(row: Partial<CombinedOrderRow>) {
  const value = row.updated_at || row.created_at
  return value ? new Date(value).getTime() : 0
}

function mergeOrderRows(source: MarkingOrderRecord[], downloads: DownloadItem[]) {
  const downloadMap = new Map(downloads.map((item) => [item.document_id, item]))
  const merged = new Map<string, CombinedOrderRow>()

  for (const item of source) {
    const downloadItem = downloadMap.get(item.document_id)
    merged.set(item.document_id, {
      ...item,
      full_name: item.full_name || downloadItem?.full_name || '',
      gtin: item.gtin || downloadItem?.gtin || '',
      download_status: downloadItem?.status || '',
      status: item.status || downloadItem?.status || '',
    })
  }

  for (const downloadItem of downloads) {
    if (merged.has(downloadItem.document_id)) continue
    merged.set(downloadItem.document_id, {
      document_id: downloadItem.document_id,
      order_name: downloadItem.order_name,
      full_name: downloadItem.full_name,
      gtin: downloadItem.gtin,
      status: downloadItem.status,
      download_status: downloadItem.status,
      codes_count: downloadItem.codes_count ?? downloadItem.requested_codes_count ?? downloadItem.received_codes_count ?? 0,
      requested_codes_count: downloadItem.requested_codes_count ?? downloadItem.codes_count ?? 0,
      received_codes_count: downloadItem.received_codes_count ?? 0,
    })
  }

  return Array.from(merged.values()).sort((left, right) => rowTime(right) - rowTime(left))
}

function buildPendingSessionOrders(queue: MarkingOrderQueueItem[]): CombinedOrderRow[] {
  const grouped = new Map<
    string,
    { orderName: string; fullName: string; gtin: string; codesCount: number }
  >()

  queue.forEach((item, index) => {
    const key = item.order_name.trim() || `queue-${index}`
    const existing = grouped.get(key)

    if (existing) {
      existing.codesCount += Number(item.codes_count || 0)
      if (!existing.fullName) {
        existing.fullName = item.full_name || item.simpl_name || ''
      }
      if (!existing.gtin) {
        existing.gtin = item.gtin || ''
      }
      return
    }

    grouped.set(key, {
      orderName: item.order_name,
      fullName: item.full_name || item.simpl_name || '',
      gtin: item.gtin || '',
      codesCount: Number(item.codes_count || 0),
    })
  })

  const now = new Date().toISOString()

  return Array.from(grouped.values()).map((item, index) => ({
    document_id: `pending:${item.orderName}:${index}`,
    order_name: item.orderName,
    full_name: item.fullName,
    gtin: item.gtin,
    status: 'Заказ выполняется',
    requested_codes_count: item.codesCount,
    codes_count: item.codesCount,
    created_at: now,
    updated_at: now,
  }))
}

function normalizeOrderMatchValue(value?: string | null) {
  return String(value || '').trim().toLowerCase()
}

function isSyntheticOrderId(documentId: string) {
  return documentId.startsWith('pending:')
}

function buildOrderRowsWithTransientState(
  rows: CombinedOrderRow[],
  transientStatuses: MarkingTransientStatusMap,
) {
  const nextRows = [...rows]
  const transientByDocumentId: MarkingTransientStatusMap = {}
  const syntheticRows: CombinedOrderRow[] = []

  Object.entries(transientStatuses).forEach(([documentId, status]) => {
    const directRow = nextRows.find((row) => row.document_id === documentId)
    if (directRow) {
      transientByDocumentId[directRow.document_id] = status
      return
    }

    const matchValue = normalizeOrderMatchValue(status.matchValue)
    if (matchValue) {
      const matchedRow = nextRows.find(
        (row) => normalizeOrderMatchValue(row.order_name) === matchValue,
      )
      if (matchedRow) {
        transientByDocumentId[matchedRow.document_id] = status
        return
      }
    }

    if (!status.row?.orderName) {
      return
    }

    syntheticRows.push({
      document_id: documentId,
      order_name: status.row.orderName,
      full_name: status.row.fullName || '',
      gtin: status.row.gtin || '',
      status: status.row.status || status.label,
      created_at: status.row.createdAt,
      updated_at: status.row.updatedAt,
      codes_count: status.row.codesCount ?? 0,
      requested_codes_count: status.row.requestedCodesCount ?? status.row.codesCount ?? 0,
    })
  })

  return {
    rows: [...syntheticRows, ...nextRows].sort((left, right) => rowTime(right) - rowTime(left)),
    transientByDocumentId,
  }
}

function isDraftReady(draft: CodeOrderDraft) {
  if (!draft.orderName.trim()) return false
  if (draft.mode === 'gtin') return Boolean(draft.gtin.trim())
  return Boolean(draft.productName.trim())
}

function hasDraftContent(draft: CodeOrderDraft) {
  return Boolean(
    draft.orderName.trim() ||
      draft.productName.trim() ||
      draft.gtin.trim() ||
      draft.size.trim() ||
      draft.color.trim() ||
      draft.venchik.trim() ||
      draft.unitsPerPack.trim() ||
      draft.codesCount > 1,
  )
}

function getDraftValidationError(draft: CodeOrderDraft) {
  if (!draft.orderName.trim()) return 'Введите название документа'
  if (draft.mode === 'gtin' && !draft.gtin.trim()) return 'Введите GTIN'
  if (draft.mode === 'params' && !draft.productName.trim()) return 'Выберите номенклатуру'
  if (draft.codesCount < 1) return 'Количество кодов должно быть больше нуля'
  return ''
}

function updateOrdersQueue(
  queryClient: ReturnType<typeof useQueryClient>,
  agentUrl: string,
  queue: MarkingOrderQueueItem[],
) {
  queryClient.setQueryData<OrdersState | undefined>(
    ['marking-orders-state', agentUrl],
    (current) => (current ? { ...current, queue } : current),
  )
}

function upsertCreatedDownloadItems(
  queryClient: ReturnType<typeof useQueryClient>,
  agentUrl: string,
  createdRows: Array<MarkingOrderRecord & { download_item?: DownloadItem }>,
) {
  const downloadItems = createdRows
    .map((row) => row.download_item)
    .filter((item): item is DownloadItem => Boolean(item?.document_id))

  if (downloadItems.length === 0) return

  queryClient.setQueryData<{ items: DownloadItem[] } | undefined>(
    ['marking-download-state', agentUrl],
    (current) => {
      if (!current) return current
      const createdIds = new Set(downloadItems.map((item) => item.document_id))
      return {
        ...current,
        items: [
          ...downloadItems,
          ...current.items.filter((item) => !createdIds.has(item.document_id)),
        ],
      }
    },
  )
}

export function CodeOrdersWorkspace({ agentUrl }: CodeOrdersWorkspaceProps) {
  const queryClient = useQueryClient()
  const transientStatuses = useMarkingTransientStatuses('turnover', agentUrl).data

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [autoDownload, setAutoDownload] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [draft, setDraft] = useState<CodeOrderDraft>(() => buildEmptyDraft())
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null)
  const [introDialogState, setIntroDialogState] = useState<{
    open: boolean
    ids: string[]
    names: string[]
  }>({ open: false, ids: [], names: [] })
  const [downloadProgress, setDownloadProgress] = useState<{
    active: boolean
    processed: number
    total: number
    label: string
  }>({ active: false, processed: 0, total: 0, label: '' })

  const optionsQuery = useQuery<OptionsResponse>({
    queryKey: ['marking-options', agentUrl],
    queryFn: () => getMarkingOptions(agentUrl),
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })

  const ordersQuery = useQuery<OrdersState>({
    queryKey: ['marking-orders-state', agentUrl],
    queryFn: () => getOrdersState(agentUrl),
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })

  const downloadQuery = useQuery({
    queryKey: ['marking-download-state', agentUrl],
    queryFn: () => getDownloadState(agentUrl),
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })

  const queue = ordersQuery.data?.queue || []
  const sourceOrders = showArchived
    ? ordersQuery.data?.deleted_orders || []
    : [...(ordersQuery.data?.session_orders || []), ...(ordersQuery.data?.history || [])]
  const allRows = useMemo(
    () => mergeOrderRows(sourceOrders, downloadQuery.data?.items || []),
    [downloadQuery.data?.items, sourceOrders],
  )
  const rowsWithTransientState = useMemo(
    () => buildOrderRowsWithTransientState(allRows, transientStatuses),
    [allRows, transientStatuses],
  )
  const visibleRows = rowsWithTransientState.rows
  const transientByDocumentId = rowsWithTransientState.transientByDocumentId

  const statusOptions = useMemo(() => {
    const options = new Set<string>()
    visibleRows.forEach((row) => {
      if (row.status) options.add(row.status)
    })
    return Array.from(options).sort((left, right) => left.localeCompare(right, 'ru'))
  }, [visibleRows])

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase()
    return visibleRows.filter((row) => {
      if (statusFilter && row.status !== statusFilter) return false
      if (!query) return true
      const haystack = [
        row.order_name,
        row.full_name,
        row.gtin,
        row.document_id,
        row.status,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(query)
    })
  }, [search, statusFilter, visibleRows])

  const activeOrder = useMemo(
    () => allRows.find((row) => row.document_id === activeOrderId) || null,
    [activeOrderId, allRows],
  )

  const rows = usePaginatedRows(filteredRows, 30)
  const selectableVisibleIds = useMemo(
    () =>
      rows.visibleRows
        .filter((item) => !isSyntheticOrderId(item.document_id))
        .map((item) => item.document_id),
    [rows.visibleRows],
  )
  const { clearSelection, toggleAll, toggleOne } = useShiftSelection<string>({
    setSelected: setSelectedIds,
  })

  const refreshAll = async () => {
    await Promise.all([ordersQuery.refetch(), downloadQuery.refetch()])
  }

  useEffect(() => {
    let cancelled = false

    const syncStatusesSilently = async () => {
      try {
        const payload = await syncDownloadStatuses(agentUrl, autoDownload)
        if (cancelled) return

        if (payload.state) {
          queryClient.setQueryData(['marking-download-state', agentUrl], payload.state)
        }

        await ordersQuery.refetch()
      } catch {
        // Silent background sync keeps the list fresh without spamming toasts.
      }
    }

    void syncStatusesSilently()
    const intervalId = window.setInterval(() => {
      void syncStatusesSilently()
    }, 10000)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [agentUrl, autoDownload, ordersQuery.refetch, queryClient])

  const addToQueueMutation = useMutation({
    mutationFn: async (payload: CodeOrderDraft) =>
      addOrderItem(agentUrl, {
        order_name: payload.orderName,
        name: payload.productName,
        gtin: payload.mode === 'gtin' ? payload.gtin : '',
        size: payload.size,
        color: payload.color,
        venchik: payload.venchik,
        units_per_pack: payload.unitsPerPack,
        codes_count: payload.codesCount,
        mode: payload.mode,
      }),
    onSuccess: (payload) => {
      updateOrdersQueue(queryClient, agentUrl, payload.queue || [])
    },
  })

  const clearQueueMutation = useMutation({
    mutationFn: () => clearOrderQueue(agentUrl),
    onSuccess: (payload) => {
      updateOrdersQueue(queryClient, agentUrl, payload.queue || [])
      toast.success('Очередь очищена')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const removeQueueItemMutation = useMutation({
    mutationFn: (uid: string) => removeOrderQueueItem(agentUrl, uid),
    onSuccess: (payload) => {
      updateOrdersQueue(queryClient, agentUrl, payload.queue || [])
      toast.success('Позиция удалена из очереди')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const submitQueueMutation = useMutation({
    mutationFn: () => submitOrderQueue(agentUrl),
    onMutate: () => {
      const currentQueue =
        queryClient.getQueryData<OrdersState>(['marking-orders-state', agentUrl])?.queue ||
        queue
      const pendingRows = buildPendingSessionOrders(currentQueue)
      toast.info('Заказ кодов выполняется')

      pendingRows.forEach((row) => {
        setMarkingTransientStatuses(queryClient, 'turnover', agentUrl, [row.document_id], {
          label: 'Заказ выполняется',
          spinning: true,
          matchValue: row.order_name,
          expiresAt: Date.now() + 120_000,
          row: {
            documentId: row.document_id,
            orderName: row.order_name,
            fullName: row.full_name,
            gtin: row.gtin,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            codesCount: row.codes_count ?? 0,
            requestedCodesCount: row.requested_codes_count ?? row.codes_count ?? 0,
            status: row.status,
          },
        })
      })

      return { pendingIds: pendingRows.map((row) => row.document_id) }
    },
    onSuccess: async (payload, _variables, context) => {
      toast.success('Заказ кодов выполняется')
      setCreateDialogOpen(false)
      const results = payload.results || []
      if (payload.state) {
        queryClient.setQueryData(['marking-orders-state', agentUrl], payload.state)
      } else {
        updateOrdersQueue(queryClient, agentUrl, [])
      }
      upsertCreatedDownloadItems(queryClient, agentUrl, results)
      results.forEach((row) => {
        const now = new Date().toISOString()
        setMarkingTransientStatuses(queryClient, 'turnover', agentUrl, [row.document_id], {
          label: 'Заказ выполняется',
          spinning: true,
          matchValue: row.order_name,
          expiresAt: Date.now() + 120_000,
          row: {
            documentId: row.document_id,
            orderName: row.order_name,
            fullName: row.full_name || row.download_item?.full_name || '',
            gtin: row.gtin || row.download_item?.gtin || '',
            createdAt: row.created_at || now,
            updatedAt: row.updated_at || now,
            codesCount: row.codes_count ?? 0,
            requestedCodesCount: row.requested_codes_count ?? row.codes_count ?? 0,
            status: row.status || 'Заказ выполняется',
          },
        })
      })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['marking-intro-state', agentUrl] }),
        queryClient.invalidateQueries({ queryKey: ['tsd-state', agentUrl] }),
        queryClient.invalidateQueries({ queryKey: ['labels-state', agentUrl] }),
      ])
      if (payload.state || results.length > 0) {
        void refreshAll()
      } else {
        await new Promise((resolve) => window.setTimeout(resolve, 600))
        await refreshAll()
      }
      const pendingIds = context?.pendingIds || []
      if (pendingIds.length) {
        window.setTimeout(() => {
          clearMarkingTransientStatuses(queryClient, 'turnover', agentUrl, pendingIds)
        }, 2_000)
      }
    },
    onError: (error: Error, _variables, context) => {
      clearMarkingTransientStatuses(queryClient, 'turnover', agentUrl, context?.pendingIds)
      toast.error(error.message)
    },
  })

  const archiveMutation = useMutation({
    mutationFn: async (documentIds: string[]) => {
      const failures: string[] = []
      for (const documentId of documentIds) {
        try {
          await deleteOrder(agentUrl, documentId)
        } catch {
          failures.push(documentId)
        }
      }
      return failures
    },
    onSuccess: async (failures) => {
      if (failures.length > 0) {
        toast.warning(`Не удалось отправить в архив: ${failures.length}`)
      } else {
        toast.success('Заказы перенесены в архив')
      }
      clearSelection()
      setActiveOrderId(null)
      await refreshAll()
    },
  })

  const restoreMutation = useMutation({
    mutationFn: async (documentIds: string[]) => {
      const failures: string[] = []
      for (const documentId of documentIds) {
        try {
          await restoreDeletedOrder(agentUrl, documentId)
        } catch {
          failures.push(documentId)
        }
      }
      return failures
    },
    onSuccess: async (failures) => {
      if (failures.length > 0) {
        toast.warning(`Не удалось вернуть из архива: ${failures.length}`)
      } else {
        toast.success('Заказы восстановлены')
      }
      clearSelection()
      setActiveOrderId(null)
      await refreshAll()
    },
  })

  const downloadMutation = useMutation({
    mutationFn: async (documentIds: string[]) => {
      if (!documentIds.length) {
        throw new Error('Выберите хотя бы один заказ')
      }

      const failures: string[] = []
      setDownloadProgress({
        active: true,
        processed: 0,
        total: documentIds.length,
        label: `Получаем коды: 0/${documentIds.length}`,
      })

      for (let index = 0; index < documentIds.length; index += 1) {
        const documentId = documentIds[index]
        try {
          await manualDownloadOrder(agentUrl, documentId)
        } catch {
          failures.push(documentId)
        }

        setDownloadProgress((current) => ({
          ...current,
          processed: index + 1,
          label: `Получаем коды: ${index + 1}/${documentIds.length}`,
        }))
      }

      return failures
    },
    onMutate: (documentIds) => {
      setMarkingTransientStatuses(queryClient, 'turnover', agentUrl, documentIds, {
        label: 'Скачивается',
        spinning: true,
      })
      toast.info('Получение кодов запущено')
    },
    onSuccess: async (failures, documentIds) => {
      setDownloadProgress({
        active: false,
        processed: documentIds.length,
        total: documentIds.length,
        label:
          failures.length > 0
            ? `Получено ${documentIds.length - failures.length}/${documentIds.length}`
            : `Получено ${documentIds.length}/${documentIds.length}`,
      })
      if (failures.length > 0) {
        toast.warning(`Часть заказов не скачалась: ${failures.length}`)
      } else {
        toast.success('Коды успешно получены')
      }
      clearSelection()
      await refreshAll()
      clearMarkingTransientStatuses(queryClient, 'turnover', agentUrl, documentIds)
    },
    onError: (error: Error, documentIds) => {
      setDownloadProgress((current) => ({ ...current, active: false, label: error.message }))
      clearMarkingTransientStatuses(queryClient, 'turnover', agentUrl, documentIds)
      toast.error(error.message)
    },
  })

  const printMutation = useMutation({
    mutationFn: async ({
      documentId,
      printerName,
      recordNumber,
    }: {
      documentId: string
      printerName: string
      recordNumber?: string | null
    }) => printDownloadOrder(agentUrl, documentId, printerName, recordNumber),
    onMutate: () => {
      toast.info('Печать 30x20 запущена')
    },
    onSuccess: () => {
      toast.success('Печать 30x20 отправлена')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const resetDraft = (preserveOrderName = false) => {
    const orderName = preserveOrderName ? draft.orderName : ''
    setDraft({
      ...buildEmptyDraft(),
      orderName,
    })
  }

  const handleAddToQueue = async (keepDocumentName = true) => {
    const validationError = getDraftValidationError(draft)
    if (validationError) {
      toast.error(validationError)
      return false
    }

    try {
      await addToQueueMutation.mutateAsync(draft)
      toast.success('Заказ добавлен в очередь')
      resetDraft(keepDocumentName)
      return true
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось добавить позицию')
      return false
    }
  }

  const handleSubmitQueue = async () => {
    const queueCount = queue.length
    const draftFilled = hasDraftContent(draft)

    if (queueCount === 0 && !draftFilled) {
      toast.error('Добавьте хотя бы одну позицию')
      return
    }

    if (draftFilled) {
      const success = await handleAddToQueue(true)
      if (!success) return
    }

    submitQueueMutation.mutate()
  }

  const openIntroDialog = (documentIds: string[]) => {
    if (!documentIds.length) {
      toast.error('Выберите хотя бы один документ')
      return
    }
    const names = visibleRows
      .filter((row) => documentIds.includes(row.document_id))
      .map((row) => row.order_name)
    setIntroDialogState({ open: true, ids: documentIds, names })
  }

  const loading = ordersQuery.isLoading || downloadQuery.isLoading

  return (
    <>
      <div className="space-y-4">
        <MarkingTablePanel
          title={showArchived ? 'Архив заказов кодов' : 'Заказ и получение'}
          maxHeight="max-h-[720px]"
          actions={
            <MarkingTableControls
              filters={
                <>
                  <SelectNative
                    value={statusFilter}
                    onChange={(event) => setStatusFilter(event.target.value)}
                    className="w-44"
                  >
                    <option value="">Все статусы</option>
                    {statusOptions.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </SelectNative>
                  <SearchInput
                    className="w-full sm:w-72"
                    placeholder="Поиск по документу, номенклатуре, GTIN"
                    value={search}
                    onChange={setSearch}
                  />
                  <MarkingIconButton
                    label="Обновить"
                    onClick={() => void refreshAll()}
                    disabled={ordersQuery.isFetching || downloadQuery.isFetching}
                  >
                    <RefreshCw
                      className={cn(
                        'h-4 w-4',
                        (ordersQuery.isFetching || downloadQuery.isFetching) && 'animate-spin',
                      )}
                    />
                  </MarkingIconButton>
                  <Checkbox
                    isSelected={autoDownload}
                    onChange={setAutoDownload}
                    aria-label="Автозагрузка"
                    className="inline-flex min-h-10 items-center gap-2 rounded-md border border-input bg-background px-3 text-sm text-muted-foreground"
                  >
                    Автозагрузка
                  </Checkbox>
                </>
              }
              metrics={
                <>
                  <MarkingMetric label="Найдено" value={filteredRows.length} tone="secondary" />
                  <MarkingMetric label="Показано" value={rows.shown} tone="neutral" />
                  <MarkingMetric label="В очереди" value={queue.length} tone="primary" />
                  <MarkingMetric
                    label="Выбрано"
                    value={selectedIds.size}
                    tone={selectedIds.size ? 'info' : 'neutral'}
                  />
                </>
              }
              actions={
                <>
                  <MarkingIconButton label="Добавить заказ" variant="default" onClick={() => setCreateDialogOpen(true)}>
                    <PlusCircle className="h-4 w-4" />
                  </MarkingIconButton>
                  {selectedIds.size > 0 ? (
                    <>
                      <MarkingIconButton
                        label="Скачать коды"
                        onClick={() => downloadMutation.mutate(Array.from(selectedIds))}
                        disabled={downloadMutation.isPending}
                      >
                        <Download className="h-4 w-4" />
                      </MarkingIconButton>
                      <MarkingIconButton
                        label="Ввести в оборот"
                        onClick={() => openIntroDialog(Array.from(selectedIds))}
                      >
                        <PackageOpen className="h-4 w-4" />
                      </MarkingIconButton>
                      {!showArchived ? (
                        <MarkingIconButton
                          label="В архив"
                          onClick={() => archiveMutation.mutate(Array.from(selectedIds))}
                          disabled={archiveMutation.isPending}
                        >
                          <Archive className="h-4 w-4" />
                        </MarkingIconButton>
                      ) : (
                        <MarkingIconButton
                          label="Вернуть"
                          onClick={() => restoreMutation.mutate(Array.from(selectedIds))}
                          disabled={restoreMutation.isPending}
                        >
                          <RotateCcw className="h-4 w-4" />
                        </MarkingIconButton>
                      )}
                    </>
                  ) : null}
                  <MarkingIconButton
                    label={showArchived ? 'Показать текущие' : 'Открыть архив'}
                    variant={showArchived ? 'default' : 'outline'}
                    onClick={() => {
                      clearSelection()
                      setShowArchived((current) => !current)
                    }}
                  >
                    {showArchived ? <RotateCcw className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                  </MarkingIconButton>
                </>
              }
            />
          }
          footer={
            downloadProgress.label ? (
              <div className="rounded-2xl border border-border bg-muted/20 p-4">
                <Progress
                  value={
                    downloadProgress.total > 0
                      ? (downloadProgress.processed / downloadProgress.total) * 100
                      : 0
                  }
                  label={downloadProgress.label}
                  valueLabel={
                    downloadProgress.total > 0
                      ? `${downloadProgress.processed}/${downloadProgress.total}`
                      : undefined
                  }
                  color="success"
                />
              </div>
            ) : null
          }
        >
          {() => (
            <>
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-background">
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        isSelected={
                          selectableVisibleIds.length > 0 &&
                          selectableVisibleIds.every((id) => selectedIds.has(id))
                        }
                        onChange={() => toggleAll(selectableVisibleIds)}
                        aria-label="Выбрать все документы"
                      />
                    </TableHead>
                    <TableHead>Создан</TableHead>
                    <TableHead>Документ</TableHead>
                    <TableHead className="text-right">Кодов</TableHead>
                    <TableHead>Статус</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                        Загрузка документов...
                      </TableCell>
                    </TableRow>
                  ) : rows.visibleRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                        {showArchived ? 'Архив пуст' : 'Документы не найдены'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    rows.visibleRows.map((row) => {
                      const selectionIndex = selectableVisibleIds.indexOf(row.document_id)

                      return (
                      <TableRow
                        key={row.document_id}
                        className={cn(
                          'cursor-pointer hover:bg-muted/40',
                          (activeOrderId === row.document_id ||
                            selectedIds.has(row.document_id)) &&
                            'bg-muted/60 hover:bg-muted/60',
                        )}
                        onClick={() => setActiveOrderId(row.document_id)}
                      >
                        <TableCell onClick={(event) => event.stopPropagation()}>
                          <Checkbox
                            isSelected={!isSyntheticOrderId(row.document_id) && selectedIds.has(row.document_id)}
                            isDisabled={isSyntheticOrderId(row.document_id)}
                            isReadOnly
                            aria-label={`Выбрать документ ${row.order_name || row.document_id}`}
                            onContentClick={(event) => {
                              event.stopPropagation()
                              if (isSyntheticOrderId(row.document_id)) return
                              toggleOne(selectableVisibleIds, row.document_id, selectionIndex, event.shiftKey)
                            }}
                          />
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                          {formatDate(row.created_at || row.updated_at || undefined)}
                        </TableCell>
                        <TableCell className="min-w-0">
                          <div className="min-w-[18rem]">
                            <div className="font-medium text-foreground">
                              {row.order_name || 'Без названия'}
                            </div>
                            <div className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                              {row.full_name || row.gtin || 'Подробности откроются в карточке документа'}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {getCodesCount(row)}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-2">
                            <MarkingStatusBadge
                              status={row.status || '?'}
                              label={transientByDocumentId[row.document_id]?.label}
                              pending={transientByDocumentId[row.document_id]?.spinning}
                            />
                            {!transientByDocumentId[row.document_id] &&
                            row.download_status &&
                            row.download_status !== row.status ? (
                              <Badge tone="secondary">{row.download_status}</Badge>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    )})
                  )}
                </TableBody>
              </Table>
              <MarkingPagination
                page={rows.page}
                totalPages={rows.totalPages}
                shown={rows.shown}
                total={rows.total}
                from={rows.from}
                to={rows.to}
                onPageChange={rows.setPage}
              />
            </>
          )}
        </MarkingTablePanel>

        <details className="rounded-2xl border border-border bg-card">
          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium">
            История
          </summary>
          <div className="space-y-4 border-t border-border p-4">
            <div className="grid gap-4 xl:grid-cols-2">
              <MarkingLogPanel
                agentUrl={agentUrl}
                channel="orders"
                title="Заказы кодов"
              />
              <MarkingLogPanel
                agentUrl={agentUrl}
                channel="download"
                title="Загрузка кодов"
              />
            </div>
          </div>
        </details>
      </div>

      <CreateCodeOrderDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        draft={draft}
        onDraftChange={setDraft}
        options={optionsQuery.data}
        queue={queue}
        onAddToQueue={() => void handleAddToQueue(true)}
        onSubmitQueue={() => void handleSubmitQueue()}
        onClearAll={() => {
          resetDraft(false)
          if (queue.length > 0) {
            clearQueueMutation.mutate()
          }
        }}
        onRemoveQueueItem={(uid) => removeQueueItemMutation.mutate(uid)}
        addPending={addToQueueMutation.isPending}
        submitPending={submitQueueMutation.isPending}
        clearPending={clearQueueMutation.isPending}
        removePending={removeQueueItemMutation.isPending}
      />

      <MarkingIntroDialog
        agentUrl={agentUrl}
        open={introDialogState.open}
        onOpenChange={(open) =>
          setIntroDialogState((current) => ({ ...current, open }))
        }
        documentIds={introDialogState.ids}
        documentNames={introDialogState.names}
        onSuccess={refreshAll}
      />

      <MarkingOrderDetailDrawer
        agentUrl={agentUrl}
        open={Boolean(activeOrder)}
        onOpenChange={(open) => {
          if (!open) setActiveOrderId(null)
        }}
        order={activeOrder}
        archived={showArchived}
        printers={downloadQuery.data?.printers || []}
        defaultPrinter={downloadQuery.data?.default_printer || ''}
        onDownload={(documentId) => downloadMutation.mutateAsync([documentId])}
        onArchive={
          showArchived ? undefined : (documentId) => archiveMutation.mutateAsync([documentId])
        }
        onRestore={
          showArchived ? (documentId) => restoreMutation.mutateAsync([documentId]) : undefined
        }
        onPrint={(documentId, printerName, recordNumber) =>
          printMutation.mutateAsync({ documentId, printerName, recordNumber })
        }
        onOpenIntro={(documentId, orderName) =>
          setIntroDialogState({ open: true, ids: [documentId], names: [orderName] })
        }
        downloading={downloadMutation.isPending}
        archiving={archiveMutation.isPending}
        restoring={restoreMutation.isPending}
        printing={printMutation.isPending}
      />
    </>
  )
}

interface CreateCodeOrderDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  draft: CodeOrderDraft
  onDraftChange: (draft: CodeOrderDraft) => void
  options?: OptionsResponse
  queue: MarkingOrderQueueItem[]
  onAddToQueue: () => void
  onSubmitQueue: () => void
  onClearAll: () => void
  onRemoveQueueItem: (uid: string) => void
  addPending: boolean
  submitPending: boolean
  clearPending: boolean
  removePending: boolean
}

function CreateCodeOrderDialog({
  open,
  onOpenChange,
  draft,
  onDraftChange,
  options,
  queue,
  onAddToQueue,
  onSubmitQueue,
  onClearAll,
  onRemoveQueueItem,
  addPending,
  submitPending,
  clearPending,
  removePending,
}: CreateCodeOrderDialogProps) {
  const validationError = getDraftValidationError(draft)
  const canAdd = !validationError
  const canSubmit = queue.length > 0 || isDraftReady(draft)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Заказать коды" className="max-w-5xl">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
          <div className="space-y-4">
            <MarkingPanel
              title="Новый документ"
              stats={
                <>
                  <MarkingMetric label="Режим" value={draft.mode === 'gtin' ? 'По GTIN' : 'По параметрам'} tone="primary" />
                  <MarkingMetric label="В очереди" value={queue.length} tone="secondary" />
                </>
              }
              actions={
                <MarkingToolbar>
                  <Button
                    type="button"
                    variant={draft.mode === 'params' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => onDraftChange({ ...draft, mode: 'params' })}
                  >
                    По параметрам
                  </Button>
                  <Button
                    type="button"
                    variant={draft.mode === 'gtin' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => onDraftChange({ ...draft, mode: 'gtin' })}
                  >
                    По GTIN
                  </Button>
                </MarkingToolbar>
              }
              className="border-sky-100 bg-gradient-to-br from-sky-50/80 via-white to-blue-50/60"
            >
              <div className="grid gap-3 md:grid-cols-2">
                <MarkingField label="Название документа" className="md:col-span-2">
                  <Input
                    value={draft.orderName}
                    onChange={(event) =>
                      onDraftChange({ ...draft, orderName: event.target.value })
                    }
                    placeholder="Например: 1228 микро 8 260629"
                  />
                </MarkingField>

                {draft.mode === 'params' ? (
                  <>
                    <MarkingField label="Номенклатура" className="md:col-span-2">
                      <Input
                        value={draft.productName}
                        onChange={(event) =>
                          onDraftChange({ ...draft, productName: event.target.value })
                        }
                        placeholder="Введите или выберите номенклатуру"
                        list="marking-product-options"
                      />
                      <datalist id="marking-product-options">
                        {(options?.simplified_options || []).map((name) => (
                          <option key={name} value={name} />
                        ))}
                      </datalist>
                    </MarkingField>
                    <MarkingField label="Размер">
                      <SelectNative
                        value={draft.size}
                        onChange={(event) =>
                          onDraftChange({ ...draft, size: event.target.value })
                        }
                      >
                        <option value="">Выберите размер</option>
                        {(options?.size_options || []).map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </SelectNative>
                    </MarkingField>
                    <MarkingField label="Цвет">
                      <SelectNative
                        value={draft.color}
                        onChange={(event) =>
                          onDraftChange({ ...draft, color: event.target.value })
                        }
                      >
                        <option value="">Не выбран</option>
                        {(options?.color_options || []).map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </SelectNative>
                    </MarkingField>
                    <MarkingField label="Венчик">
                      <SelectNative
                        value={draft.venchik}
                        onChange={(event) =>
                          onDraftChange({ ...draft, venchik: event.target.value })
                        }
                      >
                        <option value="">Без венчика</option>
                        {(options?.venchik_options || []).map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </SelectNative>
                    </MarkingField>
                    <MarkingField label="Ед. в упаковке">
                      <SelectNative
                        value={draft.unitsPerPack}
                        onChange={(event) =>
                          onDraftChange({ ...draft, unitsPerPack: event.target.value })
                        }
                      >
                        <option value="">Выберите</option>
                        {(options?.units_options || []).map((option) => (
                          <option key={String(option)} value={String(option)}>
                            {option}
                          </option>
                        ))}
                      </SelectNative>
                    </MarkingField>
                  </>
                ) : (
                  <MarkingField label="GTIN" className="md:col-span-2">
                    <Input
                      value={draft.gtin}
                      onChange={(event) =>
                        onDraftChange({ ...draft, gtin: event.target.value })
                      }
                      placeholder="Введите GTIN"
                    />
                  </MarkingField>
                )}

                <MarkingField label="Количество кодов">
                  <Input
                    type="number"
                    min={1}
                    step={1}
                    value={String(draft.codesCount)}
                    onChange={(event) =>
                      onDraftChange({
                        ...draft,
                        codesCount: Math.max(1, Number(event.target.value) || 1),
                      })
                    }
                  />
                </MarkingField>
              </div>

              {validationError && hasDraftContent(draft) ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                  {validationError}
                </div>
              ) : null}
            </MarkingPanel>
          </div>

          <div className="space-y-4">
            <MarkingPanel
              title="Очередь документа"
              stats={
                <MarkingMetric
                  label="Позиции"
                  value={queue.length}
                  tone={queue.length ? 'info' : 'neutral'}
                />
              }
              className="border-emerald-100 bg-gradient-to-br from-emerald-50/70 via-white to-teal-50/40"
            >
              <div className="overflow-hidden rounded-2xl border border-border">
                <Table>
                  <TableHeader className="bg-background">
                    <TableRow>
                      <TableHead>Документ</TableHead>
                      <TableHead>Позиция</TableHead>
                      <TableHead className="text-right">Кодов</TableHead>
                      <TableHead className="w-12" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {queue.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                          Очередь пуста
                        </TableCell>
                      </TableRow>
                    ) : (
                      queue.map((item) => (
                        <TableRow key={item.uid}>
                          <TableCell className="min-w-40 font-medium">{item.order_name}</TableCell>
                          <TableCell className="min-w-56">
                            <div>{item.simpl_name || item.gtin || 'Позиция без названия'}</div>
                            <div className="text-xs text-muted-foreground">
                              {[item.size, item.color, item.units_per_pack]
                                .filter(Boolean)
                                .join(' • ')}
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-medium">{item.codes_count}</TableCell>
                          <TableCell className="text-right">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => onRemoveQueueItem(item.uid)}
                              disabled={removePending}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={onClearAll}
                  disabled={clearPending && queue.length > 0}
                >
                  <RotateCcw className="h-4 w-4" />
                  Очистить
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={onAddToQueue}
                  disabled={addPending || !canAdd}
                >
                  <ListPlus className="h-4 w-4" />
                  Создать еще
                </Button>
                <Button
                  type="button"
                  onClick={onSubmitQueue}
                  disabled={submitPending || !canSubmit}
                >
                  <PlusCircle className="h-4 w-4" />
                  Выполнить
                </Button>
              </div>
            </MarkingPanel>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
