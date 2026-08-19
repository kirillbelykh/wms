// frontend/src/pages/ItemDetailPage.tsx
import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Package, Boxes, Calendar, MapPin, Hash, Layers } from 'lucide-react'
import { getCells, getItems, getStocksByItem, getWarehouses } from '@/api/client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { SearchInput } from '@/components/ui/search-input'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatCoordinate, formatDate } from '@/lib/utils'

function getColorValue(colorName?: string | null): string {
  if (!colorName) return '#e5e5e5'
  const colorMap: Record<string, string> = {
    'белый': '#f5f5f5',
    'черный': '#1a1a1a', 'чёрный': '#1a1a1a',
    'синий': '#3b82f6', 'зеленый': '#22c55e', 'зелёный': '#22c55e',
    'розовый': '#ec4899', 'красный': '#ef4444',
    'жёлтый': '#eab308', 'желтый': '#eab308', 'оранжевый': '#f97316',
    'фиолетовый': '#a855f7', 'голубой': '#06b6d4', 'серый': '#6b7280',
    'коричневый': '#8b4513', 'бежевый': '#f5f5dc', 'натуральный': '#d4a574',
    'салатовый': '#84cc16', 'бирюзовый': '#14b8a6', 'индиго': '#6366f1',
    'лавандовый': '#c084fc', 'лиловый': '#d946ef', 'малиновый': '#e11d48',
    'бордовый': '#881337', 'оливковый': '#65a30d', 'хаки': '#a8a29e',
    'серебристый': '#a1a1aa', 'золотой': '#fbbf24', 'бронзовый': '#d97706',
  }
  return colorMap[colorName.toLowerCase()] || '#e5e5e5'
}

export function ItemDetailPage() {
  const { id } = useParams()
  const itemId = Number(id)

  const [sizeFilter, setSizeFilter] = useState('')
  const [colorFilter, setColorFilter] = useState('')
  const [batchFilter, setBatchFilter] = useState('')

  const itemsQuery = useQuery({
    queryKey: ['items'],
    queryFn: getItems,
  })

  const stocksQuery = useQuery({
    queryKey: ['stocks', 'item', itemId],
    queryFn: () => getStocksByItem(itemId),
    enabled: Number.isFinite(itemId),
  })

  const cellsQuery = useQuery({
    queryKey: ['cells'],
    queryFn: () => getCells(),
  })

  const warehousesQuery = useQuery({
    queryKey: ['warehouses'],
    queryFn: getWarehouses,
  })

  const isLoading = itemsQuery.isLoading || stocksQuery.isLoading || cellsQuery.isLoading || warehousesQuery.isLoading

  const item = itemsQuery.data?.find(i => i.id === itemId)
  const stocks = stocksQuery.data ?? []
  const cells = cellsQuery.data ?? []
  const warehouses = warehousesQuery.data ?? []

  const cellById = useMemo(() => new Map(cells.map(c => [c.id, c])), [cells])
  const warehouseById = useMemo(() => new Map(warehouses.map(w => [w.id, w])), [warehouses])

  const filteredStocks = useMemo(() => {
    return stocks.filter(stock => {
      if (stock.pairs_quantity <= 0) return false
      const sizeMatch = !sizeFilter || (stock.size || '').toLowerCase().includes(sizeFilter.toLowerCase())
      const colorMatch = !colorFilter || (stock.color || '').toLowerCase().includes(colorFilter.toLowerCase())
      const batchMatch = !batchFilter || (stock.batch_number || '').toLowerCase().includes(batchFilter.toLowerCase())
      return sizeMatch && colorMatch && batchMatch
    })
  }, [stocks, sizeFilter, colorFilter, batchFilter])

  const totalPairs = filteredStocks.reduce((sum, s) => sum + s.pairs_quantity, 0)
  const uniqueCells = new Set(filteredStocks.map(s => s.cell_id)).size
  const uniqueWarehouses = new Set(
    filteredStocks.map(s => {
      const cell = cellById.get(s.cell_id)
      return cell?.warehouse_id
    }).filter(Boolean)
  ).size

  if (isLoading) {
    return (
      <section className="page-shell space-y-5">
        <Skeleton className="h-10 w-32" />
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
        <Skeleton className="h-96" />
      </section>
    )
  }

  if (!item) {
    return (
      <section className="page-shell">
        <Card>
          <Card.Content className="pt-5 text-center">
            <p className="text-muted-foreground">Товар не найден</p>
            <Button asChild className="mt-4" variant="outline">
              <Link to="/items">Назад к товарам</Link>
            </Button>
          </Card.Content>
        </Card>
      </section>
    )
  }

  return (
    <section className="page-shell space-y-5">
      <Button asChild variant="ghost">
        <Link to="/items">
          <ArrowLeft className="h-4 w-4 mr-1" />
          Назад к товарам
        </Link>
      </Button>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <Card.Header className="flex flex-row items-center justify-between space-y-0 pb-2">
            <Card.Title className="text-2xl">{item.title}</Card.Title>
            <Package className="h-5 w-5 text-muted-foreground" />
          </Card.Header>
          <Card.Content>
            <div className="grid gap-4 sm:grid-cols-1">
              <div className="space-y-1">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Название</span>
                <div className="text-sm">{item.name}</div>
              </div>
              <div className="space-y-1">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Максимум пар в коробке</span>
                <div className="text-sm">{item.max_pairs_per_box}</div>
              </div>
              <div className="space-y-1">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Создан</span>
                <div className="text-sm flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {formatDate(item.created_at)}
                </div>
              </div>
            </div>
          </Card.Content>
        </Card>

        <Card>
          <Card.Header className="pb-2">
            <Card.Title className="text-sm font-medium">Остаток на складе</Card.Title>
          </Card.Header>
          <Card.Content>
            {filteredStocks.length === 0 ? (
              <div>
                <div className="text-2xl font-bold text-muted-foreground">0</div>
                <p className="text-xs text-muted-foreground">нет остатков</p>
              </div>
            ) : (
              <>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold">{totalPairs}</span>
                  <span className="text-sm text-muted-foreground">пар</span>
                </div>
              </>
            )}
          </Card.Content>
        </Card>
      </div>

      {filteredStocks.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Card>
            <Card.Header className="flex flex-row items-center justify-between space-y-0 pb-2">
              <Card.Title className="text-sm font-medium">Занимает ячеек</Card.Title>
              <Layers className="h-4 w-4 text-muted-foreground" />
            </Card.Header>
            <Card.Content>
              <div className="text-2xl font-bold">{uniqueCells}</div>
              <p className="text-xs text-muted-foreground">разных ячеек</p>
            </Card.Content>
          </Card>

          <Card>
            <Card.Header className="flex flex-row items-center justify-between space-y-0 pb-2">
              <Card.Title className="text-sm font-medium">На складах</Card.Title>
              <MapPin className="h-4 w-4 text-muted-foreground" />
            </Card.Header>
            <Card.Content>
              <div className="text-2xl font-bold">{uniqueWarehouses}</div>
              <p className="text-xs text-muted-foreground">разных складов</p>
            </Card.Content>
          </Card>

          <Card>
            <Card.Header className="flex flex-row items-center justify-between space-y-0 pb-2">
              <Card.Title className="text-sm font-medium">Среднее в ячейке</Card.Title>
              <Boxes className="h-4 w-4 text-muted-foreground" />
            </Card.Header>
            <Card.Content>
              <div className="text-2xl font-bold">
                {uniqueCells ? Math.round(totalPairs / uniqueCells) : 0}
              </div>
              <p className="text-xs text-muted-foreground">пар на ячейку</p>
            </Card.Content>
          </Card>
        </div>
      )}

      <Card>
        <Card.Header>
          <Card.Title className="flex items-center gap-2">
            <Hash className="h-5 w-5" />
            Партии и расположение
          </Card.Title>
          <div className="flex flex-wrap items-center gap-3 mt-3">
            <SearchInput
              className="w-36"
              groupClassName="h-8"
              inputClassName="text-xs"
              placeholder="Размер"
              value={sizeFilter}
              onChange={setSizeFilter}
            />
            <SearchInput
              className="w-36"
              groupClassName="h-8"
              inputClassName="text-xs"
              placeholder="Цвет"
              value={colorFilter}
              onChange={setColorFilter}
            />
            <SearchInput
              className="w-40"
              groupClassName="h-8"
              inputClassName="text-xs"
              placeholder="Партия"
              value={batchFilter}
              onChange={setBatchFilter}
            />
            {(sizeFilter || colorFilter || batchFilter) && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs"
                onClick={() => { setSizeFilter(''); setColorFilter(''); setBatchFilter('') }}
              >
                Сбросить
              </Button>
            )}
          </div>
        </Card.Header>
        <Card.Content>
          {filteredStocks.length === 0 ? (
            <div className="text-center py-8">
              <Package className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">Нет остатков, соответствующих фильтрам</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Партия</TableHead>
                    <TableHead>Размер</TableHead>
                    <TableHead>Цвет</TableHead>
                    <TableHead>Склад</TableHead>
                    <TableHead>Ячейка</TableHead>
                    <TableHead>Пары</TableHead>
                    <TableHead>Пар/кор</TableHead>
                    <TableHead>Обновлено</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredStocks.map((stock) => {
                    const cell = cellById.get(stock.cell_id)
                    const warehouse = cell ? warehouseById.get(cell.warehouse_id) : undefined

                    return (
                      <TableRow key={stock.id}>
                        <TableCell>
                          {stock.batch_number ? (
                            <Badge className="font-mono text-xs">
                              {stock.batch_number}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>{stock.size || '—'}</TableCell>
                        <TableCell>
                          {stock.color ? (
                            <div className="flex items-center gap-1">
                              <div
                                className="h-3 w-3 rounded-full border"
                                style={{ backgroundColor: getColorValue(stock.color) }}
                              />
                              {stock.color}
                            </div>
                          ) : '—'}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <MapPin className="h-3 w-3 text-muted-foreground" />
                            <span className="text-sm">{warehouse?.name ?? '—'}</span>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {cell ? formatCoordinate(cell) : '—'}
                        </TableCell>
                        <TableCell>
                          <span className="font-mono inline-block px-2 py-0.5 rounded-md">
                            {stock.pairs_quantity}
                          </span>
                        </TableCell>
                        <TableCell>{stock.pairs_per_box ?? '—'}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatDate(stock.updated_at)}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </Card.Content>
      </Card>
    </section>
  )
}
