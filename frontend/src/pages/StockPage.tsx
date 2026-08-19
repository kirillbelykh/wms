import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { createPortal } from 'react-dom'
import * as XLSX from 'xlsx'
import { Download, Filter, Grid3X3, List, Printer, Trash2 } from 'lucide-react'
import { toast } from '@/lib/toast'

import { bulkDeleteStocks, getCells, getItems, getStocks, getWarehouses } from '@/api/client'
import { ConfirmDialog } from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { SelectNative } from '@/components/ui/input'
import { SearchInput } from '@/components/ui/search-input'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { WarehouseSummaryCard } from '@/components/warehouse/WarehouseSummaryCard'
import { WarehouseCardsSection } from '@/components/warehouse/WarehouseCardsSection'
import { cn, formatCoordinate, getErrorMessage, inventoryTypeLabel, inventoryTypeShortLabel, inventoryTypeUnitLabel } from '@/lib/utils'
import type { Cell, Item, Stock, Warehouse } from '@/types/wms'

type InventoryTypeFilter = 'all' | 'finished_goods' | 'raw_material' | 'consumable'
type QuantityRange = 'all' | 'low' | 'medium' | 'high'
type EnrichedStock = Stock & { cell: Cell; warehouse: Warehouse; item: Item }

const STOCK_LEVELS = {
  LOW: 100,
  MEDIUM: 500,
}

function getColorValue(colorName?: string | null): string {
  if (!colorName) return '#e5e7eb'

  const colors: Record<string, string> = {
    белый: '#f5f5f5',
    черный: '#111827',
    чёрный: '#111827',
    синий: '#2563eb',
    зеленый: '#16a34a',
    зелёный: '#16a34a',
    розовый: '#ec4899',
    красный: '#dc2626',
    желтый: '#eab308',
    жёлтый: '#eab308',
    фиолетовый: '#9333ea',
    натуральный: '#d6c0ad',
  }

  return colors[colorName.trim().toLowerCase()] ?? '#cbd5e1'
}

function getStockLevel(quantity: number): 'low' | 'medium' | 'high' {
  if (quantity < STOCK_LEVELS.LOW) return 'low'
  if (quantity < STOCK_LEVELS.MEDIUM) return 'medium'
  return 'high'
}

// Компонент для печатной таблицы
function PrintableStockTable({ stocks }: { stocks: EnrichedStock[] }) {
  return (
    <div className="print-only hidden print:block">
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-2">Отчёт по остаткам</h1>
        <p className="text-sm text-muted-foreground mb-4">
          Дата: {new Date().toLocaleString('ru-RU')}
        </p>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-black">
              <th className="text-left py-2 px-3 font-semibold">Склад</th>
              <th className="text-left py-2 px-3 font-semibold">Ячейка</th>
              <th className="text-left py-2 px-3 font-semibold">Номенклатура</th>
              <th className="text-left py-2 px-3 font-semibold">Размер</th>
              <th className="text-left py-2 px-3 font-semibold">Цвет</th>
              <th className="text-right py-2 px-3 font-semibold">Количество</th>
              <th className="text-right py-2 px-3 font-semibold">Кол-во кор</th>
              <th className="text-right py-2 px-3 font-semibold">Ед. в коробке</th>
              <th className="text-left py-2 px-3 font-semibold">Партия</th>
            </tr>
          </thead>
          <tbody>
            {stocks.map((stock) => {
              const boxesQuantity = stock.pairs_per_box ? Math.ceil(stock.pairs_quantity / stock.pairs_per_box) : null
              return (
                <tr key={stock.id} className="border-b border-gray-200">
                  <td className="py-2 px-3">{stock.warehouse.name}</td>
                  <td className="py-2 px-3 font-mono">{formatCoordinate(stock.cell)}</td>
                  <td className="py-2 px-3 font-medium">{stock.item.title}</td>
                  <td className="py-2 px-3">{stock.size || '—'}</td>
                  <td className="py-2 px-3">{stock.color || '—'}</td>
                  <td className="py-2 px-3 text-right">{stock.pairs_quantity}</td>
                  <td className="py-2 px-3 text-right">{boxesQuantity ?? '—'}</td>
                  <td className="py-2 px-3 text-right">{stock.pairs_per_box ?? '—'}</td>
                  <td className="py-2 px-3">{stock.batch_number || '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <div className="mt-4 text-xs text-muted-foreground">
          Всего записей: {stocks.length}
        </div>
      </div>
    </div>
  )
}

export function StockPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [itemFilter, setItemFilter] = useState('')
  const [cellFilter, setCellFilter] = useState('')
  const [inventoryTypeFilter, setInventoryTypeFilter] = useState<InventoryTypeFilter>('all')
  const [quantityRange, setQuantityRange] = useState<QuantityRange>('all')
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table')
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedStockIds, setSelectedStockIds] = useState<Set<number>>(new Set())
  const [printDialogOpen, setPrintDialogOpen] = useState(false)
  const [printWarehouseId, setPrintWarehouseId] = useState('')
  const [printStocks, setPrintStocks] = useState<EnrichedStock[]>([])

  const warehousesQuery = useQuery({ queryKey: ['warehouses'], queryFn: getWarehouses })
  const cellsQuery = useQuery({ queryKey: ['cells-all'], queryFn: () => getCells() })
  const stocksQuery = useQuery({ queryKey: ['stocks'], queryFn: getStocks })
  const itemsQuery = useQuery({ queryKey: ['items'], queryFn: getItems })

  const warehouses = useMemo(() => (Array.isArray(warehousesQuery.data) ? warehousesQuery.data : []), [warehousesQuery.data])
  const cells = useMemo(() => (Array.isArray(cellsQuery.data) ? cellsQuery.data : []), [cellsQuery.data])
  const stocks = useMemo(() => (Array.isArray(stocksQuery.data) ? stocksQuery.data : []), [stocksQuery.data])
  const items = useMemo(() => (Array.isArray(itemsQuery.data) ? itemsQuery.data : []), [itemsQuery.data])

  const cellById = useMemo(() => new Map(cells.map((cell) => [cell.id, cell])), [cells])
  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items])

  const enrichedStocks = useMemo<EnrichedStock[]>(() => {
    return stocks
      .filter((stock) => stock.pairs_quantity > 0)
      .map((stock) => {
        const cell = cellById.get(stock.cell_id)
        const warehouse = cell ? warehouses.find((candidate) => candidate.id === cell.warehouse_id) : undefined
        const item = itemById.get(stock.item_id)
        return { ...stock, cell, warehouse, item }
      })
      .filter((stock): stock is EnrichedStock => Boolean(stock.cell && stock.warehouse && stock.item))
  }, [cellById, itemById, stocks, warehouses])

  useEffect(() => {
    const existingStockIds = new Set(enrichedStocks.map((stock) => stock.id))
    setSelectedStockIds((current) => {
      const next = new Set(Array.from(current).filter((stockId) => existingStockIds.has(stockId)))
      return next.size === current.size ? current : next
    })
  }, [enrichedStocks])

  const warehouseStats = useMemo(() => {
    const stats = new Map<number, { stockCount: number; totalQuantity: number; cellCount: number; occupiedCells: number }>()
    const occupiedCellsByWarehouse = new Map<number, Set<number>>()

    for (const warehouse of warehouses) {
      stats.set(warehouse.id, {
        stockCount: 0,
        totalQuantity: 0,
        cellCount: warehouse.cells.length,
        occupiedCells: 0,
      })
    }

    for (const stock of enrichedStocks) {
      const warehouseId = stock.warehouse.id
      const current = stats.get(warehouseId)
      if (!current) continue

      current.stockCount += 1
      current.totalQuantity += stock.pairs_quantity

      const currentCells = occupiedCellsByWarehouse.get(warehouseId) ?? new Set<number>()
      currentCells.add(stock.cell_id)
      occupiedCellsByWarehouse.set(warehouseId, currentCells)
    }

    for (const [warehouseId, occupiedCells] of occupiedCellsByWarehouse) {
      const current = stats.get(warehouseId)
      if (current) current.occupiedCells = occupiedCells.size
    }

    return stats
  }, [enrichedStocks, warehouses])

  const itemFilterOptions = useMemo(() => {
    const titles = new Set<string>()
    for (const stock of enrichedStocks) {
      if (stock.item?.title) titles.add(stock.item.title)
    }
    return Array.from(titles).sort((left, right) => left.localeCompare(right, 'ru'))
  }, [enrichedStocks])

  const cellFilterOptions = useMemo(() => {
    const coords = new Set<string>()
    for (const stock of enrichedStocks) {
      if (stock.cell) coords.add(formatCoordinate(stock.cell))
    }
    return Array.from(coords).sort((left, right) => left.localeCompare(right, 'ru'))
  }, [enrichedStocks])

  const filteredStocks = useMemo(() => {
    const searchValue = search.trim().toLowerCase()

    const filtered = enrichedStocks.filter((stock) => {
      if (selectedWarehouseId !== null && stock.warehouse.id !== selectedWarehouseId) return false
      if (inventoryTypeFilter !== 'all' && stock.inventory_type !== inventoryTypeFilter) return false
      if (itemFilter && stock.item.title !== itemFilter) return false
      if (cellFilter && formatCoordinate(stock.cell) !== cellFilter) return false

      if (quantityRange !== 'all') {
        if (quantityRange === 'low' && stock.pairs_quantity >= STOCK_LEVELS.LOW) return false
        if (quantityRange === 'medium' && (stock.pairs_quantity < STOCK_LEVELS.LOW || stock.pairs_quantity >= STOCK_LEVELS.MEDIUM)) return false
        if (quantityRange === 'high' && stock.pairs_quantity < STOCK_LEVELS.MEDIUM) return false
      }

      if (!searchValue) return true

      const haystack = [
        stock.item.title,
        stock.item.name,
        formatCoordinate(stock.cell),
        stock.warehouse.name,
        stock.batch_number ?? '',
        stock.size ?? '',
        stock.color ?? '',
        stock.manufacturer ?? '',
      ]
        .join(' ')
        .toLowerCase()

      return haystack.includes(searchValue)
    })

    filtered.sort((left, right) => {
      const warehouseComparison = left.warehouse.name.localeCompare(right.warehouse.name, 'ru')
      if (warehouseComparison !== 0) return warehouseComparison

      const rackComparison = left.cell.rack - right.cell.rack
      if (rackComparison !== 0) return rackComparison

      const tierComparison = left.cell.tier - right.cell.tier
      if (tierComparison !== 0) return tierComparison

      const cellComparison = left.cell.cell - right.cell.cell
      if (cellComparison !== 0) return cellComparison

      const itemComparison = left.item.title.localeCompare(right.item.title, 'ru')
      if (itemComparison !== 0) return itemComparison

      const sizeComparison = (left.size ?? '').localeCompare(right.size ?? '', 'ru', { numeric: true })
      if (sizeComparison !== 0) return sizeComparison

      const colorComparison = (left.color ?? '').localeCompare(right.color ?? '', 'ru')
      if (colorComparison !== 0) return colorComparison

      const batchComparison = (left.batch_number ?? '').localeCompare(right.batch_number ?? '', 'ru', { numeric: true })
      if (batchComparison !== 0) return batchComparison

      const inventoryComparison = inventoryTypeLabel(left.inventory_type).localeCompare(
        inventoryTypeLabel(right.inventory_type),
        'ru',
      )
      if (inventoryComparison !== 0) return inventoryComparison

      const quantityComparison = right.pairs_quantity - left.pairs_quantity
      if (quantityComparison !== 0) return quantityComparison

      const boxComparison = (right.pairs_per_box ?? 0) - (left.pairs_per_box ?? 0)
      if (boxComparison !== 0) return boxComparison

      const manufacturerComparison = (left.manufacturer ?? '').localeCompare(right.manufacturer ?? '', 'ru')
      if (manufacturerComparison !== 0) return manufacturerComparison

      return 0
    })

    return filtered
  }, [cellFilter, enrichedStocks, inventoryTypeFilter, itemFilter, quantityRange, search, selectedWarehouseId])

  const visibleStockIds = useMemo(() => filteredStocks.map((stock) => stock.id), [filteredStocks])
  const selectedVisibleStockIds = useMemo(
    () => visibleStockIds.filter((stockId) => selectedStockIds.has(stockId)),
    [selectedStockIds, visibleStockIds],
  )
  const allVisibleStocksSelected =
    visibleStockIds.length > 0 && selectedVisibleStockIds.length === visibleStockIds.length

  const bulkDeleteMutation = useMutation({
    mutationFn: (stockIds: number[]) => bulkDeleteStocks(stockIds),
    onSuccess: async ({ deleted_count }) => {
      toast.success(`Списано остатков: ${deleted_count}`)
      setSelectedStockIds(new Set())
      setSelectionMode(false)

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['stocks'] }),
        queryClient.invalidateQueries({ queryKey: ['cells-all'] }),
        queryClient.invalidateQueries({ queryKey: ['warehouses'] }),
        queryClient.invalidateQueries({ queryKey: ['orders'] }),
      ])
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  const startSelection = () => {
    setViewMode('table')
    setSelectionMode(true)
    setSelectedStockIds(new Set())
  }

  const cancelSelection = () => {
    setSelectionMode(false)
    setSelectedStockIds(new Set())
  }

  const toggleStockSelection = (stockId: number) => {
    setSelectedStockIds((current) => {
      const next = new Set(current)
      if (next.has(stockId)) {
        next.delete(stockId)
      } else {
        next.add(stockId)
      }
      return next
    })
  }

  const toggleAllVisibleStocks = () => {
    setSelectedStockIds((current) => {
      const next = new Set(current)
      if (allVisibleStocksSelected) {
        visibleStockIds.forEach((stockId) => next.delete(stockId))
      } else {
        visibleStockIds.forEach((stockId) => next.add(stockId))
      }
      return next
    })
  }

  const printWarehouseOptions = useMemo(() => {
    return warehouses.map((warehouse) => {
      const stockCount = enrichedStocks.filter((stock) => stock.warehouse.id === warehouse.id).length
      return { warehouse, stockCount }
    })
  }, [enrichedStocks, warehouses])

  const exportToXLSX = () => {
    const header = [
      '№',
      'Склад',
      'Ячейка',
      'Тип',
      'Номенклатура',
      'Размер',
      'Цвет',
      'Производитель',
      'Количество',
      'Ед.',
      'Коробок',
      'Ед. в коробке',
      'Партия',
    ]
    const rows = filteredStocks.map((stock, index) => {
      const boxesQuantity = stock.pairs_per_box ? Math.ceil(stock.pairs_quantity / stock.pairs_per_box) : ''
      return [
        index + 1,
        stock.warehouse.name,
        formatCoordinate(stock.cell),
        inventoryTypeLabel(stock.inventory_type),
        stock.item.title,
        stock.size ?? '',
        stock.color ?? '',
        stock.manufacturer ?? '',
        stock.pairs_quantity,
        inventoryTypeUnitLabel(stock.inventory_type),
        boxesQuantity,
        stock.pairs_per_box ?? '',
        stock.batch_number ?? '',
      ]
    })
    const totalQuantity = filteredStocks.reduce((sum, stock) => sum + stock.pairs_quantity, 0)
    const worksheet = XLSX.utils.aoa_to_sheet([
      header,
      ...rows,
      [],
      ['Итого записей', filteredStocks.length],
      ['Итого количество', totalQuantity],
    ])
    worksheet['!cols'] = [
      { wch: 6 },
      { wch: 20 },
      { wch: 14 },
      { wch: 16 },
      { wch: 46 },
      { wch: 12 },
      { wch: 14 },
      { wch: 20 },
      { wch: 12 },
      { wch: 10 },
      { wch: 10 },
      { wch: 14 },
      { wch: 16 },
    ]
    worksheet['!autofilter'] = { ref: `A1:M${Math.max(rows.length + 1, 1)}` }

    const workbook = XLSX.utils.book_new()
    workbook.Props = {
      Title: 'Остатки WMS',
      Subject: 'Остатки по складам и ячейкам',
      CreatedDate: new Date(),
    }
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Остатки')
    XLSX.writeFile(workbook, `stocks_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.xlsx`)
    toast.success('Экспорт XLSX выполнен')
  }

  const isLoading = warehousesQuery.isLoading || cellsQuery.isLoading || stocksQuery.isLoading || itemsQuery.isLoading

  const handlePrint = () => {
    const defaultWarehouseId =
      selectedWarehouseId?.toString() ||
      printWarehouseOptions.find((option) => option.stockCount > 0)?.warehouse.id.toString() ||
      ''
    setPrintWarehouseId(defaultWarehouseId)
    setPrintDialogOpen(true)
  }

  const confirmPrint = () => {
    const warehouseId = Number(printWarehouseId)
    if (!warehouseId) {
      toast.error('Выберите склад для печати')
      return
    }

    const stocksToPrint = enrichedStocks.filter((stock) => stock.warehouse.id === warehouseId)
    if (stocksToPrint.length === 0) {
      toast.error('На выбранном складе нет остатков для печати')
      return
    }

    const cleanup = () => {
      document.body.classList.remove('wms-printing')
      setPrintStocks([])
    }

    document.body.classList.add('wms-printing')
    setPrintStocks(stocksToPrint)
    setPrintDialogOpen(false)

    window.addEventListener('afterprint', cleanup, { once: true })
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        window.print()
        window.setTimeout(cleanup, 30000)
      })
    })
  }

  const printPortal =
    printStocks.length > 0 && typeof document !== 'undefined'
      ? createPortal(<PrintableStockTable stocks={printStocks} />, document.body)
      : null

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
                    onSelect={(warehouseId) => setSelectedWarehouseId((current) => (current === warehouseId ? null : warehouseId))}
                    stockCount={stats?.stockCount ?? 0}
                    totalPairs={stats?.totalQuantity ?? 0}
                    cellCount={stats?.cellCount ?? 0}
                    occupiedCells={stats?.occupiedCells ?? 0}
                  />
                )
              })}
        </div>
      </WarehouseCardsSection>

      <Card>
        <Card.Content className="space-y-4 pt-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <SearchInput
              className="min-w-[220px] flex-1"
              placeholder="Поиск по складу, ячейке или номенклатуре"
              value={search}
              onChange={setSearch}
            />

            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setViewMode((current) => (current === 'table' ? 'cards' : 'table'))}
                disabled={selectionMode}
              >
                {viewMode === 'table' ? <Grid3X3 className="h-4 w-4" /> : <List className="h-4 w-4" />}
              </Button>
              <Button variant="outline" onClick={exportToXLSX}>
                <Download className="mr-2 h-4 w-4" />
                Экспорт
              </Button>
              <Button variant="outline" onClick={handlePrint}>
                <Printer className="mr-2 h-4 w-4" />
                Печать
              </Button>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <SelectNative
              searchable
              searchPlaceholder="Поиск номенклатуры…"
              value={itemFilter}
              onChange={(event) => setItemFilter(event.target.value)}
            >
              <option value="">Все номенклатуры</option>
              {itemFilterOptions.map((title) => (
                <option key={title} value={title}>
                  {title}
                </option>
              ))}
            </SelectNative>

            <SelectNative value={cellFilter} onChange={(event) => setCellFilter(event.target.value)}>
              <option value="">Все ячейки</option>
              {cellFilterOptions.map((cellCoordinate) => (
                <option key={cellCoordinate} value={cellCoordinate}>
                  {cellCoordinate}
                </option>
              ))}
            </SelectNative>

            <SelectNative value={inventoryTypeFilter} onChange={(event) => setInventoryTypeFilter(event.target.value as InventoryTypeFilter)}>
              <option value="all">Все типы</option>
              <option value="finished_goods">Готовая продукция</option>
              <option value="raw_material">Сырье</option>
              <option value="consumable">Упаковка</option>
            </SelectNative>

            <SelectNative value={quantityRange} onChange={(event) => setQuantityRange(event.target.value as QuantityRange)}>
              <option value="all">Все количества</option>
              <option value="low">Мало</option>
              <option value="medium">Средне</option>
              <option value="high">Много</option>
            </SelectNative>

            <Button
              variant="outline"
              onClick={() => {
                setSelectedWarehouseId(null)
                setSearch('')
                setItemFilter('')
                setCellFilter('')
                setInventoryTypeFilter('all')
                setQuantityRange('all')
              }}
            >
              <Filter className="mr-2 h-4 w-4" />
              Сбросить
            </Button>
          </div>

        </Card.Content>
      </Card>

      <Card>
        <Card.Content className="pt-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              {!selectionMode ? (
                <Button type="button" variant="outline" onClick={startSelection} disabled={isLoading || filteredStocks.length === 0}>
                  Выбрать
                </Button>
              ) : (
                <>
                  <Button type="button" variant="outline" onClick={cancelSelection}>
                    Отмена
                  </Button>
                  <ConfirmDialog
                    title="Списать выбранные остатки?"
                    description={`Будет списано ${selectedStockIds.size} записей остатков из ячеек и из общей таблицы остатков.`}
                    confirmLabel="Списать"
                    onConfirm={() => bulkDeleteMutation.mutate(Array.from(selectedStockIds))}
                  >
                    <Button
                      type="button"
                      variant="danger"
                      disabled={selectedStockIds.size === 0 || bulkDeleteMutation.isPending}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Списать остаток
                    </Button>
                  </ConfirmDialog>
                </>
              )}
            </div>
            {selectionMode && (
              <span className="text-sm text-muted-foreground">
                Выбрано {selectedStockIds.size}
              </span>
            )}
          </div>
          {isLoading ? (
            <div className="grid gap-3">
              {Array.from({ length: 8 }).map((_, index) => (
                <Skeleton key={index} className="h-16" />
              ))}
            </div>
          ) : filteredStocks.length === 0 ? (
            <p className="py-10 text-center text-muted-foreground">Остатки не найдены</p>
          ) : viewMode === 'table' ? (
            <div className="max-h-[calc(100vh-18rem)] overflow-auto">
              <Table>
                <TableHeader className="[&_th]:sticky [&_th]:top-0 [&_th]:z-20 [&_th]:bg-card [&_th]:shadow-[inset_0_-1px_0_hsl(var(--wms-border))]">
                  <TableRow>
                    {selectionMode && (
                      <TableHead className="w-10">
                        <Checkbox
                          isSelected={allVisibleStocksSelected}
                          onChange={toggleAllVisibleStocks}
                          aria-label="Выбрать все остатки"
                        />
                      </TableHead>
                    )}
                    <TableHead>Склад</TableHead>
                    <TableHead className="w-24">Ячейка</TableHead>
                    <TableHead>Номенклатура</TableHead>
                    <TableHead>Размер</TableHead>
                    <TableHead>Цвет</TableHead>
                    <TableHead>Количество</TableHead>
                    <TableHead>Кол-во кор</TableHead>
                    <TableHead>Ед. в коробке</TableHead>
                    <TableHead>Партия</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredStocks.map((stock) => {
                    const level = getStockLevel(stock.pairs_quantity)
                    const unitLabel = inventoryTypeUnitLabel(stock.inventory_type)
                    const boxesQuantity = stock.pairs_per_box ? Math.ceil(stock.pairs_quantity / stock.pairs_per_box) : null

                    return (
                      <TableRow
                        key={stock.id}
                        className={cn(
                          'cursor-pointer hover:bg-muted/40',
                          selectionMode && selectedStockIds.has(stock.id) && 'bg-muted/60',
                        )}
                        onClick={() => {
                          if (selectionMode) {
                            toggleStockSelection(stock.id)
                            return
                          }
                          navigate(`/items/${stock.item_id}`)
                        }}
                      >
                        {selectionMode && (
                          <TableCell onClick={(event) => event.stopPropagation()}>
                            <Checkbox
                              isSelected={selectedStockIds.has(stock.id)}
                              onChange={() => toggleStockSelection(stock.id)}
                              aria-label={`Выбрать остаток ${stock.item.title}`}
                            />
                          </TableCell>
                        )}
                        <TableCell className="max-w-28 truncate">{stock.warehouse.name}</TableCell>
                        <TableCell className="font-mono">{formatCoordinate(stock.cell)}</TableCell>
                        <TableCell>
                          <div className="font-medium">{stock.item.title}</div>
                        </TableCell>
                        <TableCell>{stock.size || '—'}</TableCell>
                        <TableCell>{stock.color || '—'}</TableCell>
                        <TableCell>
                          <Badge tone={level === 'low' ? 'warning' : level === 'medium' ? 'secondary' : 'success'}>
                            {stock.pairs_quantity} {unitLabel}
                          </Badge>
                        </TableCell>
                        <TableCell>{boxesQuantity ?? '—'}</TableCell>
                        <TableCell>{stock.pairs_per_box ?? '—'}</TableCell>
                        <TableCell>{stock.batch_number || '—'}</TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {filteredStocks.map((stock) => {
                const level = getStockLevel(stock.pairs_quantity)
                const unitLabel = inventoryTypeUnitLabel(stock.inventory_type)
                const characteristics = [stock.size ? `р ${stock.size}` : null, stock.color, stock.manufacturer, stock.venchik]
                  .filter(Boolean)
                  .join(' · ')

                return (
                  <button
                    key={stock.id}
                    type="button"
                    className="rounded-2xl border p-4 text-left transition-colors hover:bg-muted/30"
                    onClick={() => navigate(`/items/${stock.item_id}`)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{stock.warehouse.name}</div>
                        <div className="mt-1 font-mono text-sm">{formatCoordinate(stock.cell)}</div>
                      </div>
                      <Badge tone="secondary">{inventoryTypeShortLabel(stock.inventory_type)}</Badge>
                    </div>

                    <div className="mt-4">
                      <div className="font-semibold">{stock.item.title}</div>
                    </div>

                    <div className="mt-3 flex items-center gap-2">
                      {stock.color ? (
                        <span
                          className="inline-flex h-4 w-4 rounded-full border border-black/10"
                          style={{ backgroundColor: getColorValue(stock.color) }}
                          aria-hidden="true"
                        />
                      ) : null}
                      <span className="text-sm text-muted-foreground">{characteristics || 'Без дополнительных характеристик'}</span>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <div className="rounded-xl bg-muted/30 p-3">
                        <div className="text-xs text-muted-foreground">Количество</div>
                        <div className={cn('mt-1 text-xl font-semibold', level === 'low' ? 'text-amber-600' : 'text-foreground')}>
                          {stock.pairs_quantity}
                        </div>
                        <div className="text-xs text-muted-foreground">{unitLabel}</div>
                      </div>
                      <div className="rounded-xl bg-muted/30 p-3">
                        <div className="text-xs text-muted-foreground">Коробка</div>
                        <div className="mt-1 text-xl font-semibold">{stock.pairs_per_box ?? '—'}</div>
                        <div className="text-xs text-muted-foreground">{stock.inventory_type === 'consumable' ? 'шт/кор' : 'пар/кор'}</div>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {stock.batch_number ? <Badge tone="secondary">Партия: {stock.batch_number}</Badge> : null}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </Card.Content>
      </Card>

      <Dialog open={printDialogOpen} onOpenChange={setPrintDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Печать остатков</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Склад</label>
              <SelectNative value={printWarehouseId} onChange={(event) => setPrintWarehouseId(event.target.value)}>
                <option value="">Выберите склад</option>
                {printWarehouseOptions.map(({ warehouse, stockCount }) => (
                  <option key={warehouse.id} value={warehouse.id} disabled={stockCount === 0}>
                    {warehouse.name} ({stockCount})
                  </option>
                ))}
              </SelectNative>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setPrintDialogOpen(false)}>
                Отмена
              </Button>
              <Button onClick={confirmPrint}>
                <Printer className="mr-2 h-4 w-4" />
                Печать
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {printPortal}
    </section>
  )
}
