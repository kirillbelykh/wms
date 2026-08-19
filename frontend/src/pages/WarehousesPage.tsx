import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import { Grid2X2, List, Minus, Move, PackageCheck, Plus, Trash2 } from 'lucide-react'
import { toast } from '@/lib/toast'

import {
  createCell,
  createStock,
  createWarehouse,
  deleteCell,
  deleteWarehouse,
  getCells,
  getItems,
  getStocks,
  getWarehouses,
  moveStock,
  withdrawStock,
} from '@/api/client'
import { ConfirmDialog } from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input, SelectNative } from '@/components/ui/input'
import { SearchInput } from '@/components/ui/search-input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Slider } from '@/components/ui/slider'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { WarehouseSummaryCard } from '@/components/warehouse/WarehouseSummaryCard'
import { WarehouseCardsSection } from '@/components/warehouse/WarehouseCardsSection'
import { activateWithKeyboard, isEventFromInteractiveElement } from '@/lib/interaction'
import {
  cn,
  formatCoordinate,
  getErrorMessage,
  inventoryTypeLabel,
  inventoryTypeShortLabel,
  inventoryTypeUnitLabel,
  numberOrZero,
} from '@/lib/utils'
import type { Cell, Item, Stock } from '@/types/wms'

type CellFilter = 'all' | 'free' | 'full'
type ViewMode = 'grid' | 'list'
type InventoryType = 'finished_goods' | 'raw_material' | 'consumable'

type CellStockSummary = {
  title: string | null
  sizeLines: string[]
  batchLabel: string | null
  isMixedTitles: boolean
  inventoryType: Stock['inventory_type'] | null
}

const COLOR_REQUIRED_TITLES = new Set([
  'латекс 1-хлор',
  'латекс 2-хлор',
  'латекс hr',
  'латекс анатом',
  'латекс диаг',
  'латекс гладкие',
  'латекс с полимер',
  'латекс удлин',
  'нитрил диаг',
  'нитрил hr короткий',
  'нитрил hr удлин',
  'стер латекс 1-хлор',
  'стер латекс 2-хлор',
  'ультра',
])

const VENCHIK_REQUIRED_TITLES = new Set(['гинекология', 'микрохирургия', 'ортопедия'])

const COLOR_OPTIONS = ['белый', 'зеленый', 'натуральный', 'розовый', 'синий', 'фиолетовый', 'черный']
const VENCHIK_OPTIONS = ['с венчиком', 'без венчика']
const SIZE_OPTIONS = ['5', '5.5', '6', '6.5', '7', '7.5', '8', '8.5', '9', '9.5', '10.0', 'XS', 'S', 'M', 'L', 'XL']

function normalizeTitle(value: string | null | undefined) {
  return (value ?? '').trim().toLowerCase()
}

function needsColor(title: string) {
  return COLOR_REQUIRED_TITLES.has(normalizeTitle(title))
}

function needsVenchik(title: string) {
  return VENCHIK_REQUIRED_TITLES.has(normalizeTitle(title))
}

function buildCellStockSummary(stocks: Stock[], itemsById: Map<number, Item>): CellStockSummary {
  if (stocks.length === 0) {
    return {
      title: null,
      sizeLines: [],
      batchLabel: null,
      isMixedTitles: false,
      inventoryType: null,
    }
  }

  const titles = new Set<string>()
  const sizes = new Set<string>()
  const batches = new Set<string>()

  for (const stock of stocks) {
    const item = itemsById.get(stock.item_id)
    titles.add(item?.title ?? `Товар #${stock.item_id}`)

    const size = stock.size ?? item?.size ?? ''
    if (size) sizes.add(size)

    if (stock.batch_number) batches.add(stock.batch_number)
  }

  const isMixedTitles = titles.size > 1

  return {
    title: isMixedTitles ? 'Смешанная ячейка' : Array.from(titles)[0] ?? null,
    sizeLines: isMixedTitles ? [] : Array.from(sizes).sort((left, right) => left.localeCompare(right, 'ru')),
    batchLabel: !isMixedTitles && batches.size === 1 ? Array.from(batches)[0] : null,
    isMixedTitles,
    inventoryType: stocks[0]?.inventory_type ?? null,
  }
}

function getStockTitle(stock: Stock, itemsById: Map<number, Item>) {
  return itemsById.get(stock.item_id)?.title ?? `Товар #${stock.item_id}`
}

function getStockOptionLabel(stock: Stock, itemsById: Map<number, Item>) {
  const parts = [getStockTitle(stock, itemsById)]
  if (stock.size) parts.push(`р ${stock.size}`)
  if (stock.batch_number) parts.push(stock.batch_number)
  parts.push(`${stock.pairs_quantity} ${inventoryTypeUnitLabel(stock.inventory_type)}`)
  return parts.join(' · ')
}

function CellGridCard({
  cell,
  totalQuantity,
  summary,
  onSelect,
  onDelete,
  cardScale,
}: {
  cell: Cell
  totalQuantity: number
  summary: CellStockSummary
  onSelect: (cell: Cell) => void
  onDelete: (cellId: number) => void
  cardScale: number
}) {
  const hasStock = totalQuantity > 0
  const glassTint = hasStock ? 'rgba(242, 119, 24, 0.22)' : 'rgba(14, 161, 129, 0.18)'
  const glassBorder = hasStock ? 'rgba(242, 119, 24, 0.48)' : 'rgba(14, 161, 129, 0.42)'
  const glassShadow = hasStock
    ? '0 10px 24px rgba(242, 119, 24, 0.12), inset 0 1px 0 rgba(255,255,255,0.34)'
    : '0 10px 24px rgba(14, 161, 129, 0.10), inset 0 1px 0 rgba(255,255,255,0.34)'

  return (
    <motion.div
      role="button"
      tabIndex={0}
      layout={false} // Отключаем layout, если он не критичен
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.985 }}
      transition={{ duration: 0.14, ease: 'easeOut' }}
      className={cn(
        'group relative flex flex-col rounded-lg border p-2.5 text-left transition-all duration-200 cursor-pointer backdrop-blur-xl dark:text-slate-950',
      )}
      style={{
        minHeight: `${Math.round(88 * (cardScale / 100))}px`,
        backgroundColor: glassTint,
        borderColor: glassBorder,
        boxShadow: glassShadow,
      }}
      onClick={() => onSelect(cell)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelect(cell)
        }
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.16em] text-black/60 dark:text-slate-950/70">Ячейка</div>
          <div className="mt-0.5 whitespace-nowrap font-mono text-sm font-semibold">{formatCoordinate(cell)}</div>
        </div>
        {/* Removed status indicator dot */}
      </div>

      {hasStock ? (
        <div className="mt-2 flex flex-1 flex-col space-y-1.5">
          <div className="line-clamp-1 text-xs font-semibold leading-snug">{summary.title ?? 'Товар'}</div>
          {summary.sizeLines.length > 0 ? (
            <div className="space-y-0.5 text-[10px] text-black/65 dark:text-slate-950/75">
              {summary.sizeLines.slice(0, 2).map((size) => (
                <div key={size}>{`р ${size}`}</div>
              ))}
              {summary.sizeLines.length > 2 && (
                <div className="text-[10px] text-black/55 dark:text-slate-950/65">
                  +{summary.sizeLines.length - 2}
                </div>
              )}
            </div>
          ) : null}
          {summary.batchLabel ? <div className="text-[10px] text-black/65 dark:text-slate-950/75">Партия: {summary.batchLabel}</div> : null}
          <div className="mt-auto space-y-1 pt-0.5">
            <div className="text-[10px] font-medium leading-none text-black/65 dark:text-slate-950/75">
              {inventoryTypeShortLabel(summary.inventoryType)}
            </div>
            <Badge tone="secondary" className="h-5 bg-white/85 px-2 py-0 font-mono text-[10px] text-slate-900 shadow-none">
              {totalQuantity} {inventoryTypeUnitLabel(summary.inventoryType)}
            </Badge>
          </div>
        </div>
      ) : (
        <div className="mt-2 flex flex-1 items-end text-xs text-black/65 dark:text-slate-950/75">Готова к пополнению</div>
      )}

      <ConfirmDialog
        title="Удалить ячейку?"
        description={
          hasStock
            ? `Ячейка ${formatCoordinate(cell)} содержит остатки. При удалении связанные остатки тоже будут удалены. Продолжить?`
            : `Удалить ячейку ${formatCoordinate(cell)}?`
        }
        confirmLabel="Удалить"
        onConfirm={() => onDelete(cell.id)}
      >
        <Button
          variant="ghost"
          size="icon"
          data-interactive="true"
          className="absolute right-2 top-2 h-6 w-6 rounded-full bg-background/85 opacity-0 shadow-sm backdrop-blur transition-opacity group-hover:opacity-100 hover:bg-background"
          onClick={(event) => {
            event.stopPropagation() // Оставляем только здесь
          }}
        >
          <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-red-600" />
        </Button>
      </ConfirmDialog>
    </motion.div>
  )
}

function CellListRow({
  cell,
  totalQuantity,
  summary,
  onSelect,
  onDelete,
}: {
  cell: Cell
  totalQuantity: number
  summary: CellStockSummary
  onSelect: (cell: Cell) => void
  onDelete: (cellId: number) => void
}) {
  const sizeLabel = summary.sizeLines.length > 0 ? summary.sizeLines.map((size) => `р ${size}`).join(', ') : '—'
  const batchLabel = summary.batchLabel || '—'
  const hasStock = totalQuantity > 0

  return (
    <TableRow
      className="group cursor-pointer transition-colors hover:bg-muted/50"
      onClick={(event) => {
        if (isEventFromInteractiveElement(event.target)) return
        onSelect(cell)
      }}
    >
      <TableCell className="font-mono">{formatCoordinate(cell)}</TableCell>
      <TableCell>{hasStock ? summary.title ?? 'Товар' : '—'}</TableCell>
      <TableCell>{hasStock ? inventoryTypeShortLabel(summary.inventoryType) : '—'}</TableCell>
      <TableCell>{sizeLabel}</TableCell>
      <TableCell className="font-mono text-xs">{batchLabel}</TableCell>
      <TableCell>{hasStock ? `${totalQuantity} ${inventoryTypeUnitLabel(summary.inventoryType)}` : '0'}</TableCell>
      <TableCell>
        <Badge tone={hasStock ? 'danger' : 'success'}>{hasStock ? 'Занята' : 'Свободна'}</Badge>
      </TableCell>
      <TableCell className="text-right">
        <ConfirmDialog
          title="Удалить ячейку?"
          description={
            hasStock
              ? `Ячейка ${formatCoordinate(cell)} содержит остатки. При удалении связанные остатки тоже будут удалены. Продолжить?`
              : `Удалить ячейку ${formatCoordinate(cell)}?`
          }
          confirmLabel="Удалить"
          onConfirm={() => onDelete(cell.id)}
        >
          <Button
            variant="ghost"
            size="icon"
            data-interactive="true"
            className="h-8 w-8 opacity-0 transition-opacity group-hover:opacity-100"
            onClick={(event) => event.stopPropagation()}
          >
            <Trash2 className="h-4 w-4 text-muted-foreground hover:text-red-600" />
          </Button>
        </ConfirmDialog>
      </TableCell>
    </TableRow>
  )
}

export function WarehousesPage() {
  const queryClient = useQueryClient()
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<number | null>(null)
  const [selectedCellId, setSelectedCellId] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<CellFilter>('all')
  const [sizeFilter, setSizeFilter] = useState('')
  const [batchFilter, setBatchFilter] = useState('')
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [cellCardScale, setCellCardScale] = useState<number>(130)
  const [dialogMode, setDialogMode] = useState<'idle' | 'replenish' | 'withdraw' | 'move'>('idle')
  const [selectedStockId, setSelectedStockId] = useState(0)
  const [replenishItemId, setReplenishItemId] = useState(0)
  const [replenishInventoryType, setReplenishInventoryType] = useState<InventoryType>('finished_goods')
  const [withdrawQuantity, setWithdrawQuantity] = useState(1)
  const [moveToCellId, setMoveToCellId] = useState(0)
  const [moveQuantity, setMoveQuantity] = useState(1)
  const [confirmDescription, setConfirmDescription] = useState('')
  const [confirmAction, setConfirmAction] = useState<(() => void) | null>(null)

  const warehousesQuery = useQuery({ queryKey: ['warehouses'], queryFn: getWarehouses })
  const cellsQuery = useQuery({
    queryKey: ['cells', selectedWarehouseId],
    queryFn: () => getCells(selectedWarehouseId ?? undefined),
    enabled: selectedWarehouseId !== null,
  })
  const allCellsQuery = useQuery({ queryKey: ['cells-all'], queryFn: () => getCells() })
  const stocksQuery = useQuery({ queryKey: ['stocks'], queryFn: getStocks })
  const itemsQuery = useQuery({ queryKey: ['items'], queryFn: getItems })

  const warehouses = useMemo(() => (Array.isArray(warehousesQuery.data) ? warehousesQuery.data : []), [warehousesQuery.data])
  const cellsRaw = useMemo(() => (Array.isArray(cellsQuery.data) ? cellsQuery.data : []), [cellsQuery.data])
  const allCells = useMemo(() => (Array.isArray(allCellsQuery.data) ? allCellsQuery.data : []), [allCellsQuery.data])
  const stocks = useMemo(() => (Array.isArray(stocksQuery.data) ? stocksQuery.data : []), [stocksQuery.data])
  const items = useMemo(() => (Array.isArray(itemsQuery.data) ? itemsQuery.data : []), [itemsQuery.data])

  const itemsById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items])

  const cellAggMap = useMemo(() => {
    const map = new Map<number, { stocks: Stock[]; totalQuantity: number }>()
    for (const stock of stocks) {
      if (stock.pairs_quantity <= 0) continue
      const current = map.get(stock.cell_id) ?? { stocks: [], totalQuantity: 0 }
      current.stocks.push(stock)
      current.totalQuantity += stock.pairs_quantity
      map.set(stock.cell_id, current)
    }
    return map
  }, [stocks])

  const cellsGroupedByWarehouse = useMemo(() => {
    const map = new Map<number, Cell[]>()
    for (const cell of allCells) {
      const current = map.get(cell.warehouse_id) ?? []
      current.push(cell)
      map.set(cell.warehouse_id, current)
    }
    return map
  }, [allCells])

  const cells = useMemo(() => {
    return cellsRaw
      .filter((cell) => cell.warehouse_id === selectedWarehouseId)
      .map((cell) => {
        const aggregate = cellAggMap.get(cell.id)
        const totalQuantity = aggregate?.totalQuantity ?? 0
        return {
          ...cell,
          totalQuantity,
          summary: buildCellStockSummary(aggregate?.stocks ?? [], itemsById),
        }
      })
  }, [cellAggMap, cellsRaw, itemsById, selectedWarehouseId])

  const warehouseStats = useMemo(() => {
    const map = new Map<number, { cellCount: number; occupiedCells: number; stockCount: number; totalQuantity: number }>()

    for (const warehouse of warehouses) {
      const warehouseCells = cellsGroupedByWarehouse.get(warehouse.id) ?? []
      let occupiedCells = 0
      let stockCount = 0
      let totalQuantity = 0

      for (const cell of warehouseCells) {
        const aggregate = cellAggMap.get(cell.id)
        if (!aggregate || aggregate.totalQuantity <= 0) continue
        occupiedCells += 1
        stockCount += aggregate.stocks.length
        totalQuantity += aggregate.totalQuantity
      }

      map.set(warehouse.id, {
        cellCount: warehouseCells.length,
        occupiedCells,
        stockCount,
        totalQuantity,
      })
    }

    return map
  }, [cellAggMap, cellsGroupedByWarehouse, warehouses])

  useEffect(() => {
    if (selectedWarehouseId === null && warehouses.length > 0) {
      setSelectedWarehouseId(warehouses[0].id)
    }
  }, [selectedWarehouseId, warehouses])

  const filteredCells = useMemo(() => {
    const searchValue = search.trim().toLowerCase()
    const sizeValue = sizeFilter.trim().toLowerCase()
    const batchValue = batchFilter.trim().toLowerCase()

    return cells.filter((cell) => {
      const status = cell.totalQuantity > 0 ? 'full' : 'free'
      if (filter !== 'all' && filter !== status) return false
      if (searchValue && !formatCoordinate(cell).toLowerCase().includes(searchValue)) return false
      if (sizeValue && !cell.summary.sizeLines.join(' ').toLowerCase().includes(sizeValue)) return false
      if (batchValue && !(cell.summary.batchLabel ?? '').toLowerCase().includes(batchValue)) return false
      return true
    })
  }, [batchFilter, cells, filter, search, sizeFilter])

  const selectedCell = useMemo(
    () => (selectedCellId ? cells.find((cell) => cell.id === selectedCellId) ?? null : null),
    [cells, selectedCellId],
  )

  const selectedCellStocks = useMemo(() => {
    if (!selectedCell) return []
    return stocks.filter((stock) => stock.cell_id === selectedCell.id && stock.pairs_quantity > 0)
  }, [selectedCell, stocks])

  const selectedCellInventoryType = selectedCellStocks[0]?.inventory_type ?? null
  const selectedCellUnitLabel = inventoryTypeUnitLabel(selectedCellInventoryType)

  const replenishItems = useMemo(
    () => items.filter((item) => item.inventory_type === replenishInventoryType),
    [items, replenishInventoryType],
  )

  const selectedItemTitle = useMemo(
    () => items.find((item) => item.id === replenishItemId)?.title ?? '',
    [items, replenishItemId],
  )

  const selectedStock = useMemo(
    () => selectedCellStocks.find((stock) => stock.id === selectedStockId) ?? selectedCellStocks[0] ?? null,
    [selectedCellStocks, selectedStockId],
  )

  const selectedStockUnitLabel = inventoryTypeUnitLabel(selectedStock?.inventory_type ?? selectedCellInventoryType)

  useEffect(() => {
    if (!selectedCell) {
      setDialogMode('idle')
      setSelectedStockId(0)
      return
    }
    setSelectedStockId(selectedCellStocks[0]?.id ?? 0)
    setDialogMode('idle')
  }, [selectedCell?.id, selectedCellStocks])

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['warehouses'] }),
      queryClient.invalidateQueries({ queryKey: ['cells'] }),
      queryClient.invalidateQueries({ queryKey: ['cells-all'] }),
      queryClient.invalidateQueries({ queryKey: ['stocks'] }),
      queryClient.invalidateQueries({ queryKey: ['items'] }),
    ])
  }

  const createWarehouseMutation = useMutation({
    mutationFn: createWarehouse,
    onSuccess: async (warehouse) => {
      toast.success('Склад создан')
      setSelectedWarehouseId(warehouse.id)
      await invalidate()
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  const deleteWarehouseMutation = useMutation({
    mutationFn: deleteWarehouse,
    onSuccess: async () => {
      toast.success('Склад удален')
      await invalidate()
      if (selectedWarehouseId !== null) {
        const nextWarehouse = warehouses.find((warehouse) => warehouse.id !== selectedWarehouseId)
        setSelectedWarehouseId(nextWarehouse?.id ?? null)
      }
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  const createCellMutation = useMutation({
    mutationFn: createCell,
    onSuccess: async () => {
      toast.success('Ячейка добавлена')
      await invalidate()
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  const deleteCellMutation = useMutation({
    mutationFn: deleteCell,
    onSuccess: async () => {
      toast.success('Ячейка удалена')
      setSelectedCellId(null)
      await invalidate()
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  const replenishMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      if (!selectedCell) throw new Error('Ячейка не выбрана')

      const itemId = numberOrZero(formData.get('item_id'))
      const quantity = numberOrZero(formData.get('pairs_quantity'))
      const quantityPerBox = numberOrZero(formData.get('pairs_per_box'))
      const batchNumber = String(formData.get('batch_number') ?? '').trim()
      const size = String(formData.get('size') ?? '').trim()
      const color = String(formData.get('color') ?? '').trim()
      const venchik = String(formData.get('venchik') ?? '').trim()
      const manufacturer = String(formData.get('manufacturer') ?? '').trim()
      const inventoryType = String(formData.get('inventory_type') ?? 'finished_goods').trim() as InventoryType

      if (selectedCellStocks.length > 0 && selectedCellStocks.some((stock) => stock.inventory_type !== inventoryType)) {
        throw new Error('В одной ячейке нельзя смешивать разные типы остатков')
      }
      if (!itemId || quantity <= 0) {
        throw new Error('Заполните обязательные поля')
      }

      // ✅ Найти или создать товар ТОЛЬКО по названию (без размера и цвета)
      const selectedItem = items.find(item => item.id === itemId)
      if (!selectedItem) {
        throw new Error('Выбранная номенклатура не найдена')
      }

      // Создаем остаток с атрибутами
      return createStock(selectedCell.id, {
        item_id: itemId,
        pairs_quantity: quantity,
        pairs_per_box: quantityPerBox > 0 ? quantityPerBox : null,
        batch_number: inventoryType === 'finished_goods' ? batchNumber || null : null,
        size: inventoryType === 'consumable' ? null : size || null,
        color: inventoryType === 'finished_goods' ? color || null : null,
        venchik: inventoryType === 'finished_goods' ? venchik || null : null,
        inventory_type: inventoryType,
        manufacturer: inventoryType === 'raw_material' ? manufacturer || null : null,
      })
    },
    onSuccess: async () => {
      toast.success('Остаток обновлен')
      setDialogMode('idle')
      await invalidate()
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  const withdrawMutation = useMutation({
    mutationFn: async (quantity: number) => {
      if (!selectedStockId) throw new Error('Выберите позицию')
      return withdrawStock(selectedStockId, quantity)
    },
    onSuccess: async () => {
      toast.success('Списание выполнено')
      setDialogMode('idle')
      await invalidate()
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  const moveMutation = useMutation({
    mutationFn: async (payload: { toCellId: number; quantity: number }) => {
      if (!selectedStockId) throw new Error('Выберите позицию')
      return moveStock(selectedStockId, { to_cell_id: payload.toCellId, pairs_quantity: payload.quantity })
    },
    onSuccess: async () => {
      toast.success('Перемещение выполнено')
      setDialogMode('idle')
      await invalidate()
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  const handleReplenishStart = () => {
    setDialogMode('replenish')
    setReplenishItemId(0)
    setReplenishInventoryType(selectedCellInventoryType ?? 'finished_goods')
  }

  const handleWithdrawStart = () => {
    setDialogMode('withdraw')
    setSelectedStockId(selectedCellStocks[0]?.id ?? 0)
    setWithdrawQuantity(1)
  }

  const handleMoveStart = () => {
    setDialogMode('move')
    setSelectedStockId(selectedCellStocks[0]?.id ?? 0)
    setMoveToCellId(0)
    setMoveQuantity(selectedCellStocks[0]?.pairs_quantity ?? 1)
  }

  const handleReplenishSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const nextItemId = numberOrZero(formData.get('item_id'))
    const nextBatchNumber = String(formData.get('batch_number') ?? '').trim()
    const firstStock = selectedCellStocks[0]

    if (firstStock) {
      if (firstStock.item_id !== nextItemId) {
        setConfirmDescription('В ячейке уже лежит другая номенклатура этого же типа. Пополнить все равно?')
        setConfirmAction(() => () => replenishMutation.mutate(formData))
        return
      }

      if (firstStock.inventory_type === 'finished_goods' && firstStock.batch_number && nextBatchNumber && firstStock.batch_number !== nextBatchNumber) {
        setConfirmDescription('В ячейке уже лежит та же номенклатура, но с другой партией. Пополнить все равно?')
        setConfirmAction(() => () => replenishMutation.mutate(formData))
        return
      }
    }

    replenishMutation.mutate(formData)
  }

  const handleWithdrawConfirm = () => {
    if (!selectedStock) return
    setConfirmDescription(`Списать "${getStockTitle(selectedStock, itemsById)}" в количестве ${withdrawQuantity} ${selectedStockUnitLabel}?`)
    setConfirmAction(() => () => withdrawMutation.mutate(withdrawQuantity))
  }

  const handleMoveConfirm = () => {
    if (!selectedStock) return
    const targetCell = allCells.find((cell) => cell.id === moveToCellId)
    const targetLabel = targetCell ? formatCoordinate(targetCell) : 'выбранную ячейку'
    setConfirmDescription(
      `Переместить "${getStockTitle(selectedStock, itemsById)}" в количестве ${moveQuantity} ${selectedStockUnitLabel} в ячейку ${targetLabel}?`,
    )
    setConfirmAction(() => () => moveMutation.mutate({ toCellId: moveToCellId, quantity: moveQuantity }))
  }

  const isLoading =
    warehousesQuery.isLoading || cellsQuery.isLoading || allCellsQuery.isLoading || stocksQuery.isLoading || itemsQuery.isLoading

  return (
    <section className="page-shell space-y-5">
      <WarehouseCardsSection
        selectedLabel={
          selectedWarehouseId !== null
            ? `№${warehouses.find((warehouse) => warehouse.id === selectedWarehouseId)?.name ?? selectedWarehouseId}`
            : null
        }
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {warehousesQuery.isLoading
            ? Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-32" />)
            : warehouses.map((warehouse) => {
                const stats = warehouseStats.get(warehouse.id)
                return (
                  <WarehouseSummaryCard
                    key={warehouse.id}
                    warehouse={warehouse}
                    isSelected={selectedWarehouseId === warehouse.id}
                    onSelect={setSelectedWarehouseId}
                    stockCount={stats?.stockCount ?? 0}
                    totalPairs={stats?.totalQuantity ?? 0}
                    cellCount={stats?.cellCount ?? 0}
                    occupiedCells={stats?.occupiedCells ?? 0}
                    onDelete={(warehouseId) => deleteWarehouseMutation.mutate(warehouseId)}
                    deleteDescription={`Удалить склад "${warehouse.name}"? Все ячейки и остатки на этом складе будут удалены.`}
                  />
                )
              })}
        </div>
      </WarehouseCardsSection>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Plus className="mr-1 h-4 w-4" />
                Склад
              </Button>
            </DialogTrigger>
            <DialogContent title="Создать склад">
              <form
                className="space-y-4"
                onSubmit={(event) => {
                  event.preventDefault()
                  const formData = new FormData(event.currentTarget)
                  const name = String(formData.get('name') ?? '').trim()
                  if (name) createWarehouseMutation.mutate({ name })
                }}
              >
                <div className="space-y-2">
                  <Label htmlFor="warehouse-name">Название</Label>
                  <Input id="warehouse-name" name="name" required />
                </div>
                <Button type="submit" disabled={createWarehouseMutation.isPending}>
                  Создать
                </Button>
              </form>
            </DialogContent>
          </Dialog>

          <Dialog>
            <DialogTrigger asChild>
              <Button size="sm" disabled={selectedWarehouseId === null}>
                <Plus className="mr-1 h-4 w-4" />
                Ячейка
              </Button>
            </DialogTrigger>
            <DialogContent title="Добавить ячейку">
              <form
                className="grid gap-4 sm:grid-cols-3"
                onSubmit={(event) => {
                  event.preventDefault()
                  if (selectedWarehouseId === null) return
                  const formData = new FormData(event.currentTarget)
                  createCellMutation.mutate({
                    warehouse_id: selectedWarehouseId,
                    rack: numberOrZero(formData.get('rack')),
                    cell: numberOrZero(formData.get('cell')),
                    tier: numberOrZero(formData.get('tier')),
                  })
                }}
              >
                <Input name="rack" type="number" min={1} placeholder="Стеллаж" required />
                <Input name="cell" type="number" min={1} placeholder="Ячейка" required />
                <Input name="tier" type="number" min={1} placeholder="Ярус" required />
                <Button className="sm:col-span-3" type="submit" disabled={createCellMutation.isPending}>
                  Добавить
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <SearchInput
            className="min-w-[160px] flex-1"
            placeholder="Поиск по координате"
            value={search}
            onChange={setSearch}
          />

          <div className="flex flex-wrap items-center gap-2">
            <SelectNative
              value={filter}
              onChange={(event) => setFilter(event.target.value as CellFilter)}
              className="h-9 w-32 shrink-0 [&_[data-slot=select-trigger]]:h-9 [&_[data-slot=select-trigger]]:min-h-9 [&_[data-slot=select-value]]:truncate"
            >
              <option value="all">Все</option>
              <option value="free">Свободные</option>
              <option value="full">Занятые</option>
            </SelectNative>
            <Input
              className="h-9 w-32 shrink-0"
              fullWidth={false}
              placeholder="Размер"
              value={sizeFilter}
              onChange={(event) => setSizeFilter(event.target.value)}
            />
            <Input
              className="h-9 w-32 shrink-0"
              fullWidth={false}
              placeholder="Партия"
              value={batchFilter}
              onChange={(event) => setBatchFilter(event.target.value)}
            />
            {viewMode === 'grid' ? (
              <Slider
                className="min-w-[180px] w-44"
                min={85}
                max={150}
                step={5}
                value={cellCardScale}
                onChange={setCellCardScale}
                formatOutput={(v) => `${v}%`}
                aria-label="Масштаб карточек ячеек"
              />
            ) : null}
            <Button variant="outline" size="icon" onClick={() => setViewMode((value) => (value === 'grid' ? 'list' : 'grid'))}>
              {viewMode === 'grid' ? <List className="h-4 w-4" /> : <Grid2X2 className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>

      <Card>
        <Card.Header>
          <Card.Title>
            {selectedWarehouseId !== null
              ? warehouses.find((warehouse) => warehouse.id === selectedWarehouseId)?.name ?? 'Склад'
              : 'Выберите склад'}
          </Card.Title>
        </Card.Header>
        <Card.Content>
          {!selectedWarehouseId ? (
            <p className="text-center text-muted-foreground">Выберите склад выше</p>
          ) : isLoading ? (
            <div className={viewMode === 'grid' ? 'grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6' : 'space-y-3'}>
              {Array.from({ length: 10 }).map((_, index) => (
                <Skeleton key={index} className="h-28" />
              ))}
            </div>
          ) : filteredCells.length === 0 ? (
            <p className="text-center text-muted-foreground">Ячейки не найдены</p>
          ) : viewMode === 'grid' ? (
            <div
              className="grid gap-3"
              style={{
                gridTemplateColumns: `repeat(auto-fill, minmax(${Math.round(104 * (cellCardScale / 100))}px, 1fr))`,
              }}
            >
              <AnimatePresence>
                {filteredCells.map((cell) => (
                  <CellGridCard
                    key={cell.id}
                    cell={cell}
                    totalQuantity={cell.totalQuantity}
                    summary={cell.summary}
                    onSelect={(nextCell) => setSelectedCellId(nextCell.id)}
                    onDelete={(cellId) => deleteCellMutation.mutate(cellId)}
                    cardScale={cellCardScale}
                  />
                ))}
              </AnimatePresence>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Координаты</TableHead>
                    <TableHead>Номенклатура</TableHead>
                    <TableHead>Тип</TableHead>
                    <TableHead>Размер</TableHead>
                    <TableHead>Партия</TableHead>
                    <TableHead>Количество</TableHead>
                    <TableHead>Статус</TableHead>
                    <TableHead className="w-[60px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCells.map((cell) => (
                    <CellListRow
                      key={cell.id}
                      cell={cell}
                      totalQuantity={cell.totalQuantity}
                      summary={cell.summary}
                      onSelect={(nextCell) => setSelectedCellId(nextCell.id)}
                      onDelete={(cellId) => deleteCellMutation.mutate(cellId)}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </Card.Content>
      </Card>

      <Dialog open={selectedCell !== null} onOpenChange={(open) => !open && setSelectedCellId(null)}>
        {selectedCell ? (
          <DialogContent className="max-w-2xl">
            <motion.div initial={{ opacity: 0, scale: 0.98, y: 6 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 26 }}>
              <DialogHeader>
                <DialogTitle>Ячейка {formatCoordinate(selectedCell)}</DialogTitle>
              </DialogHeader>

              <div className="mt-4 space-y-5">
                <div className="rounded-2xl border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Ячейка</div>
                      <div className="mt-1 font-mono text-lg font-semibold">{formatCoordinate(selectedCell)}</div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {selectedCellInventoryType ? <Badge tone="secondary">{inventoryTypeLabel(selectedCellInventoryType)}</Badge> : null}
                      <Badge tone={selectedCellStocks.length > 0 ? 'danger' : 'success'}>
                        {selectedCellStocks.length > 0 ? 'Занята' : 'Свободна'}
                      </Badge>
                    </div>
                  </div>

                  {selectedCellStocks.length > 0 ? (
                    <div className="mt-4 space-y-3">
                      <div className="text-sm text-muted-foreground">
                        Всего: <span className="font-semibold text-foreground">{selectedCellStocks.reduce((sum, stock) => sum + stock.pairs_quantity, 0)}</span>{' '}
                        {selectedCellUnitLabel}
                      </div>

                      {selectedCellStocks.map((stock) => {
                        const item = itemsById.get(stock.item_id)
                        const unitLabel = inventoryTypeUnitLabel(stock.inventory_type)
                        const boxesCount =
                          stock.pairs_per_box && stock.pairs_per_box > 0 ? Math.ceil(stock.pairs_quantity / stock.pairs_per_box) : null

                        return (
                          <div key={stock.id} className="rounded-xl border bg-muted/20 p-4">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <div className="font-semibold">{item?.title ?? `Товар #${stock.item_id}`}</div>
                                <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                                  {stock.size ? <span>{`р ${stock.size}`}</span> : null}
                                  {stock.color ? <span>{stock.color}</span> : null}
                                  {stock.venchik ? <span>{stock.venchik}</span> : null}
                                  {stock.manufacturer ? <span>{stock.manufacturer}</span> : null}
                                  {stock.batch_number ? <span>{`Партия ${stock.batch_number}`}</span> : null}
                                </div>
                              </div>
                              <Badge tone="secondary">{inventoryTypeShortLabel(stock.inventory_type)}</Badge>
                            </div>

                            <div className="mt-3 grid gap-3 sm:grid-cols-3">
                              <div className="rounded-xl bg-background p-3 text-center">
                                <div className="text-xs text-muted-foreground">Количество</div>
                                <div className="mt-1 font-semibold">
                                  {stock.pairs_quantity} {unitLabel}
                                </div>
                              </div>
                              <div className="rounded-xl bg-background p-3 text-center">
                                <div className="text-xs text-muted-foreground">{stock.inventory_type === 'consumable' ? 'Штук в коробке' : 'Пар в коробке'}</div>
                                <div className="mt-1 font-semibold">{stock.pairs_per_box ?? '—'}</div>
                              </div>
                              <div className="rounded-xl bg-background p-3 text-center">
                                <div className="text-xs text-muted-foreground">Коробок</div>
                                <div className="mt-1 font-semibold">{boxesCount ?? '—'}</div>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <p className="mt-4 text-sm text-muted-foreground">Ячейка свободна и готова к пополнению</p>
                  )}
                </div>

                {dialogMode === 'idle' ? (
                  <div className="grid grid-cols-3 gap-3">
                    <Button variant="outline" className="h-16 flex-col gap-1" onClick={handleReplenishStart}>
                      <PackageCheck className="h-5 w-5" />
                      <span className="text-xs">Пополнить</span>
                    </Button>
                    <Button variant="outline" className="h-16 flex-col gap-1" disabled={selectedCellStocks.length === 0} onClick={handleWithdrawStart}>
                      <Minus className="h-5 w-5" />
                      <span className="text-xs">Списать</span>
                    </Button>
                    <Button variant="outline" className="h-16 flex-col gap-1" disabled={selectedCellStocks.length === 0} onClick={handleMoveStart}>
                      <Move className="h-5 w-5" />
                      <span className="text-xs">Переместить</span>
                    </Button>
                  </div>
                ) : null}

                {dialogMode === 'replenish' ? (
                  <form onSubmit={handleReplenishSubmit} className="space-y-4">
                    <h3 className="text-sm font-semibold">Пополнение ячейки</h3>

                    <div className="space-y-2">
                      <Label htmlFor="inventory_type">Тип остатка</Label>
                      <SelectNative
                        id="inventory_type"
                        name="inventory_type"
                        value={replenishInventoryType}
                        disabled={selectedCellInventoryType !== null}
                        onChange={(event) => setReplenishInventoryType(event.target.value as InventoryType)}
                      >
                        <option value="finished_goods">Готовая продукция</option>
                        <option value="raw_material">Сырье</option>
                        <option value="consumable">Упаковка</option>
                      </SelectNative>
                      {selectedCellInventoryType ? (
                        <p className="text-xs text-muted-foreground">Тип зафиксирован, потому что в ячейке уже лежит {inventoryTypeLabel(selectedCellInventoryType).toLowerCase()}.</p>
                      ) : null}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="item_id">Номенклатура</Label>
                      <SelectNative
                        id="item_id"
                        name="item_id"
                        searchable
                        searchPlaceholder="Поиск номенклатуры…"
                        value={replenishItemId || ''}
                        onChange={(event) => setReplenishItemId(Number(event.target.value))}
                        required
                      >
                        <option value="">Выберите номенклатуру</option>
                        {replenishItems.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.title}
                          </option>
                        ))}
                      </SelectNative>
                    </div>

                    {replenishInventoryType !== 'consumable' ? (
                      <div className="space-y-2">
                        <Label htmlFor="size">Размер</Label>
                        <SelectNative id="size" name="size" defaultValue="">
                          <option value="">Выберите размер</option>
                          {SIZE_OPTIONS.map((size) => (
                            <option key={size} value={size}>
                              {size}
                            </option>
                          ))}
                        </SelectNative>
                      </div>
                    ) : null}

                    {replenishInventoryType === 'raw_material' ? (
                      <div className="space-y-2">
                        <Label htmlFor="manufacturer">Производитель</Label>
                        <Input id="manufacturer" name="manufacturer" placeholder="Необязательно" />
                      </div>
                    ) : null}

                    {replenishInventoryType === 'finished_goods' && needsColor(selectedItemTitle) ? (
                      <div className="space-y-2">
                        <Label htmlFor="color">Цвет</Label>
                        <SelectNative id="color" name="color" defaultValue="">
                          <option value="">Выберите цвет</option>
                          {COLOR_OPTIONS.map((color) => (
                            <option key={color} value={color}>
                              {color}
                            </option>
                          ))}
                        </SelectNative>
                      </div>
                    ) : null}

                    {replenishInventoryType === 'finished_goods' && needsVenchik(selectedItemTitle) ? (
                      <div className="space-y-2">
                        <Label htmlFor="venchik">Венчик</Label>
                        <SelectNative id="venchik" name="venchik" defaultValue="">
                          <option value="">Выберите вариант</option>
                          {VENCHIK_OPTIONS.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </SelectNative>
                      </div>
                    ) : null}

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="pairs_quantity">Количество {replenishInventoryType === 'consumable' ? 'штук' : 'пар'}</Label>
                        <Input id="pairs_quantity" name="pairs_quantity" type="number" min={1} required />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="pairs_per_box">{replenishInventoryType === 'consumable' ? 'Штук в коробке' : 'Пар в коробке'}</Label>
                        <Input id="pairs_per_box" name="pairs_per_box" type="number" min={1} defaultValue="1" />
                      </div>
                    </div>

                    {replenishInventoryType === 'finished_goods' ? (
                      <div className="space-y-2">
                        <Label htmlFor="batch_number">Партия</Label>
                        <Input id="batch_number" name="batch_number" />
                      </div>
                    ) : null}

                    <div className="flex gap-2">
                      <Button type="submit" disabled={replenishMutation.isPending}>
                        Пополнить
                      </Button>
                      <Button type="button" variant="ghost" onClick={() => setDialogMode('idle')}>
                        Отмена
                      </Button>
                    </div>
                  </form>
                ) : null}

                {dialogMode === 'withdraw' && selectedStock ? (
                  <div className="space-y-4">
                    <h3 className="text-sm font-semibold">Списание</h3>

                    {selectedCellStocks.length > 1 ? (
                      <div className="space-y-2">
                        <Label htmlFor="withdraw-stock">Позиция</Label>
                        <SelectNative id="withdraw-stock" value={selectedStockId} onChange={(event) => setSelectedStockId(Number(event.target.value))}>
                          {selectedCellStocks.map((stock) => (
                            <option key={stock.id} value={stock.id}>
                              {getStockOptionLabel(stock, itemsById)}
                            </option>
                          ))}
                        </SelectNative>
                      </div>
                    ) : null}

                    <div className="rounded-xl bg-muted/30 p-4 text-sm">
                      <p>Номенклатура: {getStockTitle(selectedStock, itemsById)}</p>
                      {selectedStock.size ? <p>Размер: {selectedStock.size}</p> : null}
                      {selectedStock.color ? <p>Цвет: {selectedStock.color}</p> : null}
                      {selectedStock.manufacturer ? <p>Производитель: {selectedStock.manufacturer}</p> : null}
                      {selectedStock.batch_number ? <p>Партия: {selectedStock.batch_number}</p> : null}
                      <p>
                        Доступно: {selectedStock.pairs_quantity} {selectedStockUnitLabel}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="withdraw-quantity">Количество {selectedStockUnitLabel}</Label>
                      <Input
                        id="withdraw-quantity"
                        type="number"
                        min={1}
                        max={selectedStock.pairs_quantity}
                        value={withdrawQuantity}
                        onChange={(event) => setWithdrawQuantity(Number(event.target.value))}
                      />
                    </div>

                    <div className="flex gap-2">
                      <Button variant="danger" onClick={handleWithdrawConfirm}>
                        Списать
                      </Button>
                      <Button variant="ghost" onClick={() => setDialogMode('idle')}>
                        Отмена
                      </Button>
                    </div>
                  </div>
                ) : null}

                {dialogMode === 'move' && selectedStock ? (
                  <div className="space-y-4">
                    <h3 className="text-sm font-semibold">Перемещение</h3>

                    {selectedCellStocks.length > 1 ? (
                      <div className="space-y-2">
                        <Label htmlFor="move-stock">Позиция</Label>
                        <SelectNative id="move-stock" value={selectedStockId} onChange={(event) => setSelectedStockId(Number(event.target.value))}>
                          {selectedCellStocks.map((stock) => (
                            <option key={stock.id} value={stock.id}>
                              {getStockOptionLabel(stock, itemsById)}
                            </option>
                          ))}
                        </SelectNative>
                      </div>
                    ) : null}

                    <div className="rounded-xl bg-muted/30 p-4 text-sm">
                      <p>Номенклатура: {getStockTitle(selectedStock, itemsById)}</p>
                      {selectedStock.size ? <p>Размер: {selectedStock.size}</p> : null}
                      {selectedStock.color ? <p>Цвет: {selectedStock.color}</p> : null}
                      {selectedStock.manufacturer ? <p>Производитель: {selectedStock.manufacturer}</p> : null}
                      {selectedStock.batch_number ? <p>Партия: {selectedStock.batch_number}</p> : null}
                      <p>
                        Доступно: {selectedStock.pairs_quantity} {selectedStockUnitLabel}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="target-cell">Целевая ячейка</Label>
                      <SelectNative id="target-cell" value={moveToCellId} onChange={(event) => setMoveToCellId(Number(event.target.value))}>
                        <option value={0}>Выберите ячейку</option>
                        {warehouses.map((warehouse) => {
                          const warehouseCells = cellsGroupedByWarehouse.get(warehouse.id) ?? []
                          const availableCells = warehouseCells.filter((cell) => cell.id !== selectedCell.id)
                          if (availableCells.length === 0) return null

                          return (
                            <optgroup key={warehouse.id} label={`Склад ${warehouse.name}`}>
                              {availableCells.map((cell) => (
                                <option key={cell.id} value={cell.id}>
                                  {formatCoordinate(cell)}
                                </option>
                              ))}
                            </optgroup>
                          )
                        })}
                      </SelectNative>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="move-quantity">Количество {selectedStockUnitLabel}</Label>
                      <Input
                        id="move-quantity"
                        type="number"
                        min={1}
                        max={selectedStock.pairs_quantity}
                        value={moveQuantity}
                        onChange={(event) => setMoveQuantity(Number(event.target.value))}
                      />
                    </div>

                    <div className="flex gap-2">
                      <Button variant="secondary" disabled={moveToCellId === 0} onClick={handleMoveConfirm}>
                        Переместить
                      </Button>
                      <Button variant="ghost" onClick={() => setDialogMode('idle')}>
                        Отмена
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            </motion.div>
          </DialogContent>
        ) : null}
      </Dialog>

      <Dialog open={confirmAction !== null} onOpenChange={(open) => !open && setConfirmAction(null)}>
        <DialogContent title="Подтверждение">
          <p className="text-sm">{confirmDescription}</p>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmAction(null)}>
              Отмена
            </Button>
            <Button
              onClick={() => {
                confirmAction?.()
                setConfirmAction(null)
              }}
            >
              Подтвердить
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  )
}
