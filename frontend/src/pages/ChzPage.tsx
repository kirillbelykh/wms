import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Archive, Plus } from 'lucide-react'
import { toast } from '@/lib/toast'

import { archiveChzRegistryEntries, createManualChzRequest, getChzRegistry, getItems } from '@/api/client'
import { ConfirmDialog } from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input, SelectNative, Textarea } from '@/components/ui/input'
import { SearchInput } from '@/components/ui/search-input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { chzRequestStatusTone, chzRegistryStatusLabel, chzSourceLabel, cn, formatDate, getErrorMessage } from '@/lib/utils'
import type { ChzRegistryEntry, Item } from '@/types/wms'

type SourceFilter = 'all' | 'shipment' | 'production' | 'manual'
type StatusFilter = 'all' | 'requested' | 'acknowledged' | 'ready' | 'cancelled'

const EMPTY_FORM = {
  itemId: '',
  pairsQuantity: '1',
  itemSize: '',
  itemColor: '',
  itemVenchik: '',
  batchNumber: '',
  comment: '',
}

function registryEntryKey(entry: ChzRegistryEntry) {
  return `${entry.source}:${entry.request_id}`
}

function isArchivedRegistryEntry(entry: ChzRegistryEntry) {
  return entry.status === 'cancelled' || entry.status === 'archived' || entry.status === 'deleted'
}

export function ChzPage() {
  const queryClient = useQueryClient()

  const [search, setSearch] = useState('')
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [createOpen, setCreateOpen] = useState(false)
  const [selectedEntry, setSelectedEntry] = useState<ChzRegistryEntry | null>(null)
  const [selectedEntryKeys, setSelectedEntryKeys] = useState<Set<string>>(new Set())
  const [showArchive, setShowArchive] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)

  const registryQuery = useQuery({
    queryKey: ['chz-registry'],
    queryFn: getChzRegistry,
  })

  const itemsQuery = useQuery({
    queryKey: ['items'],
    queryFn: getItems,
    staleTime: 60_000,
  })

  const items = (itemsQuery.data ?? []) as Item[]
  const finishedGoodsItems = useMemo(
    () => items.filter((item) => item.inventory_type === 'finished_goods'),
    [items],
  )

  const selectedItem = useMemo(
    () => finishedGoodsItems.find((item) => item.id === Number(form.itemId)) ?? null,
    [finishedGoodsItems, form.itemId],
  )

  const filteredEntries = useMemo(() => {
    const rows = (registryQuery.data ?? []) as ChzRegistryEntry[]
    const query = search.trim().toLowerCase()

    return rows.filter((row) => {
      const isArchived = isArchivedRegistryEntry(row)
      if (showArchive ? !isArchived : isArchived) return false
      if (sourceFilter !== 'all' && row.source !== sourceFilter) return false
      if (statusFilter !== 'all' && row.status !== statusFilter) return false
      if (!query) return true

      const haystack = [
        row.order_name ?? '',
        row.author ?? '',
        row.item_title ?? '',
        row.item_size ?? '',
        row.item_color ?? '',
        row.batch_number ?? '',
        row.comment ?? '',
      ]
        .join(' ')
        .toLowerCase()

      return haystack.includes(query)
    })
  }, [registryQuery.data, search, showArchive, sourceFilter, statusFilter])

  const visibleEntryKeys = useMemo(() => filteredEntries.map(registryEntryKey), [filteredEntries])
  const selectedEntries = useMemo(
    () => filteredEntries.filter((entry) => selectedEntryKeys.has(registryEntryKey(entry))),
    [filteredEntries, selectedEntryKeys],
  )
  const selectedRequestEntries = useMemo(
    () => Array.from(
      new Map(
        selectedEntries.map((entry) => [
          registryEntryKey(entry),
          { source: entry.source, request_id: entry.request_id },
        ]),
      ).values(),
    ),
    [selectedEntries],
  )
  const allVisibleEntriesSelected =
    visibleEntryKeys.length > 0 && visibleEntryKeys.every((entryKey) => selectedEntryKeys.has(entryKey))

  const toggleEntry = (entry: ChzRegistryEntry) => {
    const entryKey = registryEntryKey(entry)
    setSelectedEntryKeys((current) => {
      const next = new Set(current)
      if (next.has(entryKey)) {
        next.delete(entryKey)
      } else {
        next.add(entryKey)
      }
      return next
    })
  }

  const toggleAllVisibleEntries = () => {
    setSelectedEntryKeys((current) => {
      const next = new Set(current)
      if (allVisibleEntriesSelected) {
        visibleEntryKeys.forEach((entryKey) => next.delete(entryKey))
      } else {
        visibleEntryKeys.forEach((entryKey) => next.add(entryKey))
      }
      return next
    })
  }

  const createMutation = useMutation({
    mutationFn: async () => {
      const itemId = Number(form.itemId)
      const pairsQuantity = Number(form.pairsQuantity)

      if (!itemId) throw new Error('Выберите номенклатуру')
      if (!Number.isFinite(pairsQuantity) || pairsQuantity <= 0) {
        throw new Error('Укажите корректное количество пар')
      }

      return createManualChzRequest({
        item_id: itemId,
        pairs_quantity: pairsQuantity,
        item_size: form.itemSize.trim() || selectedItem?.size || undefined,
        item_color: form.itemColor.trim() || selectedItem?.color || undefined,
        item_venchik: form.itemVenchik.trim() || undefined,
        batch_number: form.batchNumber.trim() || undefined,
        comment: form.comment.trim() || undefined,
      })
    },
    onSuccess: async () => {
      toast.success('Запрос ЧЗ создан')
      setCreateOpen(false)
      setForm(EMPTY_FORM)
      await queryClient.invalidateQueries({ queryKey: ['chz-registry'] })
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  const archiveMutation = useMutation({
    mutationFn: async () => {
      if (selectedRequestEntries.length === 0) throw new Error('Выберите запросы ЧЗ')
      return archiveChzRegistryEntries({ entries: selectedRequestEntries })
    },
    onSuccess: async (entries) => {
      toast.success('Запросы ЧЗ перенесены в архив')
      setSelectedEntryKeys(new Set())
      queryClient.setQueryData(['chz-registry'], entries)
      await queryClient.invalidateQueries({ queryKey: ['chz-registry'] })
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  const openCreateDialog = () => {
    setForm(EMPTY_FORM)
    setCreateOpen(true)
  }

  const handleItemChange = (itemId: string) => {
    const nextItem = finishedGoodsItems.find((item) => item.id === Number(itemId)) ?? null
    setForm((current) => ({
      ...current,
      itemId,
      itemSize: nextItem?.size ?? '',
      itemColor: nextItem?.color ?? '',
    }))
  }

  const toggleArchive = () => {
    setShowArchive((current) => !current)
    setSelectedEntryKeys(new Set())
  }

  const isLoading = registryQuery.isLoading || itemsQuery.isLoading

  return (
    <section className="page-shell space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">ЧЗ</h1>
          <p className="text-sm text-muted-foreground">Реестр запросов Честного знака по отгрузке, производству и ручным заявкам.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant={showArchive ? 'secondary' : 'outline'} onClick={toggleArchive}>
            <Archive className="h-4 w-4" />
            {showArchive ? 'Рабочие' : 'Архив'}
          </Button>
          <Button onClick={openCreateDialog}>
            <Plus className="h-4 w-4" />
            Запросить ЧЗ
          </Button>
        </div>
      </div>

      <Card>
        <Card.Content className="grid gap-3 pt-5 md:grid-cols-[minmax(0,1fr)_180px_180px]">
          <SearchInput
            placeholder="Поиск по заказу, номенклатуре, партии, автору"
            value={search}
            onChange={setSearch}
          />
          <SelectNative value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value as SourceFilter)}>
            <option value="all">Все типы</option>
            <option value="shipment">Отгрузка</option>
            <option value="production">Производство</option>
            <option value="manual">Ручной запрос</option>
          </SelectNative>
          <SelectNative value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}>
            <option value="all">Все статусы</option>
            <option value="requested">Создан</option>
            <option value="acknowledged">В работе</option>
            <option value="ready">Готов</option>
            <option value="cancelled">Отменен</option>
          </SelectNative>
        </Card.Content>
      </Card>

      <Card>
        <Card.Header>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Card.Title>
              {showArchive ? 'Архив ЧЗ' : 'Реестр ЧЗ'}
              <span className="ml-2 text-sm font-normal text-muted-foreground">{filteredEntries.length}</span>
            </Card.Title>
            {!showArchive ? (
              <ConfirmDialog
                title="Перенести выбранные запросы ЧЗ в архив?"
                description={`Будет перенесено в архив: ${selectedRequestEntries.length}.`}
                confirmLabel="В архив"
                onConfirm={() => archiveMutation.mutate()}
              >
                <Button
                  type="button"
                  variant="outline"
                  disabled={selectedRequestEntries.length === 0 || archiveMutation.isPending}
                >
                  <Archive className="h-4 w-4" />
                  В архив
                </Button>
              </ConfirmDialog>
            ) : null}
          </div>
        </Card.Header>
        <Card.Content>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, index) => (
                <Skeleton key={index} className="h-12" />
              ))}
            </div>
          ) : filteredEntries.length === 0 ? (
            <div className="rounded-2xl border border-dashed p-8 text-center text-muted-foreground">
              Запросы ЧЗ не найдены
            </div>
          ) : (
            <>
              <div className="hidden overflow-x-auto lg:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox
                          isSelected={allVisibleEntriesSelected}
                          onChange={toggleAllVisibleEntries}
                          aria-label="Выбрать все запросы ЧЗ"
                        />
                      </TableHead>
                      <TableHead>Дата</TableHead>
                      <TableHead>Статус</TableHead>
                      <TableHead>Тип</TableHead>
                      <TableHead>Заказ №</TableHead>
                      <TableHead>Номенклатура</TableHead>
                      <TableHead>Кол-во пар</TableHead>
                      <TableHead>Размер</TableHead>
                      <TableHead>Партия</TableHead>
                      <TableHead>Цвет</TableHead>
                      <TableHead>Автор</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredEntries.map((entry) => (
                      <TableRow
                        key={`${entry.source}-${entry.request_id}-${entry.item_id}-${entry.batch_number ?? 'no-batch'}`}
                        className={cn(
                          'cursor-pointer hover:bg-muted/40',
                          selectedEntryKeys.has(registryEntryKey(entry)) && 'bg-muted/60 hover:bg-muted/60',
                        )}
                        onClick={() => setSelectedEntry(entry)}
                      >
                        <TableCell onClick={(event) => event.stopPropagation()}>
                          <Checkbox
                            isSelected={selectedEntryKeys.has(registryEntryKey(entry))}
                            onChange={() => toggleEntry(entry)}
                            aria-label="Выбрать запрос ЧЗ"
                          />
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{formatDate(entry.requested_at)}</TableCell>
                        <TableCell>
                          <Badge tone={chzRequestStatusTone(entry.status)}>
                            {chzRegistryStatusLabel(entry.status)}
                          </Badge>
                        </TableCell>
                        <TableCell>{chzSourceLabel(entry.source)}</TableCell>
                        <TableCell>{entry.order_name || '—'}</TableCell>
                        <TableCell className="font-medium">{entry.item_title}</TableCell>
                        <TableCell>{entry.pairs_quantity}</TableCell>
                        <TableCell>{entry.item_size || '—'}</TableCell>
                        <TableCell>{entry.batch_number || '—'}</TableCell>
                        <TableCell>{entry.item_color || '—'}</TableCell>
                        <TableCell>{entry.author || '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="grid gap-3 lg:hidden">
                {filteredEntries.map((entry) => (
                  <div
                    key={`${entry.source}-${entry.request_id}-${entry.item_id}-${entry.batch_number ?? 'no-batch'}`}
                    className={cn(
                      'rounded-2xl border border-border/70 p-4 text-left transition hover:bg-muted/30',
                      selectedEntryKeys.has(registryEntryKey(entry)) && 'bg-muted/60',
                    )}
                    onClick={() => setSelectedEntry(entry)}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex min-w-0 items-start gap-3">
                        <Checkbox
                          isSelected={selectedEntryKeys.has(registryEntryKey(entry))}
                          onChange={() => toggleEntry(entry)}
                          onContentClick={(event) => event.stopPropagation()}
                          aria-label="Выбрать запрос ЧЗ"
                          className="mt-1"
                        />
                        <div className="min-w-0">
                          <div className="font-semibold">{entry.item_title}</div>
                          <div className="text-sm text-muted-foreground">{entry.order_name || 'Без номера заказа'}</div>
                        </div>
                      </div>
                      <Badge tone={chzRequestStatusTone(entry.status)}>
                        {chzRegistryStatusLabel(entry.status)}
                      </Badge>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <span>{chzSourceLabel(entry.source)}</span>
                      <span>{entry.pairs_quantity} пар</span>
                      <span>{entry.item_size || 'Без размера'}</span>
                      <span>{entry.batch_number ? `партия ${entry.batch_number}` : 'без партии'}</span>
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      {entry.author || '—'} · {formatDate(entry.requested_at)}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card.Content>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Запросить ЧЗ</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label>Номенклатура</Label>
              <SelectNative
                searchable
                searchPlaceholder="Поиск номенклатуры…"
                value={form.itemId}
                onChange={(event) => handleItemChange(event.target.value)}
              >
                <option value="">Выберите готовую продукцию</option>
                {finishedGoodsItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                    {item.size ? ` · р. ${item.size}` : ''}
                    {item.color ? ` · ${item.color}` : ''}
                  </option>
                ))}
              </SelectNative>
            </div>

            <div className="space-y-2">
              <Label>Количество пар</Label>
              <Input
                type="number"
                min={1}
                value={form.pairsQuantity}
                onChange={(event) => setForm((current) => ({ ...current, pairsQuantity: event.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label>Партия</Label>
              <Input
                value={form.batchNumber}
                onChange={(event) => setForm((current) => ({ ...current, batchNumber: event.target.value }))}
                placeholder="Например 260101"
              />
            </div>

            <div className="space-y-2">
              <Label>Размер</Label>
              <Input
                value={form.itemSize}
                onChange={(event) => setForm((current) => ({ ...current, itemSize: event.target.value }))}
                placeholder="Например 7,0"
              />
            </div>

            <div className="space-y-2">
              <Label>Цвет</Label>
              <Input
                value={form.itemColor}
                onChange={(event) => setForm((current) => ({ ...current, itemColor: event.target.value }))}
                placeholder="Например синий"
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label>С венчиком / без венчика</Label>
              <Input
                value={form.itemVenchik}
                onChange={(event) => setForm((current) => ({ ...current, itemVenchik: event.target.value }))}
                placeholder="Необязательно"
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label>Комментарий</Label>
              <Textarea
                rows={3}
                value={form.comment}
                onChange={(event) => setForm((current) => ({ ...current, comment: event.target.value }))}
                placeholder="Комментарий для оператора ЧЗ"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Отмена
            </Button>
            <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Отправка...' : 'Отправить'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={selectedEntry !== null} onOpenChange={(open) => !open && setSelectedEntry(null)}>
        {selectedEntry ? (
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{selectedEntry.item_title}</DialogTitle>
            </DialogHeader>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border p-4">
                <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Статус</div>
                <div className="mt-2">
                  <Badge tone={chzRequestStatusTone(selectedEntry.status)}>
                    {chzRegistryStatusLabel(selectedEntry.status)}
                  </Badge>
                </div>
              </div>
              <div className="rounded-2xl border p-4">
                <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Тип</div>
                <div className="mt-2 text-sm font-medium">{chzSourceLabel(selectedEntry.source)}</div>
              </div>
              <div className="rounded-2xl border p-4">
                <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Заказ №</div>
                <div className="mt-2 text-sm font-medium">{selectedEntry.order_name || '—'}</div>
              </div>
              <div className="rounded-2xl border p-4">
                <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Автор</div>
                <div className="mt-2 text-sm font-medium">{selectedEntry.author || '—'}</div>
              </div>
              <div className="rounded-2xl border p-4">
                <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Количество</div>
                <div className="mt-2 text-sm font-medium">{selectedEntry.pairs_quantity} пар</div>
              </div>
              <div className="rounded-2xl border p-4">
                <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Дата</div>
                <div className="mt-2 text-sm font-medium">{formatDate(selectedEntry.requested_at)}</div>
              </div>
              <div className="rounded-2xl border p-4">
                <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Размер</div>
                <div className="mt-2 text-sm font-medium">{selectedEntry.item_size || '—'}</div>
              </div>
              <div className="rounded-2xl border p-4">
                <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Партия</div>
                <div className="mt-2 text-sm font-medium">{selectedEntry.batch_number || '—'}</div>
              </div>
              <div className="rounded-2xl border p-4">
                <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Цвет</div>
                <div className="mt-2 text-sm font-medium">{selectedEntry.item_color || '—'}</div>
              </div>
              <div className="rounded-2xl border p-4">
                <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Венчик</div>
                <div className="mt-2 text-sm font-medium">{selectedEntry.item_venchik || '—'}</div>
              </div>
            </div>

            <div className="rounded-2xl border p-4">
              <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Комментарий</div>
              <div className="mt-2 text-sm">{selectedEntry.comment || 'Комментарий не указан'}</div>
            </div>
          </DialogContent>
        ) : null}
      </Dialog>
    </section>
  )
}
