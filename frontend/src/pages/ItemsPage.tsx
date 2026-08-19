import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, Trash2 } from 'lucide-react'
import { toast } from '@/lib/toast'

import { createItem, deleteItem, getItems, getStocks } from '@/api/client'
import { ConfirmDialog } from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog'
import { Input, SelectNative } from '@/components/ui/input'
import { FieldErrorWrap } from '@/components/ui/field-error'
import { SearchInput } from '@/components/ui/search-input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { activateWithKeyboard, isEventFromInteractiveElement } from '@/lib/interaction'
import { getErrorMessage, inventoryTypeLabel, inventoryTypeShortLabel, inventoryTypeUnitLabel } from '@/lib/utils'
import type { ItemCreate } from '@/types/wms'

type InventoryTypeFilter = 'all' | 'finished_goods' | 'raw_material' | 'consumable'

const itemSchema = z.object({
  title: z.string().min(1, 'Укажите название'),
  name: z.string().min(1, 'Укажите полное описание'),
  inventory_type: z.enum(['finished_goods', 'raw_material', 'consumable']),
  max_pairs_per_box: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.coerce.number().int().positive('Должно быть больше 0').optional(),
  ),
})

type ItemFormInput = z.input<typeof itemSchema>
type ItemFormOutput = z.output<typeof itemSchema>

export function ItemsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<InventoryTypeFilter>('all')

  const itemsQuery = useQuery({
    queryKey: ['items'],
    queryFn: getItems,
    staleTime: 60_000,
  })

  const stocksQuery = useQuery({
    queryKey: ['stocks'],
    queryFn: getStocks,
    staleTime: 60_000,
  })

  const items = useMemo(() => (Array.isArray(itemsQuery.data) ? itemsQuery.data : []), [itemsQuery.data])
  const stocks = useMemo(() => (Array.isArray(stocksQuery.data) ? stocksQuery.data : []), [stocksQuery.data])

  const stockTotalsByItem = useMemo(() => {
    const result = new Map<number, number>()
    for (const stock of stocks) {
      if (stock.pairs_quantity <= 0) continue
      result.set(stock.item_id, (result.get(stock.item_id) ?? 0) + stock.pairs_quantity)
    }
    return result
  }, [stocks])

  const filteredItems = useMemo(() => {
    const searchValue = search.trim().toLowerCase()

    return items.filter((item) => {
      if (typeFilter !== 'all' && item.inventory_type !== typeFilter) return false
      if (!searchValue) return true
      const haystack = `${item.title} ${item.name}`.toLowerCase()
      return haystack.includes(searchValue)
    })
  }, [items, search, typeFilter])

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['items'] }),
      queryClient.invalidateQueries({ queryKey: ['stocks'] }),
    ])
  }

  const createMutation = useMutation({
    mutationFn: createItem,
    onSuccess: async () => {
      toast.success('Номенклатура создана')
      setOpen(false)
      form.reset({
        title: '',
        name: '',
        inventory_type: 'finished_goods',
        max_pairs_per_box: '',
      })
      await invalidate()
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  const deleteMutation = useMutation({
    mutationFn: deleteItem,
    onSuccess: async () => {
      toast.success('Номенклатура удалена')
      await invalidate()
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  const form = useForm<ItemFormInput, undefined, ItemFormOutput>({
    resolver: zodResolver(itemSchema),
    defaultValues: {
      title: '',
      name: '',
      inventory_type: 'finished_goods',
      max_pairs_per_box: '',
    },
  })

  const handleSubmit = (values: ItemFormOutput) => {
    const payload: ItemCreate = {
      title: values.title,
      name: values.name,
      product_type: '',
      size: '',
      color: '',
      inventory_type: values.inventory_type,
      max_pairs_per_box: typeof values.max_pairs_per_box === 'number' ? values.max_pairs_per_box : undefined,
    }
    createMutation.mutate(payload)
  }

  return (
    <section className="page-shell space-y-5">
      <Card>
        <Card.Content className="flex flex-wrap items-center gap-3 pt-5">
          <SearchInput
            className="min-w-[220px] flex-1"
            placeholder="Поиск номенклатуры"
            value={search}
            onChange={setSearch}
          />

          <SelectNative value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as InventoryTypeFilter)} className="w-[220px]">
            <option value="all">Все типы</option>
            <option value="finished_goods">Готовая продукция</option>
            <option value="raw_material">Сырье</option>
            <option value="consumable">Упаковка</option>
          </SelectNative>

          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4" />
                Номенклатура
              </Button>
            </DialogTrigger>
            <DialogContent title="Создать номенклатуру">
              <form className="space-y-4" onSubmit={form.handleSubmit(handleSubmit)}>
                <div className="space-y-2">
                  <Label htmlFor="title">Краткое название</Label>
                  <FieldErrorWrap error={form.formState.errors.title?.message}>
                    <Input id="title" placeholder="Например: стер латекс" {...form.register('title')} />
                  </FieldErrorWrap>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="name">Полное описание</Label>
                  <FieldErrorWrap error={form.formState.errors.name?.message}>
                    <Input id="name" placeholder="Например: перчатки латексные стерильные" {...form.register('name')} />
                  </FieldErrorWrap>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="inventory_type">Тип номенклатуры</Label>
                  <Controller
                    control={form.control}
                    name="inventory_type"
                    render={({ field }) => (
                      <SelectNative
                        id="inventory_type"
                        value={field.value}
                        onBlur={field.onBlur}
                        onChange={(event) => field.onChange(event.target.value)}
                      >
                        <option value="finished_goods">Готовая продукция</option>
                        <option value="raw_material">Сырье</option>
                        <option value="consumable">Упаковка</option>
                      </SelectNative>
                    )}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="max_pairs_per_box">Вместимость коробки</Label>
                  <FieldErrorWrap
                    error={form.formState.errors.max_pairs_per_box?.message as string | undefined}
                    hint="Если оставить пустым, система подставит значение по умолчанию по правилам упаковки."
                  >
                    <Input id="max_pairs_per_box" type="number" min={1} placeholder="Необязательно" {...form.register('max_pairs_per_box')} />
                  </FieldErrorWrap>
                </div>

                <Button type="submit" disabled={createMutation.isPending} className="w-full">
                  {createMutation.isPending ? 'Сохранение...' : 'Создать номенклатуру'}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </Card.Content>
      </Card>

      <Card>
        <Card.Content className="pt-4">
          {itemsQuery.isLoading || stocksQuery.isLoading ? (
            <div className="grid gap-3">
              {Array.from({ length: 8 }).map((_, index) => (
                <Skeleton key={index} className="h-16" />
              ))}
            </div>
          ) : filteredItems.length === 0 ? (
            <p className="py-10 text-center text-muted-foreground">Ничего не найдено</p>
          ) : (
            <>
              <div className="hidden overflow-x-auto md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Номенклатура</TableHead>
                      <TableHead>Тип</TableHead>
                      <TableHead>На остатках</TableHead>
                      <TableHead>Короб / лимит</TableHead>
                      <TableHead className="w-[64px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredItems.map((item) => {
                      const quantity = stockTotalsByItem.get(item.id) ?? 0
                      const unitLabel = inventoryTypeUnitLabel(item.inventory_type)
                      const hasStock = quantity > 0

                      return (
                        <TableRow
                          key={item.id}
                          className="group cursor-pointer hover:bg-muted/50"
                          onClick={(event) => {
                            if (isEventFromInteractiveElement(event.target)) return
                            navigate(`/items/${item.id}`)
                          }}
                        >
                          <TableCell>
                            <div className="font-medium text-primary hover:underline">{item.title}</div>
                            <div className="text-xs text-muted-foreground">{item.name}</div>
                          </TableCell>
                          <TableCell>
                            <Badge tone="secondary">{inventoryTypeLabel(item.inventory_type)}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge tone={hasStock ? 'success' : 'neutral'}>
                              {quantity} {unitLabel}
                            </Badge>
                          </TableCell>
                          <TableCell>{item.max_pairs_per_box || '—'}</TableCell>
                          <TableCell onClick={(event) => event.stopPropagation()}>
                            <ConfirmDialog
                              title="Удалить номенклатуру?"
                              description={
                                hasStock
                                  ? `У номенклатуры "${item.title}" есть остатки: ${quantity} ${unitLabel}. При удалении связанные остатки тоже будут скрыты из работы. Продолжить?`
                                  : `Удалить номенклатуру "${item.title}"?`
                              }
                              confirmLabel="Удалить"
                              onConfirm={() => deleteMutation.mutate(item.id)}
                            >
                              <Button
                                variant="ghost"
                                size="icon"
                                data-interactive="true"
                                className="h-8 w-8 opacity-0 transition-opacity group-hover:opacity-100"
                              >
                                <Trash2 className="h-4 w-4 text-muted-foreground hover:text-red-600" />
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
                {filteredItems.map((item) => {
                  const quantity = stockTotalsByItem.get(item.id) ?? 0
                  const unitLabel = inventoryTypeUnitLabel(item.inventory_type)
                  const hasStock = quantity > 0

                  return (
                    <div
                      key={item.id}
                      role="button"
                      tabIndex={0}
                      className="rounded-2xl border p-4 text-left transition-colors hover:bg-muted/40"
                      onClick={(event) => {
                        if (isEventFromInteractiveElement(event.target)) return
                        navigate(`/items/${item.id}`)
                      }}
                      onKeyDown={(event) => activateWithKeyboard(event, () => navigate(`/items/${item.id}`))}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-semibold">{item.title}</div>
                          <div className="mt-1 text-xs text-muted-foreground">{item.name}</div>
                        </div>
                        <Badge tone="secondary">{inventoryTypeShortLabel(item.inventory_type)}</Badge>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <Badge tone={hasStock ? 'success' : 'neutral'}>
                          {quantity} {unitLabel}
                        </Badge>
                        <Badge tone="secondary">Короб: {item.max_pairs_per_box || '—'}</Badge>
                      </div>

                      <div className="mt-3 flex justify-end" onClick={(event) => event.stopPropagation()}>
                        <ConfirmDialog
                          title="Удалить номенклатуру?"
                          description={
                            hasStock
                              ? `У номенклатуры "${item.title}" есть остатки: ${quantity} ${unitLabel}. Продолжить?`
                              : `Удалить номенклатуру "${item.title}"?`
                          }
                          confirmLabel="Удалить"
                          onConfirm={() => deleteMutation.mutate(item.id)}
                        >
                          <Button variant="ghost" size="icon" data-interactive="true" className="h-8 w-8">
                            <Trash2 className="h-4 w-4 text-muted-foreground hover:text-red-600" />
                          </Button>
                        </ConfirmDialog>
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </Card.Content>
      </Card>
    </section>
  )
}
