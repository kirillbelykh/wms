import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowRight,
  Calendar,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Filter,
  MapPin,
  Package,
  User,
  X,
  Undo2,
} from 'lucide-react'

import { getHistory, rollbackHistory } from '@/api/client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DateInput } from '@/components/ui/date-picker'
import { Input, SelectNative } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatDate, getErrorMessage } from '@/lib/utils'
import type { HistoryLog } from '@/types/wms'
import { toast } from '@/lib/toast'

const PAGE_SIZE = 50

const OPERATION_LABELS: Record<string, string> = {
  replenish: 'Пополнение',
  withdraw: 'Списание',
  stock_withdraw: 'Списание',
  move: 'Перемещение',
  update_stock: 'Изменение остатка',
  delete_stock: 'Удаление остатка',
  create_order: 'Создание заказа',
  update_order: 'Изменение заказа',
  delete_order: 'Удаление заказа',
  ship_order: 'Отгрузка заказа',
  start_picking: 'Начало отбора',
  pick: 'Отбор',
  complete_picking: 'Завершение отбора',
  cancel_picking: 'Отмена отбора',
  delete_pick: 'Удаление операции отбора',
  update_pick: 'Изменение операции отбора',
  update_suggested_stock: 'Изменение рекомендованной ячейки',
  create_chz_request: 'Запрос ЧЗ',
  mark_chz_ready: 'Коды ЧЗ готовы',
  create_production_order: 'Создание задания на производство',
  update_production_order: 'Изменение задания на производство',
  delete_production_order: 'Удаление задания на производство',
  update_production_item_progress: 'Изменение факта производства',
  create_production_supply_request: 'Запрос ресурсов для производства',
  create_production_supply_request_auto: 'Автозапрос ресурсов для производства',
  start_production_supply_request: 'Запуск складского задания производства',
  create_production_receipt_request: 'Создание задания на приемку ГП',
  fulfill_production_supply_request: 'Передача ресурсов в производство',
  start_production: 'Запуск производства',
  complete_production: 'Завершение производства',
  transfer_production_to_stock: 'Передача продукции на склад',
  create_production_chz_request: 'Запрос ЧЗ для производства',
}

OPERATION_LABELS.create_manual_chz_request = 'Ручной запрос ЧЗ'
OPERATION_LABELS.update_production_item_batch_date = 'Изменение партии и даты производства'
OPERATION_LABELS.rollback_operation = 'Откат операции'

const OPERATION_TONES: Record<string, 'success' | 'danger' | 'warning' | 'primary' | 'neutral' | 'secondary' | 'info'> = {
  replenish: 'success',
  withdraw: 'danger',
  stock_withdraw: 'danger',
  move: 'warning',
  update_stock: 'secondary',
  delete_stock: 'danger',
  create_order: 'success',
  update_order: 'warning',
  delete_order: 'danger',
  ship_order: 'success',
  start_picking: 'primary',
  pick: 'primary',
  complete_picking: 'success',
  cancel_picking: 'warning',
  delete_pick: 'danger',
  update_pick: 'warning',
  update_suggested_stock: 'secondary',
  create_chz_request: 'info',
  mark_chz_ready: 'success',
  create_production_order: 'success',
  update_production_order: 'warning',
  delete_production_order: 'danger',
  update_production_item_progress: 'warning',
  create_production_supply_request: 'info',
  create_production_supply_request_auto: 'info',
  start_production_supply_request: 'warning',
  create_production_receipt_request: 'primary',
  fulfill_production_supply_request: 'success',
  start_production: 'warning',
  complete_production: 'success',
  transfer_production_to_stock: 'primary',
  create_production_chz_request: 'info',
}

OPERATION_TONES.create_manual_chz_request = 'info'
OPERATION_TONES.rollback_operation = 'warning'

function getUserName(log: HistoryLog) {
  if (log.user_username) return log.user_username
  if (log.user_email) return log.user_email
  return 'Система'
}

function getString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function getNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function getMoveRoute(details?: Record<string, unknown> | null) {
  if (!details) return null
  const fromWarehouse = getString(details.from_warehouse)
  const fromCell = getString(details.from_cell)
  const toWarehouse = getString(details.to_warehouse)
  const toCell = getString(details.to_cell)
  if (!fromCell && !toCell) return null
  const fromLabel = [fromWarehouse, fromCell].filter(Boolean).join(' - ') || 'Не указано'
  const toLabel = [toWarehouse, toCell].filter(Boolean).join(' - ') || 'Не указано'
  return { fromLabel, toLabel }
}

function translateRequestType(value: string | null) {
  if (value === 'raw_material') return 'Сырье'
  if (value === 'consumable') return 'Упаковка'
  if (value === 'finished_goods_receipt') return 'Приемка ГП'
  return value
}

function formatUnknown(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'Да' : 'Нет'
  if (typeof value === 'number') return String(value)
  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) return formatDate(value)
    return value
  }
  if (Array.isArray(value)) return value.map(formatUnknown).join(', ')
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function translateChangeKey(key: string) {
  switch (key) {
    case 'approved':
      return 'Согласование'
    case 'shipping_date':
      return 'Дата отгрузки'
    case 'actual_shipping_date':
      return 'Фактическая дата отгрузки'
    case 'customer':
      return 'Клиент'
    case 'supplier':
      return 'Поставщик'
    case 'comment':
      return 'Комментарий'
    case 'invoice':
      return 'Накладная'
    case 'transport_company':
      return 'Транспортная компания'
    case 'priority':
      return 'Приоритет'
    case 'status':
      return 'Статус'
    case 'order_type':
      return 'Тип заказа'
    case 'batch_number':
      return 'Партия'
    case 'production_date':
      return 'Дата производства'
    default:
      return key
  }
}

function buildShortDescription(log: HistoryLog) {
  const details = log.details ?? {}
  const route = getMoveRoute(details)

  switch (log.operation_type) {
    case 'move':
      return route ? `${route.fromLabel} → ${route.toLabel}` : 'Перемещение между ячейками'
    case 'replenish':
      return log.cell_coord && log.warehouse_name ? `${log.warehouse_name} - ${log.cell_coord}` : 'Пополнение ячейки'
    case 'withdraw':
    case 'stock_withdraw':
      return log.cell_coord && log.warehouse_name ? `${log.warehouse_name} - ${log.cell_coord}` : 'Списание из ячейки'
    case 'pick':
      return getString(details.order_name) ? `Заказ ${getString(details.order_name)}` : 'Отбор для заказа'
    case 'create_order':
    case 'update_order':
    case 'delete_order':
    case 'ship_order':
      return getString(details.order_name) ? `Заказ ${getString(details.order_name)}` : 'Работа с заказом'
    case 'create_production_order':
      return getString(details.name) ? `Задание ${getString(details.name)}` : 'Создано производственное задание'
    case 'delete_production_order':
      return getString(details.name) ? `Задание ${getString(details.name)}` : 'Удалено производственное задание'
    case 'create_production_supply_request': {
      const type = translateRequestType(getString(details.request_type))
      return type ? `Запрошено: ${type}` : 'Запрошены ресурсы'
    }
    case 'start_production':
      return getString(details.batch_number) ? `Партия ${getString(details.batch_number)}` : 'Производство запущено'
    default:
      return getString(details.order_name) || getString(details.name) || log.item_title || 'Подробности в карточке'
  }
}

function buildDetailRows(log: HistoryLog) {
  const details = log.details ?? {}
  const rows: Array<{ label: string; value: string }> = []
  const route = getMoveRoute(details)

  if (log.item_title) rows.push({ label: 'Номенклатура', value: log.item_title })
  if (log.quantity !== null && log.quantity !== undefined) rows.push({ label: 'Количество', value: String(log.quantity) })

  if (log.warehouse_name || log.cell_coord) {
    rows.push({
      label: 'Место',
      value: [log.warehouse_name, log.cell_coord].filter(Boolean).join(' - ') || '—',
    })
  }

  if (route) {
    rows.push({ label: 'Откуда', value: route.fromLabel })
    rows.push({ label: 'Куда', value: route.toLabel })
  }

  const orderName = getString(details.order_name)
  if (orderName) rows.push({ label: 'Заказ', value: orderName })

  const customer = getString(details.customer)
  if (customer) rows.push({ label: 'Клиент', value: customer })

  const batch = getString(details.batch)
  if (batch) rows.push({ label: 'Партия', value: batch })

  const size = getString(details.size)
  if (size) rows.push({ label: 'Размер', value: size })

  const color = getString(details.color)
  if (color) rows.push({ label: 'Цвет', value: color })

  const venchik = getString(details.venchik)
  if (venchik) rows.push({ label: 'Венчик', value: venchik })

  const remaining = getNumber(details.remaining)
  if (remaining !== null) rows.push({ label: 'Осталось после операции', value: String(remaining) })

  const oldQuantity = getNumber(details.old_quantity)
  if (oldQuantity !== null) rows.push({ label: 'Было', value: String(oldQuantity) })

  const newQuantity = getNumber(details.new_quantity)
  if (newQuantity !== null) rows.push({ label: 'Стало', value: String(newQuantity) })

  const pairsPerBox = getNumber(details.pairs_per_box)
  if (pairsPerBox !== null) rows.push({ label: 'Единиц в коробке', value: String(pairsPerBox) })

  const requestType = translateRequestType(getString(details.request_type))
  if (requestType) rows.push({ label: 'Тип запроса', value: requestType })

  const actualShippingDate = getString(details.actual_shipping_date)
  if (actualShippingDate) rows.push({ label: 'Фактическая отгрузка', value: formatDate(actualShippingDate) })

  const changes = details.changes
  if (changes && typeof changes === 'object' && !Array.isArray(changes)) {
    for (const [key, value] of Object.entries(changes as Record<string, unknown>)) {
      rows.push({ label: `Изменение: ${translateChangeKey(key)}`, value: formatUnknown(value) })
    }
  }

  const extraKeys = [
    ['production_order_id', 'Заказ на производство'],
    ['production_order_item_id', 'Позиция производства'],
    ['request_id', 'Запрос ЧЗ'],
    ['supply_request_id', 'Заявка на ресурсы'],
    ['operation_id', 'Операция отбора'],
    ['new_stock_id', 'Новая рекомендуемая ячейка'],
    ['source_stock_id', 'Исходный остаток'],
    ['order_id', 'ID заказа'],
  ] as const

  for (const [key, label] of extraKeys) {
    const value = details[key]
    if (value !== null && value !== undefined && value !== '') {
      rows.push({ label, value: formatUnknown(value) })
    }
  }

  return rows
}

export function HistoryPage() {
  const queryClient = useQueryClient()
  const [operationType, setOperationType] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [selectedLog, setSelectedLog] = useState<HistoryLog | null>(null)
  const [page, setPage] = useState(0)

  useEffect(() => {
    setPage(0)
  }, [operationType, fromDate, toDate])

  const { data: historyPage, isLoading, isFetching } = useQuery({
    queryKey: ['history', { operationType, fromDate, toDate, page }],
    queryFn: () =>
      getHistory({
        operation_type: operationType || undefined,
        from_date: fromDate || undefined,
        to_date: toDate || undefined,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      }),
  })

  const rollbackMutation = useMutation({
    mutationFn: async (logId: number) => rollbackHistory(logId),
    onSuccess: async () => {
      toast.success('Операция откатена')
      await queryClient.invalidateQueries({ queryKey: ['history'] })
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  const logs = historyPage?.items ?? []
  const total = historyPage?.total ?? 0
  const pageStart = total === 0 ? 0 : page * PAGE_SIZE + 1
  const pageEnd = total === 0 ? 0 : Math.min(page * PAGE_SIZE + logs.length, total)
  const canGoPrev = page > 0
  const canGoNext = pageEnd < total

  const pageLabel = useMemo(() => {
    if (total === 0) return 'Нет записей'
    return `${pageStart}-${pageEnd} из ${total}`
  }, [pageEnd, pageStart, total])

  const resetFilters = () => {
    setOperationType('')
    setFromDate('')
    setToDate('')
  }

  const handleRollback = async (log: HistoryLog) => {
    await rollbackMutation.mutateAsync(log.id)
    if (selectedLog?.id === log.id) {
      setSelectedLog(null)
    }
  }

  return (
    <section className="page-shell space-y-5">
      <Card>
        <Card.Content className="grid gap-3 pt-5 md:grid-cols-[1fr_auto]">
          <div className="flex flex-wrap gap-2">
            <Button variant={showFilters ? 'default' : 'outline'} size="sm" onClick={() => setShowFilters((current) => !current)}>
              <Filter className="mr-1 h-4 w-4" />
              Фильтры
            </Button>
            {(operationType || fromDate || toDate) ? (
              <Button variant="ghost" size="sm" onClick={resetFilters}>
                <X className="mr-1 h-3 w-3" />
                Сбросить
              </Button>
            ) : null}
          </div>
        </Card.Content>

        {showFilters ? (
          <Card.Content className="border-t pt-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <Label>Тип операции</Label>
                <SelectNative value={operationType} onChange={(event) => setOperationType(event.target.value)}>
                  <option value="">Все</option>
                  {Object.entries(OPERATION_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </SelectNative>
              </div>
              <div>
                <DateInput label="С даты" value={fromDate} onChange={setFromDate} />
              </div>
              <div>
                <DateInput label="По дату" value={toDate} onChange={setToDate} />
              </div>
            </div>
          </Card.Content>
        ) : null}
      </Card>

      <Card>
        <Card.Content className="space-y-4 pt-5">
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, index) => (
                <Skeleton key={index} className="h-12" />
              ))}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Дата</TableHead>
                      <TableHead>Операция</TableHead>
                      <TableHead>Пользователь</TableHead>
                      <TableHead>Объект</TableHead>
                      <TableHead>Подробности</TableHead>
                      <TableHead className="text-right">Действие</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.map((log) => (
                      <TableRow key={log.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedLog(log)}>
                        <TableCell className="whitespace-nowrap text-xs">{formatDate(log.created_at)}</TableCell>
                        <TableCell>
                          <Badge tone={OPERATION_TONES[log.operation_type] || 'neutral'}>
                            {OPERATION_LABELS[log.operation_type] || log.operation_type}
                          </Badge>
                        </TableCell>
                        <TableCell>{getUserName(log)}</TableCell>
                        <TableCell className="max-w-[240px] truncate">{log.item_title || getString(log.details?.order_name) || getString(log.details?.name) || '—'}</TableCell>
                        <TableCell className="max-w-[320px] truncate text-sm text-muted-foreground">{buildShortDescription(log)}</TableCell>
                        <TableCell className="text-right">
                          {log.can_rollback ? (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={rollbackMutation.isPending}
                              onClick={(event) => {
                                event.stopPropagation()
                                void handleRollback(log)
                              }}
                            >
                              <Undo2 className="h-4 w-4" />
                              Откатить
                            </Button>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                <div className="text-sm text-muted-foreground">
                  {pageLabel}
                  {isFetching ? ' · обновление...' : ''}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={!canGoPrev} onClick={() => setPage((current) => Math.max(current - 1, 0))}>
                    <ChevronLeft className="mr-1 h-4 w-4" />
                    Назад
                  </Button>
                  <Button variant="outline" size="sm" disabled={!canGoNext} onClick={() => setPage((current) => current + 1)}>
                    Вперед
                    <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </Card.Content>
      </Card>

      <Dialog open={selectedLog !== null} onOpenChange={(open) => !open && setSelectedLog(null)}>
        {selectedLog ? (
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{OPERATION_LABELS[selectedLog.operation_type] || selectedLog.operation_type}</DialogTitle>
            </DialogHeader>

            <div className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border p-4">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    Дата
                  </div>
                  <div className="mt-2 text-sm font-medium">{formatDate(selectedLog.created_at)}</div>
                </div>
                <div className="rounded-2xl border p-4">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-muted-foreground">
                    <User className="h-4 w-4" />
                    Пользователь
                  </div>
                  <div className="mt-2 text-sm font-medium">{getUserName(selectedLog)}</div>
                </div>
              </div>

              {selectedLog.item_title ? (
                <div className="rounded-2xl border p-4">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-muted-foreground">
                    <Package className="h-4 w-4" />
                    Номенклатура
                  </div>
                  <div className="mt-2 text-sm font-medium">{selectedLog.item_title}</div>
                </div>
              ) : null}

              {getMoveRoute(selectedLog.details) ? (
                <div className="rounded-2xl border p-4">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-muted-foreground">
                    <MapPin className="h-4 w-4" />
                    Маршрут
                  </div>
                  <div className="mt-3 flex items-center gap-3 text-sm">
                    <span>{getMoveRoute(selectedLog.details)?.fromLabel}</span>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    <span>{getMoveRoute(selectedLog.details)?.toLabel}</span>
                  </div>
                </div>
              ) : null}

              <Separator />

              <div>
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                  <ClipboardList className="h-4 w-4" />
                  Детали операции
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {buildDetailRows(selectedLog).map((row) => (
                    <div key={`${row.label}-${row.value}`} className="rounded-xl border p-3">
                      <div className="text-xs text-muted-foreground">{row.label}</div>
                      <div className="mt-1 text-sm font-medium">{row.value}</div>
                    </div>
                  ))}
                </div>
              </div>
              {selectedLog.can_rollback ? (
                <div className="flex justify-end">
                  <Button
                    variant="outline"
                    disabled={rollbackMutation.isPending}
                    onClick={() => void handleRollback(selectedLog)}
                  >
                    <Undo2 className="h-4 w-4" />
                    Откатить операцию
                  </Button>
                </div>
              ) : null}
            </div>
          </DialogContent>
        ) : null}
      </Dialog>
    </section>
  )
}
