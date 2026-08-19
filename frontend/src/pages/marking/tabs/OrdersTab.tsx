// src/pages/marking/tabs/OrdersTab.tsx

import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from '@/lib/toast'
import { Button } from '@/components/ui/button'
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
import { ListPlus, Play, RefreshCw, RotateCcw, Trash2, X } from 'lucide-react'
import {
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

interface OrderItem {
  uid: string
  order_name: string
  simpl_name: string
  gtin: string
  size: string
  color: string
  venchik: string
  units_per_pack: string
  codes_count: number
  full_name?: string
  tnved_code?: string
}

interface OrdersState {
  queue: OrderItem[]
  session_orders: any[]
  history: any[]
  deleted_orders?: any[]
}

interface OptionsResponse {
  simplified_options: string[]
  color_options: string[]
  size_options: string[]
  units_options: (string | number)[]
  venchik_options: string[]
}

interface OrdersTabProps {
  agentUrl: string
}

export function OrdersTab({ agentUrl }: OrdersTabProps) {
  const queryClient = useQueryClient()

  // ===== Состояния =====
  const [mode, setMode] = useState<'params' | 'gtin'>('params')
  const [orderName, setOrderName] = useState('')
  const [productName, setProductName] = useState('')
  const [gtin, setGtin] = useState('')
  const [size, setSize] = useState('')
  const [color, setColor] = useState('')
  const [venchik, setVenchik] = useState('')
  const [unitsPerPack, setUnitsPerPack] = useState('')
  const [codesCount, setCodesCount] = useState(1)
  const [selectedQueueId, setSelectedQueueId] = useState<string>('')

  // История с постепенной отрисовкой
  const [historySearch, setHistorySearch] = useState('')
  const [showDeleted, setShowDeleted] = useState(false)
  const [selectedHistoryId, setSelectedHistoryId] = useState<string>('')

  // ===== React Query =====
  const { data: options } = useQuery<OptionsResponse>({
    queryKey: ['marking-options'],
    queryFn: async () => {
      const res = await fetch(`${agentUrl}/api/call/get_options`, withAgentFetchOptions(agentUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ args: [] }),
      }))
      if (!res.ok) throw new Error('Failed to fetch options')
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
  })

  const {
    data: ordersState,
    refetch: refetchOrders,
    isLoading,
  } = useQuery<OrdersState>({
    queryKey: ['orders-state'],
    queryFn: async () => {
      const res = await fetch(`${agentUrl}/api/call/get_orders_view_state`, withAgentFetchOptions(agentUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ args: [false] }),
      }))
      if (!res.ok) throw new Error('Failed to fetch orders state')
      return res.json()
    },
    staleTime: 10 * 1000,
  })

  const queue = ordersState?.queue || []
  const history = ordersState?.history || []
  const deletedOrders = ordersState?.deleted_orders || []

  // ===== Фильтрация истории =====
  const filteredHistory = useMemo(() => {
    const search = historySearch.trim().toLowerCase()
    const items = showDeleted ? deletedOrders : history
    if (!search) return items
    return items.filter((item: any) => {
      const haystack = [
        item.order_name,
        item.full_name,
        item.gtin,
        item.status,
      ].filter(Boolean).join(' ').toLowerCase()
      return haystack.includes(search)
    })
  }, [history, deletedOrders, historySearch, showDeleted])

  const historyRows = useIncrementalRows(filteredHistory, 30)

  // ===== Мутации =====
  const addToQueueMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        args: [{
          order_name: orderName,
          name: productName,
          gtin: mode === 'gtin' ? gtin : '',
          size,
          color,
          venchik,
          units_per_pack: unitsPerPack,
          codes_count: codesCount,
          mode,
        }],
      }
      const res = await fetch(`${agentUrl}/api/call/add_order_item`, withAgentFetchOptions(agentUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }))
      if (!res.ok) throw new Error('Failed to add order item')
      return res.json()
    },
    onSuccess: (data) => {
      if (data.success) {
        toast.success('Товар добавлен в очередь')
        queryClient.setQueryData(['orders-state'], (old: OrdersState | undefined) => {
          if (!old) return old
          return { ...old, queue: data.queue }
        })
        setOrderName('')
        setProductName('')
        setGtin('')
      } else {
        toast.error(data.error || 'Ошибка при добавлении')
      }
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const submitQueueMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${agentUrl}/api/call/submit_order_queue`, withAgentFetchOptions(agentUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ args: [] }),
      }))
      if (!res.ok) throw new Error('Failed to submit queue')
      return res.json()
    },
    onSuccess: () => {
      toast.success('Очередь выполнена')
      refetchOrders()
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const clearQueueMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${agentUrl}/api/call/clear_order_queue`, withAgentFetchOptions(agentUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ args: [] }),
      }))
      if (!res.ok) throw new Error('Failed to clear queue')
      return res.json()
    },
    onSuccess: (data) => {
      toast.success('Очередь очищена')
      queryClient.setQueryData(['orders-state'], (old: OrdersState | undefined) => {
        if (!old) return old
        return { ...old, queue: data.queue || [] }
      })
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const removeFromQueueMutation = useMutation({
    mutationFn: async (uid: string) => {
      const res = await fetch(`${agentUrl}/api/call/remove_order_item`, withAgentFetchOptions(agentUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ args: [uid] }),
      }))
      if (!res.ok) throw new Error('Failed to remove order item')
      return res.json()
    },
    onSuccess: (data) => {
      toast.success('Позиция удалена из очереди')
      queryClient.setQueryData(['orders-state'], (old: OrdersState | undefined) => {
        if (!old) return old
        return { ...old, queue: data.queue || [] }
      })
      setSelectedQueueId('')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const deleteOrderMutation = useMutation({
    mutationFn: async (documentId: string) => {
      const res = await fetch(`${agentUrl}/api/call/delete_order`, withAgentFetchOptions(agentUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ args: [documentId] }),
      }))
      if (!res.ok) throw new Error('Failed to delete order')
      return res.json()
    },
    onSuccess: () => {
      toast.success('Заказ перемещён в удалённые')
      refetchOrders()
      setSelectedHistoryId('')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const restoreDeletedMutation = useMutation({
    mutationFn: async (documentId: string) => {
      const res = await fetch(`${agentUrl}/api/call/restore_deleted_order`, withAgentFetchOptions(agentUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ args: [documentId] }),
      }))
      if (!res.ok) throw new Error('Failed to restore order')
      return res.json()
    },
    onSuccess: () => {
      toast.success('Заказ восстановлен')
      refetchOrders()
      setSelectedHistoryId('')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  // ===== Обработчики =====
  const handleAddToQueue = () => {
    if (!orderName.trim()) {
      toast.error('Введите название заявки')
      return
    }
    if (mode === 'params' && !productName.trim()) {
      toast.error('Введите название товара')
      return
    }
    if (mode === 'gtin' && !gtin.trim()) {
      toast.error('Введите GTIN')
      return
    }
    addToQueueMutation.mutate()
  }

  const handleRemoveFromQueue = () => {
    if (!selectedQueueId) {
      toast.error('Выберите позицию в очереди')
      return
    }
    removeFromQueueMutation.mutate(selectedQueueId)
  }

  const handleDeleteHistory = () => {
    if (!selectedHistoryId) {
      toast.error('Выберите заказ в истории')
      return
    }
    deleteOrderMutation.mutate(selectedHistoryId)
  }

  const handleRestoreDeleted = () => {
    if (!selectedHistoryId) {
      toast.error('Выберите удалённый заказ')
      return
    }
    restoreDeletedMutation.mutate(selectedHistoryId)
  }

  // ===== Рендер =====
  if (isLoading) {
    return (
      <MarkingPanel title="Заказ кодов">
        <div className="py-10 text-center text-sm text-muted-foreground">Загрузка...</div>
      </MarkingPanel>
    )
  }

  // Компонент очереди
  const renderQueueTable = () => (
    <div className="overflow-auto rounded-md border border-border">
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-card">
          <TableRow>
            <TableHead>Заявка</TableHead>
            <TableHead>Товар</TableHead>
            <TableHead>GTIN</TableHead>
            <TableHead className="text-right">Кодов</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {queue.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                Очередь пуста
              </TableCell>
            </TableRow>
          ) : (
            queue.map((item) => (
              <TableRow
                key={item.uid}
                className={cn(
                  'cursor-pointer hover:bg-muted/40',
                  selectedQueueId === item.uid && 'bg-muted/60'
                )}
                onClick={() => setSelectedQueueId(item.uid)}
              >
                <TableCell className="min-w-44 font-medium">{item.order_name}</TableCell>
                <TableCell className="min-w-56">{item.simpl_name}</TableCell>
                <TableCell className="font-mono text-xs">{item.gtin || '—'}</TableCell>
                <TableCell className="text-right">{item.codes_count}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )

  // Компонент истории
  const renderHistoryTable = (fullscreen = false) => (
    <>
      <Table>
        <TableHeader className="sticky top-0 bg-background z-10">
          <TableRow>
            <TableHead>Заявка</TableHead>
            <TableHead>Наименование</TableHead>
            <TableHead>Статус</TableHead>
            <TableHead>GTIN</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {historyRows.visibleRows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                {showDeleted ? 'Нет удалённых заказов' : 'История пуста'}
              </TableCell>
            </TableRow>
          ) : (
            historyRows.visibleRows.map((item: any) => (
              <TableRow
                key={item.document_id}
                className={cn(
                  'cursor-pointer hover:bg-muted/40',
                  selectedHistoryId === item.document_id && 'bg-muted/60'
                )}
                onClick={() => setSelectedHistoryId(item.document_id)}
              >
                <TableCell className="min-w-44 font-medium">{item.order_name}</TableCell>
                <TableCell className="min-w-80">{item.full_name || '—'}</TableCell>
                <TableCell><MarkingStatusBadge status={item.status || '—'} /></TableCell>
                <TableCell className="font-mono text-xs">{item.gtin || '—'}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      <MarkingLoadMore
        markerRef={historyRows.markerRef}
        hasMore={historyRows.hasMore}
        shown={historyRows.shown}
        total={historyRows.total}
      />
      {fullscreen && selectedHistoryId && (
        <div className="border-t border-border px-4 py-3 text-sm text-muted-foreground">
          Выбрана запись: <span className="font-medium text-foreground">{selectedHistoryId}</span>
        </div>
      )}
    </>
  )

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(420px,1.05fr)]">
        <MarkingPanel
          title="Новая заявка"
          actions={
            <MarkingToolbar>
              <Button variant={mode === 'params' ? 'default' : 'outline'} onClick={() => setMode('params')} size="sm">
                По параметрам
              </Button>
              <Button variant={mode === 'gtin' ? 'default' : 'outline'} onClick={() => setMode('gtin')} size="sm">
                По GTIN
              </Button>
            </MarkingToolbar>
          }
        >
          <div className="grid gap-3 md:grid-cols-2">
            <MarkingField label="Название заявки" className="md:col-span-2">
              <Input
                value={orderName}
                onChange={(e) => setOrderName(e.target.value)}
                placeholder="Например: лат диаг S 260316"
              />
            </MarkingField>

            {mode === 'params' ? (
              <>
                <MarkingField label="Название товара" className="md:col-span-2">
                  <Input
                    value={productName}
                    onChange={(e) => setProductName(e.target.value)}
                    placeholder="Выберите товар"
                    list="product-options"
                  />
                  <datalist id="product-options">
                    {(options?.simplified_options || []).map((name) => (
                      <option key={name} value={name} />
                    ))}
                  </datalist>
                </MarkingField>
                <MarkingField label="Размер">
                  <SelectNative value={size} onChange={(e) => setSize(e.target.value)}>
                    <option value="">Выберите</option>
                    {(options?.size_options || []).map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </SelectNative>
                </MarkingField>
                <MarkingField label="Цвет">
                  <SelectNative value={color} onChange={(e) => setColor(e.target.value)}>
                    <option value="">Не выбран</option>
                    {(options?.color_options || []).map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </SelectNative>
                </MarkingField>
                <MarkingField label="Венчик">
                  <SelectNative value={venchik} onChange={(e) => setVenchik(e.target.value)}>
                    <option value="">Без венчика</option>
                    {(options?.venchik_options || []).map((v) => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </SelectNative>
                </MarkingField>
                <MarkingField label="Ед. в упаковке">
                  <SelectNative value={unitsPerPack} onChange={(e) => setUnitsPerPack(e.target.value)}>
                    <option value="">Выберите</option>
                    {(options?.units_options || []).map((u) => (
                      <option key={String(u)} value={String(u)}>{u}</option>
                    ))}
                  </SelectNative>
                </MarkingField>
              </>
            ) : (
              <MarkingField label="GTIN" className="md:col-span-2">
                <Input value={gtin} onChange={(e) => setGtin(e.target.value)} placeholder="Введите GTIN" />
              </MarkingField>
            )}

            <MarkingField label="Количество кодов">
              <Input
                type="number"
                min={1}
                value={codesCount}
                onChange={(e) => setCodesCount(Number(e.target.value))}
              />
            </MarkingField>
          </div>

          <MarkingToolbar className="border-t border-border pt-4">
            <Button onClick={handleAddToQueue} disabled={addToQueueMutation.isPending} size="sm">
              <ListPlus className="h-4 w-4" />
              Добавить
            </Button>
            <Button
              variant="outline"
              onClick={() => submitQueueMutation.mutate()}
              disabled={submitQueueMutation.isPending || queue.length === 0}
              size="sm"
            >
              <Play className="h-4 w-4" />
              Выполнить
            </Button>
            <Button
              variant="outline"
              onClick={handleRemoveFromQueue}
              disabled={removeFromQueueMutation.isPending || !selectedQueueId}
              size="sm"
            >
              <X className="h-4 w-4" />
              Удалить
            </Button>
            <Button
              variant="outline"
              onClick={() => clearQueueMutation.mutate()}
              disabled={clearQueueMutation.isPending || queue.length === 0}
              size="sm"
            >
              <Trash2 className="h-4 w-4" />
              Очистить
            </Button>
          </MarkingToolbar>
        </MarkingPanel>

        <div className="space-y-4">
          <MarkingPanel
            title="Очередь"
            stats={
              <>
                <MarkingMetric label="Позиции" value={queue.length} tone="secondary" />
                {selectedQueueId && <MarkingMetric label="Выбрано" value="1" tone="primary" />}
              </>
            }
          >
            {renderQueueTable()}
          </MarkingPanel>

          <MarkingLogPanel
            agentUrl={agentUrl}
            channel="orders"
            title="Лог заказа кодов"
            description="Создание очереди, отправка заявок и ответы локальной утилиты."
          />
        </div>
      </div>

      <MarkingTablePanel
        title={showDeleted ? 'Удаленные заказы' : 'История заказов'}
        maxHeight="max-h-[620px]"
        stats={
          <>
            <MarkingMetric label="Найдено" value={filteredHistory.length} tone="secondary" />
            {selectedHistoryId && <MarkingMetric label="Выбрано" value="1" tone="primary" />}
          </>
        }
        actions={
          <MarkingToolbar>
            <SearchInput
              className="w-full sm:w-64"
              placeholder="Поиск"
              value={historySearch}
              onChange={setHistorySearch}
            />
            <Button variant="outline" size="sm" onClick={() => refetchOrders()}>
              <RefreshCw className="h-4 w-4" />
              Обновить
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDeleteHistory}
              disabled={deleteOrderMutation.isPending || !selectedHistoryId || showDeleted}
            >
              <Trash2 className="h-4 w-4" />
              Удалить
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowDeleted(!showDeleted)}>
              {showDeleted ? 'Активные' : 'Удаленные'}
            </Button>
            {showDeleted && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleRestoreDeleted}
                disabled={restoreDeletedMutation.isPending || !selectedHistoryId}
              >
                <RotateCcw className="h-4 w-4" />
                Вернуть
              </Button>
            )}
          </MarkingToolbar>
        }
      >
        {({ fullscreen }) => renderHistoryTable(fullscreen)}
      </MarkingTablePanel>
    </div>
  )
}
