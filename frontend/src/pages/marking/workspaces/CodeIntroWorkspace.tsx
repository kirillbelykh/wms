import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from '@/lib/toast'
import { CheckCheck, PackageCheck, RefreshCw } from 'lucide-react'
import { Input, SelectNative } from '@/components/ui/input'
import { SearchInput } from '@/components/ui/search-input'
import { Checkbox } from '@/components/ui/checkbox'
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
  getDownloadState,
  getIntroState,
  manualDownloadOrder,
  printDownloadOrder,
  type IntroItem,
  type IntroState,
} from '../api'
import {
  MarkingMetric,
  MarkingPagination,
  MarkingStatusBadge,
  MarkingIconButton,
  MarkingTableControls,
  MarkingTablePanel,
  usePaginatedRows,
} from '../marking-ui'
import {
  clearMarkingTransientStatuses,
  setMarkingTransientStatuses,
  useMarkingTransientStatuses,
  type MarkingTransientStatusMap,
} from '../transient-state'
import { useShiftSelection } from '../useShiftSelection'

interface CodeIntroWorkspaceProps {
  agentUrl: string
}

function getCodesCount(item: IntroItem) {
  const values = [
    item.requested_codes_count,
    item.codes_count,
    (item as { requestedCodesCount?: number | string | null }).requestedCodesCount,
    (item as { codesCount?: number | string | null }).codesCount,
  ]

  return values.reduce<number>((max, value) => {
    const next = Number(value)
    return Number.isFinite(next) ? Math.max(max, next) : max
  }, 0)
}

function normalizeOrderMatchValue(value?: string | null) {
  return String(value || '').trim().toLowerCase()
}

function isSyntheticOrderId(documentId: string) {
  return documentId.startsWith('pending:')
}

function buildIntroItemsWithTransientState(
  items: IntroItem[],
  transientStatuses: MarkingTransientStatusMap,
) {
  const transientByDocumentId: MarkingTransientStatusMap = {}
  const syntheticItems: IntroItem[] = []

  Object.entries(transientStatuses).forEach(([documentId, status]) => {
    const directItem = items.find((item) => item.document_id === documentId)
    if (directItem) {
      transientByDocumentId[directItem.document_id] = status
      return
    }

    const matchValue = normalizeOrderMatchValue(status.matchValue)
    if (matchValue) {
      const matchedItem = items.find(
        (item) => normalizeOrderMatchValue(item.order_name) === matchValue,
      )
      if (matchedItem) {
        transientByDocumentId[matchedItem.document_id] = status
        return
      }
    }

    if (!status.row?.orderName) {
      return
    }

    syntheticItems.push({
      document_id: documentId,
      order_name: status.row.orderName,
      full_name: status.row.fullName || '',
      gtin: status.row.gtin || '',
      status: status.row.status || status.label,
      status_summary: status.row.statusSummary || '',
      created_at: status.row.createdAt,
      updated_at: status.row.updatedAt,
      codes_count: status.row.codesCount ?? 0,
      requested_codes_count: status.row.requestedCodesCount ?? status.row.codesCount ?? 0,
    })
  })

  return {
    items: [...syntheticItems, ...items].sort((left, right) => {
      const leftTime = new Date(left.updated_at || left.created_at || 0).getTime()
      const rightTime = new Date(right.updated_at || right.created_at || 0).getTime()
      return rightTime - leftTime
    }),
    transientByDocumentId,
  }
}

export function CodeIntroWorkspace({ agentUrl }: CodeIntroWorkspaceProps) {
  const queryClient = useQueryClient()
  const transientStatuses = useMarkingTransientStatuses('turnover', agentUrl).data
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null)
  const [introDialogState, setIntroDialogState] = useState<{
    open: boolean
    ids: string[]
    names: string[]
  }>({ open: false, ids: [], names: [] })

  const introQuery = useQuery<IntroState>({
    queryKey: ['marking-intro-state', agentUrl],
    queryFn: () => getIntroState(agentUrl),
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

  const items = introQuery.data?.items || []
  const itemsWithTransientState = useMemo(
    () => buildIntroItemsWithTransientState(items, transientStatuses),
    [items, transientStatuses],
  )
  const visibleItems = itemsWithTransientState.items
  const transientByDocumentId = itemsWithTransientState.transientByDocumentId
  const statusOptions = useMemo(() => {
    const statuses = new Set<string>()
    visibleItems.forEach((item) => {
      if (item.status) statuses.add(item.status)
    })
    return Array.from(statuses).sort((left, right) => left.localeCompare(right, 'ru'))
  }, [visibleItems])

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase()
    return visibleItems.filter((item) => {
      if (statusFilter && item.status !== statusFilter) return false
      if (!query) return true
      const haystack = [
        item.order_name,
        item.full_name,
        item.gtin,
        item.document_id,
        item.status,
        item.status_summary,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(query)
    })
  }, [search, statusFilter, visibleItems])

  const rows = usePaginatedRows(filteredItems, 30)
  const selectableVisibleIds = useMemo(
    () =>
      rows.visibleRows
        .filter((item) => !isSyntheticOrderId(item.document_id))
        .map((item) => item.document_id),
    [rows.visibleRows],
  )
  const activeOrder = useMemo(
    () => items.find((item) => item.document_id === activeOrderId) || null,
    [activeOrderId, items],
  )

  const { clearSelection, toggleAll, toggleOne } = useShiftSelection<string>({
    setSelected: setSelectedIds,
  })

  const refreshMutation = useMutation({
    mutationFn: () => introQuery.refetch(),
    onMutate: () => {
      toast.info('Список документов обновляется')
    },
    onSuccess: () => {
      toast.success('Список для ввода в оборот обновлен')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const downloadMutation = useMutation({
    mutationFn: async (documentId: string) => manualDownloadOrder(agentUrl, documentId),
    onMutate: (documentId) => {
      setMarkingTransientStatuses(queryClient, 'turnover', agentUrl, [documentId], {
        label: 'Скачивается',
        spinning: true,
      })
      toast.info('Получение кодов запущено')
    },
    onSuccess: async (_payload, documentId) => {
      toast.success('Коды по документу получены')
      await Promise.all([downloadQuery.refetch(), introQuery.refetch()])
      clearMarkingTransientStatuses(queryClient, 'turnover', agentUrl, [documentId])
    },
    onError: (error: Error, documentId) => {
      clearMarkingTransientStatuses(queryClient, 'turnover', agentUrl, [documentId])
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

  const openIntroDialog = (documentIds: string[]) => {
    if (!documentIds.length) {
      toast.error('Выберите хотя бы один документ')
      return
    }
    const names = visibleItems
      .filter((item) => documentIds.includes(item.document_id))
      .map((item) => item.order_name)
    setIntroDialogState({ open: true, ids: documentIds, names })
  }

  return (
    <>
      <div className="space-y-4">
        <MarkingTablePanel
          title="Документы к вводу в оборот"
          maxHeight="max-h-[720px]"
          actions={
            <MarkingTableControls
              filters={
                <>
                  <SelectNative
                    value={statusFilter}
                    onChange={(event) => setStatusFilter(event.target.value)}
                    className="w-48"
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
                    onClick={() => refreshMutation.mutate()}
                    disabled={refreshMutation.isPending}
                  >
                    <RefreshCw
                      className={cn('h-4 w-4', refreshMutation.isPending && 'animate-spin')}
                    />
                  </MarkingIconButton>
                </>
              }
              metrics={
                <>
                  <MarkingMetric label="Найдено" value={filteredItems.length} tone="secondary" />
                  <MarkingMetric label="Показано" value={rows.shown} tone="neutral" />
                  <MarkingMetric
                    label="Выбрано"
                    value={selectedIds.size}
                    tone={selectedIds.size ? 'primary' : 'neutral'}
                  />
                </>
              }
              actions={
                <>
                  <MarkingIconButton
                    label="Ввести в оборот"
                    variant="default"
                    onClick={() => openIntroDialog(Array.from(selectedIds))}
                    disabled={selectedIds.size === 0}
                  >
                    <PackageCheck className="h-4 w-4" />
                  </MarkingIconButton>
                  {selectedIds.size > 0 ? (
                    <MarkingIconButton label="Снять выбор" onClick={() => clearSelection()}>
                      <CheckCheck className="h-4 w-4" />
                    </MarkingIconButton>
                  ) : null}
                </>
              }
            />
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
                  {introQuery.isLoading ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                        Загрузка документов...
                      </TableCell>
                    </TableRow>
                  ) : rows.visibleRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                        Документы для ввода в оборот не найдены
                      </TableCell>
                    </TableRow>
                  ) : (
                    rows.visibleRows.map((item) => {
                      const selectionIndex = selectableVisibleIds.indexOf(item.document_id)

                      return (
                      <TableRow
                        key={item.document_id}
                        className={cn(
                          'cursor-pointer hover:bg-muted/40',
                          (activeOrderId === item.document_id ||
                            selectedIds.has(item.document_id)) &&
                            'bg-muted/60 hover:bg-muted/60',
                        )}
                        onClick={() => setActiveOrderId(item.document_id)}
                      >
                        <TableCell onClick={(event) => event.stopPropagation()}>
                          <Checkbox
                            isSelected={!isSyntheticOrderId(item.document_id) && selectedIds.has(item.document_id)}
                            isDisabled={isSyntheticOrderId(item.document_id)}
                            isReadOnly
                            aria-label={`Выбрать документ ${item.order_name || item.document_id}`}
                            onContentClick={(event) => {
                              event.stopPropagation()
                              if (isSyntheticOrderId(item.document_id)) return
                              toggleOne(selectableVisibleIds, item.document_id, selectionIndex, event.shiftKey)
                            }}
                          />
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                          {formatDate(item.created_at || item.updated_at || undefined)}
                        </TableCell>
                        <TableCell className="min-w-0">
                          <div className="min-w-[18rem]">
                            <div className="font-medium text-foreground">
                              {item.order_name || 'Без названия'}
                            </div>
                            <div className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                              {item.full_name || item.gtin || 'Подробности откроются в карточке документа'}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {getCodesCount(item)}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-2">
                            <MarkingStatusBadge
                              status={item.status || '—'}
                              label={transientByDocumentId[item.document_id]?.label}
                              pending={transientByDocumentId[item.document_id]?.spinning}
                            />
                            {!transientByDocumentId[item.document_id] && item.status_summary ? (
                              <span className="text-xs text-muted-foreground">
                                {item.status_summary}
                              </span>
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
          <div className="border-t border-border p-4">
            <MarkingLogPanel
              agentUrl={agentUrl}
              channel="intro"
              title="Ввод в оборот"
            />
          </div>
        </details>
      </div>

      <MarkingIntroDialog
        agentUrl={agentUrl}
        open={introDialogState.open}
        onOpenChange={(open) => setIntroDialogState((current) => ({ ...current, open }))}
        documentIds={introDialogState.ids}
        documentNames={introDialogState.names}
        onSuccess={async () => {
          clearSelection()
          await Promise.all([introQuery.refetch(), downloadQuery.refetch()])
        }}
      />

      <MarkingOrderDetailDrawer
        agentUrl={agentUrl}
        open={Boolean(activeOrder)}
        onOpenChange={(open) => {
          if (!open) setActiveOrderId(null)
        }}
        order={activeOrder}
        printers={downloadQuery.data?.printers || []}
        defaultPrinter={downloadQuery.data?.default_printer || ''}
        onDownload={(documentId) => downloadMutation.mutateAsync(documentId)}
        onPrint={(documentId, printerName, recordNumber) =>
          printMutation.mutateAsync({ documentId, printerName, recordNumber })
        }
        onOpenIntro={(documentId, orderName) =>
          setIntroDialogState({ open: true, ids: [documentId], names: [orderName] })
        }
        downloading={downloadMutation.isPending}
        printing={printMutation.isPending}
      />
    </>
  )
}
