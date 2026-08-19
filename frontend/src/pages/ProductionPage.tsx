import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { toast } from '@/lib/toast'
import { Controller, useFieldArray, useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'

import { createProductionOrder, deleteProductionOrder, getItems, getProductionOrders, createItem } from '@/api/client'
import { ConfirmDialog } from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input, SelectNative, Textarea } from '@/components/ui/input'
import { FieldErrorWrap } from '@/components/ui/field-error'
import { SearchInput } from '@/components/ui/search-input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { activateWithKeyboard } from '@/lib/interaction'
import {
  formatProductionItemLabel,
  getProductionProgress,
  getProductionWarehouseTasks,
  productionStatusLabel,
  productionStatusTone,
  productionTaskTypeLabel,
  productionSupplyStatusLabel,
  productionSupplyStatusTone,
  productionSupplyTypeLabel,
  productionSupplyTypeUnitLabel,
} from '@/lib/production'
import { formatDate, getErrorMessage } from '@/lib/utils'
import { useAuthStore } from '@/stores/authStore'
import type { ProductionTaskType } from '@/types/wms'

// ✅ Функция для получения цвета (добавлена)
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

// ✅ ПРЕДОПРЕДЕЛЕННЫЕ РАЗМЕРЫ И ЦВЕТА ДЛЯ ПРОИЗВОДСТВА
const PREDEFINED_SIZES = ['6.0', '6.5', '7.0', '7.5', '8.0', '8.5', '9.0', '9.5', 'XS', 'S', 'M', 'L', 'XL']
const PREDEFINED_COLORS = ['натуральный', 'синий', 'фиолетовый', 'коричневый']

const PRODUCTION_TASK_TYPES = [
  'packaging',
  'unpacking',
  'trim_cuffs',
  'warehouse_help',
  'defect_sorting',
  'repacking',
  'cleaning',
] as const

const SUPPORT_PRODUCTION_TASK_TYPES = new Set<ProductionTaskType>(['warehouse_help', 'cleaning'])
const RAW_ALLOWED_PRODUCTION_TASK_TYPES = new Set<ProductionTaskType>([
  'unpacking',
  'trim_cuffs',
  'defect_sorting',
  'repacking',
])

function isSupportProductionTaskType(taskType: ProductionTaskType) {
  return SUPPORT_PRODUCTION_TASK_TYPES.has(taskType)
}

function isRawAllowedProductionTaskType(taskType: ProductionTaskType) {
  return RAW_ALLOWED_PRODUCTION_TASK_TYPES.has(taskType)
}

// Схема валидации для формы создания
const productionOrderSchema = z
  .object({
    name: z.string().min(1, 'Укажите название заказа'),
    task_type: z.enum(PRODUCTION_TASK_TYPES),
    priority: z.coerce.number().int().min(0).max(9),
    comment: z.string().optional(),
    items: z.array(
      z.object({
        item_title: z.string().optional(),
        item_size: z.string().optional(),
        item_color: z.string().optional(),
        pairs_quantity: z.coerce.number().int().min(1, 'Минимум 1 пара'),
      }),
    ),
  })
  .superRefine((value, context) => {
    if (isSupportProductionTaskType(value.task_type)) return

    if (value.items.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['items'],
        message: 'Добавьте хотя бы одну позицию',
      })
      return
    }

    value.items.forEach((item, index) => {
      if (!item.item_title?.trim()) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['items', index, 'item_title'],
          message: 'Выберите номенклатуру',
        })
      }
      if (!item.item_size?.trim()) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['items', index, 'item_size'],
          message: 'Выберите размер',
        })
      }
    })
  })

type ProductionOrderForm = z.infer<typeof productionOrderSchema>

function buildEmptyItem() {
  return {
    item_title: '',
    item_size: '',
    item_color: '',
    pairs_quantity: 1,
  }
}

function withCurrentStringOption(options: string[], currentValue: string) {
  if (!currentValue) return options
  return options.includes(currentValue) ? options : [currentValue, ...options]
}

export function ProductionPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const currentUser = useAuthStore((state) => state.user)

  const [search, setSearch] = useState('')
  const [taskTypeFilter, setTaskTypeFilter] = useState<'all' | 'raw_material' | 'consumable' | 'finished_goods_receipt'>('all')
  const [taskStatusFilter, setTaskStatusFilter] = useState<'all' | 'requested' | 'in_progress' | 'completed'>('all')
  const [createOpen, setCreateOpen] = useState(false)

  const productionOrdersQuery = useQuery({ queryKey: ['production-orders'], queryFn: getProductionOrders })
  const itemsQuery = useQuery({ queryKey: ['items'], queryFn: getItems })

  const productionOrders = productionOrdersQuery.data ?? []
  const items = itemsQuery.data ?? []
  const isStorekeeper = currentUser?.role === 'storekeeper'

  // Форма для создания - используем as any для zodResolver
  const form = useForm<ProductionOrderForm>({
    resolver: zodResolver(productionOrderSchema) as any,
    defaultValues: {
      name: '',
      task_type: 'packaging',
      priority: 5,
      comment: '',
      items: [buildEmptyItem()],
    },
  })

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'items',
  })

  const selectedTaskType = form.watch('task_type')
  const isSupportTask = isSupportProductionTaskType(selectedTaskType)

  // ✅ Получаем названия из существующих товаров (только уникальные названия)
  const productionSelectableItems = useMemo(
    () =>
      items.filter((item) =>
        item.inventory_type === 'finished_goods' ||
        (isRawAllowedProductionTaskType(selectedTaskType) && item.inventory_type === 'raw_material'),
      ),
    [items, selectedTaskType],
  )

  const titleOptions = useMemo(() => {
    const titles = new Set<string>()
    productionSelectableItems.forEach(item => {
      if (item.title) titles.add(item.title)
    })
    return Array.from(titles).sort((a, b) => a.localeCompare(b, 'ru'))
  }, [productionSelectableItems])

  // ✅ Функция получения размеров для производства (предопределенные + существующие)
  const getAvailableSizes = (selectedTitle: string): string[] => {
    if (!selectedTitle) return PREDEFINED_SIZES
    
    const existingSizes = new Set<string>()
    productionSelectableItems.forEach(item => {
      if (item.title.toLowerCase() === selectedTitle.toLowerCase() && item.size) {
        existingSizes.add(item.size)
      }
    })
    
    const result = new Set([...existingSizes, ...PREDEFINED_SIZES])
    return Array.from(result).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  }

  // ✅ Функция получения цветов для производства (предопределенные + существующие)
  const getAvailableColors = (selectedTitle: string, selectedSize: string): string[] => {
    if (!selectedTitle) return PREDEFINED_COLORS
    
    const existingColors = new Set<string>()
    productionSelectableItems.forEach(item => {
      if (
        item.title.toLowerCase() === selectedTitle.toLowerCase() &&
        (!selectedSize || item.size === selectedSize) &&
        item.color
      ) {
        existingColors.add(item.color)
      }
    })
    
    const result = new Set([...existingColors, ...PREDEFINED_COLORS])
    return Array.from(result).sort()
  }

  // ✅ Найти ID товара по названию (ТОЛЬКО ПО НАЗВАНИЮ, без учета размера и цвета)
  const findItemIdByTitle = (title: string): number | undefined => {
    const found = productionSelectableItems.find(item =>
      item.title.toLowerCase() === title.toLowerCase()
    )
    return found?.id
  }

  const storekeeperTasks = useMemo(
    () => getProductionWarehouseTasks(productionOrders),
    [productionOrders],
  )

  const filteredOrders = useMemo(() => {
    const query = search.trim().toLowerCase()
    const source = query ? productionOrders.filter((order) => {
      const itemLabel = order.items.map((item) => `${item.item_title} ${item.item_size ?? ''}`).join(' ')
      const haystack = [
        order.name,
        itemLabel,
        order.batch_number ?? '',
        order.comment ?? '',
      ]
        .join(' ')
        .toLowerCase()
      return haystack.includes(query)
    }) : productionOrders
    return [...source].sort((left, right) => {
      if (left.priority !== right.priority) return right.priority - left.priority
      return new Date(right.created_at).getTime() - new Date(left.created_at).getTime()
    })
  }, [productionOrders, search])

  const filteredTasks = useMemo(() => {
    const query = search.trim().toLowerCase()
    return storekeeperTasks.filter((task) => {
      if (taskTypeFilter !== 'all' && task.requestType !== taskTypeFilter) return false
      if (taskStatusFilter !== 'all' && task.requestStatus !== taskStatusFilter) return false
      if (!query) return true
      const haystack = [
        task.orderName,
        task.itemTitle,
        task.itemSize ?? '',
        task.itemColor ?? '',
        task.batchNumber ?? '',
        productionSupplyTypeLabel(task.requestType),
      ]
        .join(' ')
        .toLowerCase()
      return haystack.includes(query)
    })
  }, [search, storekeeperTasks, taskStatusFilter, taskTypeFilter])

  // ✅ Мутация создания - поддерживает множество позиций
  const createMutation = useMutation({
    mutationFn: async (data: ProductionOrderForm) => {
      // Сначала находим или создаём item_id для каждой позиции
      const itemsWithIds = isSupportProductionTaskType(data.task_type) ? [] : await Promise.all(
        data.items.map(async (item) => {
          const itemTitle = item.item_title?.trim() ?? ''
          const itemSize = item.item_size?.trim() ?? ''
          let itemId = findItemIdByTitle(itemTitle)
          
          // Если товар не найден - создаем его ТОЛЬКО ПО НАЗВАНИЮ
          if (!itemId) {
            try {
              const newItem = await createItem({
                title: itemTitle,
                name: itemTitle,
                product_type: 'finished_goods',
                size: '',
                color: '',
                inventory_type: 'finished_goods',
              })
              itemId = newItem.id
              // Обновляем список товаров после создания
              await queryClient.invalidateQueries({ queryKey: ['items'] })
            } catch (error) {
              throw new Error(`Не удалось создать товар "${itemTitle}": ${getErrorMessage(error)}`)
            }
          }
          
          return {
            item_id: itemId,
            pairs_quantity: item.pairs_quantity,
            item_size: itemSize,
            item_color: item.item_color || undefined,
          }
        })
      )
      
      return createProductionOrder({
        name: data.name.trim(),
        task_type: data.task_type,
        priority: data.priority,
        comment: data.comment?.trim() || undefined,
        items: itemsWithIds,
      })
    },
    onSuccess: async (order) => {
      toast.success('Задание на производство создано')
      setCreateOpen(false)
      form.reset({
        name: '',
        task_type: 'packaging',
        priority: 5,
        comment: '',
        items: [buildEmptyItem()],
      })
      await queryClient.invalidateQueries({ queryKey: ['production-orders'] })
      navigate(`/production/${order.id}`)
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  const deleteMutation = useMutation({
    mutationFn: (productionOrderId: number) => deleteProductionOrder(productionOrderId),
    onSuccess: async () => {
      toast.success('Заказ на производство удален')
      await queryClient.invalidateQueries({ queryKey: ['production-orders'] })
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  const isLoading = productionOrdersQuery.isLoading || itemsQuery.isLoading

  // ✅ Обработчик клика по карточке для мобильных устройств
  const handleCardClick = (id: number, event: React.MouseEvent) => {
    const target = event.target as HTMLElement
    const isInteractive = target.closest('[data-interactive="true"]')
    if (isInteractive) {
      return
    }
    navigate(`/production/${id}`)
  }

  // ✅ Обработчик отправки формы
  const onSubmit = (data: ProductionOrderForm) => {
    createMutation.mutate(data)
  }

  return (
    <section className="page-shell space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Производство</h1>
        </div>
        {!isStorekeeper ? (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            Создать заказ
          </Button>
        ) : null}
      </div>

      <Card className="border-border/70">
        <Card.Content className="flex flex-wrap items-center gap-3 pt-5">
          <SearchInput
            className="min-w-[240px] flex-1"
            placeholder={isStorekeeper ? 'Поиск по заданиям склада' : 'Поиск по заказам на производство'}
            value={search}
            onChange={setSearch}
          />
          {isStorekeeper ? (
            <>
              <SelectNative
                className="w-[220px]"
                value={taskTypeFilter}
                onChange={(event) =>
                  setTaskTypeFilter(event.target.value as 'all' | 'raw_material' | 'consumable' | 'finished_goods_receipt')
                }
              >
                <option value="all">Все типы заданий</option>
                <option value="raw_material">Сырье</option>
                <option value="consumable">Расходники</option>
                <option value="finished_goods_receipt">Приемка ГП</option>
              </SelectNative>
              <SelectNative
                className="w-[220px]"
                value={taskStatusFilter}
                onChange={(event) =>
                  setTaskStatusFilter(event.target.value as 'all' | 'requested' | 'in_progress' | 'completed')
                }
              >
                <option value="all">Все статусы</option>
                <option value="requested">Ожидает</option>
                <option value="in_progress">В работе</option>
                <option value="completed">Выполнено</option>
              </SelectNative>
            </>
          ) : null}
          <div className="rounded-2xl border border-border/70 bg-muted/20 px-4 py-2 text-sm text-muted-foreground">
            {isStorekeeper ? (
              <>
                Активных заданий: <span className="font-semibold text-foreground">{filteredTasks.length}</span>
              </>
            ) : (
              <>
                Активных заказов: <span className="font-semibold text-foreground">{filteredOrders.length}</span>
              </>
            )}
          </div>
        </Card.Content>
      </Card>

      <Card>
        <Card.Header>
          <Card.Title>{isStorekeeper ? 'Складские задания' : 'Заказы на производство'}</Card.Title>
        </Card.Header>
        <Card.Content>
          {isLoading ? (
            <div className="grid gap-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <Skeleton key={index} className="h-16" />
              ))}
            </div>
          ) : isStorekeeper ? (
            <>
              <div className="hidden overflow-x-auto md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Создан</TableHead>
                      <TableHead>Тип задания</TableHead>
                      <TableHead>Заказ №</TableHead>
                      <TableHead>Номенклатура</TableHead>
                      <TableHead>Размер</TableHead>
                      <TableHead>Цвет</TableHead>  {/* ✅ Добавлена колонка Цвет */}
                      <TableHead>Кол-во</TableHead>
                      <TableHead>Партия</TableHead>
                      <TableHead>Статус</TableHead>
                      <TableHead className="text-right">Действие</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTasks.map((task) => (
                      <TableRow
                        key={task.key}
                        className="cursor-pointer hover:bg-muted/40"
                        onClick={() => navigate(`/production/tasks/${encodeURIComponent(task.key)}`)}
                      >
                        <TableCell>{formatDate(task.createdAt)}</TableCell>
                        <TableCell>
                          <div className="font-medium">{productionSupplyTypeLabel(task.requestType)}</div>
                        </TableCell>
                        <TableCell>{task.orderName}</TableCell>
                        <TableCell className="font-medium">{task.itemTitle}</TableCell>
                        <TableCell>{task.itemSize || '—'}</TableCell>
                        <TableCell>
                          {task.itemColor ? (
                            <div className="flex items-center gap-1">
                              <span
                                className="inline-block h-3 w-3 rounded-full border border-border"
                                style={{ backgroundColor: getColorValue(task.itemColor) }}
                              />
                              <span className="text-sm">{task.itemColor}</span>
                            </div>
                          ) : (
                            '—'
                          )}
                        </TableCell>
                        <TableCell>
                          {task.remainingQuantity} {productionSupplyTypeUnitLabel(task.requestType)}
                        </TableCell>
                        <TableCell>{task.batchNumber || '—'}</TableCell>
                        <TableCell>
                          <Badge tone={productionSupplyStatusTone(task.requestStatus)}>
                            {productionSupplyStatusLabel(task.requestStatus)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(event) => {
                              event.stopPropagation()
                              navigate(`/production/tasks/${encodeURIComponent(task.key)}`)
                            }}
                          >
                            Выполнить
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="grid gap-3 md:hidden">
                {filteredTasks.map((task) => (
                  <div
                    key={task.key}
                    role="button"
                    tabIndex={0}
                    className="rounded-2xl border border-border/70 p-4 text-left transition hover:bg-muted/30"
                    onClick={() => navigate(`/production/tasks/${encodeURIComponent(task.key)}`)}
                    onKeyDown={(event) =>
                      activateWithKeyboard(event, () => navigate(`/production/tasks/${encodeURIComponent(task.key)}`))
                    }
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold">{productionSupplyTypeLabel(task.requestType)}</div>
                        <div className="text-sm text-muted-foreground">{task.orderName}</div>
                      </div>
                      <Badge tone={productionSupplyStatusTone(task.requestStatus)}>
                        {productionSupplyStatusLabel(task.requestStatus)}
                      </Badge>
                    </div>
                    <div className="mt-3 text-sm font-medium">{task.itemTitle}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {task.itemSize || 'Без размера'}
                      {task.itemColor ? ` · ${task.itemColor}` : ''}
                      {task.batchNumber ? ` · партия ${task.batchNumber}` : ''}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {task.remainingQuantity} {productionSupplyTypeUnitLabel(task.requestType)}
                    </div>
                  </div>
                ))}
              </div>

              {filteredTasks.length === 0 ? (
                <div className="rounded-2xl border border-dashed p-8 text-center text-muted-foreground">
                  Активных заданий нет
                </div>
              ) : null}
            </>
          ) : (
            <>
              <div className="hidden overflow-x-auto md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Заказ №</TableHead>
                      <TableHead>Тип</TableHead>
                      <TableHead>Номенклатура</TableHead>
                      <TableHead>Размер</TableHead>
                      <TableHead>Цвет</TableHead>
                      <TableHead>Партия</TableHead>
                      <TableHead>Приоритет</TableHead>
                      <TableHead>Статус</TableHead>
                      <TableHead>Кол-во пар</TableHead>
                      <TableHead>Факт</TableHead>
                      <TableHead>Создан</TableHead>
                      <TableHead className="w-[72px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredOrders.map((order) => {
                      const primaryItem = order.items[0]
                      const progress = getProductionProgress(order)
                      return (
                        <TableRow
                          key={order.id}
                          className="cursor-pointer hover:bg-muted/40"
                          onClick={() => navigate(`/production/${order.id}`)}
                        >
                          <TableCell>
                            <div className="font-medium">{order.name}</div>
                          </TableCell>
                          <TableCell>{productionTaskTypeLabel(order.task_type)}</TableCell>
                          <TableCell className="font-medium">{primaryItem?.item_title || '—'}</TableCell>
                          <TableCell>{primaryItem?.item_size || '—'}</TableCell>
                          <TableCell>{primaryItem?.item_color || '—'}</TableCell>
                          <TableCell>{order.batch_number || '—'}</TableCell>
                          <TableCell className="font-semibold">{order.priority}</TableCell>
                          <TableCell>
                            <Badge tone={productionStatusTone(order.status)}>
                              {productionStatusLabel(order.status)}
                            </Badge>
                          </TableCell>
                          <TableCell>{primaryItem?.pairs_quantity ?? 0}</TableCell>
                          <TableCell>
                            <div className="min-w-44">
                              <Progress
                                value={progress.percent}
                                label="Произведено"
                                valueLabel={`${progress.produced}/${progress.total}`}
                              />
                            </div>
                          </TableCell>
                          <TableCell>{formatDate(order.created_at)}</TableCell>
                          <TableCell className="text-right">
                            <ConfirmDialog
                              title="Удалить заказ на производство?"
                              description="Все связанные складские операции будут отменены, а остатки восстановлены."
                              confirmLabel="Удалить"
                              onConfirm={() => deleteMutation.mutate(order.id)}
                            >
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                data-interactive="true"
                                onClick={(event) => {
                                  event.stopPropagation()
                                }}
                                disabled={deleteMutation.isPending}
                              >
                                <Trash2 className="h-4 w-4 text-red-600" />
                              </Button>
                            </ConfirmDialog>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>

              <div className="grid gap-3 md:hidden">
                {filteredOrders.map((order) => {
                  const primaryItem = order.items[0]
                  const progress = getProductionProgress(order)
                  return (
                    <div
                      key={order.id}
                      role="button"
                      tabIndex={0}
                      className="rounded-2xl border border-border/70 p-4 text-left transition hover:bg-muted/30"
                      onClick={(event) => handleCardClick(order.id, event)}
                      onKeyDown={(event) => activateWithKeyboard(event, () => navigate(`/production/${order.id}`))}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold truncate">{order.name}</div>
                          <div className="text-xs text-muted-foreground">{productionTaskTypeLabel(order.task_type)}</div>
                          <div className="text-sm text-muted-foreground truncate">
                            {primaryItem ? formatProductionItemLabel(primaryItem) : 'Без номенклатуры'}
                          </div>
                        </div>
                        <Badge tone={productionStatusTone(order.status)} className="shrink-0">
                          {productionStatusLabel(order.status)}
                        </Badge>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                        <span>Партия: {order.batch_number || '—'}</span>
                        <span>{primaryItem?.pairs_quantity ?? 0} пар</span>
                      </div>
                      <Progress
                        className="mt-3"
                        value={progress.percent}
                        label="Произведено"
                        valueLabel={`${progress.produced}/${progress.total} пар`}
                      />
                      <div className="mt-3 flex justify-end">
                        <ConfirmDialog
                          title="Удалить заказ на производство?"
                          description="Все связанные складские операции будут отменены, а остатки восстановлены."
                          confirmLabel="Удалить"
                          onConfirm={() => deleteMutation.mutate(order.id)}
                        >
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            data-interactive="true"
                            onClick={(event) => {
                              event.stopPropagation()
                            }}
                            disabled={deleteMutation.isPending}
                          >
                            <Trash2 className="h-4 w-4 text-red-600" />
                          </Button>
                        </ConfirmDialog>
                      </div>
                    </div>
                  )
                })}
              </div>

              {filteredOrders.length === 0 ? (
                <div className="rounded-2xl border border-dashed p-8 text-center text-muted-foreground">
                  Заказы на производство не найдены
                </div>
              ) : null}
            </>
          )}
        </Card.Content>
      </Card>

      {/* ✅ Диалог создания с поддержкой множества позиций */}
      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open)
          if (!open) {
            form.reset({
              name: '',
              task_type: 'packaging',
              priority: 5,
              comment: '',
              items: [buildEmptyItem()],
            })
          }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Новый заказ на производство</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Заказ № *</Label>
                <FieldErrorWrap error={form.formState.errors.name?.message}>
                  <Input
                    {...form.register('name')}
                    placeholder="Например, ПР-2601"
                  />
                </FieldErrorWrap>
              </div>
              <div className="space-y-2">
                <Label>Приоритет</Label>
                <Controller
                  control={form.control}
                  name="priority"
                  render={({ field }) => (
                    <SelectNative
                      value={field.value}
                      onBlur={field.onBlur}
                      onChange={(event) => field.onChange(Number(event.target.value))}
                    >
                      {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((priority) => (
                        <option key={priority} value={priority}>
                          {priority}
                        </option>
                      ))}
                    </SelectNative>
                  )}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Тип задания</Label>
              <SelectNative
                value={selectedTaskType}
                onChange={(event) => {
                  const nextTaskType = event.target.value as ProductionTaskType
                  form.setValue('task_type', nextTaskType)
                  if (isSupportProductionTaskType(nextTaskType)) {
                    form.setValue('items', [])
                  } else if (form.getValues('items').length === 0) {
                    form.setValue('items', [buildEmptyItem()])
                  }
                }}
              >
                {PRODUCTION_TASK_TYPES.map((taskType) => (
                  <option key={taskType} value={taskType}>
                    {productionTaskTypeLabel(taskType)}
                  </option>
                ))}
              </SelectNative>
            </div>

            {/* Позиции заказа */}
            {!isSupportTask ? (
            <div className="space-y-3 border-t pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold">Позиции заказа</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Добавьте номенклатуру, размер и количество для каждой позиции.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => append(buildEmptyItem())}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Добавить товар
                </Button>
              </div>

              {fields.map((field, index) => {
                const currentItem = form.watch(`items.${index}`)
                const sizeOptions = withCurrentStringOption(
                  getAvailableSizes(currentItem?.item_title || ''),
                  currentItem?.item_size || '',
                )
                const colorOptions = withCurrentStringOption(
                  getAvailableColors(currentItem?.item_title || '', currentItem?.item_size || ''),
                  currentItem?.item_color || '',
                )
                const resolvedItemId = findItemIdByTitle(currentItem?.item_title || '')
                const resolvedItem = productionSelectableItems.find(item => item.id === resolvedItemId)

                return (
                  <div key={field.id} className="space-y-3 rounded-xl border border-border/70 p-4">
                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground">Номенклатура *</Label>
                        <FieldErrorWrap
                          error={form.formState.errors.items?.[index]?.item_title?.message}
                          messageClassName="text-xs"
                        >
                          <SelectNative
                            searchable
                            searchPlaceholder="Поиск номенклатуры…"
                            value={currentItem?.item_title || ''}
                            onChange={(event) => {
                              form.setValue(`items.${index}.item_title`, event.target.value)
                              form.setValue(`items.${index}.item_size`, '')
                              form.setValue(`items.${index}.item_color`, '')
                            }}
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
                        <Label className="text-xs text-muted-foreground">Размер *</Label>
                        <FieldErrorWrap
                          error={form.formState.errors.items?.[index]?.item_size?.message}
                          messageClassName="text-xs"
                        >
                          <SelectNative
                            value={currentItem?.item_size || ''}
                            onChange={(event) => {
                              form.setValue(`items.${index}.item_size`, event.target.value)
                              form.setValue(`items.${index}.item_color`, '')
                            }}
                            disabled={!currentItem?.item_title}
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
                        <SelectNative
                          value={currentItem?.item_color || ''}
                          onChange={(event) => {
                            form.setValue(`items.${index}.item_color`, event.target.value)
                          }}
                          disabled={!currentItem?.item_title || !currentItem?.item_size}
                        >
                          <option value="">Не указан</option>
                          {colorOptions.map((color) => (
                            <option key={color} value={color}>
                              {color}
                            </option>
                          ))}
                        </SelectNative>
                      </div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                      <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground">Кол-во пар *</Label>
                        <FieldErrorWrap
                          error={form.formState.errors.items?.[index]?.pairs_quantity?.message}
                          messageClassName="text-xs"
                        >
                          <Input
                            type="number"
                            min={1}
                            {...form.register(`items.${index}.pairs_quantity`)}
                          />
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

                    {resolvedItem && (
                      <div className="rounded-md bg-muted/30 p-3 text-xs">
                        <div className="font-medium text-foreground">
                          ✅ Товар найден в справочнике
                        </div>
                        <div className="mt-1 text-muted-foreground">
                          {resolvedItem.title}
                        </div>
                      </div>
                    )}
                    {!resolvedItem && currentItem?.item_title && (
                      <div className="rounded-md bg-amber-50/70 p-3 text-xs">
                        <div className="font-medium text-amber-700">🆕 Новый товар</div>
                        <div className="mt-1 text-amber-600">
                          Будет создан в справочнике номенклатуры
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}

              {form.formState.errors.items && typeof form.formState.errors.items.message === 'string' && (
                <p className="text-sm text-red-500">{form.formState.errors.items.message}</p>
              )}
            </div>
            ) : (
              <div className="rounded-xl border border-border/70 bg-muted/20 p-4 text-sm text-muted-foreground">
                Для этого типа задания номенклатура не нужна. Людей и время можно указать в карточке задания.
              </div>
            )}

            <div className="space-y-2">
              <Label>Комментарий</Label>
              <Textarea
                rows={2}
                {...form.register('comment')}
                placeholder="Необязательный комментарий"
              />
            </div>

            <Button
              className="w-full"
              type="submit"
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? 'Создание...' : 'Создать заказ'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  )
}
