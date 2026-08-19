import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import { createPortal } from 'react-dom'
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  ListChecks,
  MapPin,
  PackageCheck,
  Printer,
  X,
  RefreshCw,
  Undo2,
} from 'lucide-react'
import { toast } from '@/lib/toast'
import {
  cancelPicking,
  completePicking,
  deletePickOperation,
  getOrder,
  getPackingProposal,
  getPickOperations,
  getPickingList,
  getStocks,
  pickItem,
  requestChz,
  updateSuggestedStock,
} from '@/api/client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input, Textarea } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { normalizeVariantComparableValue } from '@/lib/itemVariants'
import { usePickingStore } from '@/stores/pickingStore'
import type { PickingListItem, Stock } from '@/types/wms'
import { calculateOrderProgress, chzRequestStatusLabel, chzRequestStatusTone, formatDate, getErrorMessage } from '@/lib/utils'

function normalizeVariantValue(value?: string | null) {
  return normalizeVariantComparableValue(value)
}

function getColorValue(colorName?: string | null): string {
  if (!colorName) return '#e5e5e5'
  const colorMap: Record<string, string> = {
    белый: '#f5f5f5',
    черный: '#1a1a1a',
    'чёрный': '#1a1a1a',
    синий: '#3b82f6',
    зеленый: '#22c55e',
    'зелёный': '#22c55e',
    розовый: '#ec4899',
    красный: '#ef4444',
    жёлтый: '#eab308',
    желтый: '#eab308',
    оранжевый: '#f97316',
    фиолетовый: '#a855f7',
    голубой: '#06b6d4',
    серый: '#6b7280',
    коричневый: '#8b4513',
    бежевый: '#f5f5dc',
    натуральный: '#f1e3d5',
    салатовый: '#84cc16',
    бирюзовый: '#14b8a6',
    индиго: '#6366f1',
  }
  return colorMap[colorName.toLowerCase()] || '#e5e5e5'
}

function parsePickingRoute(location?: string | null) {
  if (!location) {
    return {
      warehouseName: null,
      coordinate: null,
      rack: Number.MAX_SAFE_INTEGER,
      tier: Number.MAX_SAFE_INTEGER,
      cell: Number.MAX_SAFE_INTEGER,
    }
  }

  const segments = location.split(' - ')
  const coordinateCandidate = segments[segments.length - 1] ?? ''
  const coordinateMatch = coordinateCandidate.match(/^(\d+)-(\d+)-(\d+)$/)

  if (!coordinateMatch) {
    return {
      warehouseName: location,
      coordinate: null,
      rack: Number.MAX_SAFE_INTEGER,
      tier: Number.MAX_SAFE_INTEGER,
      cell: Number.MAX_SAFE_INTEGER,
    }
  }

  return {
    warehouseName: segments.slice(0, -1).join(' - ') || null,
    coordinate: coordinateCandidate,
    rack: Number(coordinateMatch[1]),
    tier: Number(coordinateMatch[2]),
    cell: Number(coordinateMatch[3]),
  }
}

// Компонент для печатной версии списка отбора
function PrintablePickingList({
  order,
  pickingList,
  orderProgress,
  stocks,
}: {
  order: any
  pickingList: PickingListItem[]
  orderProgress: { total: number; picked: number; percent: number }
  stocks: Stock[]
}) {
  // Создаём Map для быстрого доступа к остаткам по id
  const stockById = useMemo(() => new Map(stocks.map((stock) => [stock.id, stock])), [stocks])

  return (
    <div className="print-only hidden print:block">
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-1">Отбор заказа {order?.name ? `№${order.name}` : `#${order?.id}`}</h1>
        <div className="text-sm text-muted-foreground mb-2">
          Клиент: {order?.customer ?? '—'} · Дата отгрузки:{' '}
          {order?.shipping_date ? formatDate(order.shipping_date) : '—'}
        </div>
        <div className="text-sm mb-4">
          Прогресс: {orderProgress.picked} / {orderProgress.total} пар ({orderProgress.percent}%)
        </div>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-black">
              <th className="text-left py-2 px-3 font-semibold">Ячейка</th>
              <th className="text-left py-2 px-3 font-semibold">Товар</th>
              <th className="text-left py-2 px-3 font-semibold">Размер</th>
              <th className="text-left py-2 px-3 font-semibold">Цвет</th>
              <th className="text-left py-2 px-3 font-semibold">Партия</th>
              <th className="text-right py-2 px-3 font-semibold">Заказано</th>
              <th className="text-right py-2 px-3 font-semibold">Отобрано</th>
              <th className="text-right py-2 px-3 font-semibold">Коробок</th>
            </tr>
          </thead>
          <tbody>
            {pickingList.map((item) => {
              const stock = item.suggested_stock_id ? stockById.get(item.suggested_stock_id) : undefined
              const boxesNeeded =
                stock?.pairs_per_box && item.pairs_required > 0
                  ? Math.ceil(item.pairs_required / stock.pairs_per_box)
                  : '—'
              const orderedPairs = item.pairs_required + item.picked_pairs
              return (
                <tr key={item.order_item_id} className="border-b border-gray-200">
                  <td className="py-2 px-3 font-mono">
                    {item.waiting_for_production ? 'Ожидается производство' : item.suggested_cell_location ?? '—'}
                  </td>
                  <td className="py-2 px-3 font-medium">{item.item_name}</td>
                  <td className="py-2 px-3">{item.item_size ?? '—'}</td>
                  <td className="py-2 px-3">
                    {item.item_color ? (
                      <div className="flex items-center gap-1">
                        <span
                          className="inline-block h-3 w-3 rounded-full border"
                          style={{ backgroundColor: getColorValue(item.item_color) }}
                        />
                        {item.item_color}
                      </div>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="py-2 px-3 font-mono text-xs">{item.batch_number ?? '—'}</td>
                  <td className="py-2 px-3 text-right">{orderedPairs} пар</td>
                  <td className="py-2 px-3 text-right">{item.picked_pairs} пар</td>
                  <td className="py-2 px-3 text-right">{boxesNeeded}</td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-black font-semibold">
              <td colSpan={5} className="py-2 px-3 text-right">
                Итого:
              </td>
              <td className="py-2 px-3 text-right">
                {pickingList.reduce((sum, i) => sum + i.pairs_required + i.picked_pairs, 0)} пар
              </td>
              <td className="py-2 px-3 text-right">
                {pickingList.reduce((sum, i) => sum + i.picked_pairs, 0)} пар
              </td>
              <td className="py-2 px-3 text-right">—</td>
            </tr>
          </tfoot>
        </table>
        <div className="mt-4 text-xs text-muted-foreground">
          Дата печати: {new Date().toLocaleString('ru-RU')}
        </div>
      </div>
    </div>
  )
}

export function PickingPage() {
  const params = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const orderId = Number(params.orderId)

  const [isProcessing, setIsProcessing] = useState<number | null>(null)
  const [selectedOrderItemIds, setSelectedOrderItemIds] = useState<number[]>([])
  const [partialTarget, setPartialTarget] = useState<PickingListItem | null>(null)
  const [partialQuantity, setPartialQuantity] = useState(1)
  const [chzDialogOpen, setChzDialogOpen] = useState(false)
  const [chzComment, setChzComment] = useState('')
  const [alternativeIndexMap, setAlternativeIndexMap] = useState<Map<number, number>>(new Map())
  const [printActive, setPrintActive] = useState(false)
  const [mobileFocusedItemId, setMobileFocusedItemId] = useState<number | null>(null)
  const [mobileFullListOpen, setMobileFullListOpen] = useState(false)

  const activeOrderId = usePickingStore((state) => state.activeOrderId)
  const setActiveOrderId = usePickingStore((state) => state.setActiveOrderId)
  const resetPicking = usePickingStore((state) => state.reset)

  const orderQuery = useQuery({
    queryKey: ['orders', orderId],
    queryFn: () => getOrder(orderId),
  })

  const pickingQuery = useQuery({
    queryKey: ['picking', orderId],
    queryFn: () => getPickingList(orderId),
    refetchOnWindowFocus: false,
  })

  const stocksQuery = useQuery({
    queryKey: ['stocks'],
    queryFn: getStocks,
  })

  const pickOperationsQuery = useQuery({
    queryKey: ['pick-operations', orderId],
    queryFn: () => getPickOperations(orderId),
    enabled: Number.isFinite(orderId) && orderId > 0,
  })

  const proposalQuery = useQuery({
    queryKey: ['packing-proposal', orderId],
    queryFn: () => getPackingProposal(orderId),
    enabled: !!orderId,
    retry: false,
  })

  useEffect(() => {
    if (activeOrderId !== orderId) {
      setActiveOrderId(orderId)
    }
  }, [activeOrderId, orderId, setActiveOrderId])

  const order = orderQuery.data
  const pickingList = pickingQuery.data ?? []
  const orderProgress = calculateOrderProgress(order)
  const canEditPicking = !['shipped', 'delivered'].includes(order?.status ?? '')
  const allDone =
    pickingList.length > 0 &&
    orderProgress.total > 0 &&
    orderProgress.picked >= orderProgress.total

  const selectableItems = useMemo(
    () => pickingList.filter((item) => item.pairs_required > 0),
    [pickingList],
  )

  const stockById = useMemo(
    () => new Map((stocksQuery.data ?? []).map((stock) => [stock.id, stock])),
    [stocksQuery.data],
  )

  const selectedItems = useMemo(
    () => selectableItems.filter((item) => selectedOrderItemIds.includes(item.order_item_id)),
    [selectableItems, selectedOrderItemIds],
  )

  const prioritizedPickingList = useMemo(() => {
    return [...pickingList].sort((left, right) => {
      if (left.waiting_for_production !== right.waiting_for_production) {
        return left.waiting_for_production ? 1 : -1
      }

      const leftRoute = parsePickingRoute(left.suggested_cell_location)
      const rightRoute = parsePickingRoute(right.suggested_cell_location)

      const warehouseCompare = (leftRoute.warehouseName ?? '').localeCompare(rightRoute.warehouseName ?? '', 'ru')
      if (warehouseCompare !== 0) return warehouseCompare
      if (leftRoute.rack !== rightRoute.rack) return leftRoute.rack - rightRoute.rack
      if (leftRoute.tier !== rightRoute.tier) return leftRoute.tier - rightRoute.tier
      if (leftRoute.cell !== rightRoute.cell) return leftRoute.cell - rightRoute.cell
      return left.item_name.localeCompare(right.item_name, 'ru')
    })
  }, [pickingList])

  const mobileQueue = useMemo(
    () => prioritizedPickingList.filter((item) => item.pairs_required > 0),
    [prioritizedPickingList],
  )

  const mobileRouteSummary = useMemo(() => {
    const summary = new Map<string, { items: number; pairs: number }>()
    for (const item of mobileQueue) {
      const route = parsePickingRoute(item.suggested_cell_location)
      const key = item.waiting_for_production ? 'Ожидание производства' : route.warehouseName || 'Без склада'
      const current = summary.get(key) ?? { items: 0, pairs: 0 }
      current.items += 1
      current.pairs += item.pairs_required
      summary.set(key, current)
    }
    return Array.from(summary.entries())
  }, [mobileQueue])

  const findAlternativeStocks = (item: PickingListItem) => {
    const allStocks = stocksQuery.data ?? []
    return allStocks.filter(
      (stock) =>
        stock.item_id === item.item_id &&
        stock.id !== item.suggested_stock_id &&
        normalizeVariantValue(stock.size) === normalizeVariantValue(item.item_size) &&
        normalizeVariantValue(stock.color) === normalizeVariantValue(item.item_color) &&
        stock.pairs_quantity > 0,
    )
  }

  const getNextAlternativeStock = (item: PickingListItem) => {
    const alternatives = findAlternativeStocks(item)
    if (alternatives.length === 0) return null

    const currentIndex = alternativeIndexMap.get(item.order_item_id) ?? -1
    const nextIndex = (currentIndex + 1) % alternatives.length
    setAlternativeIndexMap((prev) => new Map(prev).set(item.order_item_id, nextIndex))

    return alternatives[nextIndex]
  }

  useEffect(() => {
    const currentIds = new Set(pickingList.map((item) => item.order_item_id))
    setAlternativeIndexMap((prev) => {
      const newMap = new Map(prev)
      for (const key of newMap.keys()) {
        if (!currentIds.has(key)) {
          newMap.delete(key)
        }
      }
      return newMap
    })
  }, [pickingList])

  useEffect(() => {
    setSelectedOrderItemIds((current) =>
      current.filter((id) => selectableItems.some((item) => item.order_item_id === id)),
    )
  }, [selectableItems])

  useEffect(() => {
    if (mobileQueue.length === 0) {
      setMobileFocusedItemId(null)
      return
    }
    if (!mobileFocusedItemId || !mobileQueue.some((item) => item.order_item_id === mobileFocusedItemId)) {
      setMobileFocusedItemId(mobileQueue[0].order_item_id)
    }
  }, [mobileFocusedItemId, mobileQueue])

  const invalidateQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['picking', orderId] }),
      queryClient.invalidateQueries({ queryKey: ['orders'] }),
      queryClient.invalidateQueries({ queryKey: ['stocks'] }),
      queryClient.invalidateQueries({ queryKey: ['packing-proposal', orderId] }),
      queryClient.invalidateQueries({ queryKey: ['pick-operations', orderId] }),
    ])
  }

  const pickMutation = useMutation({
    mutationFn: ({
      orderItemId,
      stockId,
      pairsQuantity,
    }: {
      orderItemId: number
      stockId: number
      pairsQuantity: number
    }) =>
      pickItem({
        order_item_id: orderItemId,
        stock_id: stockId,
        pairs_quantity: pairsQuantity,
      }),
    onSuccess: async (_, variables) => {
      toast.success('Товар отобран')
      setAlternativeIndexMap((prev) => {
        const newMap = new Map(prev)
        newMap.delete(variables.orderItemId)
        return newMap
      })
      await invalidateQueries()
    },
    onError: (error) => toast.error(getErrorMessage(error)),
    onSettled: () => setIsProcessing(null),
  })

  const updateSuggestedStockMutation = useMutation({
    mutationFn: ({ orderItemId, stockId }: { orderItemId: number; stockId: number }) =>
      updateSuggestedStock(orderId, orderItemId, stockId),
    onSuccess: async () => {
      toast.success('Ячейка изменена')
      await invalidateQueries()
    },
    onError: (error) => {
      toast.error(getErrorMessage(error))
    },
    onSettled: () => {
      setIsProcessing(null)
    },
  })

  const completeMutation = useMutation({
    mutationFn: () => completePicking(orderId),
    onSuccess: async () => {
      toast.success('Сборка завершена')
      resetPicking()
      await invalidateQueries()
      navigate(`/orders/${orderId}`)
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  const cancelMutation = useMutation({
    mutationFn: () => cancelPicking(orderId),
    onSuccess: async () => {
      toast.success('Отбор отменен, товар возвращен в ячейки')
      resetPicking()
      await invalidateQueries()
      navigate(`/orders/${orderId}`)
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  const undoItemMutation = useMutation({
    mutationFn: async (item: PickingListItem) => {
      const operations = (pickOperationsQuery.data ?? []).filter(
        (operation) => operation.order_item_id === item.order_item_id,
      )
      if (operations.length === 0) {
        throw new Error('Для этой позиции нет операций отбора')
      }
      for (const operation of operations) {
        await deletePickOperation(operation.id)
      }
    },
    onSuccess: async () => {
      toast.success('Отбор по позиции отменен, товар возвращен в ячейку')
      await invalidateQueries()
    },
    onError: (error) => toast.error(getErrorMessage(error)),
    onSettled: () => setIsProcessing(null),
  })

  const requestChzMutation = useMutation({
    mutationFn: () =>
      requestChz(orderId, {
        order_item_ids: selectedItems.map((item) => item.order_item_id),
        comment: chzComment.trim() || undefined,
      }),
    onSuccess: async () => {
      toast.success('Запрос ЧЗ отправлен')
      setSelectedOrderItemIds([])
      setChzComment('')
      setChzDialogOpen(false)
      await invalidateQueries()
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  const handlePick = (item: PickingListItem, pairsQuantity: number) => {
    if (!canEditPicking) {
      toast.error('Отбор отгруженного или доставленного заказа менять нельзя')
      return
    }
    if (!order?.approved) {
      toast.error('Сборка недоступна: заказ не согласован')
      return
    }
    if (!item.suggested_stock_id) {
      toast.error('Для позиции не назначен остаток')
      return
    }
    if (pairsQuantity <= 0 || pairsQuantity > item.pairs_required || pairsQuantity > item.available_pairs) {
      toast.error('Некорректное количество для отбора')
      return
    }

    setIsProcessing(item.order_item_id)
    pickMutation.mutate({
      orderItemId: item.order_item_id,
      stockId: item.suggested_stock_id,
      pairsQuantity,
    })
  }

  const handleAlternativeStock = (item: PickingListItem) => {
    if (!canEditPicking) {
      toast.error('Отбор отгруженного или доставленного заказа менять нельзя')
      return
    }
    if (!order?.approved) {
      toast.error('Сборка недоступна: заказ не согласован')
      return
    }

    const nextStock = getNextAlternativeStock(item)
    if (!nextStock) {
      toast.error('Нет альтернативных ячеек с этим товаром')
      return
    }

    const alternatives = findAlternativeStocks(item)
    const currentIndex = alternativeIndexMap.get(item.order_item_id) ?? 0

    const cellLocation = item.suggested_cell_location || 'ячейка'

    toast.info(`Ячейка ${currentIndex + 1} из ${alternatives.length}: ${cellLocation}`)

    setIsProcessing(item.order_item_id)
    updateSuggestedStockMutation.mutate({
      orderItemId: item.order_item_id,
      stockId: nextStock.id,
    })
  }

  const handleUndoPick = (item: PickingListItem) => {
    if (!canEditPicking) {
      toast.error('Отбор отгруженного или доставленного заказа менять нельзя')
      return
    }
    if (!window.confirm(`Отменить отбор для "${item.item_name}"? Товар вернется в ячейку.`)) return
    setIsProcessing(item.order_item_id)
    undoItemMutation.mutate(item)
  }

  const handleOpenPartialDialog = (item: PickingListItem) => {
    setPartialTarget(item)
    setPartialQuantity(Math.max(1, Math.min(item.pairs_required, item.available_pairs)))
  }

  const handleConfirmPartialPick = () => {
    if (!partialTarget) return
    handlePick(partialTarget, partialQuantity)
    setPartialTarget(null)
  }

  const handleComplete = () => {
    if (!canEditPicking) {
      toast.error('Отбор отгруженного или доставленного заказа менять нельзя')
      return
    }
    if (!order?.approved) {
      toast.error('Сборка недоступна: заказ не согласован')
      return
    }
    if (!allDone) {
      const remaining = pickingList.filter((item) => item.pairs_required > 0).length
      if (orderProgress.picked <= 0) {
        toast.error(`Отбор еще не завершен. Осталось позиций: ${remaining}`)
        return
      }
      const confirmed = window.confirm(
        `Отобрано ${orderProgress.picked} из ${orderProgress.total} пар. Завершить отбор частично?`,
      )
      if (!confirmed) return
    }
    completeMutation.mutate()
  }

  const handleCancelPicking = () => {
    if (!canEditPicking) {
      toast.error('Отбор отгруженного или доставленного заказа менять нельзя')
      return
    }
    if (!window.confirm('Отменить отбор и вернуть весь товар обратно в ячейки?')) return
    cancelMutation.mutate()
  }

  const toggleItemSelection = (orderItemId: number) => {
    setSelectedOrderItemIds((current) =>
      current.includes(orderItemId)
        ? current.filter((id) => id !== orderItemId)
        : [...current, orderItemId],
    )
  }

  const toggleAllSelectableItems = () => {
    if (selectedOrderItemIds.length === selectableItems.length) {
      setSelectedOrderItemIds([])
      return
    }
    setSelectedOrderItemIds(selectableItems.map((item) => item.order_item_id))
  }

  const currentMobileIndex = useMemo(() => {
    if (mobileQueue.length === 0 || mobileFocusedItemId === null) return 0
    const foundIndex = mobileQueue.findIndex((item) => item.order_item_id === mobileFocusedItemId)
    return foundIndex >= 0 ? foundIndex : 0
  }, [mobileFocusedItemId, mobileQueue])

  const currentMobileItem = mobileQueue[currentMobileIndex] ?? null

  const changeMobileFocus = (offset: number) => {
    if (mobileQueue.length === 0) return
    const nextIndex = Math.min(Math.max(currentMobileIndex + offset, 0), mobileQueue.length - 1)
    setMobileFocusedItemId(mobileQueue[nextIndex].order_item_id)
  }

  const renderPickingActions = (item: PickingListItem, compact = false) => {
    const isPicked = item.pairs_required === 0
    const isProcessingThis = isProcessing === item.order_item_id
    const alternatives = findAlternativeStocks(item)
    const hasAlternatives = alternatives.length > 0
    const currentAltIndex = alternativeIndexMap.get(item.order_item_id) ?? -1
    const actionClassName = compact ? 'flex flex-wrap gap-2' : 'flex flex-wrap gap-2'

    if (item.waiting_for_production) {
      return <Badge tone="warning">Ожидается производство</Badge>
    }

    if (isPicked) {
      return (
        <div className={actionClassName}>
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleUndoPick(item)}
            disabled={isProcessingThis || undoItemMutation.isPending || !canEditPicking}
            className="text-red-600 hover:bg-red-50 hover:text-red-700"
          >
            <Undo2 className="mr-1 h-4 w-4" />
            Отменить
          </Button>
        </div>
      )
    }

    return (
      <div className={actionClassName}>
        <Button
          size="sm"
          onClick={() => handlePick(item, Math.min(item.pairs_required, item.available_pairs))}
          disabled={!item.suggested_stock_id || item.available_pairs <= 0 || isProcessingThis || !order?.approved || !canEditPicking}
        >
          <PackageCheck className="mr-1 h-4 w-4" />
          Отобрать
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => handleOpenPartialDialog(item)}
          disabled={!item.suggested_stock_id || isProcessingThis || !order?.approved || item.available_pairs <= 0 || !canEditPicking}
        >
          Частично
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => handleAlternativeStock(item)}
          disabled={!hasAlternatives || isProcessingThis || !order?.approved || !canEditPicking}
        >
          <RefreshCw className="mr-1 h-4 w-4" />
          Другая ячейка
          {hasAlternatives ? (
            <span className="ml-1 text-[10px] text-muted-foreground">
              ({currentAltIndex + 1}/{alternatives.length})
            </span>
          ) : null}
        </Button>
      </div>
    )
  }

  const handlePrint = () => {
    const cleanup = () => {
      document.body.classList.remove('wms-printing')
      setPrintActive(false)
    }

    document.body.classList.add('wms-printing')
    setPrintActive(true)
    window.addEventListener('afterprint', cleanup, { once: true })
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        window.print()
        window.setTimeout(cleanup, 30000)
      })
    })
  }

  const isLoading = orderQuery.isLoading || pickingQuery.isLoading || stocksQuery.isLoading
  const printPortal =
    printActive && typeof document !== 'undefined'
      ? createPortal(
          <PrintablePickingList
            order={order}
            pickingList={pickingList}
            orderProgress={orderProgress}
            stocks={stocksQuery.data ?? []}
          />,
          document.body,
        )
      : null

  return (
    <section className="page-shell space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button asChild variant="ghost">
          <Link to={`/orders/${orderId}`}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            Назад к заказу
          </Link>
        </Button>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            className="lg:hidden"
            onClick={() => setMobileFullListOpen((current) => !current)}
          >
            <ListChecks className="mr-1 h-4 w-4" />
            {mobileFullListOpen ? 'К пошаговому отбору' : 'Посмотреть отбор'}
          </Button>
          <Button
            variant="outline"
            onClick={() => setChzDialogOpen(true)}
            disabled={selectedItems.length === 0 || requestChzMutation.isPending}
          >
            <Printer className="mr-1 h-4 w-4" />
            Заказать ЧЗ
          </Button>
          <Button
            variant="success"
            onClick={handleComplete}
            disabled={completeMutation.isPending || pickingList.length === 0 || !canEditPicking}
          >
            <Check className="mr-1 h-4 w-4" />
            Завершить отбор
          </Button>
          <Button
            variant="outline"
            onClick={handleCancelPicking}
            disabled={cancelMutation.isPending || orderProgress.picked === 0 || !canEditPicking}
          >
            <X className="mr-1 h-4 w-4" />
            Отменить отбор
          </Button>
          <Button variant="outline" onClick={handlePrint}>
            <Printer className="mr-1 h-4 w-4" />
            Печать
          </Button>
        </div>
      </div>

      <Card>
        <Card.Content className="pt-5">
          <div>
            <h1 className="text-2xl font-semibold sm:text-3xl">
              Отбор заказа {order?.name ? `№${order.name}` : `#${orderId}`}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">{order?.customer ?? 'Клиент'}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge tone={order?.approved ? 'success' : 'warning'}>
                {order?.approved ? 'Согласовано' : 'Не согласовано'}
              </Badge>
              {order?.shipping_date ? <Badge tone="secondary">{formatDate(order.shipping_date)}</Badge> : null}
              {order?.requires_chz ? <Badge tone="warning">Требуется ЧЗ</Badge> : null}
              {order?.active_chz_request ? (
                <Badge tone={chzRequestStatusTone(order.active_chz_request.status)}>
                  ЧЗ: {chzRequestStatusLabel(order.active_chz_request.status)}
                </Badge>
              ) : null}
            </div>
          </div>
          <Progress
            className="mt-5"
            size="md"
            value={orderProgress.percent}
            label="Прогресс"
            valueLabel={`${orderProgress.picked} / ${orderProgress.total} пар`}
          />
        </Card.Content>
      </Card>

      {!order?.approved ? (
        <Card className="border-amber-200 bg-amber-50/80">
          <Card.Content className="flex items-start gap-3 pt-5 text-amber-900">
            <AlertTriangle className="mt-0.5 h-5 w-5" />
            <div>
              <div className="font-semibold">Отбор заблокирован</div>
              <div className="text-sm text-amber-800">
                Этот заказ не согласован. Начать сборку и выполнять операции отбора нельзя.
              </div>
            </div>
          </Card.Content>
        </Card>
      ) : null}

      {proposalQuery.data?.has_proposals ? (
        <Card className="border-sky-200 bg-sky-50/70">
          <Card.Header>
            <Card.Title className="text-base">Подсказка по упаковке</Card.Title>
          </Card.Header>
          <Card.Content className="space-y-3 text-sm">
            {proposalQuery.data.proposals.map((proposal) => (
              <div key={proposal.group_number} className="rounded-md border border-sky-200 bg-white/80 p-3">
                <div className="flex items-center justify-between">
                  <div className="font-medium">
                    {proposal.is_mixed ? (
                      <span className="text-amber-600">📦 Смешанная коробка</span>
                    ) : (
                      <span>Коробка {proposal.group_number}</span>
                    )}
                    {proposal.color ? ` · ${proposal.color}` : ''}
                  </div>
                  <Badge tone="secondary">Всего {proposal.total_pairs} пар</Badge>
                </div>

                {proposal.is_mixed && (
                  <div className="mt-1 text-xs text-amber-600">
                    ⚠️ В одной коробке будут разные позиции. Наклейте все этикетки на коробку.
                  </div>
                )}

                <div className="mt-2 flex flex-wrap gap-2">
                  {proposal.items.map((proposalItem) => (
                    <Badge key={proposalItem.order_item_id} tone="secondary" className="gap-1">
                      {proposalItem.item_name}
                      {proposalItem.size ? ` ${proposalItem.size}` : ''}
                      {proposalItem.color ? ` · ${proposalItem.color}` : ''}
                      {proposalItem.batch ? ` · партия ${proposalItem.batch}` : ''}
                      {proposalItem.venchik ? ` · ${proposalItem.venchik}` : ''}
                      <span className="font-mono ml-1">({proposalItem.pairs_quantity} пар)</span>
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </Card.Content>
        </Card>
      ) : null}

      <Card>
        <Card.Header>
          <Card.Title>Позиции к отбору</Card.Title>
        </Card.Header>
        <Card.Content>
          {isLoading ? (
            <Skeleton className="h-96" />
          ) : pickingList.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">Нет позиций для отбора</div>
          ) : (
            <>
              <div className="space-y-4 lg:hidden">
                {!mobileFullListOpen && currentMobileItem ? (
                  <div className="space-y-4">
                    <div className="rounded-xl border border-border/70 bg-muted/10 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                            Маршрут отбора
                          </div>
                          <div className="mt-1 text-sm font-semibold">
                            Шаг {currentMobileIndex + 1} из {mobileQueue.length}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => changeMobileFocus(-1)}
                            disabled={currentMobileIndex === 0}
                          >
                            <ChevronLeft className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => changeMobileFocus(1)}
                            disabled={currentMobileIndex >= mobileQueue.length - 1}
                          >
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        {mobileRouteSummary.map(([warehouseName, summary]) => (
                          <Badge
                            key={warehouseName}
                            tone={warehouseName === (parsePickingRoute(currentMobileItem.suggested_cell_location).warehouseName || 'Без склада') ? 'primary' : 'secondary'}
                          >
                            {warehouseName}: {summary.items} поз. · {summary.pairs} пар
                          </Badge>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-xl border border-border/70 bg-background p-4 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-2">
                          <div className="text-lg font-semibold">{currentMobileItem.item_name}</div>
                          <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                            <span>{currentMobileItem.item_size ?? '—'}</span>
                            <span>{currentMobileItem.item_color ?? '—'}</span>
                            <span>{currentMobileItem.batch_number ?? '—'}</span>
                          </div>
                        </div>
                        <Badge tone={currentMobileItem.pairs_required === 0 ? 'success' : 'warning'}>
                          {currentMobileItem.pairs_required} пар
                        </Badge>
                      </div>

                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
                          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.12em] text-muted-foreground">
                            <MapPin className="h-3.5 w-3.5" />
                            Ячейка
                          </div>
                          <div className="mt-1 font-mono text-base font-semibold">
                            {currentMobileItem.waiting_for_production ? 'Ожидается производство' : currentMobileItem.suggested_cell_location ?? '—'}
                          </div>
                        </div>
                        <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
                          <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Прогресс позиции</div>
                          <div className="mt-1 text-sm font-medium">
                            Отобрано {currentMobileItem.picked_pairs} пар · доступно {currentMobileItem.available_pairs} пар
                          </div>
                        </div>
                      </div>

                      <div className="mt-4">{renderPickingActions(currentMobileItem, true)}</div>
                    </div>
                  </div>
                ) : null}

                {mobileFullListOpen ? (
                  <div className="space-y-3">
                    {prioritizedPickingList.map((item) => {
                      const stock = item.suggested_stock_id ? stockById.get(item.suggested_stock_id) : undefined
                      const boxesNeeded =
                        stock?.pairs_per_box && item.pairs_required > 0
                          ? Math.ceil(item.pairs_required / stock.pairs_per_box)
                          : 0
                      const isSelectable = item.pairs_required > 0 && !item.waiting_for_production

                      return (
                        <div key={item.order_item_id} className="rounded-xl border border-border/70 bg-background p-4 shadow-sm">
                          <div className="flex items-start justify-between gap-3">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <Checkbox
                                  isSelected={selectedOrderItemIds.includes(item.order_item_id)}
                                  isDisabled={!isSelectable}
                                  onChange={() => toggleItemSelection(item.order_item_id)}
                                  aria-label={`Выбрать ${item.item_name}`}
                                />
                                <div className="font-semibold">{item.item_name}</div>
                              </div>
                              <div className="font-mono text-xs text-muted-foreground">
                                {item.waiting_for_production ? 'Ожидается производство' : item.suggested_cell_location ?? '—'}
                              </div>
                            </div>
                            <Badge tone={item.pairs_required === 0 ? 'success' : 'warning'}>
                              {item.pairs_required} пар
                            </Badge>
                          </div>

                          <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                            <div>Размер: <span className="text-foreground">{item.item_size ?? '—'}</span></div>
                            <div>Цвет: <span className="text-foreground">{item.item_color ?? '—'}</span></div>
                            <div>Партия: <span className="text-foreground">{item.batch_number ?? '—'}</span></div>
                            <div>Коробок: <span className="text-foreground">{boxesNeeded > 0 ? boxesNeeded : '—'}</span></div>
                          </div>

                          <div className="mt-3">{renderPickingActions(item, true)}</div>
                        </div>
                      )
                    })}
                  </div>
                ) : null}
              </div>

              <div className="hidden lg:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted/30">
                    <tr>
                      <th className="w-10 p-3 text-left">
                        <Checkbox
                          isSelected={selectedItems.length > 0 && selectedItems.length === selectableItems.length}
                          onChange={toggleAllSelectableItems}
                          isDisabled={selectableItems.length === 0}
                          aria-label="Выбрать все позиции"
                        />
                      </th>
                      <th className="p-3 text-left font-medium">Ячейка</th>
                      <th className="p-3 text-left font-medium">Товар</th>
                      <th className="p-3 text-left font-medium">Размер</th>
                      <th className="p-3 text-left font-medium">Цвет</th>
                      <th className="p-3 text-left font-medium">Партия</th>
                      <th className="p-3 text-left font-medium">Осталось</th>
                      <th className="p-3 text-left font-medium">Отобрано</th>
                      <th className="p-3 text-left font-medium">Коробок</th>
                      <th className="p-3 text-left font-medium">Действия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pickingList.map((item) => {
                      const stock = item.suggested_stock_id ? stockById.get(item.suggested_stock_id) : undefined
                      const isPicked = item.pairs_required === 0
                      const isSelectable = item.pairs_required > 0 && !item.waiting_for_production
                      const boxesNeeded =
                        stock?.pairs_per_box && item.pairs_required > 0
                          ? Math.ceil(item.pairs_required / stock.pairs_per_box)
                          : 0

                      return (
                        <tr key={item.order_item_id} className="border-b hover:bg-muted/50">
                          <td className="p-3">
                            <Checkbox
                              isSelected={selectedOrderItemIds.includes(item.order_item_id)}
                              isDisabled={!isSelectable}
                              onChange={() => toggleItemSelection(item.order_item_id)}
                              aria-label={`Выбрать ${item.item_name}`}
                            />
                          </td>
                          <td className="p-3 font-mono">
                            {item.waiting_for_production ? 'Ожидается производство' : item.suggested_cell_location ?? '—'}
                          </td>
                          <td className="p-3 font-medium">{item.item_name}</td>
                          <td className="p-3">{item.item_size ?? '—'}</td>
                          <td className="p-3">
                            {item.item_color ? (
                              <div className="flex items-center gap-1">
                                <span
                                  className="inline-block h-3 w-3 rounded-full border"
                                  style={{ backgroundColor: getColorValue(item.item_color) }}
                                />
                                {item.item_color}
                              </div>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="p-3 font-mono text-xs">{item.batch_number ?? '—'}</td>
                          <td className="p-3">
                            <Badge tone={isPicked ? 'success' : 'warning'}>{item.pairs_required}</Badge>
                          </td>
                          <td className="p-3">{item.picked_pairs}</td>
                          <td className="p-3">{boxesNeeded > 0 ? boxesNeeded : '—'}</td>
                          <td className="p-3">{renderPickingActions(item)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Card.Content>
      </Card>

      <Dialog open={!!partialTarget} onOpenChange={(open) => !open && setPartialTarget(null)}>
        {partialTarget ? (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Частичный отбор</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="rounded-md bg-muted/40 p-3 text-sm">
                <div className="font-medium">{partialTarget.item_name}</div>
                <div className="text-muted-foreground">
                  Осталось отобрать {partialTarget.pairs_required} пар, доступно {partialTarget.available_pairs} пар
                </div>
              </div>
              <div className="space-y-2">
                <label htmlFor="partial-quantity" className="text-sm font-medium">
                  Количество пар
                </label>
                <Input
                  id="partial-quantity"
                  type="number"
                  min={1}
                  max={Math.min(partialTarget.pairs_required, partialTarget.available_pairs)}
                  value={partialQuantity}
                  onChange={(event) => setPartialQuantity(Number(event.target.value))}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setPartialTarget(null)}>
                  Отмена
                </Button>
                <Button onClick={handleConfirmPartialPick} disabled={pickMutation.isPending}>
                  ОК
                </Button>
              </div>
            </div>
          </DialogContent>
        ) : null}
      </Dialog>

      <Dialog open={chzDialogOpen} onOpenChange={setChzDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Заказать ЧЗ</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-md bg-muted/40 p-3 text-sm">
              <div className="font-medium">Выбрано позиций: {selectedItems.length}</div>
              <div className="mt-2 space-y-2">
                {selectedItems.map((item) => (
                  <div key={item.order_item_id} className="rounded-md bg-background p-2">
                    {item.item_name} {item.item_size ?? '—'} · {item.pairs_required} пар
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <label htmlFor="chz-comment" className="text-sm font-medium">
                Комментарий
              </label>
              <Textarea
                id="chz-comment"
                value={chzComment}
                onChange={(event) => setChzComment(event.target.value)}
                placeholder="Необязательно"
                className="resize-none"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setChzDialogOpen(false)}>
                Отмена
              </Button>
              <Button onClick={() => requestChzMutation.mutate()} disabled={requestChzMutation.isPending}>
                Отправить
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Скрытая область для печати */}
      {printPortal}
    </section>
  )
}
