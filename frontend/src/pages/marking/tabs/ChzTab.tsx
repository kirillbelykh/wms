// src/pages/marking/tabs/ChzTab.tsx

import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from '@/lib/toast'
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
import { cn } from '@/lib/utils'
import { Archive, CheckCircle2, RefreshCw, RotateCcw, ShieldCheck, Trash2 } from 'lucide-react'
import {
  MarkingIconButton,
  MarkingMetric,
  MarkingPagination,
  MarkingStatusBadge,
  MarkingTableControls,
  MarkingTablePanel,
  usePaginatedRows,
} from '../marking-ui'
import { MarkingLogPanel } from '../components/MarkingLogPanel'
import { withAgentFetchOptions } from '../agentFetch'
import { useShiftSelection } from '../useShiftSelection'

type ChzWorkflowStatus = 'new' | 'work' | 'archive'

interface ChzRequest {
  request_key: string
  request_id: number
  type_label: string
  order_number: string
  author: string
  item_title: string
  item_size: string
  batch_number: string
  item_color: string
  pairs_total: number
  status: string
  status_label: string
  requested_at_label: string
  order_name: string
  comment?: string
  items_summary?: string
  positions_count?: number
  items?: Array<{
    item_title: string
    item_size: string
    batch_number: string
    item_color: string
    item_venchik: string
    pairs_quantity: number
  }>
}

interface ChzTableRow extends ChzRequest {
  workflow_status: ChzWorkflowStatus
}

interface ChzState {
  new_requests: ChzRequest[]
  in_progress: ChzRequest[]
  archive: ChzRequest[]
}

interface ChzActionResponse {
  success?: boolean
  error?: string
  state?: ChzState
}

interface ChzTabProps {
  agentUrl: string
}

const CHZ_LIVE_REFRESH_INTERVAL_MS = 10_000

function requestKey(item: ChzRequest) {
  return item.request_key || String(item.request_id)
}

function normalizeSearchValue(value?: string | number | null) {
  return String(value || '').trim().toLowerCase()
}

async function fetchChzState(agentUrl: string, live = false): Promise<ChzState> {
  const res = await fetch(`${agentUrl}/api/call/get_chz_requests_view_state`, withAgentFetchOptions(agentUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ args: [live] }),
  }))
  if (!res.ok) throw new Error('Failed to fetch CHZ state')
  const payload = await res.json()
  if (payload?.error) throw new Error(String(payload.error))
  return payload
}

async function postChzAction(agentUrl: string, method: string, ids: string[]): Promise<ChzActionResponse> {
  const res = await fetch(`${agentUrl}/api/call/${method}`, withAgentFetchOptions(agentUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ args: [ids] }),
  }))
  if (!res.ok) throw new Error('Не удалось выполнить действие с запросами ЧЗ')
  const payload = (await res.json()) as ChzActionResponse
  if (payload.success === false || payload.error) {
    throw new Error(payload.error || 'Не удалось выполнить действие с запросами ЧЗ')
  }
  return payload
}

export function ChzTab({ agentUrl }: ChzTabProps) {
  const queryClient = useQueryClient()
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showArchive, setShowArchive] = useState(false)
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')
  const selection = useShiftSelection<string>({ setSelected: setSelectedIds })

  const {
    data: chzState,
    refetch: refetchChz,
  } = useQuery<ChzState>({
    queryKey: ['chz-state', agentUrl],
    queryFn: () => fetchChzState(agentUrl, true),
    staleTime: 0,
    gcTime: 30 * 60 * 1000,
    refetchInterval: CHZ_LIVE_REFRESH_INTERVAL_MS,
    refetchIntervalInBackground: true,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  })

  const newRequests = chzState?.new_requests || []
  const inProgress = chzState?.in_progress || []
  const archive = chzState?.archive || []

  const allRows = useMemo<ChzTableRow[]>(() => {
    const activeRows = [
      ...newRequests.map((item) => ({ ...item, workflow_status: 'new' as const })),
      ...inProgress.map((item) => ({ ...item, workflow_status: 'work' as const })),
    ]
    const archiveRows = archive.map((item) => ({ ...item, workflow_status: 'archive' as const }))
    return showArchive ? archiveRows : activeRows
  }, [archive, inProgress, newRequests, showArchive])

  const statusOptions = useMemo(() => {
    const map = new Map<string, string>()
    allRows.forEach((item) => {
      if (!item.status) return
      map.set(item.status, item.status_label || item.status)
    })
    return Array.from(map.entries()).map(([value, label]) => ({ value, label }))
  }, [allRows])

  const filteredRows = useMemo(() => {
    const query = normalizeSearchValue(search)
    return allRows.filter((item) => {
      if (statusFilter && item.status !== statusFilter) return false
      if (!query) return true
      const haystack = [
        item.type_label,
        item.order_number,
        item.order_name,
        item.author,
        item.item_title,
        item.item_size,
        item.batch_number,
        item.item_color,
        item.items_summary,
        item.comment,
        item.status_label,
        item.status,
        item.pairs_total,
      ]
        .map(normalizeSearchValue)
        .join(' ')
      return haystack.includes(query)
    })
  }, [allRows, search, statusFilter])

  const rows = usePaginatedRows(filteredRows, 40)
  const visibleIds = rows.visibleRows.map(requestKey)
  const selectedRows = useMemo(() => allRows.filter((item) => selectedIds.has(requestKey(item))), [allRows, selectedIds])
  const selectedNewIds = selectedRows.filter((item) => item.workflow_status === 'new').map(requestKey)
  const selectedWorkIds = selectedRows.filter((item) => item.workflow_status === 'work').map(requestKey)
  const selectedArchiveIds = selectedRows.filter((item) => item.workflow_status === 'archive').map(requestKey)
  const selectedActiveIds = selectedRows.filter((item) => item.workflow_status !== 'archive').map(requestKey)

  const clearSelection = () => selection.clearSelection()

  const toggleArchive = () => {
    setShowArchive((current) => !current)
    clearSelection()
  }

  const liveRefreshMutation = useMutation({
    mutationFn: () => fetchChzState(agentUrl, true),
    onMutate: () => {
      toast.info('Запросы ЧЗ обновляются')
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['chz-state', agentUrl], data)
      toast.success('Запросы ЧЗ обновлены')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const takeWorkMutation = useMutation({
    mutationFn: async () => {
      if (!selectedNewIds.length) {
        throw new Error('Выберите новые запросы ЧЗ')
      }
      return postChzAction(agentUrl, 'acknowledge_wms_chz_requests', selectedNewIds)
    },
    onMutate: () => {
      toast.info('Запросы ЧЗ переводятся в работу')
    },
    onSuccess: (payload) => {
      if (payload.state) queryClient.setQueryData(['chz-state', agentUrl], payload.state)
      toast.success('Запросы ЧЗ взяты в работу')
      clearSelection()
      void refetchChz()
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const readyMutation = useMutation({
    mutationFn: async () => {
      if (!selectedWorkIds.length) {
        throw new Error('Выберите запросы ЧЗ в работе')
      }
      return postChzAction(agentUrl, 'mark_wms_chz_requests_ready', selectedWorkIds)
    },
    onMutate: () => {
      toast.info('Готовность кодов отправляется в WMS')
    },
    onSuccess: (payload) => {
      if (payload.state) queryClient.setQueryData(['chz-state', agentUrl], payload.state)
      toast.success('WMS уведомлена о готовности кодов')
      clearSelection()
      void queryClient.invalidateQueries({ queryKey: ['chz-registry'] })
      void refetchChz()
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const archiveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedActiveIds.length) {
        throw new Error('Выберите запросы ЧЗ не из архива')
      }
      return postChzAction(agentUrl, 'archive_wms_chz_requests', selectedActiveIds)
    },
    onMutate: () => {
      toast.info('Запросы ЧЗ отправляются в архив')
    },
    onSuccess: (payload) => {
      if (payload.state) queryClient.setQueryData(['chz-state', agentUrl], payload.state)
      toast.success('Запросы ЧЗ перенесены в архив')
      clearSelection()
      void refetchChz()
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const restoreMutation = useMutation({
    mutationFn: async () => {
      if (!selectedArchiveIds.length) {
        throw new Error('Выберите архивные запросы ЧЗ')
      }
      return postChzAction(agentUrl, 'restore_wms_chz_requests', selectedArchiveIds)
    },
    onMutate: () => {
      toast.info('Запросы ЧЗ возвращаются из архива')
    },
    onSuccess: (payload) => {
      if (payload.state) queryClient.setQueryData(['chz-state', agentUrl], payload.state)
      toast.success('Запросы ЧЗ возвращены из архива')
      clearSelection()
      void refetchChz()
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const ids = Array.from(selectedIds)
      if (!ids.length) {
        throw new Error('Выберите запросы ЧЗ')
      }
      return postChzAction(agentUrl, 'delete_wms_chz_requests', ids)
    },
    onMutate: () => {
      toast.info('Запросы ЧЗ удаляются')
    },
    onSuccess: (payload) => {
      if (payload.state) queryClient.setQueryData(['chz-state', agentUrl], payload.state)
      toast.success('Выбранные запросы ЧЗ удалены')
      clearSelection()
      void refetchChz()
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  return (
    <div className="space-y-4">
      <MarkingTablePanel
        title="Запросы"
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
                  className="w-full sm:w-80"
                  placeholder="Поиск по заказу, автору, номенклатуре"
                  value={search}
                  onChange={setSearch}
                />
                <MarkingIconButton
                  label="Обновить"
                  onClick={() => liveRefreshMutation.mutate()}
                  disabled={liveRefreshMutation.isPending}
                >
                  <RefreshCw className={cn('h-4 w-4', liveRefreshMutation.isPending && 'animate-spin')} />
                </MarkingIconButton>
              </>
            }
            metrics={
              <>
                <MarkingMetric label="Новых" value={newRequests.length} tone="warning" />
                <MarkingMetric label="В работе" value={inProgress.length} tone="primary" />
                <MarkingMetric label="Архив" value={archive.length} tone="secondary" />
                <MarkingMetric label="Найдено" value={filteredRows.length} tone="neutral" />
                <MarkingMetric label="Показано" value={rows.shown} tone="neutral" />
                <MarkingMetric label="Выбрано" value={selectedIds.size} tone={selectedIds.size ? 'primary' : 'neutral'} />
              </>
            }
            actions={
              <>
                <MarkingIconButton
                  label={showArchive ? 'Рабочие' : 'Архив'}
                  variant={showArchive ? 'secondary' : 'outline'}
                  onClick={toggleArchive}
                >
                  <Archive className="h-4 w-4" />
                </MarkingIconButton>
                <MarkingIconButton
                  label="В работу"
                  variant="default"
                  onClick={() => takeWorkMutation.mutate()}
                  disabled={takeWorkMutation.isPending || selectedNewIds.length === 0}
                >
                  <ShieldCheck className="h-4 w-4" />
                </MarkingIconButton>
                <MarkingIconButton
                  label="Коды готовы"
                  onClick={() => readyMutation.mutate()}
                  disabled={readyMutation.isPending || selectedWorkIds.length === 0}
                >
                  <CheckCircle2 className="h-4 w-4" />
                </MarkingIconButton>
                <MarkingIconButton
                  label="В архив"
                  onClick={() => archiveMutation.mutate()}
                  disabled={archiveMutation.isPending || selectedActiveIds.length === 0}
                >
                  <Archive className="h-4 w-4" />
                </MarkingIconButton>
                <MarkingIconButton
                  label="Вернуть из архива"
                  onClick={() => restoreMutation.mutate()}
                  disabled={restoreMutation.isPending || selectedArchiveIds.length === 0}
                >
                  <RotateCcw className="h-4 w-4" />
                </MarkingIconButton>
                <MarkingIconButton
                  label="Удалить выбранные"
                  variant="danger"
                  onClick={() => deleteMutation.mutate()}
                  disabled={deleteMutation.isPending || selectedIds.size === 0}
                >
                  <Trash2 className="h-4 w-4" />
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
                      isSelected={visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id))}
                      onChange={() => selection.toggleAll(visibleIds)}
                      aria-label="Выбрать все запросы"
                    />
                  </TableHead>
                  <TableHead>Тип</TableHead>
                  <TableHead>Заказ №</TableHead>
                  <TableHead>Автор</TableHead>
                  <TableHead>Номенклатура</TableHead>
                  <TableHead>Размер</TableHead>
                  <TableHead>Партия</TableHead>
                  <TableHead>Цвет</TableHead>
                  <TableHead className="text-right">Кол-во</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead>Время</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.visibleRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={11} className="py-10 text-center text-muted-foreground">
                      {search || statusFilter ? 'Нет запросов по текущему фильтру' : 'Нет запросов'}
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.visibleRows.map((item, index) => {
                    const key = requestKey(item)
                    const isMultiPosition = (item.positions_count || 0) > 1

                    return (
                      <TableRow
                        key={key}
                        className={cn(
                          'cursor-pointer hover:bg-muted/40',
                          selectedIds.has(key) && 'bg-muted/60 hover:bg-muted/60',
                        )}
                        onClick={(event) => selection.toggleOne(visibleIds, key, index, event.shiftKey)}
                      >
                        <TableCell onClick={(event) => event.stopPropagation()}>
                          <Checkbox
                            isSelected={selectedIds.has(key)}
                            isReadOnly
                            aria-label={`Выбрать запрос ${item.order_number}`}
                            onContentClick={(event) => {
                              event.stopPropagation()
                              selection.toggleOne(visibleIds, key, index, event.shiftKey)
                            }}
                          />
                        </TableCell>
                        <TableCell>{item.type_label}</TableCell>
                        <TableCell className="font-medium">{item.order_number}</TableCell>
                        <TableCell>{item.author}</TableCell>
                        <TableCell className="min-w-72">
                          <div className="font-medium text-foreground">{item.items_summary || item.item_title}</div>
                          {isMultiPosition ? (
                            <div className="mt-1 text-xs text-muted-foreground">{item.positions_count} позиции</div>
                          ) : null}
                        </TableCell>
                        <TableCell>{isMultiPosition ? '-' : item.item_size}</TableCell>
                        <TableCell>{isMultiPosition ? '-' : item.batch_number}</TableCell>
                        <TableCell>{isMultiPosition ? '-' : item.item_color}</TableCell>
                        <TableCell className="text-right">{item.pairs_total}</TableCell>
                        <TableCell>
                          <MarkingStatusBadge status={item.status} label={item.status_label || item.status} />
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {item.requested_at_label}
                        </TableCell>
                      </TableRow>
                    )
                  })
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
            channel="chz"
            title="Запросы ЧЗ"
          />
        </div>
      </details>
    </div>
  )
}
