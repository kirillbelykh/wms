// frontend/src/pages/PickOperationsPage.tsx
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import { ArrowLeft, Trash2, Edit2, Package, CheckCircle, XCircle, AlertCircle } from 'lucide-react'
import { toast } from '@/lib/toast'
import { getOrder, getPickOperations, deletePickOperation, updatePickOperation, getStocks, getItems, getCells, getWarehouses } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ConfirmDialog } from '@/components/ui/alert-dialog'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input, SelectNative } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatDate, getErrorMessage, formatCoordinate } from '@/lib/utils'
import type { PickOperation, Stock, Item, Cell, Warehouse } from '@/types/wms'

function getColorValue(colorName?: string | null): string {
  if (!colorName) return '#e5e5e5'
  const colorMap: Record<string, string> = {
    'белый': '#f5f5f5',
    'черный': '#1a1a1a', 'чёрный': '#1a1a1a',
    'синий': '#3b82f6', 'зеленый': '#22c55e', 'зелёный': '#22c55e',
    'розовый': '#ec4899', 'красный': '#ef4444',
    'жёлтый': '#eab308', 'желтый': '#eab308', 'оранжевый': '#f97316',
    'фиолетовый': '#a855f7', 'голубой': '#06b6d4', 'серый': '#6b7280',
    'коричневый': '#8b4513', 'бежевый': '#f5f5dc', 'натуральный': '#f1e3d5',
    'салатовый': '#84cc16', 'бирюзовый': '#14b8a6', 'индиго': '#6366f1',
    'лавандовый': '#c084fc', 'лиловый': '#d946ef', 'малиновый': '#e11d48',
    'бордовый': '#881337', 'оливковый': '#65a30d', 'хаки': '#a8a29e',
    'серебристый': '#a1a1aa', 'золотой': '#fbbf24', 'бронзовый': '#d97706',
  }
  return colorMap[colorName.toLowerCase()] || '#e5e5e5'
}

export function PickOperationsPage() {
  const { orderId } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const id = Number(orderId)
  const [editOperation, setEditOperation] = useState<PickOperation | null>(null)
  const [editQuantity, setEditQuantity] = useState<number>(0)

  // Данные заказа и операций
  const orderQuery = useQuery({
    queryKey: ['orders', id],
    queryFn: () => getOrder(id),
    enabled: !isNaN(id),
  })
  const operationsQuery = useQuery({
    queryKey: ['pickOperations', id],
    queryFn: () => getPickOperations(id),
    enabled: !isNaN(id),
  })
  const stocksQuery = useQuery({ queryKey: ['stocks'], queryFn: getStocks })
  const itemsQuery = useQuery({ queryKey: ['items'], queryFn: getItems })
  const cellsQuery = useQuery({ queryKey: ['cells'], queryFn: () => getCells() })
  const warehousesQuery = useQuery({ queryKey: ['warehouses'], queryFn: getWarehouses })

  const itemsById = useMemo(() => new Map((itemsQuery.data ?? []).map(i => [i.id, i])), [itemsQuery.data])
  const cellsById = useMemo(() => new Map((cellsQuery.data ?? []).map(c => [c.id, c])), [cellsQuery.data])
  const warehousesById = useMemo(() => new Map((warehousesQuery.data ?? []).map(w => [w.id, w])), [warehousesQuery.data])

  // Обогащаем операции деталями
  const enrichedOperations = useMemo(() => {
    const stocks = stocksQuery.data ?? []
    const stockMap = new Map(stocks.map(s => [s.id, s]))
    return (operationsQuery.data ?? []).map(op => {
      const stock = op.stock_id ? stockMap.get(op.stock_id) : null
      const item = stock ? itemsById.get(stock.item_id) : op.item_id ? itemsById.get(op.item_id) : null
      const cell = stock ? cellsById.get(stock.cell_id) : op.cell_id ? cellsById.get(op.cell_id) : null
      const warehouse = cell ? warehousesById.get(cell.warehouse_id) : null
      return {
        ...op,
        stock,
        item,
        cell,
        warehouse,
        size: stock?.size || item?.size || '—',
        color: stock?.color || item?.color || '—',
        venchik: stock?.venchik || '—',
        batchNumber: stock?.batch_number || '—',
        cellLocation: cell ? formatCoordinate(cell) : '—',
        warehouseName: warehouse?.name || '—',
      }
    })
  }, [operationsQuery.data, stocksQuery.data, itemsById, cellsById, warehousesById])

  // Мутации
  const deleteMutation = useMutation({
    mutationFn: (operationId: number) => deletePickOperation(operationId),
    onSuccess: async () => {
      toast.success('Операция удалена, товар возвращён на склад')
      await queryClient.invalidateQueries({ queryKey: ['pickOperations', id] })
      await queryClient.invalidateQueries({ queryKey: ['stocks'] })
      await queryClient.invalidateQueries({ queryKey: ['orders', id] })
      await queryClient.invalidateQueries({ queryKey: ['picking', id] })
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  const updateMutation = useMutation({
    mutationFn: ({ operationId, pairs }: { operationId: number; pairs: number }) =>
      updatePickOperation(operationId, pairs),
    onSuccess: async () => {
      toast.success('Количество отбора изменено')
      setEditOperation(null)
      await queryClient.invalidateQueries({ queryKey: ['pickOperations', id] })
      await queryClient.invalidateQueries({ queryKey: ['stocks'] })
      await queryClient.invalidateQueries({ queryKey: ['orders', id] })
      await queryClient.invalidateQueries({ queryKey: ['picking', id] })
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  if (operationsQuery.isLoading || orderQuery.isLoading) {
    return (
      <section className="page-shell space-y-5">
        <Skeleton className="h-10 w-32" />
        <Skeleton className="h-96" />
      </section>
    )
  }

  const order = orderQuery.data
  const operations = enrichedOperations

  return (
    <section className="page-shell space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button asChild variant="ghost">
          <Link to={`/orders/${id}`}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Назад к заказу
          </Link>
        </Button>
        <Badge tone="primary">Операции отбора</Badge>
      </div>

      <Card>
        <Card.Header>
          <Card.Title>Заказ {order?.name} — отобранные товары</Card.Title>
        </Card.Header>
        <Card.Content>
          {operations.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground flex flex-col items-center gap-2">
              <Package className="h-12 w-12 text-muted-foreground/50" />
              <p>Нет выполненных операций отбора</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Товар</TableHead>
                    <TableHead>Размер</TableHead>
                    <TableHead>Цвет</TableHead>
                    <TableHead>Венчик</TableHead>
                    <TableHead>Партия</TableHead>
                    <TableHead>Кол-во пар</TableHead>
                    <TableHead>Склад / Ячейка</TableHead>
                    <TableHead>Дата отбора</TableHead>
                    <TableHead className="w-[100px]">Действия</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {operations.map((op) => (
                    <TableRow key={op.id}>
                      <TableCell className="font-medium">{op.item?.title || `Товар #${op.item_id ?? op.stock?.item_id ?? '—'}`}</TableCell>
                      <TableCell>{op.size}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <div
                            className="h-3 w-3 rounded-full border border-border"
                            style={{ backgroundColor: getColorValue(op.color) }}
                          />
                          {op.color !== '—' ? op.color : '—'}
                        </div>
                      </TableCell>
                      <TableCell>{op.venchik}</TableCell>
                      <TableCell className="font-mono text-xs">{op.batchNumber}</TableCell>
                      <TableCell>{op.pairs_quantity}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {op.warehouseName} — {op.cellLocation}
                      </TableCell>
                      <TableCell>{formatDate(op.picked_at)}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <ConfirmDialog
                            title="Удалить операцию отбора"
                            description={`Вы уверены? Товар (${op.pairs_quantity} пар) будет возвращён на склад.`}
                            confirmLabel="Удалить"
                            onConfirm={() => deleteMutation.mutate(op.id)}
                          >
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </ConfirmDialog>
                          <Dialog open={editOperation?.id === op.id} onOpenChange={(open) => !open && setEditOperation(null)}>
                            <DialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => {
                                setEditOperation(op)
                                setEditQuantity(op.pairs_quantity)
                              }}>
                                <Edit2 className="h-4 w-4" />
                              </Button>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle>Изменить количество отбора</DialogTitle>
                              </DialogHeader>
                              <div className="space-y-4">
                                <div className="space-y-2">
                                  <Label>Товар</Label>
                                  <div className="text-sm font-medium">{op.item?.title}</div>
                                </div>
                                <div className="space-y-2">
                                  <Label>Новое количество пар</Label>
                                  <Input
                                    type="number"
                                    min={1}
                                    max={op.stock?.pairs_quantity ? op.stock.pairs_quantity + op.pairs_quantity : op.pairs_quantity}
                                    value={editQuantity}
                                    onChange={(e) => setEditQuantity(Number(e.target.value))}
                                  />
                                  <p className="text-xs text-muted-foreground">
                                    Доступно на складе с учётом возврата: {op.stock?.pairs_quantity ? op.stock.pairs_quantity + op.pairs_quantity : op.pairs_quantity} пар
                                  </p>
                                </div>
                                <div className="flex justify-end gap-3">
                                  <Button variant="outline" onClick={() => setEditOperation(null)}>Отмена</Button>
                                  <Button
                                    variant="success"
                                    onClick={() => updateMutation.mutate({ operationId: op.id, pairs: editQuantity })}
                                    disabled={updateMutation.isPending || editQuantity === op.pairs_quantity || editQuantity < 1}
                                  >
                                    Сохранить
                                  </Button>
                                </div>
                              </div>
                            </DialogContent>
                          </Dialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </Card.Content>
      </Card>
    </section>
  )
}
