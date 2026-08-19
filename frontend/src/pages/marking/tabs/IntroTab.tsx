// src/pages/marking/tabs/IntroTab.tsx

import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from '@/lib/toast'
import { Button } from '@/components/ui/button'
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
import { Play, RefreshCw } from 'lucide-react'
import {
  inputDateValue,
  MarkingField,
  MarkingLoadMore,
  MarkingMetric,
  MarkingPanel,
  MarkingStatusBadge,
  MarkingTablePanel,
  MarkingToolbar,
  useIncrementalRows,
} from '../marking-ui'
import { MarkingLogPanel } from '../components/MarkingLogPanel'
import { withAgentFetchOptions } from '../agentFetch'

interface IntroItem {
  document_id: string
  order_name: string
  full_name: string
  gtin: string
  status: string
  status_summary?: string
}

interface IntroState {
  items: IntroItem[]
}

interface IntroTabProps {
  agentUrl: string
}

export function IntroTab({ agentUrl }: IntroTabProps) {
  const queryClient = useQueryClient()

  const [selectedId, setSelectedId] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [productionDate, setProductionDate] = useState(() => inputDateValue())
  const [expirationDate, setExpirationDate] = useState(() => inputDateValue(2))
  const [batchNumber, setBatchNumber] = useState('')

  const {
    data: introState,
    refetch: refetchIntro,
    isLoading,
  } = useQuery<IntroState>({
    queryKey: ['intro-state'],
    queryFn: async () => {
      const res = await fetch(`${agentUrl}/api/call/get_intro_state`, withAgentFetchOptions(agentUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ args: [] }),
      }))
      if (!res.ok) throw new Error('Failed to fetch intro state')
      return res.json()
    },
    staleTime: 10 * 1000,
  })

  const items = introState?.items || []

  const statusOptions = useMemo(() => {
    const statuses = new Set<string>()
    items.forEach((item) => {
      if (item.status) statuses.add(item.status)
    })
    return Array.from(statuses).sort()
  }, [items])

  const filteredItems = useMemo(() => {
    let result = items

    if (statusFilter) {
      result = result.filter((item) => item.status === statusFilter)
    }

    const query = searchQuery.trim().toLowerCase()
    if (query) {
      result = result.filter((item) => {
        const haystack = [
          item.order_name,
          item.full_name,
          item.gtin,
          item.document_id,
        ].filter(Boolean).join(' ').toLowerCase()
        return haystack.includes(query)
      })
    }

    return result
  }, [items, searchQuery, statusFilter])

  const rows = useIncrementalRows(filteredItems, 30)

  const introMutation = useMutation({
    mutationFn: async () => {
      if (!selectedId) {
        throw new Error('Выберите заказ для ввода в оборот')
      }

      const res = await fetch(`${agentUrl}/api/call/introduce_orders`, withAgentFetchOptions(agentUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          args: [
            [selectedId],
            productionDate || null,
            expirationDate || null,
            batchNumber || null,
          ],
        }),
      }))
      if (!res.ok) throw new Error('Failed to introduce orders')
      return res.json()
    },
    onSuccess: () => {
      toast.success('Ввод в оборот выполнен')
      refetchIntro()
      setSelectedId('')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const refreshMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${agentUrl}/api/call/get_intro_state`, withAgentFetchOptions(agentUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ args: [] }),
      }))
      if (!res.ok) throw new Error('Failed to refresh intro state')
      return res.json()
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['intro-state'], data)
      toast.success('Список заказов обновлён')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const selectedItem = items.find((item) => item.document_id === selectedId)

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
      <div className="space-y-4">
      <MarkingPanel
        title="Параметры ввода в оборот"
        stats={selectedItem ? <MarkingMetric label="Выбран" value={selectedItem.order_name} tone="primary" /> : undefined}
        actions={
          <Button onClick={() => introMutation.mutate()} disabled={introMutation.isPending || !selectedId} size="sm">
            <Play className="h-4 w-4" />
            {introMutation.isPending ? 'Выполняется...' : 'Выполнить'}
          </Button>
        }
      >
        <div className="grid gap-3 md:grid-cols-3">
          <MarkingField label="Дата производства">
            <DateInput value={productionDate} onChange={setProductionDate} aria-label="Дата производства" />
          </MarkingField>
          <MarkingField label="Срок годности">
            <DateInput value={expirationDate} onChange={setExpirationDate} aria-label="Срок годности" />
          </MarkingField>
          <MarkingField label="Номер партии">
            <Input value={batchNumber} onChange={(e) => setBatchNumber(e.target.value)} placeholder="Введите номер партии" />
          </MarkingField>
        </div>
      </MarkingPanel>

      <MarkingTablePanel
        title="Готовые заявки"
        maxHeight="max-h-[620px]"
        stats={
          <>
            <MarkingMetric label="Найдено" value={filteredItems.length} tone="secondary" />
            <MarkingMetric label="Показано" value={rows.shown} tone="neutral" />
          </>
        }
        actions={
          <MarkingToolbar>
            <SelectNative value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-44">
              <option value="">Все статусы</option>
              {statusOptions.map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </SelectNative>
            <SearchInput
              className="w-full sm:w-64"
              placeholder="Поиск"
              value={searchQuery}
              onChange={setSearchQuery}
            />
            <Button variant="outline" onClick={() => refreshMutation.mutate()} disabled={refreshMutation.isPending} size="sm">
              <RefreshCw className="h-4 w-4" />
              {refreshMutation.isPending ? 'Обновление...' : 'Обновить'}
            </Button>
          </MarkingToolbar>
        }
      >
        {() => (
          <>
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-background">
                <TableRow>
                  <TableHead>Заявка</TableHead>
                  <TableHead>Наименование</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead>GTIN</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">Загрузка...</TableCell>
                  </TableRow>
                ) : rows.visibleRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                      {searchQuery || statusFilter ? 'Нет заказов по текущему фильтру' : 'Нет заказов, готовых к вводу в оборот'}
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.visibleRows.map((item) => (
                    <TableRow
                      key={item.document_id}
                      className={cn('cursor-pointer hover:bg-muted/40', selectedId === item.document_id && 'bg-muted/60')}
                      onClick={() => setSelectedId(item.document_id)}
                    >
                      <TableCell className="min-w-44 font-medium">{item.order_name}</TableCell>
                      <TableCell className="min-w-80">{item.full_name || '—'}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-2">
                          <MarkingStatusBadge status={item.status || '—'} />
                          {item.status_summary && <span className="text-xs text-muted-foreground">{item.status_summary}</span>}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{item.gtin || '—'}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            <MarkingLoadMore markerRef={rows.markerRef} hasMore={rows.hasMore} shown={rows.shown} total={rows.total} />
          </>
        )}
      </MarkingTablePanel>
      </div>

      <MarkingLogPanel
        agentUrl={agentUrl}
        channel="intro"
        title="Лог ввода в оборот"
        description="Подписание документов, отправка и ошибки по выбранным заказам."
      />
    </div>
  )
}
