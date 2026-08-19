// frontend/src/pages/OrdersPage.tsx
import { useMemo, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Controller, useFieldArray, useForm, type SubmitHandler } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useQuery } from '@tanstack/react-query'
import { Plus, Trash2, Filter, X } from 'lucide-react'
import { toast } from '@/lib/toast'
import { createOrder, getOrders, getStocks, getItems } from '@/api/client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CoolMode } from '@/components/ui/cool-mode'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog'
import { DateInput } from '@/components/ui/date-picker'
import { Input, SelectNative, Textarea } from '@/components/ui/input'
import { FieldErrorWrap } from '@/components/ui/field-error'
import { SearchInput } from '@/components/ui/search-input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  buildAvailableStockOption,
  filterStockOptionsByVariant,
  normalizeVariantComparableValue,
  normalizeVariantDisplayValue,
  type AvailableStockOption,
  type VariantSelection,
} from '@/lib/itemVariants'
import { calculateOrderProgress, dateInputToMskIso, formatDate, getErrorMessage, orderStatusLabel, orderStatusTone } from '@/lib/utils'
import type { OrderCreate } from '@/types/wms'

// ✅ ПРЕДОПРЕДЕЛЕННЫЕ РАЗМЕРЫ И ЦВЕТА
const PREDEFINED_SIZES = ['6.0', '6.5', '7.0', '7.5', '8.0', '8.5', '9.0', '9.5', 'XS', 'S', 'M', 'L', 'XL']
const PREDEFINED_COLORS = ['натуральный', 'синий', 'фиолетовый', 'коричневый']

function normalizeVariantValue(value?: string | null) {
  return normalizeVariantComparableValue(value)
}

// Схема с обновленной валидацией
const orderSchema = z.object({
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
        if (!item.stock_id && !item.item_id && !item.item_title) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Выберите товар',
            path: [index, 'item_title'],
          })
        }
      })
    })
    .min(1, 'Добавьте хотя бы одну позицию'),
})

type OrderForm = z.infer<typeof orderSchema>

function buildEmptyOrderItem() {
  return {
    stock_id: 0,
    item_id: 0,
    item_title: '',
    item_size: '',
    item_color: '',
    pairs_quantity: 1,
  }
}

function buildVariantSelection(item: Pick<OrderForm['items'][number], 'item_title' | 'item_size' | 'item_color'>): VariantSelection {
  return {
    item_title: item.item_title ?? '',
    item_size: item.item_size ?? '',
    item_color: item.item_color ?? '',
  }
}

function withCurrentStringOption(options: string[], currentValue: string) {
  const normalizedCurrent = normalizeVariantDisplayValue(currentValue)
  if (!normalizedCurrent) return options
  return options.some((option) => normalizeVariantValue(option) === normalizeVariantValue(normalizedCurrent))
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
    'коричневый': '#8b4513', 'бежевый': '#f5f5dc',
    'натуральный': '#ebccaa', 'салатовый': '#84cc16',
    'бирюзовый': '#14b8a6', 'индиго': '#6366f1',
    'лавандовый': '#c084fc', 'лиловый': '#d946ef',
    'малиновый': '#e11d48', 'бордовый': '#881337',
    'оливковый': '#65a30d', 'хаки': '#a8a29e',
    'серебристый': '#a1a1aa', 'золотой': '#fbbf24', 'бронзовый': '#d97706',
  }
  return colorMap[colorName.toLowerCase()] || '#e5e5e5'
}

export function OrdersPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [approvedFilter, setApprovedFilter] = useState<'all' | 'approved' | 'unapproved'>('all')
  const [shippingDate, setShippingDate] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [visibleStockRows, setVisibleStockRows] = useState<Record<string, boolean>>({})

  const ordersQuery = useQuery({
    queryKey: ['orders', statusFilter, approvedFilter, shippingDate],
    queryFn: () =>
      getOrders({
        status: statusFilter === 'all' ? 'all' : (statusFilter as any),
        approved:
          approvedFilter === 'all' ? undefined : approvedFilter === 'approved',
        shipping_date: shippingDate || undefined,
      }),
  })
  const stocksQuery = useQuery({
    queryKey: ['stocks'],
    queryFn: getStocks,
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  })
  const itemsQuery = useQuery({ queryKey: ['items'], queryFn: getItems })

  const stocks = useMemo(() => (Array.isArray(stocksQuery.data) ? stocksQuery.data : []), [stocksQuery.data])
  const items = useMemo(() => (Array.isArray(itemsQuery.data) ? itemsQuery.data : []), [itemsQuery.data])
  const orders = useMemo(() => (Array.isArray(ordersQuery.data) ? ordersQuery.data : []), [ordersQuery.data])

  // Доступные остатки на складе
  const availableStocks = useMemo(
    () =>
      stocks
        .filter((stock) => stock.pairs_quantity > 0 && stock.inventory_type === 'finished_goods')
        .map((stock) => {
          const item = items.find((candidate) => candidate.id === stock.item_id)
          if (!item || item.inventory_type !== 'finished_goods') return null
          return item ? buildAvailableStockOption(stock, item) : null
        })
        .filter((stock): stock is AvailableStockOption => stock !== null)
        .sort((left, right) => left.label.localeCompare(right.label, 'ru')),
    [stocks, items],
  )

  // ✅ Группируем остатки по названию товара для быстрого доступа
  const stockByTitle = useMemo(() => {
    const map = new Map<string, AvailableStockOption[]>()
    availableStocks.forEach(stock => {
      const key = stock.title.toLowerCase()
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(stock)
    })
    return map
  }, [availableStocks])

  // ✅ Получаем доступные размеры для товара на основе реальных остатков
  const getAvailableSizesFromStocks = (title: string): string[] => {
    if (!title) return PREDEFINED_SIZES
    
    const key = title.toLowerCase()
    const stocksForTitle = stockByTitle.get(key) || []
    
    // Получаем уникальные размеры из остатков
    const sizesFromStocks = new Set<string>()
    stocksForTitle.forEach(stock => {
      const size = normalizeVariantDisplayValue(stock.size)
      if (size) sizesFromStocks.add(size)
    })
    
    // Объединяем с предопределенными
    const result = new Set([...sizesFromStocks, ...PREDEFINED_SIZES])
    return Array.from(result).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  }

  // ✅ Получаем доступные цвета для товара и размера на основе реальных остатков
  const getAvailableColorsFromStocks = (title: string, size: string): string[] => {
    if (!title) return PREDEFINED_COLORS
    
    const key = title.toLowerCase()
    const stocksForTitle = stockByTitle.get(key) || []
    
    // Фильтруем по размеру и получаем цвета
    const colorsFromStocks = new Set<string>()
    stocksForTitle.forEach(stock => {
      if (!size || normalizeVariantValue(stock.size) === normalizeVariantValue(size)) {
        if (stock.color) colorsFromStocks.add(stock.color)
      }
    })
    
    // Объединяем с предопределенными
    const result = new Set([...colorsFromStocks, ...PREDEFINED_COLORS])
    return Array.from(result).sort()
  }

  // ✅ Получаем информацию о наличии остатков для конкретной комбинации
  const getStockInfo = (title: string, size: string, color: string): { hasStock: boolean; totalPairs: number; stocks: AvailableStockOption[] } => {
    if (!title || !size) return { hasStock: false, totalPairs: 0, stocks: [] }
    
    const key = title.toLowerCase()
    const stocksForTitle = stockByTitle.get(key) || []
    
    const matchingStocks = stocksForTitle.filter(stock => 
      normalizeVariantValue(stock.size) === normalizeVariantValue(size) &&
      (!color || normalizeVariantValue(stock.color) === normalizeVariantValue(color))
    )
    
    const totalPairs = matchingStocks.reduce((sum, stock) => sum + stock.pairs_quantity, 0)
    return {
      hasStock: totalPairs > 0,
      totalPairs,
      stocks: matchingStocks
    }
  }

  // ✅ Получаем все уникальные названия товаров из базы
  const allTitles = useMemo(() => {
    const titles = new Set<string>()
    items.filter((item) => item.inventory_type === 'finished_goods').forEach(item => {
      if (item.title) titles.add(item.title)
    })
    return Array.from(titles).sort((a, b) => a.localeCompare(b, 'ru'))
  }, [items])

  // ✅ Найти ID товара по названию, размеру и цвету
  const findItemId = (title: string, size: string, color: string): number | undefined => {
    const found = items.find(item => 
      item.inventory_type === 'finished_goods' &&
      item.title.toLowerCase() === title.toLowerCase() &&
      normalizeVariantValue(item.size) === normalizeVariantValue(size) &&
      (!color || normalizeVariantValue(item.color) === normalizeVariantValue(color))
    )
    return found?.id
  }

  const form = useForm<OrderForm>({
    resolver: zodResolver(orderSchema) as any,
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
      items: [buildEmptyOrderItem()],
    },
  })

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'items',
  })

  useEffect(() => {
    if (open) {
      queryClient.invalidateQueries({ queryKey: ['stocks'] })
      setVisibleStockRows({})
      form.reset({
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
        items: [buildEmptyOrderItem()],
      })
    }
  }, [form, open, queryClient])

  const sortedAndFilteredOrders = useMemo(() => {
    let filtered = orders
    const needle = search.trim().toLowerCase()
    if (needle) {
      filtered = filtered.filter((order) => `${order.name} ${order.customer}`.toLowerCase().includes(needle))
    }
    return [...filtered].sort((a, b) => {
      if (shippingDate) {
        if ((a.priority || 0) !== (b.priority || 0)) return (b.priority || 0) - (a.priority || 0)
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      }
      if (a.status === 'pending' && b.status !== 'pending') return -1
      if (a.status !== 'pending' && b.status === 'pending') return 1
      if (a.status === 'pending' && b.status === 'pending') return (b.priority || 0) - (a.priority || 0)
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })
  }, [orders, search, shippingDate])

  const createMutation = useMutation({
    mutationFn: (data: OrderForm) => {
      const orderData: OrderCreate = {
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
        items: data.items.map((item) => {
          if (item.stock_id && item.stock_id > 0) {
            return {
              stock_id: item.stock_id,
              item_id: undefined,
              pairs_quantity: item.pairs_quantity,
            }
          }
          
          if (item.item_id && item.item_id > 0) {
            return {
              stock_id: undefined,
              item_id: item.item_id,
              pairs_quantity: item.pairs_quantity,
            }
          }
          
          return {
            stock_id: undefined,
            item_id: undefined,
            item_title: item.item_title,
            item_size: normalizeVariantDisplayValue(item.item_size),
            item_color: item.item_color || undefined,
            pairs_quantity: item.pairs_quantity,
          }
        }),
      }
      return createOrder(orderData)
    },
    onSuccess: async () => {
      toast.success('Заказ создан')
      form.reset({
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
        items: [buildEmptyOrderItem()],
      })
      setOpen(false)
      await queryClient.invalidateQueries({ queryKey: ['orders'] })
      await queryClient.invalidateQueries({ queryKey: ['stocks'] })
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  const onSubmit: SubmitHandler<OrderForm> = (data) => createMutation.mutate(data)

  const toggleStockRowVisibility = (rowKey: string) => {
    setVisibleStockRows((current) => ({
      ...current,
      [rowKey]: !current[rowKey],
    }))
  }

  const statuses = [
    { value: 'all', label: 'Все' },
    { value: 'pending', label: 'Ожидает' },
    { value: 'processing', label: 'В обработке' },
    { value: 'picking', label: 'Сборка' },
    { value: 'packed', label: 'Упакован' },
    { value: 'partially_packed', label: 'Отобран частично' },
    { value: 'shipped', label: 'Отгружен' },
    { value: 'delivered', label: 'Доставлен' },
    { value: 'cancelled', label: 'Отменён' },
    { value: 'reformulated', label: 'Расформирован' },
    { value: 'pick_edited', label: 'Изменен отбор' },
    { value: 'edited', label: 'Редактирован' },
  ]

  const setRowVariantSelection = (
    index: number,
    partialSelection: Partial<VariantSelection>,
  ) => {
    const currentItem = form.getValues(`items.${index}`)
    const nextSelection = buildVariantSelection({
      item_title: partialSelection.item_title ?? currentItem.item_title,
      item_size: normalizeVariantDisplayValue(partialSelection.item_size ?? currentItem.item_size),
      item_color: partialSelection.item_color ?? currentItem.item_color,
    })
    
    const currentStockId = Number(currentItem.stock_id || 0)
    const currentStock = availableStocks.find((stock) => stock.id === currentStockId)
    const matchingStocks = filterStockOptionsByVariant(availableStocks, nextSelection)
    
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
    const selectedStock = availableStocks.find((stock) => stock.id === stockId)
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

  return (
    <section className="page-shell space-y-5">
        <Card>
          <Card.Content className="grid gap-3 pt-5 md:grid-cols-[1fr_auto_auto]">
            <SearchInput
              placeholder="Поиск заказа или клиента"
              value={search}
              onChange={setSearch}
            />
            <Button
              variant="outline"
              onClick={() => setShowFilters(!showFilters)}
              className={showFilters ? 'bg-primary/10' : ''}
            >
              <Filter className="h-4 w-4 mr-2" />
              Фильтры
              {statusFilter !== 'all' && (
                <Badge tone="neutral" className="ml-2">
                  {statuses.find((s) => s.value === statusFilter)?.label}
                </Badge>
              )}
            </Button>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4" />
                  Заказ
                </Button>
              </DialogTrigger>
              <DialogContent title="Создать заказ" className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <form className="space-y-5" onSubmit={form.handleSubmit(onSubmit)}>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="name">Название заказа <span className="text-red-500">*</span></Label>
                      <FieldErrorWrap error={form.formState.errors.name?.message}>
                        <Input id="name" placeholder="Например: Заказ №123" {...form.register('name')} />
                      </FieldErrorWrap>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="order_type">Тип заказа <span className="text-red-500">*</span></Label>
                      <Controller
                        control={form.control}
                        name="order_type"
                        render={({ field }) => (
                          <SelectNative
                            id="order_type"
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
                      <Label htmlFor="priority">Приоритет <span className="text-red-500">*</span></Label>
                      <Controller
                        control={form.control}
                        name="priority"
                        render={({ field }) => (
                          <SelectNative
                            id="priority"
                            value={field.value}
                            onBlur={field.onBlur}
                            onChange={(event) => field.onChange(Number(event.target.value))}
                          >
                            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((p) => (
                              <option key={p} value={p}>
                                {p} {p === 0 && '(низкий)'} {p === 9 && '(высокий)'}
                              </option>
                            ))}
                          </SelectNative>
                        )}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="customer">Клиент <span className="text-red-500">*</span></Label>
                      <FieldErrorWrap error={form.formState.errors.customer?.message}>
                        <Input id="customer" {...form.register('customer')} />
                      </FieldErrorWrap>
                    </div>
                    <div className="space-y-2"><Label htmlFor="supplier">Поставщик</Label><Input id="supplier" {...form.register('supplier')} /></div>
                    <div className="space-y-2"><Label htmlFor="transport_company">Транспортная компания</Label><Input id="transport_company" {...form.register('transport_company')} /></div>
                    <div className="space-y-2"><Label htmlFor="invoice">Счета</Label><Input id="invoice" {...form.register('invoice')} /></div>
                    <div className="space-y-2">
                      <Controller
                        control={form.control}
                        name="shipping_date"
                        render={({ field }) => (
                          <DateInput
                            id="shipping_date"
                            label="Дата отгрузки"
                            value={field.value ?? ''}
                            onChange={field.onChange}
                          />
                        )}
                      />
                    </div>
                    <div className="col-span-2 space-y-2">
                      <Label htmlFor="comment">Комментарий</Label>
                      <Textarea id="comment" rows={3} {...form.register('comment')} />
                    </div>
                    <div className="col-span-2">
                      <Controller
                        control={form.control}
                        name="approved"
                        render={({ field }) => (
                          <Checkbox
                            id="approved"
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

                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-semibold">Позиции заказа</h3>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Выберите номенклатуру, размер и цвет.
                        </p>
                      </div>
                      <Button type="button" variant="outline" size="sm" onClick={() => append(buildEmptyOrderItem())}>
                        <Plus className="h-4 w-4" />
                        Добавить товар
                      </Button>
                    </div>

                    {fields.map((field, index) => {
                      const currentItem = form.watch(`items.${index}`) ?? buildEmptyOrderItem()
                      const isStockInfoVisible = !!visibleStockRows[field.id]
                      const selection = buildVariantSelection(currentItem)
                      const selectedStockId = Number(currentItem.stock_id || 0)
                      const selectedStock = availableStocks.find((stock) => stock.id === selectedStockId)
                      const matchingStocks = withCurrentStockOption(
                        filterStockOptionsByVariant(availableStocks, selection),
                        selectedStock,
                      )
                      const foundItemId = findItemId(
                        currentItem.item_title,
                        currentItem.item_size,
                        currentItem.item_color
                      )
                      const resolvedItemId = foundItemId || Number(currentItem.item_id || 0)
                      const resolvedItem = items.find((item) => item.id === resolvedItemId)
                      
                      // ✅ Используем новые функции на основе остатков
                      const titleOptions = withCurrentStringOption(allTitles, currentItem.item_title)
                      const sizeOptions = withCurrentStringOption(
                        getAvailableSizesFromStocks(currentItem.item_title),
                        currentItem.item_size,
                      )
                      const colorOptions = withCurrentStringOption(
                        getAvailableColorsFromStocks(currentItem.item_title, currentItem.item_size),
                        currentItem.item_color,
                      )
                      
                      // ✅ Получаем информацию об остатках для текущей комбинации
                      const stockInfo = getStockInfo(
                        currentItem.item_title,
                        currentItem.item_size,
                        currentItem.item_color
                      )
                      const stockStatusLabel =
                        currentItem.item_title && currentItem.item_size
                          ? stockInfo.hasStock
                            ? `На остатках - ${stockInfo.totalPairs} пар`
                            : 'Нет на остатках'
                          : 'Выберите товар'
                      
                      const maxAvailable = selectedStock?.pairs_quantity || undefined
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
                              <div className="flex items-center justify-between gap-2">
                                <Label className="text-xs text-muted-foreground">Остаток на складе</Label>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => toggleStockRowVisibility(field.id)}
                                  disabled={!currentItem.item_title || !currentItem.item_size}
                                >
                                  {isStockInfoVisible ? 'Скрыть остаток' : 'Показать остаток'}
                                </Button>
                              </div>
                              {isStockInfoVisible ? (
                                <div className="space-y-2">
                                  <div className="rounded-md border border-border/70 bg-muted/20 px-3 py-2 text-xs font-medium text-foreground">
                                    {stockStatusLabel}
                                  </div>
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
                              ) : (
                                <p className="text-xs text-muted-foreground">
                                  Остатки и доступные ячейки открываются по кнопке, чтобы не перегружать форму.
                                </p>
                              )}
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
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>

                          {/* ✅ Улучшенный статус товара с деталями остатков */}
                          <div className="rounded-md bg-muted/30 p-3 text-xs">
                            <div className="font-medium text-foreground">
                              {isNewItem ? (
                                <span className="text-amber-600 dark:text-amber-400">🆕 Новый товар</span>
                              ) : resolvedItem ? (
                                <span className="text-foreground">Позиция выбрана</span>
                              ) : (
                                <span className="text-muted-foreground">Выберите товар</span>
                              )}
                            </div>
                            
                            {resolvedItem && (
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
                              </div>
                            )}
                            {isNewItem && (
                              <div className="mt-1 text-muted-foreground">
                                Новый товар будет создан в системе с указанными характеристиками
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {form.formState.errors.items && <p className="text-sm text-red-500">{form.formState.errors.items.message}</p>}
                  <CoolMode>
                    <Button type="submit" disabled={createMutation.isPending} className="w-full">
                      {createMutation.isPending ? 'Создание...' : 'Создать заказ'}
                    </Button>
                  </CoolMode>
                </form>
              </DialogContent>
            </Dialog>
          </Card.Content>

          {showFilters && (
            <Card.Content className="border-t pt-5">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-2">
                  <Label>Статус</Label>
                  <SelectNative value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                    {statuses.map((status) => (
                      <option key={status.value} value={status.value}>{status.label}</option>
                    ))}
                  </SelectNative>
                </div>
                <div className="space-y-2">
                  <Label>Согласование</Label>
                  <SelectNative
                    value={approvedFilter}
                    onChange={(e) => setApprovedFilter(e.target.value as 'all' | 'approved' | 'unapproved')}
                  >
                    <option value="all">Все</option>
                    <option value="approved">Согласовано</option>
                    <option value="unapproved">Не согласовано</option>
                  </SelectNative>
                </div>
                <div className="space-y-2">
                  <DateInput label="Дата отгрузки" value={shippingDate} onChange={setShippingDate} />
                </div>
                {(statusFilter !== 'all' || approvedFilter !== 'all' || shippingDate) && (
                  <div className="sm:col-span-2 lg:col-span-4 flex items-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setStatusFilter('all')
                        setApprovedFilter('all')
                        setShippingDate('')
                      }}
                      className="text-muted-foreground"
                    >
                      <X className="h-3 w-3 mr-1" />
                      Сбросить фильтры
                    </Button>
                  </div>
                )}
              </div>
            </Card.Content>
          )}
        </Card>

        <Card>
          <Card.Header><Card.Title>Заказы</Card.Title></Card.Header>
          <Card.Content>
            {ordersQuery.isLoading ? (
              <div className="grid gap-3">
                {Array.from({ length: 6 }).map((_, idx) => (<Skeleton key={idx} className="h-16" />))}
              </div>
            ) : (
              <>
                <div className="hidden overflow-x-auto md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Дата отгрузки</TableHead>
                        <TableHead>Название</TableHead>
                        <TableHead>Клиент</TableHead>
                        <TableHead>Приоритет</TableHead>
                        <TableHead>Статус</TableHead>
                        <TableHead>Согласовано</TableHead>
                        <TableHead>Прогресс</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedAndFilteredOrders.map((order) => {
                        const progress = calculateOrderProgress(order)
                        const status = order.status as string
                        let badgeTone = orderStatusTone(order.status)
                        if (status === 'reformulated') badgeTone = 'warning'
                        if (status === 'pick_edited') badgeTone = 'secondary'
                        if (status === 'edited') badgeTone = 'neutral'
                        return (
                          <TableRow key={order.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/orders/${order.id}`)}>
                            <TableCell>{order.shipping_date ? formatDate(order.shipping_date) : '—'}</TableCell>
                            <TableCell className="font-medium">{order.name}</TableCell>
                            <TableCell>{order.customer || '—'}</TableCell>
                            <TableCell className="font-semibold">
                              {order.status === 'pending' ? (
                                <span className={(order.priority || 0) >= 7 ? 'text-red-600' : (order.priority || 0) >= 4 ? 'text-orange-500' : 'text-green-600'}>
                                  {order.priority}
                                </span>
                              ) : order.priority}
                            </TableCell>
                            <TableCell><Badge tone={badgeTone}>{orderStatusLabel(order.status)}</Badge></TableCell>
                            <TableCell>{order.approved ? <Badge tone="success">Да</Badge> : <Badge tone="neutral">Нет</Badge>}</TableCell>
                            <TableCell>
                              <div className="min-w-40">
                                <Progress
                                  value={progress.percent}
                                  label="Сборка"
                                  valueLabel={`${progress.picked}/${progress.total}`}
                                />
                              </div>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
                <div className="grid gap-3 md:hidden">
                  {sortedAndFilteredOrders.map((order) => {
                    const progress = calculateOrderProgress(order)
                    return (
                      <div key={order.id} className="cursor-pointer rounded-md border border-border p-4 transition hover:bg-muted/30" onClick={() => navigate(`/orders/${order.id}`)}>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-semibold">{order.name}</div>
                            <div className="text-sm text-muted-foreground">{order.customer || '—'}</div>
                            <div className="mt-2 flex flex-wrap gap-2">
                              <Badge tone={order.approved ? 'success' : 'neutral'}>
                                {order.approved ? 'Согласовано' : 'Не согласовано'}
                              </Badge>
                              <Badge tone="secondary">
                                {order.shipping_date ? formatDate(order.shipping_date) : 'Без даты'}
                              </Badge>
                            </div>
                          </div>
                          <Badge tone={orderStatusTone(order.status)}>{orderStatusLabel(order.status)}</Badge>
                        </div>
                        <Progress
                          className="mt-3"
                          value={progress.percent}
                          label="Сборка"
                          valueLabel={`${progress.picked}/${progress.total} пар`}
                        />
                      </div>
                    )
                  })}
                </div>
                {sortedAndFilteredOrders.length === 0 && (
                  <div className="py-8 text-center text-muted-foreground">Заказы не найдены</div>
                )}
              </>
            )}
          </Card.Content>
        </Card>
      </section>
  )
}
