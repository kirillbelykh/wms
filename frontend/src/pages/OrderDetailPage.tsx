// frontend/src/pages/OrderDetailPage.tsx
import React, { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Link as HeroLink } from '@heroui/react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useQuery } from '@tanstack/react-query'
import { Controller, useForm, useFieldArray } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  ArrowLeft,
  Play,
  Trash2,
  Package,
  Truck,
  CheckCircle,
  XCircle,
  Calendar,
  FileText,
  Truck as TruckIcon,
  CheckSquare,
  Edit,
  Plus,
  History,
  ChartPie,
  ListOrdered,
} from 'lucide-react'
import { toast } from '@/lib/toast'
import { deleteOrder, getOrder, getItems, getOrderAuditLogs, getStocks, markOrderChzReady, shipOrder, startOrderPicking, updateOrder } from '@/api/client'
import { ConfirmDialog } from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { DateInput } from '@/components/ui/date-picker'
import { Input, SelectNative } from '@/components/ui/input'
import { FieldErrorWrap } from '@/components/ui/field-error'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  buildAvailableStockOption,
  filterCatalogItemsByVariant,
  filterStockOptionsByVariant,
  getDistinctVariantColors,
  getDistinctVariantSizes,
  getDistinctVariantTitles,
  normalizeVariantComparableValue,
  normalizeVariantDisplayValue,
  resolveCatalogItemId,
  type AvailableStockOption,
  type VariantSelection,
} from '@/lib/itemVariants'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  calculateOrderProgress,
  chzRequestStatusLabel,
  chzRequestStatusTone,
  dateInputToMskIso,
  formatDate,
  formatDateInputValue,
  getErrorMessage,
  orderItemStatusLabel,
  orderItemStatusTone,
  orderStatusLabel,
  orderStatusTone,
} from '@/lib/utils'
import type { HistoryLog, Item, Order, OrderCreate, OrderItem, Stock } from '@/types/wms'

// Предопределенные размеры и цвета
const PREDEFINED_SIZES = ['6.0', '6.5', '7.0', '7.5', '8.0', '8.5', '9.0', '9.5', 'XS', 'S', 'M', 'L', 'XL']
const PREDEFINED_COLORS = ['натуральный', 'синий', 'фиолетовый', 'коричневый']

// Схема с явной типизацией
const orderEditSchema = z.object({
  name: z.string().min(1, 'Укажите название заказа'),
  order_type: z.string().min(1, 'Выберите тип заказа'),
  priority: z.coerce.number().int().min(0, 'От 0 до 9').max(9, 'От 0 до 9'),
  customer: z.string().min(1, 'Укажите клиента'),
  supplier: z.string().optional(),
  comment: z.string().optional(),
  invoice: z.string().optional(),
  transport_company: z.string().optional(),
  approved: z.boolean().default(false),
  shipping_date: z.string().optional(),
  items: z
    .array(
      z.object({
        stock_id: z.coerce.number().int().nonnegative().optional(),
        item_id: z.coerce.number().int().nonnegative().optional(),
        item_title: z.string().default(''),
        item_size: z.string().default(''),
        item_color: z.string().default(''),
        pairs_quantity: z.coerce.number().int().min(1, 'Минимум 1 пара'),
      }),
    )
    .superRefine((items, ctx) => {
      items.forEach((item, index) => {
        if (!item.item_title) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Выберите номенклатуру',
            path: [index, 'item_title'],
          })
        }
        if (!item.item_size) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Выберите размер',
            path: [index, 'item_size'],
          })
        }
        if (!item.stock_id && !item.item_id) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Не удалось определить товар. Уточните размер или цвет',
            path: [index, 'item_color'],
          })
        }
      })
    })
    .min(1, 'Добавьте хотя бы одну позицию'),
})

type OrderEditForm = z.infer<typeof orderEditSchema>

function buildEmptyOrderEditItem() {
  return {
    stock_id: 0,
    item_id: 0,
    item_title: '',
    item_size: '',
    item_color: '',
    pairs_quantity: 1,
  }
}

function buildOrderEditVariantSelection(
  item: Pick<OrderEditForm['items'][number], 'item_title' | 'item_size' | 'item_color'>,
): VariantSelection {
  return {
    item_title: item.item_title ?? '',
    item_size: item.item_size ?? '',
    item_color: item.item_color ?? '',
  }
}

function withCurrentStringOption(options: string[], currentValue: string) {
  const normalizedCurrent = normalizeVariantDisplayValue(currentValue)
  if (!normalizedCurrent) return options
  return options.some((option) => normalizeVariantComparableValue(option) === normalizeVariantComparableValue(normalizedCurrent))
    ? options
    : [normalizedCurrent, ...options]
}

function withCurrentStockOption(options: AvailableStockOption[], currentOption?: AvailableStockOption) {
  if (!currentOption) return options
  return options.some((option) => option.id === currentOption.id) ? options : [currentOption, ...options]
}

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

function getStockForOrderItem(stocks: any[], itemId: number, size?: string | null, color?: string | null, venchik?: string | null) {
  return stocks.find(s => 
    s.item_id === itemId && 
    (!size || normalizeVariantComparableValue(s.size) === normalizeVariantComparableValue(size)) &&
    (!color || normalizeVariantComparableValue(s.color) === normalizeVariantComparableValue(color)) &&
    (!venchik || normalizeVariantComparableValue(s.venchik) === normalizeVariantComparableValue(venchik))
  )
}

function getOrderAuditLogIcon(operationType: string) {
  switch (operationType) {
    case 'create_order':
      return <Plus className="h-4 w-4 text-green-500" />
    case 'update_order':
    case 'update_suggested_stock':
      return <Edit className="h-4 w-4 text-blue-500" />
    case 'pick':
    case 'start_picking':
    case 'update_pick':
    case 'delete_pick':
    case 'complete_picking':
    case 'cancel_picking':
      return <Package className="h-4 w-4 text-amber-500" />
    case 'create_chz_request':
    case 'mark_chz_ready':
      return <CheckSquare className="h-4 w-4 text-cyan-500" />
    case 'ship_order':
      return <Truck className="h-4 w-4 text-emerald-500" />
    case 'delete_order':
      return <Trash2 className="h-4 w-4 text-red-500" />
    default:
      return <History className="h-4 w-4 text-muted-foreground" />
  }
}

function formatOrderAuditValue(value: unknown) {
  if (value === null || value === undefined || value === '') return 'не указано'
  if (typeof value === 'boolean') return value ? 'да' : 'нет'
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return formatDate(value)
  if (Array.isArray(value)) return `позиций: ${value.length}`
  if (typeof value === 'object') return 'обновлено'
  return String(value)
}

function formatOrderAuditChanges(changes: Record<string, unknown>) {
  const labels: Record<string, string> = {
    name: 'название',
    customer: 'клиент',
    supplier: 'поставщик',
    comment: 'комментарий',
    invoice: 'счет',
    transport_company: 'транспортная компания',
    approved: 'согласование',
    shipping_date: 'дата отгрузки',
    actual_shipping_date: 'фактическая отгрузка',
    order_type: 'тип заказа',
    priority: 'приоритет',
  }

  return Object.entries(changes)
    .map(([key, value]) => `${labels[key] || key}: ${formatOrderAuditValue(value)}`)
    .join(', ')
}

function formatOrderAuditMessage(log: HistoryLog) {
  const details = (log.details ?? {}) as Record<string, unknown>
  const orderName = typeof details.order_name === 'string' ? details.order_name : ''
  const itemName =
    log.item_title ||
    (typeof details.item_name === 'string' ? details.item_name : '') ||
    (typeof details.item_title === 'string' ? details.item_title : '')
  const changes =
    details.changes && typeof details.changes === 'object' && !Array.isArray(details.changes)
      ? (details.changes as Record<string, unknown>)
      : {}

  switch (log.operation_type) {
    case 'create_order':
      return `Создан заказ "${orderName || 'без названия'}"`
    case 'update_order':
      if (Object.keys(changes).length === 0) return 'Обновлены данные заказа'
      return `Обновлены данные заказа: ${formatOrderAuditChanges(changes)}`
    case 'ship_order':
      return 'Заказ отгружен'
    case 'delete_order':
      return 'Заказ удален'
    case 'update_suggested_stock':
      return itemName
        ? `Обновлена предложенная ячейка для позиции "${itemName}"`
        : 'Обновлена предложенная ячейка'
    case 'create_chz_request':
      return 'Отправлен запрос ЧЗ'
    case 'mark_chz_ready':
      return 'Коды ЧЗ отмечены как готовые'
    case 'start_picking':
      return 'Сборка заказа начата'
    case 'pick':
      return itemName
        ? `Отобрано ${log.quantity ?? details.pairs_quantity ?? 0} пар по позиции "${itemName}"`
        : `Отобрано ${log.quantity ?? details.pairs_quantity ?? 0} пар`
    case 'update_pick':
      return `Изменено количество в операции отбора: ${details.old_quantity ?? 0} → ${details.new_quantity ?? 0}`
    case 'delete_pick':
      return 'Операция отбора удалена'
    case 'complete_picking':
      return 'Сборка заказа завершена'
    case 'cancel_picking':
      return 'Сборка заказа отменена'
    default:
      return 'Выполнено действие по заказу'
  }
}

function formatOrderAuditAuthor(log: HistoryLog) {
  return log.user_username || log.user_email || (log.user_id ? `Пользователь #${log.user_id}` : 'Система')
}

export function OrderDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const orderId = Number(id)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [isHistoryExpanded, setIsHistoryExpanded] = useState(false)

  const orderQuery = useQuery<Order>({
    queryKey: ['orders', orderId],
    queryFn: () => getOrder(orderId),
    enabled: Number.isFinite(orderId),
  })

  const orderAuditLogsQuery = useQuery<HistoryLog[]>({
    queryKey: ['order-audit-logs', orderId],
    queryFn: () => getOrderAuditLogs(orderId),
    enabled: Number.isFinite(orderId) && orderId > 0,
  })

  const itemsQuery = useQuery({
    queryKey: ['items'],
    queryFn: getItems,
  })

  const stocksQuery = useQuery({
    queryKey: ['stocks'],
    queryFn: getStocks,
  })

  const items = useMemo(() => (itemsQuery.data ?? []) as Item[], [itemsQuery.data])
  const itemsById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items])
  const stocks = useMemo(() => (stocksQuery.data ?? []) as Stock[], [stocksQuery.data])

  const availableStocksForEdit = useMemo(
    () =>
      stocks
        .filter((stock) => stock.pairs_quantity > 0)
        .map((stock) => {
          const item = itemsById.get(stock.item_id)
          return item ? buildAvailableStockOption(stock, item) : null
        })
        .filter((stock): stock is AvailableStockOption => stock !== null)
        .sort((left, right) => left.label.localeCompare(right.label, 'ru')),
    [itemsById, stocks],
  )

  const stockAvailabilityByItemId = useMemo(() => {
    const availability = new Map<number, number>()
    stocks.forEach((stock) => {
      if (stock.pairs_quantity <= 0) return
      availability.set(stock.item_id, (availability.get(stock.item_id) ?? 0) + stock.pairs_quantity)
    })
    return availability
  }, [stocks])

  const order = orderQuery.data
  const isOrderLockedForEdit = order?.status === 'shipped' || order?.status === 'delivered'

  const form = useForm<OrderEditForm>({
    resolver: zodResolver(orderEditSchema) as any,
    defaultValues: {
      name: '',
      order_type: 'outbound',
      priority: 5,
      customer: '',
      supplier: '',
      comment: '',
      invoice: '',
      transport_company: '',
      approved: false,
      shipping_date: '',
      items: [buildEmptyOrderEditItem()],
    },
  })

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'items',
  })

  // ✅ Получаем все уникальные названия товаров из базы
  const allTitles = useMemo(() => {
    const titles = new Set<string>()
    items.forEach(item => {
      if (item.title) titles.add(item.title)
    })
    return Array.from(titles).sort((a, b) => a.localeCompare(b, 'ru'))
  }, [items])

  // ✅ Функция получения размеров для выбранного товара
  const getAvailableSizes = (selectedTitle: string): string[] => {
    if (!selectedTitle) return PREDEFINED_SIZES
    
    const existingSizes = new Set<string>()
    items.forEach(item => {
      if (item.title.toLowerCase() === selectedTitle.toLowerCase() && item.size) {
        existingSizes.add(normalizeVariantDisplayValue(item.size))
      }
    })
    
    const result = new Set([...existingSizes, ...PREDEFINED_SIZES])
    return Array.from(result).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  }

  // ✅ Функция получения цветов для выбранного товара и размера
  const getAvailableColors = (selectedTitle: string, selectedSize: string): string[] => {
    if (!selectedTitle) return PREDEFINED_COLORS
    
    const existingColors = new Set<string>()
    items.forEach(item => {
      if (
        item.title.toLowerCase() === selectedTitle.toLowerCase() &&
        (!selectedSize || normalizeVariantComparableValue(item.size) === normalizeVariantComparableValue(selectedSize)) &&
        item.color
      ) {
        existingColors.add(item.color)
      }
    })
    
    const result = new Set([...existingColors, ...PREDEFINED_COLORS])
    return Array.from(result).sort()
  }

  // ✅ Найти ID товара по названию, размеру и цвету
  const findItemId = (title: string, size: string, color: string): number | undefined => {
    const found = items.find(item => 
      item.title.toLowerCase() === title.toLowerCase() &&
      normalizeVariantComparableValue(item.size) === normalizeVariantComparableValue(size) &&
      normalizeVariantComparableValue(item.color) === normalizeVariantComparableValue(color)
    )
    return found?.id
  }

  useEffect(() => {
    if (order) {
      const convertedItems =
        order.items?.map((item) => {
          const stock = getStockForOrderItem(stocks, item.item_id, item.item_size, item.item_color)
          const product = itemsById.get(item.item_id)
          return {
            stock_id: stock?.id ?? 0,
            item_id: item.item_id,
            item_title: product?.title ?? item.item_name ?? '',
            item_size: item.item_size ?? product?.size ?? '',
            item_color: item.item_color ?? product?.color ?? '',
            pairs_quantity: item.pairs_quantity,
          }
        }) ?? []

      form.reset({
        name: order.name,
        order_type: order.order_type,
        priority: order.priority,
        customer: order.customer,
        supplier: order.supplier || '',
        comment: order.comment || '',
        invoice: order.invoice || '',
        transport_company: order.transport_company || '',
        approved: order.approved,
        shipping_date: formatDateInputValue(order.shipping_date),
        items: convertedItems.length > 0 ? convertedItems : [buildEmptyOrderEditItem()],
      })
    }
  }, [order, stocks, form, itemsById])

  const statusMutation = useMutation({
    mutationFn: () => startOrderPicking(orderId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['orders'] })
      navigate(`/picking/${orderId}`)
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  const markChzReadyMutation = useMutation({
    mutationFn: () => markOrderChzReady(orderId),
    onSuccess: async () => {
      toast.success('Коды ЧЗ отмечены как готовые')
      await queryClient.invalidateQueries({ queryKey: ['orders'] })
      await queryClient.invalidateQueries({ queryKey: ['order-audit-logs', orderId] })
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  const continuePickingMutation = useMutation({
    mutationFn: () => startOrderPicking(orderId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['orders'] })
      navigate(`/picking/${orderId}`)
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  const shipOrderMutation = useMutation({
    mutationFn: () => shipOrder(orderId),
    onSuccess: async () => {
      toast.success('Заказ отгружен')
      await queryClient.invalidateQueries({ queryKey: ['orders'] })
      await queryClient.invalidateQueries({ queryKey: ['order-audit-logs', orderId] })
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  const updateOrderMutation = useMutation({
    mutationFn: (data: OrderEditForm) => {
      const updateData: Partial<OrderCreate> = {
        name: data.name,
        order_type: data.order_type,
        priority: data.priority,
        customer: data.customer,
        supplier: data.supplier,
        comment: data.comment,
        invoice: data.invoice,
        transport_company: data.transport_company,
        approved: data.approved,
        shipping_date: dateInputToMskIso(data.shipping_date),
        items: data.items.map((item) => ({
          stock_id: item.stock_id && item.stock_id > 0 ? item.stock_id : undefined,
          item_id: item.item_id && item.item_id > 0 ? item.item_id : undefined,
          pairs_quantity: item.pairs_quantity,
        })),
      }
      return updateOrder(orderId, updateData)
    },
    onSuccess: async () => {
      toast.success('Заказ обновлён')
      setEditDialogOpen(false)
      await queryClient.invalidateQueries({ queryKey: ['orders'] })
      await queryClient.invalidateQueries({ queryKey: ['stocks'] })
      await queryClient.invalidateQueries({ queryKey: ['order-audit-logs', orderId] })
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteOrder(orderId),
    onSuccess: async () => {
      toast.success('Заказ удалён')
      await queryClient.invalidateQueries({ queryKey: ['orders'] })
      navigate('/orders')
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  const onSubmitEdit = (data: OrderEditForm) => {
    if (isOrderLockedForEdit) {
      toast.error('Отгруженный заказ нельзя редактировать')
      return
    }
    updateOrderMutation.mutate(data)
  }

  const setRowVariantSelection = (
    index: number,
    partialSelection: Partial<VariantSelection>,
  ) => {
    const currentItem = form.getValues(`items.${index}`)
    const nextSelection = buildOrderEditVariantSelection({
      item_title: partialSelection.item_title ?? currentItem.item_title,
      item_size: normalizeVariantDisplayValue(partialSelection.item_size ?? currentItem.item_size),
      item_color: partialSelection.item_color ?? currentItem.item_color,
    })
    const currentStockId = Number(currentItem.stock_id || 0)
    const currentStock = availableStocksForEdit.find((stock) => stock.id === currentStockId)
    const matchingStocks = filterStockOptionsByVariant(availableStocksForEdit, nextSelection)
    
    // ✅ Находим ID товара по выбранным характеристикам
    const foundItemId = findItemId(
      nextSelection.item_title,
      nextSelection.item_size,
      nextSelection.item_color
    )
    
    const nextStock =
      (currentStock && matchingStocks.find((stock) => stock.id === currentStock.id)) ||
      (matchingStocks.length === 1 ? matchingStocks[0] : undefined)

    form.setValue(`items.${index}.item_title`, nextSelection.item_title, {
      shouldDirty: true,
      shouldValidate: true,
    })
    form.setValue(`items.${index}.item_size`, nextSelection.item_size, {
      shouldDirty: true,
      shouldValidate: true,
    })
    form.setValue(`items.${index}.item_color`, nextSelection.item_color, {
      shouldDirty: true,
      shouldValidate: true,
    })
    form.setValue(`items.${index}.item_id`, foundItemId || 0, {
      shouldDirty: true,
      shouldValidate: true,
    })
    form.setValue(`items.${index}.stock_id`, nextStock?.id ?? 0, {
      shouldDirty: true,
      shouldValidate: true,
    })
  }

  const setRowStock = (index: number, stockId: number) => {
    const selectedStock = availableStocksForEdit.find((stock) => stock.id === stockId)
    if (!selectedStock) {
      form.setValue(`items.${index}.stock_id`, 0, { shouldDirty: true, shouldValidate: true })
      return
    }

    form.setValue(`items.${index}.stock_id`, selectedStock.id, { shouldDirty: true, shouldValidate: true })
    form.setValue(`items.${index}.item_id`, selectedStock.item_id, { shouldDirty: true, shouldValidate: true })
    form.setValue(`items.${index}.item_title`, selectedStock.title, { shouldDirty: true, shouldValidate: true })
    form.setValue(`items.${index}.item_size`, normalizeVariantDisplayValue(selectedStock.size), { shouldDirty: true, shouldValidate: true })
    form.setValue(`items.${index}.item_color`, selectedStock.color ?? '', { shouldDirty: true, shouldValidate: true })
  }

  const progress = calculateOrderProgress(order)
  const hasWaitingProductionItems = order?.items?.some((item) => item.waiting_for_production) ?? false

  if (orderQuery.isLoading || itemsQuery.isLoading || stocksQuery.isLoading) {
    return (
      <section className="page-shell">
        <div className="space-y-4">
          <Skeleton className="h-10 w-32" />
          <div className="grid gap-4 lg:grid-cols-2">
            <Skeleton className="h-64" />
            <Skeleton className="h-64" />
          </div>
          <Skeleton className="h-96" />
        </div>
      </section>
    )
  }

  if (!order) {
    return (
      <section className="page-shell">
        <Card className="mx-auto max-w-md">
          <Package aria-label="Заказ" className="size-6 text-primary" role="img" />
          <Card.Header>
            <Card.Title>Заказ не найден</Card.Title>
            <Card.Description>Проверьте ссылку или вернитесь к списку заказов.</Card.Description>
          </Card.Header>
          <Card.Footer>
            <HeroLink
              aria-label="К списку заказов"
              href="/orders"
              onClick={(event) => {
                event.preventDefault()
                navigate('/orders')
              }}
            >
              К заказам
              <HeroLink.Icon aria-hidden="true" />
            </HeroLink>
          </Card.Footer>
        </Card>
      </section>
    )
  }

  const StatusIcon = () => {
    const iconClass = 'size-6 text-primary'
    switch (order.status) {
      case 'delivered':
        return <CheckCircle aria-label="Доставлен" className={iconClass} role="img" />
      case 'cancelled':
        return <XCircle aria-label="Отменён" className={iconClass} role="img" />
      case 'shipped':
        return <Truck aria-label="Отгружен" className={iconClass} role="img" />
      default:
        return <Package aria-label="Заказ" className={iconClass} role="img" />
    }
  }

  const getItemDetails = (item: OrderItem) => {
    const product = itemsById.get(item.item_id)
    const stock = getStockForOrderItem(stocks, item.item_id, item.item_size, item.item_color)
    return {
      title: product?.title || item.item_name || `Товар #${item.item_id}`,
      size: stock?.size || item.item_size || product?.size || '—',
      color: stock?.color || item.item_color || product?.color || '—',
      venchik: stock?.venchik || '—',
      batch_number: stock?.batch_number || '—'
    }
  }

  return (
    <TooltipProvider>
      <section className="page-shell space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button asChild variant="ghost">
            <Link to="/orders">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Назад к заказам
            </Link>
          </Button>
          <div className="flex gap-2 flex-wrap">
            {(order.status === 'pending' || order.status === 'edited' || order.status === 'pick_edited') && (
              <Button
                variant="success"
                onClick={() => statusMutation.mutate()}
                disabled={statusMutation.isPending || !order.approved}
              >
                <Play className="h-4 w-4 mr-1" />
                {order.approved ? 'Начать сборку' : 'Ждет согласования'}
              </Button>
            )}
            
            {order.status === 'picking' && (
              <Button
                variant="warning"
                onClick={() => continuePickingMutation.mutate()}
                disabled={continuePickingMutation.isPending || !order.approved}
              >
                <Play className="h-4 w-4 mr-1" />
                Продолжить сборку
              </Button>
            )}
            
            {order.requires_chz && (
              <Button
                variant="outline"
                onClick={() => markChzReadyMutation.mutate()}
                disabled={markChzReadyMutation.isPending}
              >
                <CheckCircle className="h-4 w-4 mr-1" />
                Коды готовы
              </Button>
            )}
            
            {order.status === 'packed' && (
              <ConfirmDialog
                title="Отгрузить заказ?"
                description={`Отгрузить заказ ${order.name}? После подтверждения статус изменится на "Отгружен".`}
                confirmLabel="Отгрузить"
                onConfirm={() => shipOrderMutation.mutate()}
              >
                <Button variant="success" disabled={shipOrderMutation.isPending}>
                  <Truck className="h-4 w-4 mr-1" />
                  Отгрузить
                </Button>
              </ConfirmDialog>
            )}
            
            {progress.picked > 0 && (
              <Button
                variant="outline"
                onClick={() => navigate(`/orders/${orderId}/pick-operations`)}
                disabled={order.status === 'shipped'}
                title={order.status === 'shipped' ? 'Для отгруженного заказа редактирование отбора недоступно' : undefined}
              >
                <History className="h-4 w-4 mr-1" />
                Редактировать отбор
              </Button>
            )}
            
            {/* ✅ Полный диалог редактирования */}
            {isOrderLockedForEdit ? (
              <Button variant="outline" disabled title="Отгруженный заказ нельзя редактировать">
                <Edit className="h-4 w-4 mr-1" />
                Редактировать
              </Button>
            ) : (
            <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <Edit className="h-4 w-4 mr-1" />
                  Редактировать
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Редактирование заказа</DialogTitle>
                </DialogHeader>
                <form onSubmit={form.handleSubmit(onSubmitEdit)} className="space-y-5">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="edit-name">Название заказа *</Label>
                      <FieldErrorWrap error={form.formState.errors.name?.message}>
                        <Input id="edit-name" {...form.register('name')} />
                      </FieldErrorWrap>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-order_type">Тип заказа *</Label>
                      <Controller
                        control={form.control}
                        name="order_type"
                        render={({ field }) => (
                          <SelectNative
                            id="edit-order_type"
                            value={field.value}
                            onBlur={field.onBlur}
                            onChange={(event) => field.onChange(event.target.value)}
                          >
                            <option value="outbound">Отгрузка</option>
                            <option value="inbound">Приёмка</option>
                            <option value="transfer">Перемещение</option>
                          </SelectNative>
                        )}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-priority">Приоритет *</Label>
                      <Controller
                        control={form.control}
                        name="priority"
                        render={({ field }) => (
                          <SelectNative
                            id="edit-priority"
                            value={field.value}
                            onBlur={field.onBlur}
                            onChange={(event) => field.onChange(Number(event.target.value))}
                          >
                            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((p) => (
                              <option key={p} value={p}>{p}</option>
                            ))}
                          </SelectNative>
                        )}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-customer">Клиент *</Label>
                      <FieldErrorWrap error={form.formState.errors.customer?.message}>
                        <Input id="edit-customer" {...form.register('customer')} />
                      </FieldErrorWrap>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-supplier">Поставщик</Label>
                      <Input id="edit-supplier" {...form.register('supplier')} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-transport_company">Транспортная компания</Label>
                      <Input id="edit-transport_company" {...form.register('transport_company')} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-invoice">Счета</Label>
                      <Input id="edit-invoice" {...form.register('invoice')} />
                    </div>
                    <div className="space-y-2">
                      <Controller
                        control={form.control}
                        name="shipping_date"
                        render={({ field }) => (
                          <DateInput
                            id="edit-shipping_date"
                            label="Дата отгрузки"
                            value={field.value ?? ''}
                            onChange={field.onChange}
                          />
                        )}
                      />
                    </div>
                    <div className="col-span-2 space-y-2">
                      <Label htmlFor="edit-comment">Комментарий</Label>
                      <textarea
                        id="edit-comment"
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        rows={3}
                        {...form.register('comment')}
                      />
                    </div>
                    <div className="col-span-2">
                      <Controller
                        control={form.control}
                        name="approved"
                        render={({ field }) => (
                          <Checkbox
                            id="edit-approved"
                            isSelected={!!field.value}
                            onChange={field.onChange}
                            name={field.name}
                          >
                            Согласовано
                          </Checkbox>
                        )}
                      />
                    </div>
                  </div>

                  <div className="space-y-3 border-t pt-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-semibold">Позиции заказа</h3>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Выберите номенклатуру, размер и цвет.
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => append(buildEmptyOrderEditItem())}
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Добавить товар
                      </Button>
                    </div>

                    {fields.map((field, index) => {
                      const currentItem = form.watch(`items.${index}`) ?? buildEmptyOrderEditItem()
                      const selection = buildOrderEditVariantSelection(currentItem)
                      const selectedStockId = Number(currentItem.stock_id || 0)
                      const selectedStock = availableStocksForEdit.find((stock) => stock.id === selectedStockId)
                      const matchingStocks = withCurrentStockOption(
                        filterStockOptionsByVariant(availableStocksForEdit, selection),
                        selectedStock,
                      )
                      const foundItemId = findItemId(
                        currentItem.item_title,
                        currentItem.item_size,
                        currentItem.item_color
                      )
                      const resolvedItemId = foundItemId || Number(currentItem.item_id || 0)
                      const resolvedItem = items.find((item) => item.id === resolvedItemId)
                      
                      const titleOptions = withCurrentStringOption(allTitles, currentItem.item_title)
                      const sizeOptions = withCurrentStringOption(
                        getAvailableSizes(currentItem.item_title),
                        currentItem.item_size,
                      )
                      const colorOptions = withCurrentStringOption(
                        getAvailableColors(currentItem.item_title, currentItem.item_size),
                        currentItem.item_color,
                      )
                      const maxAvailable = selectedStock?.pairs_quantity || undefined
                      const availablePairs = resolvedItem ? stockAvailabilityByItemId.get(resolvedItem.id) ?? 0 : 0
                      const isNewItem = !resolvedItem && currentItem.item_title && currentItem.item_size

                      return (
                        <div key={field.id} className="space-y-4 rounded-xl border border-border/70 p-4">
                          <div className="grid gap-3 md:grid-cols-3">
                            <div className="space-y-2">
                              <Label className="text-xs text-muted-foreground">Номенклатура</Label>
                              <FieldErrorWrap
                                error={form.formState.errors.items?.[index]?.item_title?.message}
                                messageClassName="text-xs"
                              >
                                <SelectNative
                                  searchable
                                  searchPlaceholder="Поиск номенклатуры…"
                                  value={currentItem.item_title}
                                  onChange={(event) =>
                                    setRowVariantSelection(index, {
                                      item_title: event.target.value,
                                      item_size: '',
                                      item_color: '',
                                    })
                                  }
                                >
                                  <option value="">Выберите номенклатуру</option>
                                  {titleOptions.map((title) => (
                                    <option key={title} value={title}>
                                      {title}
                                    </option>
                                  ))}
                                </SelectNative>
                              </FieldErrorWrap>
                            </div>

                            <div className="space-y-2">
                              <Label className="text-xs text-muted-foreground">Размер</Label>
                              <FieldErrorWrap
                                error={form.formState.errors.items?.[index]?.item_size?.message}
                                messageClassName="text-xs"
                              >
                                <SelectNative
                                  value={currentItem.item_size}
                                  onChange={(event) =>
                                    setRowVariantSelection(index, {
                                      item_size: event.target.value,
                                      item_color: '',
                                    })
                                  }
                                  disabled={!currentItem.item_title}
                                >
                                  <option value="">Выберите размер</option>
                                  {sizeOptions.map((size) => (
                                    <option key={size} value={size}>
                                      {size}
                                    </option>
                                  ))}
                                </SelectNative>
                              </FieldErrorWrap>
                            </div>

                            <div className="space-y-2">
                              <Label className="text-xs text-muted-foreground">Цвет</Label>
                              <FieldErrorWrap
                                error={form.formState.errors.items?.[index]?.item_color?.message}
                                messageClassName="text-xs"
                              >
                                <SelectNative
                                  value={currentItem.item_color}
                                  onChange={(event) =>
                                    setRowVariantSelection(index, {
                                      item_color: event.target.value,
                                    })
                                  }
                                  disabled={!currentItem.item_title || !currentItem.item_size}
                                >
                                  <option value="">Не указан</option>
                                  {colorOptions.map((color) => (
                                    <option key={color} value={color}>
                                      {color}
                                    </option>
                                  ))}
                                </SelectNative>
                              </FieldErrorWrap>
                            </div>
                          </div>

                          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_140px_auto]">
                            <div className="space-y-2">
                              <Label className="text-xs text-muted-foreground">Остаток на складе</Label>
                              <FieldErrorWrap
                                error={
                                  form.formState.errors.items?.[index]?.stock_id?.message ||
                                  form.formState.errors.items?.[index]?.item_id?.message
                                }
                                messageClassName="text-xs"
                                hint="Можно не выбирать. Тогда система сама подберет остаток при сборке."
                              >
                                <SelectNative
                                  value={selectedStockId}
                                  onChange={(event) => setRowStock(index, Number(event.target.value))}
                                  disabled={!currentItem.item_title || !currentItem.item_size}
                                >
                                  <option value={0}>
                                    {matchingStocks.length > 0 ? 'Подобрать автоматически' : 'Подходящего остатка нет'}
                                  </option>
                                  {matchingStocks.map((stock) => (
                                    <option key={stock.id} value={stock.id}>
                                      {stock.label}
                                    </option>
                                  ))}
                                </SelectNative>
                              </FieldErrorWrap>
                            </div>

                            <div className="space-y-2">
                              <Label className="text-xs text-muted-foreground">Количество пар</Label>
                              <FieldErrorWrap
                                error={form.formState.errors.items?.[index]?.pairs_quantity?.message}
                                messageClassName="text-xs"
                              >
                                <Input type="number" min={1} max={maxAvailable} {...form.register(`items.${index}.pairs_quantity`)} />
                              </FieldErrorWrap>
                            </div>

                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => remove(index)}
                              disabled={fields.length === 1}
                              className="self-end"
                            >
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </div>

                          {resolvedItem ? (
                            <div className="rounded-md bg-muted/30 p-3 text-xs">
                              <div className="font-medium text-foreground">
                                {availablePairs > 0 ? '✅ Товар есть на остатках' : '⏳ Товар ожидает производства'}
                              </div>
                              <div className="mt-1 space-y-1 text-muted-foreground">
                                <div>{resolvedItem.title}</div>
                                <div>
                                  Размер: <span className="font-medium text-foreground">{resolvedItem.size}</span>
                                </div>
                                {resolvedItem.color ? (
                                  <div className="flex items-center gap-1">
                                    Цвет:
                                    <span className="inline-flex items-center gap-1">
                                      <span
                                        className="inline-block h-3 w-3 rounded-full border border-border"
                                        style={{ backgroundColor: getColorValue(resolvedItem.color) }}
                                      />
                                      <span className="font-medium text-foreground">{resolvedItem.color}</span>
                                    </span>
                                  </div>
                                ) : null}
                                {availablePairs > 0 ? (
                                  <div className="pt-1 font-medium text-emerald-600 dark:text-emerald-400">
                                    На остатках: {availablePairs} пар
                                  </div>
                                ) : (
                                  <div className="pt-1 font-medium text-amber-600 dark:text-amber-400">
                                    Будет доступен после производства
                                  </div>
                                )}
                              </div>
                            </div>
                          ) : isNewItem ? (
                            <div className="rounded-md bg-muted/30 p-3 text-xs">
                              <div className="font-medium text-amber-600 dark:text-amber-400">🆕 Новый товар</div>
                              <div className="mt-1 text-muted-foreground">
                                Будет создан в системе с указанными характеристиками
                              </div>
                            </div>
                          ) : null}
                        </div>
                      )
                    })}

                    {form.formState.errors.items && (
                      <p className="text-sm text-red-500">{form.formState.errors.items.message || form.formState.errors.items.root?.message}</p>
                    )}
                  </div>

                  <div className="flex justify-end gap-3 border-t pt-4">
                    <Button type="button" variant="outline" onClick={() => setEditDialogOpen(false)}>
                      Отмена
                    </Button>
                    <Button type="submit" disabled={updateOrderMutation.isPending}>
                      {updateOrderMutation.isPending ? 'Сохранение...' : 'Сохранить'}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
            )}
            
            <ConfirmDialog
              title="Удалить заказ?"
              description="Заказ будет удалён без возможности восстановления."
              confirmLabel="Удалить"
              onConfirm={() => deleteMutation.mutate()}
            >
              <Button variant="outline">
                <Trash2 className="h-4 w-4 mr-1" />
                Удалить
              </Button>
            </ConfirmDialog>
          </div>
        </div>

        {/* Остальной код страницы без изменений */}
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <StatusIcon />
            <Card.Header>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Card.Title className="text-xl">{order.name}</Card.Title>
                <Badge tone={orderStatusTone(order.status)} className="text-sm">
                  {orderStatusLabel(order.status)}
                </Badge>
              </div>
              <Card.Description>
                {order.customer}
                {' · '}
                {order.order_type === 'outbound'
                  ? 'Отгрузка'
                  : order.order_type === 'inbound'
                    ? 'Приёмка'
                    : order.order_type === 'transfer'
                      ? 'Перемещение'
                      : order.order_type}
              </Card.Description>
            </Card.Header>
            <Card.Content>
              <div className="grid gap-4 text-sm">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-muted-foreground">Клиент</span>
                    <div className="font-medium">{order.customer}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Поставщик</span>
                    <div className="font-medium">{order.supplier || '—'}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Тип заказа</span>
                    <div className="font-medium capitalize">
                      {order.order_type === 'outbound' ? 'Отгрузка' : 
                      order.order_type === 'inbound' ? 'Приёмка' : 
                      order.order_type === 'transfer' ? 'Перемещение' : 
                      order.order_type}
                    </div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Приоритет</span>
                    <div className="font-medium">{order.priority}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Дата создания</span>
                    <div className="font-medium">{formatDate(order.created_at)}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Дата отгрузки</span>
                    <div className="font-medium">{order.shipping_date ? formatDate(order.shipping_date) : '—'}</div>
                  </div>
                </div>
                
                <Separator />
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-muted-foreground">Транспортная компания</span>
                    <div className="font-medium flex items-center gap-1">
                      <TruckIcon className="h-3 w-3" />
                      {order.transport_company || '—'}
                    </div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Счета</span>
                    <div className="font-medium flex items-center gap-1">
                      <FileText className="h-3 w-3" />
                      {order.invoice || '—'}
                    </div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Согласовано</span>
                    <div className="font-medium flex items-center gap-1">
                      <CheckSquare className="h-3 w-3" />
                      {order.approved ? (
                        <Badge tone="success">Да</Badge>
                      ) : (
                        <Badge tone="neutral">Нет</Badge>
                      )}
                    </div>
                  </div>
                </div>

                {(order.requires_chz || order.active_chz_request) && (
                  <>
                    <Separator />
                    <div className="rounded-md border border-amber-200 bg-amber-50/70 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-amber-900">Честный знак</div>
                          <div className="text-sm text-amber-800">
                            {order.active_chz_request
                              ? `Статус: ${chzRequestStatusLabel(order.active_chz_request.status)}`
                              : 'Ожидается заказ кодов'}
                          </div>
                        </div>
                        {order.active_chz_request ? (
                          <Badge tone={chzRequestStatusTone(order.active_chz_request.status)}>
                            {chzRequestStatusLabel(order.active_chz_request.status)}
                          </Badge>
                        ) : null}
                      </div>
                    </div>
                  </>
                )}
                
                {order.comment && (
                  <>
                    <Separator />
                    <div>
                      <span className="text-muted-foreground">Комментарий</span>
                      <div className="text-sm mt-1 p-2 bg-muted/50 rounded-md">{order.comment}</div>
                    </div>
                  </>
                )}
              </div>
            </Card.Content>
            {hasWaitingProductionItems ? (
              <Card.Footer className="flex-col items-start gap-1">
                <div className="text-sm font-medium text-sky-900">Ожидается производство</div>
                <div className="text-sm text-sky-800">
                  В заказе есть позиции без доступного остатка. Они автоматически зарезервируются после пополнения склада.
                </div>
              </Card.Footer>
            ) : null}
          </Card>

          <div className="space-y-4">
            <Card>
              <Package aria-label="Сборка" className="size-6 text-primary" role="img" />
              <Card.Header>
                <Card.Title>Прогресс сборки</Card.Title>
                <Card.Description>
                  {progress.percent === 100 ? 'Заказ полностью собран' : 'Ожидает сборки'}
                </Card.Description>
              </Card.Header>
              <Card.Content>
                <Progress
                  value={progress.percent}
                  label="Выполнено"
                  valueLabel={`${progress.picked} / ${progress.total} пар`}
                />
              </Card.Content>
              {order.status === 'picking' ? (
                <Card.Footer>
                  <HeroLink
                    aria-label="Перейти к сборке"
                    href={`/picking/${orderId}`}
                    onClick={(event) => {
                      event.preventDefault()
                      navigate(`/picking/${orderId}`)
                    }}
                  >
                    Перейти к сборке
                    <HeroLink.Icon aria-hidden="true" />
                  </HeroLink>
                </Card.Footer>
              ) : null}
            </Card>

            <Card>
              <ChartPie aria-label="Итоги" className="size-6 text-primary" role="img" />
              <Card.Header>
                <Card.Title>Итоги заказа</Card.Title>
                <Card.Description>
                  {order.items?.length || 0} наименований · {progress.total} пар
                </Card.Description>
              </Card.Header>
              <Card.Content>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Всего пар:</span>
                    <span className="font-medium">{progress.total}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Отобрано пар:</span>
                    <span className="font-medium text-green-600">{progress.picked}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Осталось собрать:</span>
                    <span className="font-medium text-orange-600">{progress.total - progress.picked}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Наименований:</span>
                    <span className="font-medium">{order.items?.length || 0}</span>
                  </div>
                </div>
              </Card.Content>
            </Card>
          </div>
        </div>

        <Card>
          <ListOrdered aria-label="Позиции" className="size-6 text-primary" role="img" />
          <Card.Header>
            <Card.Title>Позиции заказа</Card.Title>
            <Card.Description>
              {order.items?.length
                ? `${order.items.length} позиций в заказе`
                : 'В заказе пока нет позиций'}
            </Card.Description>
          </Card.Header>
          <Card.Content>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Товар</TableHead>
                    <TableHead>Размер</TableHead>
                    <TableHead>Цвет</TableHead>
                    <TableHead>Венчик</TableHead>
                    <TableHead>Партия</TableHead>
                    <TableHead>Заказано пар</TableHead>
                    <TableHead>Отобрано пар</TableHead>
                    <TableHead>Статус</TableHead>
                    <TableHead>Предложенная ячейка</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {order.items?.map((item: OrderItem) => {
                    const details = getItemDetails(item)
                    return (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">{details.title}</TableCell>
                        <TableCell>{details.size}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <div 
                              className="h-3 w-3 rounded-full" 
                              style={{ backgroundColor: getColorValue(details.color) }}
                            />
                            {details.color !== '—' ? details.color : '—'}
                          </div>
                        </TableCell>
                        <TableCell>{details.venchik}</TableCell>
                        <TableCell className="font-mono text-xs">{details.batch_number}</TableCell>
                        <TableCell>{item.pairs_quantity}</TableCell>
                        <TableCell>
                          {item.picked_pairs === item.pairs_quantity ? (
                            <Badge tone="success">{item.picked_pairs}</Badge>
                          ) : item.picked_pairs > 0 ? (
                            <Badge tone="warning">{item.picked_pairs}</Badge>
                          ) : (
                            item.picked_pairs
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge tone={orderItemStatusTone(item.status)}>
                            {orderItemStatusLabel(item.status)}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono">
                          {item.waiting_for_production ? (
                            <Badge tone="warning">Ожидается производство</Badge>
                          ) : (
                            item.suggested_cell_location ?? '—'
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
            {(!order.items || order.items.length === 0) && (
              <div className="py-8 text-center text-muted-foreground">
                Нет позиций в заказе
              </div>
            )}
          </Card.Content>
        </Card>

        <Card>
          <History aria-label="История" className="size-6 text-primary" role="img" />
          <Card.Header
            className="cursor-pointer select-none"
            onClick={() => setIsHistoryExpanded((current) => !current)}
          >
            <Card.Title>История изменений</Card.Title>
            <Card.Description>
              {isHistoryExpanded ? 'Скрыть записи аудита' : 'Показать записи аудита по заказу'}
            </Card.Description>
          </Card.Header>
          {isHistoryExpanded ? (
            <Card.Content>
              {orderAuditLogsQuery.isLoading ? (
                <Skeleton className="h-20" />
              ) : orderAuditLogsQuery.data && orderAuditLogsQuery.data.length > 0 ? (
                <div className="space-y-2">
                  {orderAuditLogsQuery.data.map((log) => (
                    <div key={log.id} className="flex items-start gap-3 border-b border-border/50 py-2 text-sm last:border-b-0">
                      <div className="mt-0.5">{getOrderAuditLogIcon(log.operation_type)}</div>
                      <div className="min-w-0 flex-1">
                        <span className="font-medium">{formatOrderAuditMessage(log)}</span>
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          Автор: {formatOrderAuditAuthor(log)}
                        </div>
                      </div>
                      <span className="whitespace-nowrap text-xs text-muted-foreground">
                        {formatDate(log.created_at)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-4 text-center text-muted-foreground">Изменений по заказу пока нет</div>
              )}
            </Card.Content>
          ) : null}
        </Card>

        {order.actual_shipping_date && (
          <Card>
            <Truck aria-label="Отгрузка" className="size-6 text-primary" role="img" />
            <Card.Header>
              <Card.Title>Фактическая отгрузка</Card.Title>
              <Card.Description>Дата, когда заказ был фактически отгружен</Card.Description>
            </Card.Header>
            <Card.Content>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <span className="text-muted-foreground">Дата фактической отгрузки</span>
                  <div className="font-medium flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {formatDate(order.actual_shipping_date)}
                  </div>
                </div>
              </div>
            </Card.Content>
          </Card>
        )}
      </section>
    </TooltipProvider>
  )
}
