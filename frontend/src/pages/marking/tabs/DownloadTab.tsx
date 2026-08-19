// src/pages/marking/tabs/DownloadTab.tsx

import { useState, useMemo } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { toast } from '@/lib/toast'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input, SelectNative } from '@/components/ui/input'
import { SearchInput } from '@/components/ui/search-input'
import { Progress } from '@/components/ui/progress'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Download, Printer, RefreshCw } from 'lucide-react'
import {
  MarkingField,
  MarkingLoadMore,
  MarkingMetric,
  MarkingPanel,
  MarkingStatusBadge,
  MarkingTablePanel,
  MarkingToolbar,
  useIncrementalRows,
} from '../marking-ui'
import { MarkingLogPanel } from '../components/MarkingLogPanel'
import { withAgentFetchOptions } from '../agentFetch'
import { useShiftSelection } from '../useShiftSelection'

interface DownloadItem {
  document_id: string
  order_name: string
  full_name: string
  gtin: string
  status: string
}

interface DownloadState {
  items: DownloadItem[]
  printers: string[]
  default_printer: string
}

interface DownloadTabProps {
  agentUrl: string
}

export function DownloadTab({ agentUrl }: DownloadTabProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedPrinter, setSelectedPrinter] = useState('')
  const [recordNumber, setRecordNumber] = useState('')
  const [autoDownload, setAutoDownload] = useState(false)
  const [progress, setProgress] = useState<{
    active: boolean
    processed: number
    total: number
    label: string
  }>({ active: false, processed: 0, total: 0, label: '' })

  const {
    data: downloadState,
    refetch: refetchDownload,
    isLoading,
  } = useQuery<DownloadState>({
    queryKey: ['download-state'],
    queryFn: async () => {
      const res = await fetch(`${agentUrl}/api/call/get_download_state`, withAgentFetchOptions(agentUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ args: [] }),
      }))
      if (!res.ok) throw new Error('Failed to fetch download state')
      return res.json()
    },
    staleTime: 10 * 1000,
  })

  const items = downloadState?.items || []
  const printers = downloadState?.printers || []
  const defaultPrinter = downloadState?.default_printer || ''
  const effectivePrinter = selectedPrinter || (defaultPrinter && printers.includes(defaultPrinter) ? defaultPrinter : '')

  // Фильтрация
  const filteredItems = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return items
    return items.filter((item) => {
      const haystack = [
        item.order_name,
        item.full_name,
        item.gtin,
        item.status,
        item.document_id,
      ].filter(Boolean).join(' ').toLowerCase()
      return haystack.includes(query)
    })
  }, [items, searchQuery])

  const rows = useIncrementalRows(filteredItems, 30)
  const visibleIds = useMemo(() => rows.visibleRows.map((item) => item.document_id), [rows.visibleRows])
  const { clearSelection, toggleAll, toggleOne } = useShiftSelection<string>({ setSelected: setSelectedIds })

  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${agentUrl}/api/call/sync_download_statuses`, withAgentFetchOptions(agentUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ args: [autoDownload] }),
      }))
      if (!res.ok) throw new Error('Failed to sync statuses')
      return res.json()
    },
    onSuccess: () => {
      toast.success('Статусы загрузки обновлены')
      refetchDownload()
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const downloadMutation = useMutation({
    mutationFn: async () => {
      const ids = Array.from(selectedIds)
      if (!ids.length) {
        throw new Error('Выберите хотя бы один заказ')
      }

      setProgress({
        active: true,
        processed: 0,
        total: ids.length,
        label: `Прогресс скачивания: 0/${ids.length}`,
      })

      let successCount = 0
      const errors: string[] = []

      for (let i = 0; i < ids.length; i++) {
        const id = ids[i]
        try {
          const res = await fetch(`${agentUrl}/api/call/manual_download_order`, withAgentFetchOptions(agentUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ args: [id] }),
          }))
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          successCount++
        } catch (error: any) {
          errors.push(`${id}: ${error.message}`)
        }

        setProgress((prev) => ({
          ...prev,
          processed: i + 1,
          label: `Прогресс скачивания: ${i + 1}/${ids.length}`,
        }))
      }

      setProgress((prev) => ({
        ...prev,
        active: false,
        label: errors.length
          ? `Скачано ${successCount}/${ids.length}, ошибок: ${errors.length}`
          : `Скачано ${successCount}/${ids.length}`,
      }))

      if (errors.length) {
        throw new Error(`Скачано ${successCount}/${ids.length}. Подробности в логе.`)
      }

      return { successCount, total: ids.length }
    },
    onSuccess: () => {
      toast.success('Скачивание завершено')
      refetchDownload()
      clearSelection()
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const printMutation = useMutation({
    mutationFn: async () => {
      const targetId = selectedIds.size
        ? Array.from(selectedIds)[0]
        : items[0]?.document_id || ''
      if (!targetId) {
        throw new Error('Нет заказов для печати')
      }
      const res = await fetch(`${agentUrl}/api/call/print_download_order`, withAgentFetchOptions(agentUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          args: [targetId, effectivePrinter, recordNumber || null],
        }),
      }))
      if (!res.ok) throw new Error('Failed to print')
      return res.json()
    },
    onSuccess: () => {
      toast.success('Печать термоэтикеток запущена')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
      <div className="space-y-4">
      <MarkingPanel
        title="Загрузка кодов"
        stats={
          <>
            <MarkingMetric label="Заказы" value={items.length} tone="secondary" />
            <MarkingMetric label="Выбрано" value={selectedIds.size} tone={selectedIds.size ? 'primary' : 'neutral'} />
          </>
        }
        actions={
          <MarkingToolbar>
            <Button variant="outline" onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending} size="sm">
              <RefreshCw className="h-4 w-4" />
              {syncMutation.isPending ? 'Обновление...' : 'Статусы'}
            </Button>
            <Checkbox
              isSelected={autoDownload}
              onChange={setAutoDownload}
              aria-label="Автоскачивание"
              className="flex h-8 items-center gap-2 rounded-md border border-border px-3 text-sm text-muted-foreground"
            >
              Автоскачивание
            </Checkbox>
          </MarkingToolbar>
        }
      >
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)]">
          <div className="grid gap-3 sm:grid-cols-2">
            <MarkingField label="Принтер">
              <SelectNative value={effectivePrinter} onChange={(e) => setSelectedPrinter(e.target.value)}>
                <option value="">Выберите принтер</option>
                {printers.map((printer) => (
                  <option key={printer} value={printer}>{printer}</option>
                ))}
              </SelectNative>
            </MarkingField>
            <MarkingField label="Номер этикетки">
              <Input
                type="number"
                min={1}
                step={1}
                placeholder="Опционально"
                value={recordNumber}
                onChange={(e) => setRecordNumber(e.target.value)}
              />
            </MarkingField>
          </div>
          <MarkingToolbar className="items-end lg:justify-end">
            <Button
              onClick={() => downloadMutation.mutate()}
              disabled={downloadMutation.isPending || selectedIds.size === 0 || progress.active}
              size="sm"
            >
              <Download className="h-4 w-4" />
              {downloadMutation.isPending ? 'Скачивание...' : 'Скачать выбранное'}
            </Button>
            <Button
              variant="outline"
              onClick={() => printMutation.mutate()}
              disabled={printMutation.isPending || !effectivePrinter}
              size="sm"
            >
              <Printer className="h-4 w-4" />
              Печать 30x20
            </Button>
          </MarkingToolbar>
        </div>

        {progress.label && (
          <div className="rounded-md border border-border bg-muted/20 p-3">
            <Progress
              value={progress.total > 0 ? (progress.processed / progress.total) * 100 : 0}
              label={progress.label}
              valueLabel={progress.total > 0 ? `${progress.processed}/${progress.total}` : undefined}
            />
          </div>
        )}
      </MarkingPanel>

      <MarkingTablePanel
        title="Заказы"
        maxHeight="max-h-[620px]"
        stats={
          <>
            <MarkingMetric label="Найдено" value={filteredItems.length} tone="secondary" />
            <MarkingMetric label="Показано" value={rows.shown} tone="neutral" />
          </>
        }
        actions={
          <SearchInput
            className="w-full sm:w-72"
            placeholder="Поиск"
            value={searchQuery}
            onChange={setSearchQuery}
          />
        }
      >
        {() => (
          <>
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-background">
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      isSelected={rows.visibleRows.length > 0 && rows.visibleRows.every((item) => selectedIds.has(item.document_id))}
                      onChange={() => toggleAll(visibleIds)}
                      aria-label="Выбрать все заказы"
                    />
                  </TableHead>
                  <TableHead>Заявка</TableHead>
                  <TableHead>Наименование</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead>GTIN</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                      Загрузка...
                    </TableCell>
                  </TableRow>
                ) : rows.visibleRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                      {searchQuery ? 'Нет заказов по запросу' : 'Нет заказов'}
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.visibleRows.map((item, index) => (
                    <TableRow
                      key={item.document_id}
                      className={selectedIds.has(item.document_id) ? 'bg-muted/60 hover:bg-muted/60' : 'hover:bg-muted/40'}
                      onClick={(event) => toggleOne(visibleIds, item.document_id, index, event.shiftKey)}
                    >
                      <TableCell>
                        <Checkbox
                          isSelected={selectedIds.has(item.document_id)}
                          isReadOnly
                          aria-label={`Выбрать заказ ${item.order_name}`}
                          onContentClick={(event) => {
                            event.stopPropagation()
                            toggleOne(visibleIds, item.document_id, index, event.shiftKey)
                          }}
                        />
                      </TableCell>
                      <TableCell className="min-w-44 font-medium">{item.order_name}</TableCell>
                      <TableCell className="min-w-80">{item.full_name || '—'}</TableCell>
                      <TableCell><MarkingStatusBadge status={item.status || '—'} /></TableCell>
                      <TableCell className="font-mono text-xs">{item.gtin || '—'}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            <MarkingLoadMore markerRef={rows.markerRef} hasMore={rows.hasMore} shown={rows.shown} total={rows.total} />
          </>
        )}
      </MarkingTablePanel>
      </div>

      <MarkingLogPanel
        agentUrl={agentUrl}
        channel="download"
        title="Лог загрузки кодов"
        description="Скачивание, синхронизация статусов и печать 30x20."
      />
    </div>
  )
}
