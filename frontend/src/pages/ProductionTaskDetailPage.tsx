import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, PackageCheck, Play, Warehouse, AlertTriangle } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from '@/lib/toast'

import {
  fulfillProductionSupplyRequest,
  getCells,
  getProductionOrders,
  getStocks,
  getWarehouses,
  startProductionSupplyRequest,
} from '@/api/client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input, SelectNative } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  getProductionWarehouseTasks,
  productionSupplyStatusLabel,
  productionSupplyStatusTone,
  productionSupplyTypeLabel,
  productionSupplyTypeUnitLabel,
} from '@/lib/production'
import { formatCoordinate, formatDate, getErrorMessage, inventoryTypeUnitLabel } from '@/lib/utils'

// ✅ Функция для получения цвета
function getColorValue(colorName?: string | null): string {
  if (!colorName) return '#e5e7eb'
  const colorMap: Record<string, string> = {
    'белый': '#f5f5f5',
    'черный': '#111827',
    'чёрный': '#111827',
    'синий': '#2563eb',
    'зеленый': '#16a34a',
    'зелёный': '#16a34a',
    'розовый': '#ec4899',
    'красный': '#dc2626',
    'желтый': '#eab308',
    'жёлтый': '#eab308',
    'фиолетовый': '#9333ea',
    'натуральный': '#d6c0ad',
    'коричневый': '#8b4513',
    'серый': '#6b7280',
    'голубой': '#06b6d4',
    'оранжевый': '#f97316',
  }
  return colorMap[colorName.trim().toLowerCase()] ?? '#e5e7eb'
}

export function ProductionTaskDetailPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const params = useParams<{ taskKey: string }>()
  const taskKey = decodeURIComponent(params.taskKey ?? '')

  const [selectedStockId, setSelectedStockId] = useState(0)
  const [selectedCellId, setSelectedCellId] = useState(0)
  const [quantity, setQuantity] = useState(1)
  
  const ordersQuery = useQuery({ queryKey: ['production-orders'], queryFn: getProductionOrders })
  const stocksQuery = useQuery({ queryKey: ['stocks'], queryFn: getStocks })
  const cellsQuery = useQuery({ queryKey: ['cells-all'], queryFn: () => getCells() })
  const warehousesQuery = useQuery({ queryKey: ['warehouses'], queryFn: getWarehouses })

  const orders = ordersQuery.data ?? []
  const stocks = stocksQuery.data ?? []
  const cells = cellsQuery.data ?? []
  const warehouses = warehousesQuery.data ?? []

  const tasks = useMemo(() => getProductionWarehouseTasks(orders), [orders])
  const task = useMemo(() => tasks.find((candidate) => candidate.key === taskKey) ?? null, [taskKey, tasks])
  const order = useMemo(() => (task ? orders.find((candidate) => candidate.id === task.orderId) ?? null : null), [orders, task])
  const request = useMemo(() => (task && order ? order.supply_requests.find((candidate) => candidate.id === task.requestId) ?? null : null), [order, task])
  const requestItem = useMemo(() => (request && task ? request.items.find((candidate) => candidate.id === task.requestItemId) ?? null : null), [request, task])

  const sortedCells = useMemo(
    () =>
      [...cells].sort((left, right) => {
        if (left.warehouse_id !== right.warehouse_id) return left.warehouse_id - right.warehouse_id
        if (left.rack !== right.rack) return left.rack - right.rack
        if (left.tier !== right.tier) return left.tier - right.tier
        return left.cell - right.cell
      }),
    [cells],
  )

  const warehouseById = useMemo(
    () => new Map(warehouses.map((warehouse) => [warehouse.id, warehouse.name])),
    [warehouses],
  )

  // ✅ Функция для получения локации ячейки
  const getCellLocation = (cellId: number): string => {
    const cell = cells.find(c => c.id === cellId)
    if (!cell) return 'Неизвестно'
    const warehouseName = warehouseById.get(cell.warehouse_id) || 'Склад'
    return `${warehouseName} - ${formatCoordinate(cell)}`
  }

  const matchingStocks = useMemo(() => {
    if (!task || !requestItem || task.requestType === 'finished_goods_receipt') return []
    return stocks.filter((stock) => {
      if (stock.inventory_type !== task.requestType) return false
      if (stock.item_id !== task.itemId) return false
      if (requestItem.size && stock.size !== requestItem.size) return false
      if (requestItem.manufacturer && stock.manufacturer !== requestItem.manufacturer) return false
      return stock.pairs_quantity > 0
    })
  }, [requestItem, stocks, task])

  const availableCells = useMemo(() => {
    if (!task || task.requestType !== 'finished_goods_receipt') return []
    return sortedCells.filter((cell) => {
      const cellStocks = stocks.filter((stock) => stock.cell_id === cell.id && stock.pairs_quantity > 0)
      return cellStocks.every((stock) => stock.inventory_type === 'finished_goods')
    })
  }, [sortedCells, stocks, task])

  const selectedStock = useMemo(() => {
    if (!selectedStockId) return null
    return stocks.find((s) => s.id === selectedStockId) || null
  }, [selectedStockId, stocks])

  const selectedCell = useMemo(() => {
    if (!selectedCellId) return null
    return cells.find((c) => c.id === selectedCellId) || null
  }, [selectedCellId, cells])

  const isQuantityExceeded = useMemo(() => {
    if (task?.requestType === 'finished_goods_receipt') {
      return quantity > (task.remainingQuantity || 0)
    }
    if (selectedStock) {
      return quantity > selectedStock.pairs_quantity
    }
    return false
  }, [quantity, selectedStock, task])

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['production-orders'] }),
      queryClient.invalidateQueries({ queryKey: ['stocks'] }),
    ])
  }

  const startMutation = useMutation({
    mutationFn: async () => {
      if (!request) throw new Error('Задание не найдено')
      return startProductionSupplyRequest(request.id)
    },
    onSuccess: async () => {
      toast.success('Задание переведено в работу')
      await invalidate()
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  const completeMutation = useMutation({
    mutationFn: async () => {
      if (!request || !requestItem || !task) throw new Error('Задание не найдено')
      if (quantity <= 0) throw new Error('Укажите корректное количество')
      
      if (isQuantityExceeded) {
        const maxAvailable = task.requestType === 'finished_goods_receipt' 
          ? task.remainingQuantity 
          : selectedStock?.pairs_quantity || 0
        throw new Error(`Доступно только ${maxAvailable} ${productionSupplyTypeUnitLabel(task.requestType)}`)
      }

      if (task.requestType === 'finished_goods_receipt') {
        if (!selectedCellId) throw new Error('Выберите ячейку приемки')
        return fulfillProductionSupplyRequest(request.id, {
          items: [{ request_item_id: requestItem.id, cell_id: selectedCellId, quantity }],
        })
      }

      if (!selectedStockId) throw new Error('Выберите остаток для выдачи')
      return fulfillProductionSupplyRequest(request.id, {
        items: [{ request_item_id: requestItem.id, stock_id: selectedStockId, quantity }],
      })
    },
    onSuccess: async () => {
      toast.success('Задание выполнено')
      await invalidate()
      navigate('/production')
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  const isLoading = ordersQuery.isLoading || stocksQuery.isLoading || cellsQuery.isLoading || warehousesQuery.isLoading

  const isStarted = Boolean(request && request.status !== 'requested')

  useEffect(() => {
    if (!task) return
    setQuantity(Math.min(task.remainingQuantity, 1))
  }, [task?.key, task?.remainingQuantity])

  useEffect(() => {
    if (matchingStocks.length > 0 && !matchingStocks.some((stock) => stock.id === selectedStockId)) {
      setSelectedStockId(matchingStocks[0].id)
    }
  }, [matchingStocks, selectedStockId])

  useEffect(() => {
    if (availableCells.length > 0 && !availableCells.some((cell) => cell.id === selectedCellId)) {
      setSelectedCellId(availableCells[0].id)
    }
  }, [availableCells, selectedCellId])

  useEffect(() => {
    if (selectedStock && task?.requestType !== 'finished_goods_receipt') {
      setQuantity(Math.min(quantity, selectedStock.pairs_quantity))
    }
  }, [selectedStock])

  if (isLoading) {
    return (
      <section className="page-shell space-y-4">
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-64" />
        <Skeleton className="h-72" />
      </section>
    )
  }

  if (!task || !order || !request || !requestItem) {
    return (
      <section className="page-shell">
        <Card>
          <Card.Content className="space-y-4 pt-6 text-center">
            <p className="text-muted-foreground">Складское задание не найдено.</p>
            <Button asChild variant="outline">
              <Link to="/production">Вернуться к списку</Link>
            </Button>
          </Card.Content>
        </Card>
      </section>
    )
  }

  return (
    <section className="page-shell space-y-5">
      <div className="space-y-2">
        <Button variant="ghost" className="px-0" onClick={() => navigate('/production')}>
          <ArrowLeft className="h-4 w-4" />
          Назад к заданиям
        </Button>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{productionSupplyTypeLabel(task.requestType)}</h1>
          <Badge tone={productionSupplyStatusTone(request.status)}>{productionSupplyStatusLabel(request.status)}</Badge>
        </div>
      </div>

      <Card>
        <Card.Header>
          <Card.Title>Информация по заданию</Card.Title>
        </Card.Header>
        <Card.Content className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-border/70 p-4">
            <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Заказ</div>
            <div className="mt-2 text-lg font-semibold">{task.orderName}</div>
          </div>
          
          {/* ✅ Улучшенная карточка номенклатуры с размером, цветом и партией */}
          <div className="rounded-2xl border border-border/70 p-4">
            <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Номенклатура</div>
            <div className="mt-2 text-lg font-semibold">{task.itemTitle}</div>
            <div className="mt-1 space-y-1 text-sm text-muted-foreground">
              {task.itemSize && <div>Размер: <span className="font-medium text-foreground">{task.itemSize}</span></div>}
              {task.itemColor && (
                <div className="flex items-center gap-1">
                  Цвет: 
                  <span className="inline-flex items-center gap-1">
                    <span
                      className="inline-block h-3 w-3 rounded-full border border-border"
                      style={{ backgroundColor: getColorValue(task.itemColor) }}
                    />
                    <span className="font-medium text-foreground">{task.itemColor}</span>
                  </span>
                </div>
              )}
              {task.batchNumber && <div>Партия: <span className="font-mono font-medium text-foreground">{task.batchNumber}</span></div>}
              {!task.itemSize && !task.itemColor && !task.batchNumber && (
                <div className="text-muted-foreground">Без дополнительных характеристик</div>
              )}
            </div>
          </div>
          
          <div className="rounded-2xl border border-border/70 p-4">
            <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Количество</div>
            <div className="mt-2 text-lg font-semibold">
              {task.remainingQuantity} {productionSupplyTypeUnitLabel(task.requestType)}
            </div>
          </div>
          <div className="rounded-2xl border border-border/70 p-4">
            <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Создано</div>
            <div className="mt-2 text-lg font-semibold">{formatDate(task.createdAt)}</div>
          </div>
        </Card.Content>
      </Card>

      <Card>
        <Card.Header>
          <Card.Title>Выполнение</Card.Title>
        </Card.Header>
        <Card.Content className="space-y-5">
          {request.comment ? (
            <div className="rounded-2xl border border-border/70 bg-muted/20 p-4 text-sm text-muted-foreground">
              Комментарий от производства: {request.comment}
            </div>
          ) : null}

          {!isStarted ? (
            <Button onClick={() => startMutation.mutate()} disabled={startMutation.isPending}>
              <Play className="h-4 w-4" />
              {startMutation.isPending ? 'Запуск...' : 'Начать задание'}
            </Button>
          ) : (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
              Задание уже взято в работу. После выполнения подтвердите операцию ниже.
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            {task.requestType === 'finished_goods_receipt' ? (
              <div className="space-y-4 rounded-2xl border border-border/70 p-4">
                <div className="flex items-center gap-2 text-base font-semibold">
                  <Warehouse className="h-4 w-4" />
                  Ячейка приемки
                </div>
                
                {/* ✅ Показываем характеристики товара, который будем принимать */}
                <div className="rounded-lg bg-muted/20 p-3 text-sm">
                  <div className="font-medium text-foreground">Принимаемый товар:</div>
                  <div className="mt-1 space-y-1">
                    <div>{task.itemTitle}</div>
                    {task.itemSize && <div>Размер: {task.itemSize}</div>}
                    {task.itemColor && (
                      <div className="flex items-center gap-1">
                        Цвет: 
                        <span
                          className="inline-block h-3 w-3 rounded-full border border-border"
                          style={{ backgroundColor: getColorValue(task.itemColor) }}
                        />
                        <span>{task.itemColor}</span>
                      </div>
                    )}
                    {task.batchNumber && <div>Партия: {task.batchNumber}</div>}
                    <div className="text-muted-foreground">
                      Количество: {task.remainingQuantity} {productionSupplyTypeUnitLabel(task.requestType)}
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Выберите ячейку</Label>
                  <SelectNative value={selectedCellId} onChange={(event) => setSelectedCellId(Number(event.target.value))}>
                    <option value={0}>Выберите ячейку</option>
                    {availableCells.map((cell) => (
                      <option key={cell.id} value={cell.id}>
                        {getCellLocation(cell.id)}
                      </option>
                    ))}
                  </SelectNative>
                </div>
                {selectedCell && (
                  <div className="rounded-lg bg-muted/30 p-3 text-sm">
                    <div className="font-medium">Выбрана ячейка:</div>
                    <div className="text-muted-foreground">
                      {getCellLocation(selectedCell.id)}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4 rounded-2xl border border-border/70 p-4">
                <div className="flex items-center gap-2 text-base font-semibold">
                  <PackageCheck className="h-4 w-4" />
                  Источник выдачи
                </div>
                <div className="space-y-2">
                  <Label>Остаток</Label>
                  <SelectNative value={selectedStockId} onChange={(event) => setSelectedStockId(Number(event.target.value))}>
                    <option value={0}>Выберите остаток</option>
                    {matchingStocks.map((stock) => {
                      const cellLocation = getCellLocation(stock.cell_id)
                      return (
                        <option key={stock.id} value={stock.id}>
                          {task.itemTitle} · 
                          {stock.size || 'Без размера'} · 
                          {stock.batch_number || 'Без партии'} · 
                          {stock.pairs_quantity} {inventoryTypeUnitLabel(stock.inventory_type)} · 
                          {cellLocation}
                        </option>
                      )
                    })}
                  </SelectNative>
                </div>
                {selectedStock && (
                  <div className="rounded-lg bg-muted/30 p-3 text-sm">
                    <div className="font-medium">Выбран остаток:</div>
                    <div className="mt-1 space-y-1 text-muted-foreground">
                      <div>Номенклатура: {task.itemTitle}</div>
                      {selectedStock.size && <div>Размер: {selectedStock.size}</div>}
                      {selectedStock.batch_number && <div>Партия: {selectedStock.batch_number}</div>}
                      {selectedStock.color && <div>Цвет: {selectedStock.color}</div>}
                      <div className="font-medium text-foreground">
                        Доступно: {selectedStock.pairs_quantity} {inventoryTypeUnitLabel(selectedStock.inventory_type)}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        📍 Ячейка: {getCellLocation(selectedStock.cell_id)}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-4 rounded-2xl border border-border/70 p-4">
              <div className="space-y-2">
                <Label>Количество</Label>
                <Input 
                  type="number" 
                  min={1} 
                  max={task.remainingQuantity} 
                  value={quantity} 
                  onChange={(event) => {
                    const val = Number(event.target.value)
                    if (val > 0) setQuantity(val)
                  }} 
                />
                {isQuantityExceeded && (
                  <div className="flex items-start gap-2 text-sm text-amber-600">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      Превышает доступное количество (
                      {task.requestType === 'finished_goods_receipt' 
                        ? task.remainingQuantity 
                        : selectedStock?.pairs_quantity || 0} 
                      {productionSupplyTypeUnitLabel(task.requestType)})
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <Button
            onClick={() => completeMutation.mutate()}
            disabled={
              completeMutation.isPending || 
              !isStarted || 
              request.status === 'completed' ||
              quantity <= 0 ||
              isQuantityExceeded ||
              (task.requestType === 'finished_goods_receipt' && !selectedCellId) ||
              (task.requestType !== 'finished_goods_receipt' && !selectedStockId)
            }
            className="w-full"
          >
            {completeMutation.isPending ? 'Завершаем...' : 'Завершить задание'}
          </Button>
        </Card.Content>
      </Card>
    </section>
  )
}
