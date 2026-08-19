import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from '@/lib/toast'
import { Play, RefreshCw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { DateInput } from '@/components/ui/date-picker'
import { Input, SelectNative } from '@/components/ui/input'
import { SearchInput } from '@/components/ui/search-input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { cn, formatDate } from '@/lib/utils'
import {
  inputDateValue,
  MarkingField,
  MarkingIconButton,
  MarkingMetric,
  MarkingPagination,
  MarkingStatusBadge,
  MarkingTableControls,
  MarkingTablePanel,
  usePaginatedRows,
} from '../marking-ui'
import { MarkingLogPanel } from '../components/MarkingLogPanel'
import {
  clearMarkingTransientStatuses,
  setMarkingTransientStatuses,
  useMarkingTransientStatuses,
  type MarkingTransientStatusMap,
} from '../transient-state'
import { withAgentFetchOptions } from '../agentFetch'
import { useShiftSelection } from '../useShiftSelection'

interface TsdItem {
  document_id: string
  order_name: string
  full_name: string
  gtin: string
  status: string
  tsd_status: string
  created_at?: string
  updated_at?: string
  codes_count?: number
  requested_codes_count?: number | null
  status_summary?: string
}

interface TsdState {
  items: TsdItem[]
  live?: boolean
}

interface TsdTabProps {
  agentUrl: string
}

function getCodesCount(item: TsdItem) {
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

function buildTsdItemsWithTransientState(
  items: TsdItem[],
  transientStatuses: MarkingTransientStatusMap,
) {
  const transientByDocumentId: MarkingTransientStatusMap = {}
  const syntheticItems: TsdItem[] = []

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
      status: status.row.status || '',
      tsd_status: status.row.tsdStatus || status.label,
      created_at: status.row.createdAt,
      updated_at: status.row.updatedAt,
      codes_count: status.row.codesCount ?? 0,
      requested_codes_count: status.row.requestedCodesCount ?? status.row.codesCount ?? 0,
      status_summary: status.row.statusSummary || '',
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

export function TsdTab({ agentUrl }: TsdTabProps) {
  const queryClient = useQueryClient()
  const transientStatuses = useMarkingTransientStatuses('turnover', agentUrl).data

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [introNumber, setIntroNumber] = useState('')
  const [productionDate, setProductionDate] = useState(() => inputDateValue())
  const [expirationDate, setExpirationDate] = useState(() => inputDateValue(2))
  const [batchNumber, setBatchNumber] = useState('')
  const [sendDialogOpen, setSendDialogOpen] = useState(false)

  const {
    data: tsdState,
    refetch: refetchTsd,
    isLoading,
  } = useQuery<TsdState>({
    queryKey: ['tsd-state', agentUrl],
    queryFn: async () => {
      const res = await fetch(`${agentUrl}/api/call/get_tsd_state`, withAgentFetchOptions(agentUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ args: [false] }),
      }))
      if (!res.ok) throw new Error('Failed to fetch TSD state')
      return res.json()
    },
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })

  const items = tsdState?.items || []
  const itemsWithTransientState = useMemo(
    () => buildTsdItemsWithTransientState(items, transientStatuses),
    [items, transientStatuses],
  )
  const visibleItems = itemsWithTransientState.items
  const transientByDocumentId = itemsWithTransientState.transientByDocumentId

  const statusOptions = useMemo(() => {
    const statuses = new Set<string>()
    visibleItems.forEach((item) => {
      if (item.tsd_status) statuses.add(item.tsd_status)
    })
    return Array.from(statuses).sort((left, right) => left.localeCompare(right, 'ru'))
  }, [visibleItems])

  const filteredItems = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    return visibleItems.filter((item) => {
      if (statusFilter && item.tsd_status !== statusFilter) return false
      if (!query) return true

      const haystack = [
        item.order_name,
        item.full_name,
        item.gtin,
        item.document_id,
        item.status,
        item.tsd_status,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      return haystack.includes(query)
    })
  }, [searchQuery, statusFilter, visibleItems])

  const rows = usePaginatedRows(filteredItems, 30)
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

  const createTsdMutation = useMutation({
    mutationFn: async () => {
      const ids = Array.from(selectedIds)
      if (!ids.length) {
        throw new Error('Выберите хотя бы один заказ')
      }

      const res = await fetch(`${agentUrl}/api/call/create_tsd_tasks`, withAgentFetchOptions(agentUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          args: [
            ids,
            introNumber || null,
            productionDate || null,
            expirationDate || null,
            batchNumber || null,
          ],
        }),
      }))
      if (!res.ok) throw new Error('Failed to create TSD tasks')
      return res.json()
    },
    onMutate: () => {
      const ids = Array.from(selectedIds)
      setMarkingTransientStatuses(queryClient, 'turnover', agentUrl, ids, {
        label: 'Отправляется на ТСД',
        spinning: true,
        expiresAt: Date.now() + 45_000,
      })
      toast.info('Создание заданий на ТСД запущено')
      return { ids }
    },
    onSuccess: async (data) => {
      const results = data.results || []
      const errors = data.errors || []

      if (errors.length > 0) {
        toast.warning(`Создано ${results.length}/${selectedIds.size}. Ошибок: ${errors.length}`)
      } else {
        toast.success(`Создано ${results.length} заданий на ТСД`)
      }

      const failedIds = new Set<string>(errors.map((error: { document_id?: string }) => String(error.document_id || '')))
      setSelectedIds(failedIds)
      setSendDialogOpen(false)
      await refetchTsd()
    },
    onError: (error: Error, _variables, context) => {
      clearMarkingTransientStatuses(queryClient, 'turnover', agentUrl, context?.ids)
      toast.error(error.message)
    },
  })

  const liveRefreshMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${agentUrl}/api/call/get_tsd_state`, withAgentFetchOptions(agentUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ args: [true] }),
      }))
      if (!res.ok) throw new Error('Failed to refresh TSD state')
      return res.json()
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['tsd-state', agentUrl], data)
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  return (
    <div className="space-y-4">
      <MarkingTablePanel
        title="Задание на ТСД"
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
                  value={searchQuery}
                  onChange={setSearchQuery}
                />
                <MarkingIconButton
                  label="Обновить"
                  onClick={() => liveRefreshMutation.mutate()}
                  disabled={liveRefreshMutation.isPending}
                >
                  <RefreshCw
                    className={cn('h-4 w-4', liveRefreshMutation.isPending && 'animate-spin')}
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
                {tsdState?.live ? <Badge tone="success">Live</Badge> : null}
              </>
            }
            actions={
              <>
                <MarkingIconButton
                  label="Отправить на ТСД"
                  variant="default"
                  onClick={() => setSendDialogOpen(true)}
                  disabled={selectedIds.size === 0}
                >
                  <Play className="h-4 w-4" />
                </MarkingIconButton>
                {selectedIds.size > 0 ? (
                  <MarkingIconButton label="Снять выбор" onClick={() => clearSelection()}>
                    <X className="h-4 w-4" />
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
                      aria-label="Выбрать все заказы"
                    />
                  </TableHead>
                  <TableHead>Создан</TableHead>
                  <TableHead>Документ</TableHead>
                  <TableHead className="text-right">Кодов</TableHead>
                  <TableHead>Статус</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                      Загрузка документов...
                    </TableCell>
                  </TableRow>
                ) : rows.visibleRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                      {searchQuery || statusFilter
                        ? 'Нет заказов по текущему фильтру'
                        : 'Нет заказов для создания заданий на ТСД'}
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
                          selectedIds.has(item.document_id) && 'bg-muted/60 hover:bg-muted/60',
                        )}
                        onClick={() => {
                          if (isSyntheticOrderId(item.document_id)) return
                          toggleOne(selectableVisibleIds, item.document_id, selectionIndex, false)
                        }}
                      >
                      <TableCell onClick={(event) => event.stopPropagation()}>
                        <Checkbox
                          isSelected={!isSyntheticOrderId(item.document_id) && selectedIds.has(item.document_id)}
                          isDisabled={isSyntheticOrderId(item.document_id)}
                          isReadOnly
                          aria-label={`Выбрать заказ ${item.order_name || item.document_id}`}
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
                            {item.full_name || item.gtin || 'Подробности доступны в карточке документа'}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {getCodesCount(item)}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-2">
                          <MarkingStatusBadge
                            status={item.tsd_status || item.status || '—'}
                            label={transientByDocumentId[item.document_id]?.label}
                            pending={transientByDocumentId[item.document_id]?.spinning}
                          />
                          {!transientByDocumentId[item.document_id] && item.status ? (
                            <span className="text-xs text-muted-foreground">{item.status}</span>
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
          <MarkingLogPanel agentUrl={agentUrl} channel="tsd" title="Задание на ТСД" />
        </div>
      </details>

      <Dialog open={sendDialogOpen} onOpenChange={setSendDialogOpen}>
        <DialogContent title="Отправить на ТСД" className="max-w-3xl">
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <MarkingMetric label="Выбрано" value={selectedIds.size} tone="primary" />
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(260px,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
              <MarkingField label="Ввод в оборот №">
                <Input
                  value={introNumber}
                  onChange={(event) => setIntroNumber(event.target.value)}
                  placeholder="Номер ввода в оборот"
                />
              </MarkingField>
              <MarkingField label="Дата производства">
                <DateInput
                  value={productionDate}
                  onChange={setProductionDate}
                  aria-label="Дата производства"
                />
              </MarkingField>
              <MarkingField label="Срок годности">
                <DateInput
                  value={expirationDate}
                  onChange={setExpirationDate}
                  aria-label="Срок годности"
                />
              </MarkingField>
              <MarkingField label="Номер партии">
                <Input
                  value={batchNumber}
                  onChange={(event) => setBatchNumber(event.target.value)}
                  placeholder="Номер партии"
                />
              </MarkingField>
            </div>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setSendDialogOpen(false)}
                disabled={createTsdMutation.isPending}
              >
                Отмена
              </Button>
              <Button
                type="button"
                onClick={() => createTsdMutation.mutate()}
                disabled={createTsdMutation.isPending || selectedIds.size === 0}
              >
                <Play className="h-4 w-4" />
                {createTsdMutation.isPending ? 'Отправляем...' : 'Отправить'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
