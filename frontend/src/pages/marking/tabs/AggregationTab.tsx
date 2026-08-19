import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from '@/lib/toast'
import { Archive, CheckCircle2, Download, ListChecks, PackagePlus, Play, RefreshCw, Tags, X } from 'lucide-react'
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
import { cn } from '@/lib/utils'
import {
  inputDateValue,
  MarkingField,
  MarkingIconButton,
  MarkingMetric,
  MarkingStatusBadge,
  MarkingTableControls,
  MarkingTablePanel,
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

interface AggregationItem {
  document_id: string
  aggregate_code: string
  comment: string
  status: string
  status_label?: string
  created_at_label: string
  includes_units_count: number
  codes_check_errors_count: number
}

interface AggregationState {
  items: AggregationItem[]
  status_options: string[] | { value: string; label: string }[]
  cache_age_seconds: number
  total_items: number
}

interface AggregationTabProps {
  agentUrl: string
}

const AGGREGATION_STATUS_LABELS: Record<string, string> = {
  tsdProcessStart: 'На ТСД',
  readyForSendAfterApproved: 'Готов после проведения',
  approved: 'Проведен',
  introduced: 'Введен в оборот',
  archived: 'В архиве',
}

function aggregationStatusLabel(status?: string | null) {
  if (!status) return '—'
  return AGGREGATION_STATUS_LABELS[status] || status
}

function isSyntheticAggregationId(documentId: string) {
  return documentId.startsWith('pending-aggregation:')
}

function buildAggregationItemsWithTransientState(
  items: AggregationItem[],
  transientStatuses: MarkingTransientStatusMap,
) {
  const transientByDocumentId: MarkingTransientStatusMap = {}
  const syntheticItems: AggregationItem[] = []

  Object.entries(transientStatuses).forEach(([documentId, status]) => {
    const directItem = items.find((item) => item.document_id === documentId)
    if (directItem) {
      transientByDocumentId[directItem.document_id] = status
      return
    }

    if (!status.row?.documentId) {
      return
    }

    syntheticItems.push({
      document_id: documentId,
      aggregate_code: status.row.aggregateCode || status.row.documentId || documentId,
      comment: status.row.comment || 'Создание агрегата',
      status: status.row.status || status.label,
      status_label: status.label,
      created_at_label: status.row.createdAtLabel || 'Сейчас',
      includes_units_count: status.row.includesUnitsCount ?? 0,
      codes_check_errors_count: status.row.codesCheckErrorsCount ?? 0,
    })
  })

  return {
    items: [...syntheticItems, ...items],
    transientByDocumentId,
  }
}

async function fetchAggregationState(agentUrl: string): Promise<AggregationState> {
  const res = await fetch(`${agentUrl}/api/call/get_aggregation_state`, withAgentFetchOptions(agentUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ args: [false] }),
  }))
  if (!res.ok) throw new Error('Failed to fetch aggregation state')
  return res.json()
}

export function AggregationTab({ agentUrl }: AggregationTabProps) {
  const queryClient = useQueryClient()
  const transientStatuses = useMarkingTransientStatuses('aggregation', agentUrl).data
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [currentPage, setCurrentPage] = useState(0)
  const pageSize = 50

  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [introDialogOpen, setIntroDialogOpen] = useState(false)

  const [createComment, setCreateComment] = useState('')
  const [createCount, setCreateCount] = useState(1)
  const [introProductionDate, setIntroProductionDate] = useState(() => inputDateValue())
  const [introExpirationDate, setIntroExpirationDate] = useState(() => inputDateValue(2))
  const [introBatchNumber, setIntroBatchNumber] = useState('')
  const [introDocumentTitle, setIntroDocumentTitle] = useState('')
  const [allowDisaggregate, setAllowDisaggregate] = useState(false)

  const {
    data: aggState,
    refetch: refetchAgg,
    isLoading,
  } = useQuery<AggregationState>({
    queryKey: ['aggregation-state', agentUrl],
    queryFn: () => fetchAggregationState(agentUrl),
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })

  const items = aggState?.items || []
  const itemsWithTransientState = useMemo(
    () => buildAggregationItemsWithTransientState(items, transientStatuses),
    [items, transientStatuses],
  )
  const visibleItems = itemsWithTransientState.items
  const transientByDocumentId = itemsWithTransientState.transientByDocumentId
  const rawStatusOptions = aggState?.status_options || []
  const cacheAge = aggState?.cache_age_seconds || 0
  const totalItems = aggState?.total_items || items.length

  const statusOptions = useMemo(() => {
    const labelsByValue = new Map<string, string>()

    visibleItems.forEach((item) => {
      if (item.status) {
        labelsByValue.set(item.status, item.status_label || aggregationStatusLabel(item.status))
      }
    })

    return rawStatusOptions
      .map((option) => {
        if (typeof option === 'object' && option !== null) {
          const value = String(option.value || option.label || '')
          return {
            value,
            label:
              String(option.label || '').trim() ||
              labelsByValue.get(value) ||
              aggregationStatusLabel(value),
          }
        }

        const value = String(option)
        return {
          value,
          label: labelsByValue.get(value) || aggregationStatusLabel(value),
        }
      })
      .filter((option) => option.value)
  }, [rawStatusOptions, visibleItems])

  const filteredItems = useMemo(() => {
    let result = visibleItems

    if (statusFilter) {
      result = result.filter((item) => item.status === statusFilter)
    }

    const query = searchQuery.trim().toLowerCase()
    if (query) {
      result = result.filter((item) => {
        const haystack = [
          item.aggregate_code,
          item.comment,
          item.status_label || item.status,
          item.document_id,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        return haystack.includes(query)
      })
    }

    return result
  }, [searchQuery, statusFilter, visibleItems])

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize))
  const visiblePage = Math.min(currentPage, totalPages - 1)

  const paginatedItems = useMemo(() => {
    const start = visiblePage * pageSize
    const end = Math.min(start + pageSize, filteredItems.length)
    return filteredItems.slice(start, end)
  }, [filteredItems, pageSize, visiblePage])

  const selectablePaginatedIds = useMemo(
    () => paginatedItems.filter((item) => !isSyntheticAggregationId(item.document_id)).map((item) => item.document_id),
    [paginatedItems],
  )

  const {
    clearSelection: clearShiftSelection,
    setSelection,
    toggleAll,
    toggleOne,
  } = useShiftSelection<string>({ setSelected: setSelectedIds })

  const refreshMutation = useMutation({
    mutationFn: () => refetchAgg(),
    onMutate: () => {
      toast.info('Список АК обновляется')
    },
    onSuccess: () => {
      toast.success('Список АК обновлен')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!createComment.trim()) {
        throw new Error('Введите название')
      }

      const res = await fetch(`${agentUrl}/api/call/create_aggregation_codes`, withAgentFetchOptions(agentUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          args: [createComment, createCount],
        }),
      }))
      if (!res.ok) throw new Error('Failed to create aggregation codes')
      return res.json()
    },
    onMutate: () => {
      const syntheticCount = Math.min(Math.max(createCount, 1), 20)
      const pendingIds = Array.from({ length: syntheticCount }, (_, index) => {
        return `pending-aggregation:${createComment}:${index}`
      })

      pendingIds.forEach((documentId, index) => {
        setMarkingTransientStatuses(queryClient, 'aggregation', agentUrl, [documentId], {
          label: 'Создается',
          spinning: true,
          expiresAt: Date.now() + 45_000,
          row: {
            documentId,
            aggregateCode: `AK-${index + 1}`,
            comment: createComment.trim() || 'Создание агрегата',
            createdAtLabel: 'Сейчас',
            status: 'Создается',
          },
        })
      })
      toast.info('Создание агрегатов запущено')
      return { pendingIds }
    },
    onSuccess: () => {
      toast.success('Агрегаты созданы')
      void refetchAgg()
      setCreateDialogOpen(false)
      setCreateComment('')
      setCreateCount(1)
    },
    onError: (error: Error, _variables, context) => {
      clearMarkingTransientStatuses(queryClient, 'aggregation', agentUrl, context?.pendingIds)
      toast.error(error.message)
    },
  })

  const downloadSelectedMutation = useMutation({
    mutationFn: async () => {
      const ids = Array.from(selectedIds)
      if (!ids.length) {
        throw new Error('Выберите хотя бы один АК')
      }
      const res = await fetch(`${agentUrl}/api/call/download_selected_aggregations`, withAgentFetchOptions(agentUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ args: [ids] }),
      }))
      if (!res.ok) throw new Error('Failed to download selected aggregations')
      return res.json()
    },
    onMutate: () => {
      const ids = Array.from(selectedIds)
      setMarkingTransientStatuses(
        queryClient,
        'aggregation',
        agentUrl,
        ids,
        {
          label: 'Скачивается',
          spinning: true,
        },
      )
      toast.info('Скачивание выбранных АК запущено')
      return { ids }
    },
    onSuccess: async (_payload, _variables, context) => {
      toast.success('Выбранные АК скачаны')
      await refetchAgg()
      clearMarkingTransientStatuses(
        queryClient,
        'aggregation',
        agentUrl,
        context?.ids,
      )
    },
    onError: (error: Error, _variables, context) => {
      clearMarkingTransientStatuses(
        queryClient,
        'aggregation',
        agentUrl,
        context?.ids,
      )
      toast.error(error.message)
    },
  })

  const approveMutation = useMutation({
    mutationFn: async () => {
      const ids = Array.from(selectedIds)
      if (!ids.length) {
        throw new Error('Выберите хотя бы один АК')
      }
      const res = await fetch(`${agentUrl}/api/call/approve_selected_aggregations`, withAgentFetchOptions(agentUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          args: [ids, allowDisaggregate],
        }),
      }))
      if (!res.ok) throw new Error('Failed to approve aggregations')
      return res.json()
    },
    onMutate: () => {
      const ids = Array.from(selectedIds)
      setMarkingTransientStatuses(
        queryClient,
        'aggregation',
        agentUrl,
        ids,
        {
          label: 'Проведение...',
          spinning: true,
        },
      )
      toast.info('Проведение выбранных АК выполняется')
      return { ids }
    },
    onSuccess: async (_payload, _variables, context) => {
      toast.success('Проведение выбранных АК завершено')
      await refetchAgg()
      clearMarkingTransientStatuses(
        queryClient,
        'aggregation',
        agentUrl,
        context?.ids,
      )
      clearShiftSelection()
    },
    onError: (error: Error, _variables, context) => {
      clearMarkingTransientStatuses(
        queryClient,
        'aggregation',
        agentUrl,
        context?.ids,
      )
      toast.error(error.message)
    },
  })

  const archiveMutation = useMutation({
    mutationFn: async () => {
      const ids = Array.from(selectedIds)
      if (!ids.length) {
        throw new Error('Выберите хотя бы один АК')
      }
      const res = await fetch(`${agentUrl}/api/call/archive_selected_aggregations`, withAgentFetchOptions(agentUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ args: [ids] }),
      }))
      if (!res.ok) throw new Error('Failed to archive aggregations')
      return res.json()
    },
    onMutate: () => {
      toast.info('Выбранные АК отправляются в архив')
    },
    onSuccess: () => {
      toast.success('Выбранные АК отправлены в архив')
      void refetchAgg()
      clearShiftSelection()
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const introMutation = useMutation({
    mutationFn: async () => {
      const ids = Array.from(selectedIds)
      if (!ids.length) {
        throw new Error('Выберите хотя бы один АК')
      }
      const res = await fetch(`${agentUrl}/api/call/introduce_selected_aggregations`, withAgentFetchOptions(agentUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          args: [
            ids,
            introProductionDate || null,
            introExpirationDate || null,
            introBatchNumber || null,
            introDocumentTitle || null,
          ],
        }),
      }))
      if (!res.ok) throw new Error('Failed to introduce aggregations')
      return res.json()
    },
    onMutate: () => {
      const ids = Array.from(selectedIds)
      setMarkingTransientStatuses(
        queryClient,
        'aggregation',
        agentUrl,
        ids,
        {
          label: 'Вводим в оборот...',
          spinning: true,
        },
      )
      toast.info('Ввод в оборот выбранных АК выполняется')
      return { ids }
    },
    onSuccess: async (_payload, _variables, context) => {
      toast.success('Ввод в оборот по выбранным АК завершен')
      await refetchAgg()
      clearMarkingTransientStatuses(
        queryClient,
        'aggregation',
        agentUrl,
        context?.ids,
      )
      clearShiftSelection()
      setIntroDialogOpen(false)
    },
    onError: (error: Error, _variables, context) => {
      clearMarkingTransientStatuses(
        queryClient,
        'aggregation',
        agentUrl,
        context?.ids,
      )
      toast.error(error.message)
    },
  })

  const selectVisible = () => {
    setSelection(selectablePaginatedIds)
  }

  const selectByName = () => {
    const firstSelected = items.find((item) => selectedIds.has(item.document_id))
    const targetName = firstSelected?.comment || paginatedItems[0]?.comment || ''
    if (!targetName) {
      toast.error('Сначала выберите АК или задайте поиск по наименованию')
      return
    }

    setSelection(
      items
        .filter((item) => item.comment === targetName)
        .map((item) => item.document_id),
    )
  }

  const clearSelection = () => {
    clearShiftSelection()
  }

  const renderStatus = (item: AggregationItem) => {
    const transientStatus = transientByDocumentId[item.document_id] || transientStatuses[item.document_id]
    const status = transientStatus?.label || item.status_label || aggregationStatusLabel(item.status)

    return (
      <div className="inline-flex flex-col items-center text-center">
        <MarkingStatusBadge
          status={item.status}
          label={status}
          pending={transientStatus?.spinning}
        />
        {item.codes_check_errors_count > 0 ? (
          <div className="mt-1 text-xs text-destructive">
            Ошибок: {item.codes_check_errors_count}
          </div>
        ) : null}
        {item.status === 'readyForSendAfterApproved' ? (
          <div className="mt-1 text-xs text-muted-foreground">
            Измененный состав после прошлой регистрации
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <>
      <div className="space-y-4">
          <MarkingTablePanel
            title="Список АК"
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
                        <option key={status.value} value={status.value}>
                          {status.label}
                        </option>
                      ))}
                    </SelectNative>
                    <SearchInput
                      className="w-full sm:w-72"
                      placeholder="Поиск по названию, коду или ID"
                      value={searchQuery}
                      onChange={setSearchQuery}
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
                    <MarkingMetric label="Всего" value={totalItems} tone="secondary" />
                    <MarkingMetric label="Найдено" value={filteredItems.length} tone="neutral" />
                    <MarkingMetric
                      label="Выбрано"
                      value={selectedIds.size}
                      tone={selectedIds.size ? 'primary' : 'neutral'}
                    />
                    <MarkingMetric label="Страница" value={`${visiblePage + 1}/${totalPages}`} tone="neutral" />
                    {cacheAge > 0 ? (
                      <MarkingMetric label="Кэш" value={`${cacheAge} сек.`} tone="secondary" />
                    ) : null}
                  </>
                }
                actions={
                  <>
                  <MarkingIconButton label="Создать агрегаты" variant="default" onClick={() => setCreateDialogOpen(true)}>
                    <PackagePlus className="h-4 w-4" />
                  </MarkingIconButton>
                  <MarkingIconButton
                    label="Ввести в оборот выбранные АК"
                    variant="default"
                    onClick={() => setIntroDialogOpen(true)}
                    disabled={selectedIds.size === 0}
                  >
                    <Play className="h-4 w-4" />
                  </MarkingIconButton>
                  <MarkingIconButton
                    label="Скачать выбранные АК"
                    onClick={() => downloadSelectedMutation.mutate()}
                    disabled={downloadSelectedMutation.isPending || selectedIds.size === 0}
                  >
                    <Download className="h-4 w-4" />
                  </MarkingIconButton>
                  <MarkingIconButton
                    label="Провести выбранные АК"
                    onClick={() => approveMutation.mutate()}
                    disabled={approveMutation.isPending || selectedIds.size === 0}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                  </MarkingIconButton>
                  <MarkingIconButton
                    label="В архив"
                    onClick={() => archiveMutation.mutate()}
                    disabled={archiveMutation.isPending || selectedIds.size === 0}
                  >
                    <Archive className="h-4 w-4" />
                  </MarkingIconButton>
                  <MarkingIconButton label="Выбрать найденные" onClick={selectVisible} disabled={selectablePaginatedIds.length === 0}>
                    <ListChecks className="h-4 w-4" />
                  </MarkingIconButton>
                  <MarkingIconButton label="Выбрать одноименные" onClick={selectByName} disabled={filteredItems.length === 0}>
                    <Tags className="h-4 w-4" />
                  </MarkingIconButton>
                  <MarkingIconButton label="Снять выделение" onClick={clearSelection} disabled={selectedIds.size === 0}>
                    <X className="h-4 w-4" />
                  </MarkingIconButton>
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
                            selectablePaginatedIds.length > 0 &&
                            selectablePaginatedIds.every((id) => selectedIds.has(id))
                          }
                          onChange={() => toggleAll(selectablePaginatedIds)}
                          aria-label="Выбрать все агрегаты"
                        />
                      </TableHead>
                      <TableHead>АК</TableHead>
                      <TableHead>Статус</TableHead>
                      <TableHead>Создан</TableHead>
                      <TableHead className="text-right">Кодов</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <TableRow>
                        <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                          Загрузка...
                        </TableCell>
                      </TableRow>
                    ) : paginatedItems.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                          {searchQuery || statusFilter
                            ? 'Нет АК по текущему фильтру'
                            : 'Нет агрегационных кодов'}
                        </TableCell>
                      </TableRow>
                    ) : (
                      paginatedItems.map((item) => {
                        const selectionIndex = selectablePaginatedIds.indexOf(item.document_id)
                        const aggregateTitle = item.comment?.trim() || item.aggregate_code || 'АК'
                        const aggregateCode = item.aggregate_code?.trim()

                        return (
                        <TableRow
                          key={item.document_id}
                          className={cn(
                            'cursor-pointer hover:bg-muted/40',
                            selectedIds.has(item.document_id) && 'bg-muted/60 hover:bg-muted/60',
                          )}
                          onClick={(event) =>
                            isSyntheticAggregationId(item.document_id)
                              ? undefined
                              : toggleOne(selectablePaginatedIds, item.document_id, selectionIndex, event.shiftKey)
                          }
                        >
                          <TableCell onClick={(event) => event.stopPropagation()}>
                            <Checkbox
                              isSelected={!isSyntheticAggregationId(item.document_id) && selectedIds.has(item.document_id)}
                              isDisabled={isSyntheticAggregationId(item.document_id)}
                              isReadOnly
                              aria-label={`Выбрать агрегат ${aggregateTitle}`}
                              onContentClick={(event) => {
                                event.stopPropagation()
                                if (isSyntheticAggregationId(item.document_id)) return
                                toggleOne(selectablePaginatedIds, item.document_id, selectionIndex, event.shiftKey)
                              }}
                            />
                          </TableCell>
                          <TableCell>
                            <div className="font-medium text-foreground">{aggregateTitle}</div>
                            {aggregateCode && aggregateCode !== aggregateTitle ? (
                              <div className="mt-1 font-mono text-xs text-muted-foreground">{aggregateCode}</div>
                            ) : null}
                          </TableCell>
                          <TableCell>{renderStatus(item)}</TableCell>
                          <TableCell>{item.created_at_label || '—'}</TableCell>
                          <TableCell className="text-right">{item.includes_units_count ?? 0}</TableCell>
                        </TableRow>
                      )})
                    )}
                  </TableBody>
                </Table>

                {filteredItems.length > pageSize ? (
                  <div className="flex items-center justify-between border-t border-border p-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(Math.max(0, visiblePage - 1))}
                      disabled={visiblePage === 0}
                    >
                      Назад
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      Страница {visiblePage + 1} из {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(Math.min(totalPages - 1, visiblePage + 1))}
                      disabled={visiblePage >= totalPages - 1}
                    >
                      Вперед
                    </Button>
                  </div>
                ) : null}
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
              channel="aggregation"
              title="Агрегация"
            />
          </div>
        </details>
      </div>

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent title="Создать агрегаты" className="max-w-2xl">
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px]">
              <MarkingField label="Название">
                <Input
                  value={createComment}
                  onChange={(event) => setCreateComment(event.target.value)}
                  placeholder="Например: лат диаг S 260316 (249к)"
                />
              </MarkingField>
              <MarkingField label="Количество агрегатов">
                <Input
                  type="number"
                  min={1}
                  value={createCount}
                  onChange={(event) => setCreateCount(Number(event.target.value))}
                />
              </MarkingField>
            </div>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateDialogOpen(false)}
                disabled={createMutation.isPending}
              >
                Отмена
              </Button>
              <Button
                type="button"
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending}
              >
                <PackagePlus className="h-4 w-4" />
                {createMutation.isPending ? 'Создание...' : 'Создать агрегаты'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={introDialogOpen} onOpenChange={setIntroDialogOpen}>
        <DialogContent title="Ввод в оборот АК" className="max-w-3xl">
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <MarkingMetric label="Выбрано" value={selectedIds.size} tone="primary" />
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(320px,1.5fr)]">
              <MarkingField label="Дата производства">
                <DateInput
                  value={introProductionDate}
                  onChange={setIntroProductionDate}
                  aria-label="Дата производства"
                />
              </MarkingField>
              <MarkingField label="Срок годности">
                <DateInput
                  value={introExpirationDate}
                  onChange={setIntroExpirationDate}
                  aria-label="Срок годности"
                />
              </MarkingField>
              <MarkingField label="Номер партии">
                <Input
                  value={introBatchNumber}
                  onChange={(event) => setIntroBatchNumber(event.target.value)}
                  placeholder="Номер партии"
                />
              </MarkingField>
              <MarkingField label="Название документа">
                <Input
                  className="xl:min-w-[20rem]"
                  value={introDocumentTitle}
                  onChange={(event) => setIntroDocumentTitle(event.target.value)}
                  placeholder="Опционально"
                />
              </MarkingField>
            </div>

            <Checkbox
              isSelected={allowDisaggregate}
              onChange={setAllowDisaggregate}
              aria-label="Разрешить расформирование чужих АК"
              className="text-sm"
            >
              Разрешить расформирование чужих АК
            </Checkbox>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIntroDialogOpen(false)}
                disabled={introMutation.isPending}
              >
                Отмена
              </Button>
              <Button
                type="button"
                onClick={() => introMutation.mutate()}
                disabled={introMutation.isPending || selectedIds.size === 0}
              >
                <Play className="h-4 w-4" />
                {introMutation.isPending ? 'Выполнение...' : 'Выполнить'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
