import { type ReactNode, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  Circle,
  ClipboardList,
  SendToBack,
  ShieldCheck,
  Warehouse,
  PackageCheck,
  ListChecks,
  CalendarDays,
  FileText,
  History,
  Plus,
  Edit,
  CheckCircle,
  Clock,
  Trash2,
  Play,
} from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from '@/lib/toast'

import {
  completeProductionOrder,
  createProductionLaborEntries,
  createProductionReceiptRequest,
  createProductionSupplyRequest,
  deleteProductionLaborEntry,
  getEmployees,
  getProductionOrder,
  requestProductionChz,
  startProductionOrder,
  updateProductionOrderItemProduced,
  getAvailableStocks,
  getProductionOrderAuditLogs,
  updateProductionOrderItemBatchDate,
} from '@/api/client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DateInput } from '@/components/ui/date-picker'
import { Input, Textarea, SelectNative } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  formatProductionItemLabel,
  getProductionItemTransferablePairs,
  getProductionProgress,
  productionBrigadierChzStatusLabel,
  productionChzStatusTone,
  productionStatusLabel,
  productionStatusTone,
  productionSupplyStatusLabel,
  productionSupplyStatusTone,
  productionSupplyTypeLabel,
  productionTaskTypeLabel,
  sumProductionPairs,
} from '@/lib/production'
import { formatDate, formatDateInputValue, getErrorMessage, todayInMsk } from '@/lib/utils'
import type { HistoryLog } from '@/types/wms'

// ========== ВСПОМОГАТЕЛЬНЫЕ КОМПОНЕНТЫ ==========

function DetailBullet({
  label,
  value,
  action,
}: {
  label: string
  value: string
  action?: ReactNode
}) {
  return (
    <li className="flex items-start gap-3">
      <Circle className="mt-1 h-3.5 w-3.5 fill-foreground text-foreground" />
      <div className="flex flex-1 flex-wrap items-center gap-2">
        <span className="font-medium text-foreground">{label}:</span>
        <span className="text-muted-foreground">{value}</span>
        {action}
      </div>
    </li>
  )
}

// Иконки для разных типов операций
function getAuditLogIcon(operationType: string) {
  switch (operationType) {
    case 'create_production_order':
      return <Plus className="h-4 w-4 text-green-500" />
    case 'update_production_order':
      return <Edit className="h-4 w-4 text-blue-500" />
    case 'update_production_item_progress':
      return <FileText className="h-4 w-4 text-orange-500" />
    case 'update_production_item_batch_date':
      return <CalendarDays className="h-4 w-4 text-purple-500" />
    case 'create_production_supply_request':
    case 'create_production_supply_request_auto':
      return <PackageCheck className="h-4 w-4 text-cyan-500" />
    case 'fulfill_production_supply_request':
      return <CheckCircle className="h-4 w-4 text-emerald-500" />
    case 'create_production_receipt_request':
      return <SendToBack className="h-4 w-4 text-indigo-500" />
    case 'start_production':
      return <Play className="h-4 w-4 text-yellow-500" />
    case 'complete_production':
      return <CheckCircle className="h-4 w-4 text-green-600" />
    case 'create_production_chz_request':
      return <ShieldCheck className="h-4 w-4 text-red-500" />
    case 'delete_production_order':
      return <Trash2 className="h-4 w-4 text-red-600" />
    default:
      return <Clock className="h-4 w-4 text-muted-foreground" />
  }
}

// Форматирование сообщения для аудит-лога с подстановкой названия позиции
function formatAuditMessage(log: any, order?: any): string {
  const details = log.details || {}
  // Находим позицию по ID, если есть
  let itemName = ''
  if (details.production_order_item_id && order) {
    const item = order.items.find((i: any) => i.id === details.production_order_item_id)
    if (item) {
      itemName = `${item.item_title}${item.item_size ? ` (${item.item_size})` : ''}`
    }
  }

  const requestType = details.request_type ? productionSupplyTypeLabel(details.request_type) : 'ресурсы'
  const itemLabel = itemName || 'позиция производства'
  const changes = details.changes && typeof details.changes === 'object' ? details.changes : {}

  switch (log.operation_type) {
    case 'create_production_order':
      return `Создан заказ на производство "${details.name || order?.name || ''}"`
    case 'update_production_order':
      if (Object.keys(changes).length === 0) return 'Изменены данные производственного заказа'
      return `Изменены данные производственного заказа: ${formatProductionChanges(changes)}`
    case 'update_production_item_progress':
      return `Обновлён факт по позиции "${itemLabel}": ${details.old_quantity ?? 0} → ${details.new_quantity ?? 0} пар`
    case 'update_production_item_batch_date':
      return `Изменены партия и дата производства для позиции "${itemLabel}": ${details.batch_number || 'без партии'}${details.production_date ? `, ${formatDate(details.production_date)}` : ''}`
    case 'create_production_supply_request':
      return `Создана заявка на ${requestType.toLowerCase()} (${details.items_count || 0} позиций)`
    case 'create_production_supply_request_auto':
      return `Автоматически создана заявка на ${requestType.toLowerCase()}`
    case 'start_production_supply_request':
      return `Складское задание по производству взято в работу`
    case 'fulfill_production_supply_request':
      return `Складское задание по производству выполнено (${details.items_count || 0} позиций)`
    case 'create_production_receipt_request':
      return `Создано задание на приёмку готовой продукции: "${itemLabel}", ${details.quantity || 0} пар`
    case 'start_production':
      return `Производство запущено, партия "${details.batch_number || 'не указана'}"`
    case 'complete_production':
      return `Производственный заказ завершён`
    case 'transfer_production_to_stock':
      return `Передача производства на склад: "${itemLabel}", ${details.pairs_quantity || 0} пар`
    case 'create_production_chz_request':
      return `Создан запрос на маркировку производства`
    case 'delete_production_order':
      return `Производственный заказ удалён`
    case 'rollback_operation':
      return `Откат операции в истории`
    default:
      return 'Выполнено действие по производственному заказу'
  }
}

function formatProductionChanges(changes: Record<string, unknown>) {
  const labels: Record<string, string> = {
    name: 'название',
    priority: 'приоритет',
    comment: 'комментарий',
    related_order_id: 'связанный заказ',
    batch_number: 'партия',
    production_date: 'дата производства',
  }

  return Object.entries(changes)
    .map(([key, value]) => `${labels[key] || key}: ${formatAuditValue(value)}`)
    .join(', ')
}

function formatAuditValue(value: unknown) {
  if (value === null || value === undefined || value === '') return 'не указано'
  if (typeof value === 'boolean') return value ? 'да' : 'нет'
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return formatDate(value)
  return String(value)
}

function formatProductionAuditAuthor(log: HistoryLog) {
  return log.user_username || log.user_email || (log.user_id ? `Пользователь #${log.user_id}` : 'Система')
}

// ========== ОСНОВНАЯ СТРАНИЦА ==========

export function ProductionDetailPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const params = useParams<{ id: string }>()
  const productionOrderId = Number(params.id)

  // Состояния для модалок
  const [chzOpen, setChzOpen] = useState(false)
  const [supplyOpen, setSupplyOpen] = useState(false)
  const [receiptOpen, setReceiptOpen] = useState(false)
  const [producedOpen, setProducedOpen] = useState(false)
  const [batchDateItemOpen, setBatchDateItemOpen] = useState(false)

  // Состояние для сворачивания истории
  const [isHistoryExpanded, setIsHistoryExpanded] = useState(false)

  // Данные для партии/даты позиции
  const [batchDateItemDraft, setBatchDateItemDraft] = useState<{
    itemId: number | null
    batch_number: string
    production_date: string
  }>({
    itemId: null,
    batch_number: '',
    production_date: '',
  })

  // Данные для ЧЗ
  const [selectedProductionItemIds, setSelectedProductionItemIds] = useState<number[]>([])
  const [chzComment, setChzComment] = useState('')

  // Данные для сырья и упаковки
  const [supplyType, setSupplyType] = useState<'raw_material' | 'consumable'>('raw_material')
  const [availableStocks, setAvailableStocks] = useState<any[]>([])
  const [selectedStockId, setSelectedStockId] = useState<number | null>(null)
  const [supplyQuantity, setSupplyQuantity] = useState(1)
  const [supplyComment, setSupplyComment] = useState('')
  const [isLoadingStocks, setIsLoadingStocks] = useState(false)
  const [currentProductionOrderItemId, setCurrentProductionOrderItemId] = useState<number | null>(null)

  // Данные для приёмки
  const [receiptDraft, setReceiptDraft] = useState({
    production_order_item_id: 0,
    quantity: 1,
    comment: '',
  })

  // Факт производства
  const [producedDraft, setProducedDraft] = useState<{ value: number; comment: string }>({
    value: 0,
    comment: '',
  })
  const [producedItemId, setProducedItemId] = useState<number | null>(null)

  // Модалка позиции
  const [activePositionModal, setActivePositionModal] = useState<number | null>(null)
  const [laborDraft, setLaborDraft] = useState({
    work_date: todayInMsk(),
    start_time: '08:00',
    end_time: '17:00',
    people_count: 1,
    employee_ids: [] as number[],
    comment: '',
  })

  const productionOrderQuery = useQuery({
    queryKey: ['production-order', productionOrderId],
    queryFn: () => getProductionOrder(productionOrderId),
    enabled: Number.isFinite(productionOrderId) && productionOrderId > 0,
  })

  // Запрос аудит-логов по заказу
  const auditLogsQuery = useQuery<HistoryLog[]>({
    queryKey: ['production-audit-logs', productionOrderId],
    queryFn: () => getProductionOrderAuditLogs(productionOrderId),
    enabled: Number.isFinite(productionOrderId) && productionOrderId > 0,
  })

  const employeesQuery = useQuery({
    queryKey: ['employees'],
    queryFn: () => getEmployees(),
    enabled: Number.isFinite(productionOrderId) && productionOrderId > 0,
  })

  const order = productionOrderQuery.data

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['production-orders'] }),
      queryClient.invalidateQueries({ queryKey: ['production-order', productionOrderId] }),
      queryClient.invalidateQueries({ queryKey: ['stocks'] }),
      queryClient.invalidateQueries({ queryKey: ['production-audit-logs', productionOrderId] }),
      queryClient.invalidateQueries({ queryKey: ['production-labor-report'] }),
    ])
  }

  const progress = order ? getProductionProgress(order) : { produced: 0, total: 0, percent: 0 }
  const transferredPairs = order ? sumProductionPairs(order, 'transferred_pairs') : 0
  const rawMaterialRequest = order?.supply_requests.find((request) => request.request_type === 'raw_material')
  const consumableRequest = order?.supply_requests.find((request) => request.request_type === 'consumable')
  const productionEmployees = employeesQuery.data?.filter((employee) => employee.department === 'production') ?? []
  const laborEntries = order?.labor_entries ?? []

  // ========== Мутации ==========

  const createLaborMutation = useMutation({
    mutationFn: async () => {
      if (!order) throw new Error('Заказ не найден')
      return createProductionLaborEntries(order.id, {
        work_date: laborDraft.work_date,
        start_time: laborDraft.start_time,
        end_time: laborDraft.end_time,
        people_count: laborDraft.people_count,
        employee_ids: laborDraft.employee_ids,
        comment: laborDraft.comment.trim() || undefined,
      })
    },
    onSuccess: async () => {
      toast.success('Период работы добавлен')
      setLaborDraft((current) => ({ ...current, comment: '' }))
      await invalidate()
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  const deleteLaborMutation = useMutation({
    mutationFn: async (entryId: number) => {
      if (!order) throw new Error('Заказ не найден')
      return deleteProductionLaborEntry(order.id, entryId)
    },
    onSuccess: async () => {
      toast.success('Период работы удален')
      await invalidate()
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  const startMutation = useMutation({
    mutationFn: async () => {
      if (!order) throw new Error('Заказ не найден')
      // Если batch_number пустой – можно оставить пустым (или сгенерировать, но пусть API сам решит)
      const batch_number = order.batch_number || ''
      // Если production_date не указана – используем сегодняшнюю дату
      const production_date = order.production_date
        ? formatDateInputValue(order.production_date)
        : new Date().toISOString().split('T')[0] // 'YYYY-MM-DD'
      return startProductionOrder(order.id, {
        batch_number,
        production_date,
      })
    },
    onSuccess: async () => {
      toast.success('Производство запущено')
      await invalidate()
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  const updateBatchDateItemMutation = useMutation({
    mutationFn: async () => {
      if (!order) throw new Error('Заказ не найден')
      if (batchDateItemDraft.itemId === null) throw new Error('Позиция не выбрана')
      if (!batchDateItemDraft.batch_number.trim() || !batchDateItemDraft.production_date) {
        throw new Error('Укажите партию и дату производства')
      }
      return updateProductionOrderItemBatchDate(order.id, batchDateItemDraft.itemId, {
        batch_number: batchDateItemDraft.batch_number.trim(),
        production_date: batchDateItemDraft.production_date,
      })
    },
    onSuccess: async () => {
      toast.success('Данные позиции обновлены')
      setBatchDateItemOpen(false)
      setBatchDateItemDraft({ itemId: null, batch_number: '', production_date: '' })
      await invalidate()
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  const chzMutation = useMutation({
    mutationFn: async () => {
      if (!order) throw new Error('Заказ не найден')
      if (selectedProductionItemIds.length === 0) throw new Error('Выберите хотя бы одну позицию')
      return requestProductionChz(order.id, {
        production_order_item_ids: selectedProductionItemIds,
        comment: chzComment.trim() || undefined,
      })
    },
    onSuccess: async () => {
      toast.success('Запрос ЧЗ отправлен')
      setChzOpen(false)
      await invalidate()
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  const loadAvailableStocks = async (type: 'raw_material' | 'consumable') => {
    setIsLoadingStocks(true)
    try {
      const data = await getAvailableStocks(type)
      setAvailableStocks(data)
    } catch {
      toast.error('Не удалось загрузить остатки')
      setAvailableStocks([])
    } finally {
      setIsLoadingStocks(false)
    }
  }

  const createSupplyMutation = useMutation({
    mutationFn: async () => {
      if (!order) throw new Error('Заказ не найден')
      if (!selectedStockId) throw new Error('Выберите остаток')
      if (supplyQuantity <= 0) throw new Error('Укажите количество')
      const selectedStock = availableStocks.find(s => s.id === selectedStockId)
      if (!selectedStock) throw new Error('Выбранный остаток не найден')
      return createProductionSupplyRequest(order.id, {
        request_type: supplyType,
        comment: supplyComment.trim() || undefined,
        items: [{
          item_id: selectedStock.item_id,
          quantity: supplyQuantity,
          size: selectedStock.size || undefined,
          stock_id: selectedStock.id,
          production_order_item_id: currentProductionOrderItemId || undefined,
        }],
      })
    },
    onSuccess: async () => {
      toast.success(
        supplyType === 'raw_material' ? 'Сырье добавлено в заявку' : 'Упаковка добавлена в заявку',
      )
      setSupplyOpen(false)
      await invalidate()
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  const receiptMutation = useMutation({
    mutationFn: async () => {
      if (!order) throw new Error('Заказ не найден')
      if (!receiptDraft.production_order_item_id || receiptDraft.quantity <= 0) {
        throw new Error('Выберите позицию и количество')
      }
      return createProductionReceiptRequest(order.id, {
        production_order_item_id: receiptDraft.production_order_item_id,
        quantity: receiptDraft.quantity,
        comment: receiptDraft.comment.trim() || undefined,
      })
    },
    onSuccess: async () => {
      toast.success('Задание на приемку готовой продукции создано')
      setReceiptOpen(false)
      await invalidate()
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  const updateProducedMutation = useMutation({
    mutationFn: async () => {
      if (!order) throw new Error('Заказ не найден')
      if (producedItemId === null) throw new Error('Позиция не выбрана')
      if (producedDraft.value < 0) throw new Error('Укажите корректное количество')
      return updateProductionOrderItemProduced(order.id, producedItemId, {
        produced_pairs: producedDraft.value,
        comment: producedDraft.comment.trim() || undefined,
      })
    },
    onSuccess: async () => {
      toast.success('Факт обновлен')
      setProducedOpen(false)
      setProducedItemId(null)
      setProducedDraft({ value: 0, comment: '' })
      await invalidate()
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  const completeMutation = useMutation({
    mutationFn: async () => {
      if (!order) throw new Error('Заказ не найден')
      return completeProductionOrder(order.id)
    },
    onSuccess: async () => {
      toast.success('Производственный заказ завершен')
      await invalidate()
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  // ========== Обработчики ==========

  const toggleLaborEmployee = (employeeId: number, checked: boolean) => {
    setLaborDraft((current) => ({
      ...current,
      employee_ids: checked
        ? Array.from(new Set([...current.employee_ids, employeeId]))
        : current.employee_ids.filter((id) => id !== employeeId),
    }))
  }

  const openPositionModal = (itemId: number) => {
    setActivePositionModal(itemId)
  }

  const handleOpenProduced = (itemId: number) => {
    setProducedItemId(itemId)
    const item = order?.items.find(i => i.id === itemId)
    setProducedDraft({ value: item?.produced_pairs ?? 0, comment: '' })
    setProducedOpen(true)
    setActivePositionModal(null)
  }

  const handleOpenChz = (itemId: number) => {
    setSelectedProductionItemIds([itemId])
    setChzComment('')
    setChzOpen(true)
    setActivePositionModal(null)
  }

  const handleOpenSupply = (itemId: number, type: 'raw_material' | 'consumable') => {
    setCurrentProductionOrderItemId(itemId)
    setSupplyType(type)
    setSupplyOpen(true)
    setSelectedStockId(null)
    setSupplyQuantity(1)
    setSupplyComment('')
    loadAvailableStocks(type)
    setActivePositionModal(null)
  }

  const handleOpenReceipt = (itemId: number) => {
    if (!order) return
    const targetItem = order.items.find(i => i.id === itemId)
    if (!targetItem) return
    setReceiptDraft({
      production_order_item_id: targetItem.id,
      quantity: Math.max(getProductionItemTransferablePairs(targetItem) - targetItem.transferred_pairs, 1),
      comment: '',
    })
    setReceiptOpen(true)
    setActivePositionModal(null)
  }

  const handleOpenBatchDate = (itemId: number) => {
    const item = order?.items.find(i => i.id === itemId)
    if (!item) return
    setBatchDateItemDraft({
      itemId: item.id,
      batch_number: item.batch_number || '',
      production_date: formatDateInputValue(item.production_date),
    })
    setBatchDateItemOpen(true)
    setActivePositionModal(null)
  }

  // ========== Рендеринг ==========

  if (productionOrderQuery.isLoading) {
    return (
      <section className="page-shell space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-60" />
        <Skeleton className="h-96" />
      </section>
    )
  }

  if (!order) {
    return (
      <section className="page-shell">
        <Card>
          <Card.Content className="space-y-4 pt-6 text-center">
            <p className="text-muted-foreground">Заказ на производство не найден.</p>
            <Button asChild variant="outline">
              <Link to="/production">Вернуться к списку</Link>
            </Button>
          </Card.Content>
        </Card>
      </section>
    )
  }

  // Проверяем, можно ли завершить заказ
  const canComplete = ['in_progress', 'partially_transferred', 'transferred'].includes(order.status)
  const canStart = ['pending', 'awaiting_resources', 'ready_to_work'].includes(order.status)
  const actionsEnabled = order.status === 'in_progress'

  const handleComplete = () => {
    if (!order) return
    const itemWithPendingTransfer = order.items.find(
      (item) => getProductionItemTransferablePairs(item) - item.transferred_pairs > 0,
    )
    if (itemWithPendingTransfer) {
      toast.info('Перед завершением нужно передать произведенный товар на склад')
      handleOpenReceipt(itemWithPendingTransfer.id)
      return
    }
    // Проверяем, совпадает ли факт с планом
    const isFull = progress.produced >= progress.total
    if (!isFull) {
      const confirmComplete = window.confirm(
        `Фактически произведено ${progress.produced} из ${progress.total} пар. Вы уверены, что хотите завершить заказ?`
      )
      if (!confirmComplete) return
    }
    completeMutation.mutate()
  }

  return (
    <section className="page-shell space-y-5">
      {/* Верхняя навигация */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-2">
          <Button variant="ghost" className="px-0" onClick={() => navigate('/production')}>
            <ArrowLeft className="h-4 w-4" />
            Назад к списку
          </Button>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold">{order.name}</h1>
            <Badge tone={productionStatusTone(order.status)}>{productionStatusLabel(order.status)}</Badge>
          </div>
        </div>
        <div className="flex gap-2">
          {canStart && (
            <Button
              variant="success"
              className="bg-green-600 hover:bg-green-700"
              onClick={() => startMutation.mutate()}
              disabled={startMutation.isPending}
            >
              <Play className="h-4 w-4 mr-1" />
              Начать задание
            </Button>
          )}
          {canComplete && (
            <Button
              variant="danger"
              onClick={handleComplete}
              disabled={completeMutation.isPending}
            >
              {completeMutation.isPending ? 'Завершение...' : 'Завершить задание'}
            </Button>
          )}
          {['completed', 'transferred'].includes(order.status) && (
            <Badge tone="success" className="text-sm px-4 py-2">
              Завершён
            </Badge>
          )}
        </div>
      </div>

      {/* Диалог редактирования партии/даты позиции */}
      <Dialog open={batchDateItemOpen} onOpenChange={(open) => {
        if (!open) {
          setBatchDateItemOpen(false)
          setBatchDateItemDraft({ itemId: null, batch_number: '', production_date: '' })
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Изменить партию и дату для позиции</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Номер партии</Label>
              <Input
                value={batchDateItemDraft.batch_number}
                onChange={(e) => setBatchDateItemDraft(prev => ({ ...prev, batch_number: e.target.value }))}
                placeholder="Например, 260101"
              />
            </div>
            <div className="space-y-2">
              <DateInput
                label="Дата производства"
                value={batchDateItemDraft.production_date}
                onChange={(production_date) => setBatchDateItemDraft((prev) => ({ ...prev, production_date }))}
              />
            </div>
            <div className="flex gap-3">
              <Button className="flex-1" onClick={() => updateBatchDateItemMutation.mutate()} disabled={updateBatchDateItemMutation.isPending}>
                {updateBatchDateItemMutation.isPending ? 'Сохраняем...' : 'Сохранить'}
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => setBatchDateItemOpen(false)}>
                Назад
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Информационный блок */}
      <Card>
        <Card.Content className="grid gap-6 pt-6 lg:grid-cols-[1fr_1fr]">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-muted-foreground" />
              <div className="text-lg font-semibold">Детали заказа</div>
            </div>
            <ul className="space-y-2 text-sm">
              <DetailBullet label="Номер заказа" value={order.name} />
              <DetailBullet label="Тип задания" value={productionTaskTypeLabel(order.task_type)} />
              <DetailBullet label="Передано на склад" value={`${transferredPairs} пар`} />
              <DetailBullet label="Комментарий" value={order.comment || '—'} />
              <DetailBullet label="Дата создания" value={formatDate(order.created_at)} />
            </ul>
          </div>

          <div className="space-y-4">
            <div>
              <Progress
                value={progress.percent}
                label="Прогресс производства"
                valueLabel={`${progress.produced} / ${progress.total} пар`}
              />
            </div>

            <div className="rounded-xl border border-border/70 p-4 space-y-2">
              <div className="text-sm font-medium">Статусы запросов</div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-xs text-muted-foreground">ЧЗ:</span>
                  {order.active_chz_request ? (
                    <Badge tone={productionChzStatusTone(order.active_chz_request.status)} className="ml-2">
                      {productionBrigadierChzStatusLabel(order.active_chz_request.status)}
                    </Badge>
                  ) : (
                    <span className="ml-2 text-xs text-muted-foreground">Нет</span>
                  )}
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Сырьё:</span>
                  {rawMaterialRequest ? (
                    <Badge tone={productionSupplyStatusTone(rawMaterialRequest.status)} className="ml-2">
                      {productionSupplyStatusLabel(rawMaterialRequest.status)}
                    </Badge>
                  ) : (
                    <span className="ml-2 text-xs text-muted-foreground">Нет</span>
                  )}
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Упаковка:</span>
                  {consumableRequest ? (
                    <Badge tone={productionSupplyStatusTone(consumableRequest.status)} className="ml-2">
                      {productionSupplyStatusLabel(consumableRequest.status)}
                    </Badge>
                  ) : (
                    <span className="ml-2 text-xs text-muted-foreground">Нет</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </Card.Content>
      </Card>

      {/* Таблица позиций */}
      <Card>
        <Card.Header>
          <Card.Title>Позиции заказа</Card.Title>
        </Card.Header>
        <Card.Content>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Номенклатура</TableHead>
                  <TableHead>Размер</TableHead>
                  <TableHead>Цвет</TableHead>
                  <TableHead>Партия</TableHead>
                  <TableHead>Дата производства</TableHead>
                  <TableHead>План (пар)</TableHead>
                  <TableHead>Факт (пар)</TableHead>
                  <TableHead>Передано (пар)</TableHead>
                  <TableHead className="w-[80px]">Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {order.items.map((item) => (
                  <TableRow
                    key={item.id}
                    className="cursor-pointer hover:bg-muted/40"
                    onClick={() => openPositionModal(item.id)}
                  >
                    <TableCell className="font-medium">{item.item_title}</TableCell>
                    <TableCell>{item.item_size || '—'}</TableCell>
                    <TableCell>{item.item_color || '—'}</TableCell>
                    <TableCell>{item.batch_number || '—'}</TableCell>
                    <TableCell>{item.production_date ? formatDate(item.production_date) : '—'}</TableCell>
                    <TableCell>{item.pairs_quantity}</TableCell>
                    <TableCell>{item.produced_pairs}</TableCell>
                    <TableCell>{item.transferred_pairs}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" onClick={(e) => {
                        e.stopPropagation()
                        openPositionModal(item.id)
                      }}>
                        <ListChecks className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {order.items.length === 0 && (
            <div className="py-8 text-center text-muted-foreground">Нет позиций</div>
          )}
        </Card.Content>
      </Card>

      <Card>
        <Card.Header>
          <Card.Title>Учет времени</Card.Title>
        </Card.Header>
        <Card.Content className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[150px_120px_120px_120px_1fr]">
            <div className="space-y-2">
              <DateInput
                label="Дата"
                value={laborDraft.work_date}
                onChange={(work_date) => setLaborDraft((current) => ({ ...current, work_date }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Начало</Label>
              <Input
                type="time"
                value={laborDraft.start_time}
                onChange={(event) => setLaborDraft((current) => ({ ...current, start_time: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Окончание</Label>
              <Input
                type="time"
                value={laborDraft.end_time}
                onChange={(event) => setLaborDraft((current) => ({ ...current, end_time: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Людей</Label>
              <Input
                type="number"
                min={1}
                value={laborDraft.people_count}
                onChange={(event) =>
                  setLaborDraft((current) => ({
                    ...current,
                    people_count: Math.max(Number(event.target.value) || 1, 1),
                  }))
                }
                disabled={laborDraft.employee_ids.length > 0}
              />
            </div>
            <div className="space-y-2">
              <Label>Комментарий</Label>
              <Input
                value={laborDraft.comment}
                onChange={(event) => setLaborDraft((current) => ({ ...current, comment: event.target.value }))}
                placeholder="Необязательно"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Сотрудники</Label>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {productionEmployees.map((employee) => (
                <Checkbox
                  key={employee.id}
                  isSelected={laborDraft.employee_ids.includes(employee.id)}
                  onChange={(checked) => toggleLaborEmployee(employee.id, checked)}
                  className="rounded-xl border border-border/70 px-3 py-2"
                >
                  <span className="min-w-0 flex-1 truncate">{employee.full_name}</span>
                </Checkbox>
              ))}
              {productionEmployees.length === 0 ? (
                <div className="rounded-xl border border-dashed p-3 text-sm text-muted-foreground">
                  Сотрудники производства пока не добавлены. Можно указать только количество людей.
                </div>
              ) : null}
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              onClick={() => createLaborMutation.mutate()}
              disabled={createLaborMutation.isPending}
            >
              <Plus className="h-4 w-4" />
              {createLaborMutation.isPending ? 'Сохраняем...' : 'Добавить период'}
            </Button>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Дата</TableHead>
                  <TableHead>Время</TableHead>
                  <TableHead>Сотрудник</TableHead>
                  <TableHead>Людей</TableHead>
                  <TableHead>Комментарий</TableHead>
                  <TableHead className="w-[64px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {laborEntries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell>{formatDate(entry.work_date)}</TableCell>
                    <TableCell>{entry.start_time.slice(0, 5)} - {entry.end_time.slice(0, 5)}</TableCell>
                    <TableCell>{entry.employee_name || 'Без указания'}</TableCell>
                    <TableCell>{entry.people_count}</TableCell>
                    <TableCell>{entry.comment || '—'}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteLaborMutation.mutate(entry.id)}
                        disabled={deleteLaborMutation.isPending}
                      >
                        <Trash2 className="h-4 w-4 text-red-600" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {laborEntries.length === 0 ? (
            <div className="rounded-2xl border border-dashed p-6 text-center text-muted-foreground">
              Периоды работы еще не добавлены
            </div>
          ) : null}
        </Card.Content>
      </Card>

      {/* Модальное окно для выбранной позиции */}
      <Dialog open={activePositionModal !== null} onOpenChange={(open) => {
        if (!open) setActivePositionModal(null)
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Действия с позицией</DialogTitle>
          </DialogHeader>
          {activePositionModal !== null && order && (() => {
            const item = order.items.find(i => i.id === activePositionModal)
            if (!item) return <div>Позиция не найдена</div>
            return (
              <div className="space-y-4">
                <div className="rounded-xl border border-border/70 p-3 text-sm">
                  <div className="font-medium">{item.item_title}</div>
                  <div className="text-muted-foreground">
                    {item.item_size || '—'} · {item.item_color || '—'} · {item.pairs_quantity} пар
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Партия: {item.batch_number || '—'} · Дата: {item.production_date ? formatDate(item.production_date) : '—'}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Факт: {item.produced_pairs} · Передано: {item.transferred_pairs}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" onClick={() => handleOpenProduced(item.id)} disabled={!actionsEnabled}>
                    <FileText className="h-4 w-4 mr-1" />
                    Отчёт
                  </Button>
                  <Button variant="outline" onClick={() => handleOpenChz(item.id)} disabled={!actionsEnabled}>
                    <ShieldCheck className="h-4 w-4 mr-1" />
                    ЧЗ
                  </Button>
                  <Button variant="outline" onClick={() => handleOpenSupply(item.id, 'raw_material')} disabled={!actionsEnabled}>
                    <Warehouse className="h-4 w-4 mr-1" />
                    Сырьё
                  </Button>
                  <Button variant="outline" onClick={() => handleOpenSupply(item.id, 'consumable')} disabled={!actionsEnabled}>
                    <PackageCheck className="h-4 w-4 mr-1" />
                    Упаковка
                  </Button>
                  <Button variant="outline" onClick={() => handleOpenReceipt(item.id)} disabled={!actionsEnabled}>
                    <SendToBack className="h-4 w-4 mr-1" />
                    На склад
                  </Button>
                  <Button variant="outline" onClick={() => handleOpenBatchDate(item.id)} disabled={!actionsEnabled}>
                    <CalendarDays className="h-4 w-4 mr-1" />
                    Партия/дата
                  </Button>
                </div>
              </div>
            )
          })()}
        </DialogContent>
      </Dialog>

      {/* Модалка "Отчёт" (факт) */}
      <Dialog open={producedOpen} onOpenChange={(open) => {
        if (!open) {
          setProducedOpen(false)
          setProducedItemId(null)
          setProducedDraft({ value: 0, comment: '' })
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Заполнить факт производства</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Количество пар</Label>
              <Input
                type="number"
                min={0}
                max={order.items.find((item) => item.id === producedItemId)?.pairs_quantity ?? undefined}
                value={producedDraft.value}
                onChange={(e) => setProducedDraft(prev => ({ ...prev, value: Number(e.target.value) }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Комментарий (необязательно)</Label>
              <Textarea
                rows={2}
                value={producedDraft.comment}
                onChange={(e) => setProducedDraft(prev => ({ ...prev, comment: e.target.value }))}
              />
            </div>
            <div className="flex gap-3">
              <Button
                className="flex-1"
                onClick={() => updateProducedMutation.mutate()}
                disabled={
                  updateProducedMutation.isPending ||
                  producedDraft.value > (order.items.find((item) => item.id === producedItemId)?.pairs_quantity ?? Number.MAX_SAFE_INTEGER)
                }
              >
                {updateProducedMutation.isPending ? 'Сохранение...' : 'Сохранить'}
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => setProducedOpen(false)}>
                Назад
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Модалка ЧЗ */}
      <Dialog open={chzOpen} onOpenChange={(open) => {
        if (!open) setChzOpen(false)
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Заказать ЧЗ</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Позиции</Label>
              {order.items.map((item) => (
                <Checkbox
                  key={item.id}
                  isSelected={selectedProductionItemIds.includes(item.id)}
                  onChange={(checked) =>
                    setSelectedProductionItemIds((current) =>
                      checked ? [...current, item.id] : current.filter((v) => v !== item.id)
                    )
                  }
                  className="w-full rounded-xl border border-border/70 px-3 py-2"
                >
                  {formatProductionItemLabel(item)} · {item.pairs_quantity} пар
                </Checkbox>
              ))}
            </div>
            <div className="space-y-2">
              <Label>Комментарий</Label>
              <Textarea rows={3} value={chzComment} onChange={(e) => setChzComment(e.target.value)} placeholder="Комментарий для оператора ЧЗ" />
            </div>
            <Button className="w-full" onClick={() => chzMutation.mutate()} disabled={chzMutation.isPending}>
              {chzMutation.isPending ? 'Отправка...' : 'Запросить ЧЗ'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Модалка для сырья/упаковки */}
      <Dialog open={supplyOpen} onOpenChange={(open) => {
        if (!open) setSupplyOpen(false)
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {supplyType === 'raw_material' ? 'Заказать сырье' : 'Заказать упаковку'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Выберите остаток</Label>
              {isLoadingStocks ? (
                <div className="text-center text-muted-foreground">Загрузка...</div>
              ) : availableStocks.length === 0 ? (
                <div className="text-center text-muted-foreground">Нет доступных позиций</div>
              ) : (
                <SelectNative value={selectedStockId || ''} onChange={(e) => setSelectedStockId(Number(e.target.value))}>
                  <option value="">Выберите остаток</option>
                  {availableStocks.map((stock) => (
                    <option key={stock.id} value={stock.id}>
                      {stock.item_title}
                      {stock.size ? ` р.${stock.size}` : ''}
                      {stock.batch_number ? ` партия ${stock.batch_number}` : ''}
                      {stock.pairs_quantity > 0 ? ` (${stock.pairs_quantity} пар)` : ''}
                      {stock.warehouse_name ? ` · ${stock.warehouse_name}` : ''}
                      {stock.cell_location ? ` - ${stock.cell_location}` : ''}
                    </option>
                  ))}
                </SelectNative>
              )}
            </div>
            <div className="space-y-2">
              <Label>Количество</Label>
              <Input type="number" min={1} value={supplyQuantity} onChange={(e) => setSupplyQuantity(Number(e.target.value))} />
            </div>
            <div className="space-y-2">
              <Label>Комментарий</Label>
              <Textarea rows={2} value={supplyComment} onChange={(e) => setSupplyComment(e.target.value)} placeholder="Необязательно" />
            </div>
            <Button className="w-full" onClick={() => createSupplyMutation.mutate()} disabled={!selectedStockId || supplyQuantity <= 0 || createSupplyMutation.isPending}>
              {createSupplyMutation.isPending ? 'Создание...' : 'Заказать'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Модалка приёмки */}
      <Dialog open={receiptOpen} onOpenChange={setReceiptOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Передать на склад</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {order.items.length > 1 ? (
              <div className="space-y-2">
                <Label>Позиция</Label>
                <SelectNative
                  value={receiptDraft.production_order_item_id}
                  onChange={(e) =>
                    setReceiptDraft(prev => ({
                      ...prev,
                      production_order_item_id: Number(e.target.value),
                    }))
                  }
                >
                  {order.items.map((item) => (
                    <option key={item.id} value={item.id}>
                      {formatProductionItemLabel(item)}
                    </option>
                  ))}
                </SelectNative>
              </div>
            ) : null}

            <div className="space-y-2">
              <Label>Кол-во пар</Label>
              <Input
                type="number"
                min={1}
                max={
                  order.items.find((item) => item.id === receiptDraft.production_order_item_id)
                    ? Math.max(
                        getProductionItemTransferablePairs(order.items.find((item) => item.id === receiptDraft.production_order_item_id)!) -
                          (order.items.find((item) => item.id === receiptDraft.production_order_item_id)?.transferred_pairs ?? 0),
                        1,
                      )
                    : undefined
                }
                value={receiptDraft.quantity}
                onChange={(e) =>
                  setReceiptDraft(prev => ({ ...prev, quantity: Number(e.target.value) }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label>Комментарий</Label>
              <Textarea
                rows={3}
                value={receiptDraft.comment}
                onChange={(e) =>
                  setReceiptDraft(prev => ({ ...prev, comment: e.target.value }))
                }
                placeholder="Необязательно"
              />
            </div>

            <Button className="w-full" onClick={() => receiptMutation.mutate()} disabled={receiptMutation.isPending}>
              {receiptMutation.isPending ? 'Создаем...' : 'Подтвердить передачу'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Блок истории действий (сворачиваемый) */}
      <Card>
        <Card.Header
          className="cursor-pointer select-none hover:bg-muted/20 transition-colors"
          onClick={() => setIsHistoryExpanded(!isHistoryExpanded)}
        >
          <Card.Title className="flex items-center gap-2">
            <History className="h-4 w-4" />
            История действий
            <span className="ml-auto text-xs text-muted-foreground">
              {isHistoryExpanded ? '▼' : '▶'}
            </span>
          </Card.Title>
        </Card.Header>
        {isHistoryExpanded && (
          <Card.Content>
            {auditLogsQuery.isLoading ? (
              <Skeleton className="h-20" />
            ) : auditLogsQuery.data && auditLogsQuery.data.length > 0 ? (
              <div className="space-y-2">
                {auditLogsQuery.data.map((log) => {
                  const message = formatAuditMessage(log, order)
                  const comment = typeof log.details?.comment === 'string' ? log.details.comment : ''
                  return (
                    <div key={log.id} className="flex items-start gap-3 text-sm border-b border-border/50 py-2">
                      <div className="mt-0.5">{getAuditLogIcon(log.operation_type)}</div>
                      <div className="flex-1">
                        <span className="font-medium">{message}</span>
                        {comment && (
                          <span className="text-muted-foreground ml-2">— {comment}</span>
                        )}
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          Автор: {formatProductionAuditAuthor(log)}
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatDate(log.created_at)}
                      </span>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="text-center text-muted-foreground py-4">Действий по заказу пока нет</div>
            )}
          </Card.Content>
        )}
      </Card>
    </section>
  )
}
