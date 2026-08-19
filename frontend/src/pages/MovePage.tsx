// frontend/src/pages/MovePage.tsx
import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, Move, X } from 'lucide-react'
import { toast } from '@/lib/toast'
import { getCells, getItems, getStocks, getWarehouses, moveStock } from '@/api/client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { WarehouseSummaryCard } from '@/components/warehouse/WarehouseSummaryCard'
import { WarehouseCardsSection } from '@/components/warehouse/WarehouseCardsSection'
import { Card } from '@/components/ui/card'
import { Input, SelectNative } from '@/components/ui/input'
import { SearchInput } from '@/components/ui/search-input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { Stock, Cell, Item } from '@/types/wms'
import { formatCoordinate, cn, getErrorMessage } from '@/lib/utils'

type ViewMode = 'grid' | 'list'
type CellStatus = 'free' | 'partial' | 'full'

function getCellStatus(stock: Stock | null | undefined): CellStatus {
  if (!stock) return 'free'
  if (stock.pairs_quantity <= 0) return 'free' 
  if (stock.pairs_quantity > 0) return 'full'
  return 'partial'
}

function GridCell({
  cell,
  stock,
  item,
  isSource,
  isTarget,
  sourceCellId,
  onSelectSource,
  onSelectTarget,
}: {
  cell: Cell
  stock: Stock | null
  item?: Item
  isSource: boolean
  isTarget: boolean
  sourceCellId: number | null
  onSelectSource: (cell: Cell, stock: Stock | null) => void
  onSelectTarget: (cellId: number) => void
}) {
  const hasStock = stock && stock.pairs_quantity > 0
  const effectiveStock = hasStock ? stock : null
  
  const status = getCellStatus(effectiveStock)
  const statusClass = {
    free: 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200',
    partial: 'bg-amber-50 dark:bg-amber-950/30 border-amber-200',
    full: 'bg-rose-50 dark:bg-rose-950/30 border-rose-200',
  }[status]

  const handleClick = () => {
    if (isSource || isTarget) return
    
    if (sourceCellId && sourceCellId !== cell.id) {
      onSelectTarget(cell.id)
    } else if (!sourceCellId && effectiveStock) {
      onSelectSource(cell, effectiveStock)
    }
  }

  const isClickable = (sourceCellId && sourceCellId !== cell.id) || (!sourceCellId && effectiveStock)

  return (
    <div
      className={cn(
        'relative rounded-md border p-3 transition-all',
        statusClass,
        isSource && 'ring-2 ring-primary bg-primary/5',
        isTarget && 'ring-2 ring-green-500 bg-green-50 dark:bg-green-950/20',
        isClickable && 'cursor-pointer hover:shadow-md'
      )}
      onClick={handleClick}
    >
      <div className="font-mono text-sm font-semibold">{formatCoordinate(cell)}</div>
      {effectiveStock && item ? (
        <>
          <div className="mt-1 text-xs font-medium line-clamp-1">{item.title}</div>
          <div className="text-xs text-muted-foreground">{effectiveStock.pairs_quantity} пар</div>
          {effectiveStock.batch_number && (
            <div className="mt-1 text-[10px] text-muted-foreground">Партия: {effectiveStock.batch_number}</div>
          )}
        </>
      ) : (
        <div className="mt-2 text-xs text-muted-foreground">Свободна</div>
      )}
      {isSource && (
        <div className="absolute -top-2 -left-2 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-white">
          Исходная
        </div>
      )}
      {isTarget && (
        <div className="absolute -top-2 -right-2 rounded-full bg-green-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
          Целевая
        </div>
      )}
    </div>
  )
}

export function MovePage() {
  const queryClient = useQueryClient()
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<number | null>(null)
  const [sourceCellId, setSourceCellId] = useState<number | null>(null)
  const [sourceWarehouseId, setSourceWarehouseId] = useState<number | null>(null)
  const [sourceCellCoord, setSourceCellCoord] = useState<string | null>(null)
  const [targetCellId, setTargetCellId] = useState<number | null>(null)
  const [moveQuantity, setMoveQuantity] = useState<number>(1)
  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [statusFilter, setStatusFilter] = useState<CellStatus | 'all'>('all')
  const [moveDialogOpen, setMoveDialogOpen] = useState(false)

  // Данные
  const warehousesQuery = useQuery({ 
    queryKey: ['warehouses'], 
    queryFn: getWarehouses,
    staleTime: 60_000,
  })
  
  const cellsQuery = useQuery({
    queryKey: ['cells', selectedWarehouseId],
    queryFn: () => getCells(selectedWarehouseId ?? undefined),
    enabled: !!selectedWarehouseId && selectedWarehouseId > 0,
    staleTime: 0,
    refetchOnMount: true,
  })
  
  const stocksQuery = useQuery({ 
    queryKey: ['stocks'], 
    queryFn: getStocks,
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  })
    
  const itemsQuery = useQuery({ 
    queryKey: ['items'], 
    queryFn: getItems,
    staleTime: 60_000,
  })

  // ✅ Сбрасываем кэш при каждом заходе на страницу
  useEffect(() => {
    queryClient.removeQueries({ queryKey: ['stocks'] })
    queryClient.removeQueries({ queryKey: ['cells'] })
    queryClient.invalidateQueries({ queryKey: ['stocks'] })
    queryClient.invalidateQueries({ queryKey: ['cells'] })
  }, [])

  const warehouses = useMemo(() => 
    Array.isArray(warehousesQuery.data) ? warehousesQuery.data : [], 
    [warehousesQuery.data]
  )
  const cells = useMemo(() => 
    Array.isArray(cellsQuery.data) ? cellsQuery.data : [], 
    [cellsQuery.data]
  )
  const stocks = useMemo(() => {
    const data = Array.isArray(stocksQuery.data) ? stocksQuery.data : []
    return data.filter(s => s.pairs_quantity > 0)
  }, [stocksQuery.data])
  const items = useMemo(() => 
    Array.isArray(itemsQuery.data) ? itemsQuery.data : [], 
    [itemsQuery.data]
  )

  const stockByCellId = useMemo(() => {
    const map = new Map<number, Stock>()
    for (const s of stocks) {
      if (s.pairs_quantity > 0) {
        map.set(s.cell_id, s)
      }
    }
    return map
  }, [stocks])
  const itemById = useMemo(() => new Map(items.map(i => [i.id, i])), [items])
  const warehouseIdByCellId = useMemo(
    () =>
      new Map(
        warehouses.flatMap((warehouse) =>
          warehouse.cells.map((cell) => [cell.id, warehouse.id] as const),
        ),
      ),
    [warehouses],
  )

  const sourceStock = sourceCellId ? stocks.find(s => s.id === sourceCellId) || stockByCellId.get(sourceCellId) : null
  const sourceItem = sourceStock ? itemById.get(sourceStock.item_id) : null
  const maxMoveQuantity = sourceStock?.pairs_quantity ?? 0

  const targetCell = targetCellId ? cells.find(c => c.id === targetCellId) ?? null : null
  const targetStock = targetCell ? stockByCellId.get(targetCell.id) : null

  const filteredCells = useMemo(() => {
    let filtered = cells
    const term = search.trim().toLowerCase()
    if (term) {
      filtered = filtered.filter(c => formatCoordinate(c).toLowerCase().includes(term))
    }
    if (statusFilter !== 'all') {
      filtered = filtered.filter(c => {
        const stock = stockByCellId.get(c.id)
        const status = getCellStatus(stock)
        return status === statusFilter
      })
    }
    return filtered
  }, [cells, search, statusFilter, stockByCellId])

  const warehouseStats = useMemo(() => {
    const map = new Map<number, { stockCount: number; totalPairs: number; cellCount: number; occupiedCells: number }>(
      warehouses.map((warehouse) => [
        warehouse.id,
        {
          stockCount: 0,
          totalPairs: 0,
          cellCount: warehouse.cells.length,
          occupiedCells: 0,
        },
      ]),
    )
    const occupiedCellIds = new Map<number, Set<number>>()

    for (const stock of stocks) {
      if (stock.pairs_quantity <= 0) continue
      const warehouseId = warehouseIdByCellId.get(stock.cell_id)
      if (!warehouseId) continue

      const stats = map.get(warehouseId)
      if (!stats) continue
      stats.stockCount++
      stats.totalPairs += stock.pairs_quantity

      const cellIds = occupiedCellIds.get(warehouseId) ?? new Set<number>()
      cellIds.add(stock.cell_id)
      occupiedCellIds.set(warehouseId, cellIds)
    }

    for (const [warehouseId, cellIds] of occupiedCellIds) {
      const stats = map.get(warehouseId)
      if (!stats) continue
      stats.occupiedCells = cellIds.size
    }

    return map
  }, [stocks, warehouseIdByCellId, warehouses])

  const handleWarehouseSelect = (id: number) => {
    if (id === selectedWarehouseId) return
    setSelectedWarehouseId(id)
  }

  const handleSelectSource = (cell: Cell, stock: Stock | null) => {
    if (!stock) {
      toast.error('Нельзя выбрать пустую ячейку как источник')
      return
    }
    setSourceCellId(stock.id)
    setSourceWarehouseId(cell.warehouse_id)
    setSourceCellCoord(formatCoordinate(cell))
    setTargetCellId(null)
    setMoveQuantity(stock.pairs_quantity)
    setMoveDialogOpen(false)
    toast.info(`Выбрана ячейка ${formatCoordinate(cell)} как источник. Теперь выберите целевую ячейку.`)
  }

  const handleSelectTarget = (cellId: number) => {
    if (sourceCellId && sourceStock && sourceStock.cell_id === cellId) {
      toast.error('Нельзя переместить товар в ту же ячейку')
      return
    }
    setTargetCellId(cellId)
    setMoveDialogOpen(true)
  }

  const handleReset = () => {
    setSourceCellId(null)
    setSourceWarehouseId(null)
    setSourceCellCoord(null)
    setTargetCellId(null)
    setMoveQuantity(1)
    setMoveDialogOpen(false)
  }

  const moveMutation = useMutation({
    mutationFn: () => {
      if (!sourceStock) throw new Error('Исходный остаток не найден')
      if (!targetCellId) throw new Error('Целевая ячейка не выбрана')
      return moveStock(sourceStock.id, { to_cell_id: targetCellId, pairs_quantity: moveQuantity })
    },
    onSuccess: async () => {
      toast.success('Товар перемещён')
      queryClient.removeQueries({ queryKey: ['stocks'] })
      queryClient.removeQueries({ queryKey: ['cells'] })
      await queryClient.invalidateQueries({ queryKey: ['stocks'] })
      await queryClient.invalidateQueries({ queryKey: ['cells'] })
      await queryClient.refetchQueries({ queryKey: ['stocks'] })
      await queryClient.refetchQueries({ queryKey: ['cells', selectedWarehouseId] })
      handleReset()
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })

  const isLoading = warehousesQuery.isLoading || stocksQuery.isLoading || itemsQuery.isLoading
  const isCellsLoading = cellsQuery.isLoading
  const canMove = sourceStock && targetCellId && moveQuantity > 0 && moveQuantity <= maxMoveQuantity

  return (
    <TooltipProvider>
      <section className="page-shell space-y-5">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight">Перемещение товаров</h1>
          {(sourceCellId || targetCellId) && (
            <Button variant="outline" onClick={handleReset}>
              <X className="mr-2 h-4 w-4" />
              Сбросить выбор
            </Button>
          )}
        </div>

        <WarehouseCardsSection
          selectedLabel={
            selectedWarehouseId !== null
              ? `№${warehouses.find((w) => w.id === selectedWarehouseId)?.name ?? selectedWarehouseId}`
              : null
          }
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {isLoading
              ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24" />)
              : warehouses.map(wh => {
                  const stats = warehouseStats.get(wh.id) ?? { stockCount: 0, totalPairs: 0, cellCount: 0, occupiedCells: 0 }
                  return (
                    <WarehouseSummaryCard
                      key={wh.id}
                      warehouse={wh}
                      isSelected={selectedWarehouseId === wh.id}
                      onSelect={handleWarehouseSelect}
                      stockCount={stats.stockCount}
                      totalPairs={stats.totalPairs}
                      cellCount={stats.cellCount}
                      occupiedCells={stats.occupiedCells}
                    />
                  )
                })}
          </div>
        </WarehouseCardsSection>

        {!selectedWarehouseId ? (
          <Card>
            <Card.Content className="py-8 text-center text-muted-foreground">
              Выберите склад для просмотра ячеек
            </Card.Content>
          </Card>
        ) : (
          <>
            {(sourceCellId || targetCellId) && (
              <Card className="border-primary/50 bg-primary/5">
                <Card.Content className="py-3">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex flex-wrap gap-4">
                      {sourceCellId && sourceStock && (
                        <div className="flex items-center gap-2">
                          <Badge className="bg-primary">Исходная</Badge>
                          <span className="font-mono text-sm">
                            {sourceCellCoord || `Ячейка #${sourceStock.cell_id}`}
                          </span>
                          <span className="text-sm text-muted-foreground">
                            {sourceItem?.title} · {sourceStock.pairs_quantity} пар
                          </span>
                          {sourceWarehouseId !== selectedWarehouseId && (
                            <span className="text-xs text-amber-600">(на другом складе)</span>
                          )}
                        </div>
                      )}
                      {targetCell && (
                        <div className="flex items-center gap-2">
                          <Badge className="bg-green-500">Целевая</Badge>
                          <span className="font-mono text-sm">{formatCoordinate(targetCell)}</span>
                          {targetStock && (
                            <span className="text-sm text-muted-foreground">
                              (уже занята, товар будет объединён)
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    {sourceCellId && targetCellId && (
                      <Button onClick={() => setMoveDialogOpen(true)}>
                        <ArrowRight className="mr-2 h-4 w-4" />
                        Продолжить
                      </Button>
                    )}
                  </div>
                </Card.Content>
              </Card>
            )}

            <Card>
              <Card.Content className="grid gap-3 pt-5 md:grid-cols-[1fr_auto_auto]">
                <SearchInput
                  placeholder="Поиск по координатам"
                  value={search}
                  onChange={setSearch}
                />
                <SelectNative
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value as CellStatus | 'all')}
                >
                  <option value="all">Все ячейки</option>
                  <option value="free">Свободные</option>
                  <option value="partial">Частично занятые</option>
                  <option value="full">Занятые</option>
                </SelectNative>
                <div className="flex gap-2">
                  <Button
                    variant={viewMode === 'grid' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setViewMode('grid')}
                  >
                    Сетка
                  </Button>
                  <Button
                    variant={viewMode === 'list' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setViewMode('list')}
                  >
                    Список
                  </Button>
                </div>
              </Card.Content>
            </Card>

            <Card>
              <Card.Header>
                <Card.Title>
                  Ячейки склада {warehouses.find(w => w.id === selectedWarehouseId)?.name || selectedWarehouseId}
                  {sourceCellId && sourceWarehouseId !== selectedWarehouseId && (
                    <span className="ml-2 text-sm font-normal text-amber-600">
                      (исходная ячейка на другом складе)
                    </span>
                  )}
                </Card.Title>
              </Card.Header>
              <Card.Content>
                {isCellsLoading ? (
                  <div className={viewMode === 'grid' ? 'grid grid-cols-3 gap-3 md:grid-cols-5' : 'space-y-2'}>
                    {Array.from({ length: 6 }).map((_, i) => (
                      <Skeleton key={i} className="h-28" />
                    ))}
                  </div>
                ) : filteredCells.length === 0 ? (
                  <div className="py-8 text-center text-muted-foreground">
                    Нет ячеек на этом складе
                  </div>
                ) : viewMode === 'grid' ? (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                    {filteredCells.map(cell => {
                      const stock = stockByCellId.get(cell.id)
                      const item = stock ? itemById.get(stock.item_id) : undefined
                      const isSource = sourceStock ? sourceStock.cell_id === cell.id : false
                      return (
                        <GridCell
                          key={cell.id}
                          cell={cell}
                          stock={stock ?? null}
                          item={item}
                          isSource={isSource}
                          isTarget={targetCellId === cell.id}
                          sourceCellId={sourceCellId}
                          onSelectSource={handleSelectSource}
                          onSelectTarget={handleSelectTarget}
                        />
                      )
                    })}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="border-b">
                        <tr>
                          <th className="px-2 py-2 text-left font-medium">Ячейка</th>
                          <th className="px-2 py-2 text-left font-medium">Товар</th>
                          <th className="px-2 py-2 text-left font-medium">Пары</th>
                          <th className="px-2 py-2 text-left font-medium">Статус</th>
                          <th className="px-2 py-2 text-left font-medium">Действие</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredCells.map(cell => {
                          const stock = stockByCellId.get(cell.id)
                          const item = stock ? itemById.get(stock.item_id) : undefined
                          const status = getCellStatus(stock ?? null)
                          const isSource = sourceStock ? sourceStock.cell_id === cell.id : false
                          return (
                            <tr key={cell.id} className="border-b">
                              <td className="px-2 py-2 font-mono">{formatCoordinate(cell)}</td>
                              <td className="px-2 py-2">{item?.title ?? '—'}</td>
                              <td className="px-2 py-2">{stock?.pairs_quantity ?? 0}</td>
                              <td className="px-2 py-2">
                                <Badge
                                  tone={
                                    status === 'free'
                                      ? 'success'
                                      : status === 'full'
                                      ? 'danger'
                                      : 'warning'
                                  }
                                >
                                  {status === 'free' ? 'Свободна' : status === 'full' ? 'Занята' : 'Частично'}
                                </Badge>
                              </td>
                              <td className="px-2 py-2">
                                {stock && !isSource && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleSelectSource(cell, stock)}
                                  >
                                    <Move className="mr-1 h-3 w-3" />
                                    Выбрать исходную
                                  </Button>
                                )}
                                {!stock && sourceCellId && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleSelectTarget(cell.id)}
                                  >
                                    Выбрать целевую
                                  </Button>
                                )}
                                {isSource && (
                                  <Badge>Исходная</Badge>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card.Content>
            </Card>
          </>
        )}

        <Dialog open={moveDialogOpen} onOpenChange={setMoveDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Подтверждение перемещения</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="rounded-md bg-muted p-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-muted-foreground">Из ячейки</div>
                    <div className="font-mono font-medium">
                      {sourceCellCoord || `Ячейка #${sourceStock?.cell_id}`}
                    </div>
                    <div className="text-xs text-muted-foreground">{sourceItem?.title}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">В ячейку</div>
                    <div className="font-mono font-medium">{targetCell && formatCoordinate(targetCell)}</div>
                    {targetStock && (
                      <div className="text-xs text-amber-600">Ячейка занята, товары объединятся</div>
                    )}
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="move-quantity">Количество пар для перемещения</Label>
                <Input
                  id="move-quantity"
                  type="number"
                  min={1}
                  max={maxMoveQuantity}
                  value={moveQuantity}
                  onChange={e => setMoveQuantity(Number(e.target.value))}
                />
                <p className="text-xs text-muted-foreground">Доступно: {maxMoveQuantity} пар</p>
              </div>
              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => setMoveDialogOpen(false)}>
                  Отмена
                </Button>
                <Button
                  onClick={() => moveMutation.mutate()}
                  disabled={moveMutation.isPending || !canMove}
                >
                  {moveMutation.isPending ? 'Перемещение...' : 'Переместить'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </section>
    </TooltipProvider>
  )
}
