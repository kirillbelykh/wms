import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { toast } from '@/lib/toast'
import { Check, Printer, RefreshCw } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { DateInput } from '@/components/ui/date-picker'
import { Input, SelectNative } from '@/components/ui/input'
import { SearchInput } from '@/components/ui/search-input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import {
  inputDateValue,
  MarkingField,
  MarkingIconButton,
  MarkingMetric,
  MarkingPagination,
  MarkingStatusBadge,
  MarkingTableControls,
  MarkingTablePanel,
  usePaginatedRows,
} from '../marking-ui'
import { MarkingLogPanel } from '../components/MarkingLogPanel'
import {
  useMarkingTransientStatuses,
  type MarkingTransientStatusMap,
} from '../transient-state'
import { withAgentFetchOptions } from '../agentFetch'

interface LabelsSheetFormat {
  key: string
  label: string
}

interface LabelsTemplate {
  path: string
  name: string
  sheet_format: string
  sheet_format_label?: string
  category: string
  relative_path: string
  source_label?: string
  data_source_kind: string
}

interface LabelsFile {
  path: string
  name: string
  folder_name: string
  record_count: number
}

interface LabelsOrder {
  document_id: string
  order_name: string
  full_name: string
  gtin: string
  size: string
  batch: string
  status?: string
  codes_count?: number
  requested_codes_count?: number | null
  received_codes_count?: number | null
}

interface LabelsState {
  sheet_formats: LabelsSheetFormat[]
  default_sheet_format: string
  templates: LabelsTemplate[]
  aggregation_files: LabelsFile[]
  marking_files: LabelsFile[]
  orders: LabelsOrder[]
  printers: string[]
  default_printer: string
}

type LabelsSourceKind = 'aggregation' | 'marking'

interface LabelsTabProps {
  agentUrl: string
}

function renderSelectionBadge(selected: boolean) {
  return selected ? <Check className="h-4 w-4 text-primary" /> : null
}

function normalizeOrderMatchValue(value?: string | null) {
  return String(value || '').trim().toLowerCase()
}

function isSyntheticOrderId(documentId: string) {
  return documentId.startsWith('pending:')
}

function getCodesCount(order: LabelsOrder) {
  const values = [
    order.requested_codes_count,
    order.codes_count,
    order.received_codes_count,
    (order as { requestedCodesCount?: number | string | null }).requestedCodesCount,
    (order as { codesCount?: number | string | null }).codesCount,
  ]

  return values.reduce<number>((max, value) => {
    const next = Number(value)
    return Number.isFinite(next) ? Math.max(max, next) : max
  }, 0)
}

function buildLabelOrdersWithTransientState(
  orders: LabelsOrder[],
  transientStatuses: MarkingTransientStatusMap,
) {
  const transientByDocumentId: MarkingTransientStatusMap = {}
  const syntheticOrders: LabelsOrder[] = []

  Object.entries(transientStatuses).forEach(([documentId, status]) => {
    const directOrder = orders.find((order) => order.document_id === documentId)
    if (directOrder) {
      transientByDocumentId[directOrder.document_id] = status
      return
    }

    const matchValue = normalizeOrderMatchValue(status.matchValue)
    if (matchValue) {
      const matchedOrder = orders.find(
        (order) => normalizeOrderMatchValue(order.order_name) === matchValue,
      )
      if (matchedOrder) {
        transientByDocumentId[matchedOrder.document_id] = status
        return
      }
    }

    if (!status.row?.orderName) {
      return
    }

    syntheticOrders.push({
      document_id: documentId,
      order_name: status.row.orderName,
      full_name: status.row.fullName || '',
      gtin: status.row.gtin || '',
      size: '',
      batch: '',
      status: status.row.status || status.label,
      codes_count: status.row.codesCount ?? 0,
      requested_codes_count: status.row.requestedCodesCount ?? status.row.codesCount ?? 0,
    })
  })

  return {
    orders: [...syntheticOrders, ...orders],
    transientByDocumentId,
  }
}

export function LabelsTab({ agentUrl }: LabelsTabProps) {
  const transientStatuses = useMarkingTransientStatuses('turnover', agentUrl).data
  const [selectedOrderId, setSelectedOrderId] = useState('')
  const [orderSearch, setOrderSearch] = useState('')
  const [printDialogOpen, setPrintDialogOpen] = useState(false)
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false)
  const [filePickerOpen, setFilePickerOpen] = useState(false)

  const [selectedSourceKind, setSelectedSourceKind] = useState<LabelsSourceKind>('marking')
  const [selectedSheetFormat, setSelectedSheetFormat] = useState('')
  const [selectedPrinter, setSelectedPrinter] = useState('')
  const [selectedTemplatePath, setSelectedTemplatePath] = useState('')
  const [selectedAggregationPath, setSelectedAggregationPath] = useState('')
  const [selectedMarkingPath, setSelectedMarkingPath] = useState('')

  const [manufactureDate, setManufactureDate] = useState(() => inputDateValue())
  const [expirationDate, setExpirationDate] = useState(() => inputDateValue(2))
  const [quantityValue, setQuantityValue] = useState('')
  const [printScope, setPrintScope] = useState<'all' | 'single' | 'range'>('all')
  const [recordNumber, setRecordNumber] = useState(1)
  const [rangeStart, setRangeStart] = useState(1)
  const [rangeEnd, setRangeEnd] = useState(1)

  const [manualEnabled, setManualEnabled] = useState(false)
  const [manualPrompt, setManualPrompt] = useState('')
  const [manualFields, setManualFields] = useState({
    gtin: '',
    size: '',
    batch: '',
    color: '',
    units_per_pack: '',
  })

  const [templateSearch, setTemplateSearch] = useState('')
  const [fileSearch, setFileSearch] = useState('')

  const {
    data: labelsState,
    isLoading,
    isFetching,
    refetch: refetchLabels,
  } = useQuery<LabelsState>({
    queryKey: ['labels-state', agentUrl],
    queryFn: async () => {
      const res = await fetch(`${agentUrl}/api/call/get_labels_state`, withAgentFetchOptions(agentUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ args: [] }),
      }))
      if (!res.ok) throw new Error('Failed to fetch labels state')
      return res.json()
    },
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })

  const sheetFormats = labelsState?.sheet_formats || []
  const defaultSheetFormat = labelsState?.default_sheet_format || '100x180'
  const templates = labelsState?.templates || []
  const aggregationFiles = labelsState?.aggregation_files || []
  const markingFiles = labelsState?.marking_files || []
  const orders = labelsState?.orders || []
  const printers = labelsState?.printers || []
  const defaultPrinter = labelsState?.default_printer || ''

  const effectiveSheetFormat = selectedSheetFormat || defaultSheetFormat
  const effectivePrinter = selectedPrinter || defaultPrinter
  const activeFiles = selectedSourceKind === 'aggregation' ? aggregationFiles : markingFiles

  const filteredTemplates = useMemo(() => {
    const query = templateSearch.trim().toLowerCase()
    return templates.filter((template) => {
      if (!query) return true
      return [template.name, template.category, template.relative_path]
        .join(' ')
        .toLowerCase()
        .includes(query)
    })
  }, [templateSearch, templates])

  const filteredFiles = useMemo(() => {
    const query = fileSearch.trim().toLowerCase()
    return activeFiles.filter((file) => {
      if (!query) return true
      return [file.name, file.path].join(' ').toLowerCase().includes(query)
    })
  }, [activeFiles, fileSearch])

  const ordersWithTransientState = useMemo(
    () => buildLabelOrdersWithTransientState(orders, transientStatuses),
    [orders, transientStatuses],
  )
  const visibleOrders = ordersWithTransientState.orders
  const transientByDocumentId = ordersWithTransientState.transientByDocumentId

  const filteredOrders = useMemo(() => {
    const query = orderSearch.trim().toLowerCase()
    if (!query) return visibleOrders
    return visibleOrders.filter((order) =>
      [
        order.order_name,
        order.full_name,
        order.gtin,
        order.size,
        order.batch,
        order.status,
        order.document_id,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(query),
    )
  }, [orderSearch, visibleOrders])

  const orderRows = usePaginatedRows(filteredOrders, 30)
  const templateRows = usePaginatedRows(filteredTemplates, 20)
  const fileRows = usePaginatedRows(filteredFiles, 20)

  const selectedOrder =
    visibleOrders.find((order) => order.document_id === selectedOrderId) || null
  const selectedTemplate =
    filteredTemplates.find((template) => template.path === selectedTemplatePath) ||
    templates.find((template) => template.path === selectedTemplatePath) ||
    null
  const selectedFilePath =
    selectedSourceKind === 'aggregation' ? selectedAggregationPath : selectedMarkingPath
  const selectedFile =
    activeFiles.find((file) => file.path === selectedFilePath) ||
    (selectedSourceKind === 'aggregation'
      ? aggregationFiles.find((file) => file.path === selectedAggregationPath)
      : markingFiles.find((file) => file.path === selectedMarkingPath)) ||
    null

  useEffect(() => {
    const hasSelectedRealOrder =
      selectedOrderId &&
      visibleOrders.some(
        (order) =>
          order.document_id === selectedOrderId && !isSyntheticOrderId(order.document_id),
      )

    if (!hasSelectedRealOrder) {
      const firstRealOrder = visibleOrders.find(
        (order) => !isSyntheticOrderId(order.document_id),
      )
      setSelectedOrderId(firstRealOrder?.document_id || '')
    }
  }, [selectedOrderId, visibleOrders])

  const openPrintDialog = () => {
    if (!selectedOrderId) {
      toast.error('Выберите документ для печати')
      return
    }
    if (selectedOrder && isSyntheticOrderId(selectedOrder.document_id)) {
      toast.error('Дождитесь завершения операции')
      return
    }
    setPrintDialogOpen(true)
  }

  const printMutation = useMutation({
    mutationFn: async () => {
      if (!selectedOrderId) {
        throw new Error('Выберите документ')
      }
      if (!selectedTemplatePath) {
        throw new Error('Выберите шаблон')
      }
      if (!selectedFilePath) {
        throw new Error(selectedSourceKind === 'aggregation' ? 'Выберите агрегаты' : 'Выберите коды')
      }

      const payload = {
        args: [
          {
            sheet_format: effectiveSheetFormat,
            document_id: selectedOrderId,
            template_path: selectedTemplatePath,
            csv_path: selectedFilePath,
            printer_name: effectivePrinter,
            manufacture_date: manufactureDate || null,
            expiration_date: expirationDate || null,
            quantity_value: quantityValue || null,
            print_scope: printScope,
            record_number: printScope === 'single' ? recordNumber : null,
            range_start: printScope === 'range' ? rangeStart : null,
            range_end: printScope === 'range' ? rangeEnd : null,
            manual_override: manualEnabled
              ? {
                  enabled: true,
                  gtin: manualFields.gtin,
                  size: manualFields.size,
                  batch: manualFields.batch,
                  color: manualFields.color,
                  units_per_pack: manualFields.units_per_pack,
                }
              : null,
          },
        ],
      }

      const res = await fetch(`${agentUrl}/api/call/print_100x180_label`, withAgentFetchOptions(agentUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }))
      if (!res.ok) throw new Error('Failed to print')
      return res.json()
    },
    onMutate: () => {
      toast.info('Печать запускается')
    },
    onSuccess: (data) => {
      if (data.needs_manual_input) {
        setManualEnabled(true)
        setManualPrompt(data.prompt || 'Заполните поля вручную')
        setManualFields({
          gtin: data.manual_form?.fields?.gtin || '',
          size: data.manual_form?.fields?.size || '',
          batch: data.manual_form?.fields?.batch || '',
          color: data.manual_form?.fields?.color || '',
          units_per_pack: data.manual_form?.fields?.units_per_pack || '',
        })
        toast.info(data.prompt || 'Заполните поля вручную')
        return
      }

      setManualEnabled(false)
      setManualPrompt('')
      toast.success('Печать запущена')
      setPrintDialogOpen(false)
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  return (
    <div className="space-y-4">
      <MarkingTablePanel
        title="Печать этикеток"
        maxHeight="max-h-[720px]"
        actions={
          <MarkingTableControls
            filters={
              <>
                <SearchInput
                  className="w-full sm:w-72"
                  placeholder="Поиск по документу, номенклатуре, GTIN"
                  value={orderSearch}
                  onChange={setOrderSearch}
                />
                <MarkingIconButton
                  label="Обновить"
                  onClick={() => void refetchLabels()}
                  disabled={isFetching}
                >
                  <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
                </MarkingIconButton>
              </>
            }
            metrics={
              <>
                <MarkingMetric label="Найдено" value={filteredOrders.length} tone="secondary" />
                <MarkingMetric label="Показано" value={orderRows.shown} tone="neutral" />
                <MarkingMetric
                  label="Выбран"
                  value={selectedOrder ? selectedOrder.order_name : '—'}
                  tone={selectedOrder ? 'primary' : 'neutral'}
                />
              </>
            }
            actions={
              <MarkingIconButton label="Выполнить печать" variant="default" onClick={openPrintDialog}>
                <Printer className="h-4 w-4" />
              </MarkingIconButton>
            }
          />
        }
      >
        {() => (
          <>
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-background">
                <TableRow>
                  <TableHead className="w-10" />
                  <TableHead>Документ</TableHead>
                  <TableHead>GTIN</TableHead>
                  <TableHead>Размер</TableHead>
                  <TableHead>Партия</TableHead>
                  <TableHead className="text-right">Кодов</TableHead>
                  <TableHead>Статус</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                      Загрузка документов...
                    </TableCell>
                  </TableRow>
                ) : orderRows.visibleRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                      Нет документов для печати
                    </TableCell>
                  </TableRow>
                ) : (
                  orderRows.visibleRows.map((order) => {
                    const isSelected = selectedOrderId === order.document_id
                    const isSynthetic = isSyntheticOrderId(order.document_id)
                    const transientStatus = transientByDocumentId[order.document_id]

                    return (
                      <TableRow
                        key={order.document_id}
                        className={cn(
                          isSynthetic ? 'cursor-default' : 'cursor-pointer hover:bg-muted/40',
                          isSelected && 'bg-muted/60 hover:bg-muted/60',
                        )}
                        onClick={() => {
                          if (isSynthetic) return
                          setSelectedOrderId(order.document_id)
                        }}
                      >
                        <TableCell onClick={(event) => event.stopPropagation()}>
                          {isSynthetic ? null : (
                            <Checkbox
                              isSelected={isSelected}
                              isReadOnly
                              aria-label={`Выбрать заказ ${order.order_name}`}
                              onContentClick={(event) => {
                                event.stopPropagation()
                                setSelectedOrderId(order.document_id)
                              }}
                            />
                          )}
                        </TableCell>
                        <TableCell className="min-w-0">
                          <div className="min-w-[18rem]">
                            <div className="font-medium text-foreground">{order.order_name}</div>
                            <div className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                              {order.full_name || 'Без описания'}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{order.gtin || '—'}</TableCell>
                        <TableCell>{order.size || '—'}</TableCell>
                        <TableCell>{order.batch || '—'}</TableCell>
                        <TableCell className="text-right font-medium">{getCodesCount(order)}</TableCell>
                        <TableCell>
                          {transientStatus || order.status ? (
                            <MarkingStatusBadge
                              status={order.status || '—'}
                              label={transientStatus?.label}
                              pending={transientStatus?.spinning}
                            />
                          ) : (
                            <span className="text-sm text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
            <MarkingPagination
              page={orderRows.page}
              totalPages={orderRows.totalPages}
              shown={orderRows.shown}
              total={orderRows.total}
              from={orderRows.from}
              to={orderRows.to}
              onPageChange={orderRows.setPage}
            />
          </>
        )}
      </MarkingTablePanel>

      <details className="rounded-2xl border border-border bg-card">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium">
          История
        </summary>
        <div className="border-t border-border p-4">
          <MarkingLogPanel agentUrl={agentUrl} channel="labels" title="Печать этикеток" />
        </div>
      </details>

      <Dialog open={printDialogOpen} onOpenChange={setPrintDialogOpen}>
        <DialogContent title="Выполнить печать" className="max-w-3xl">
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <MarkingMetric
                label="Документ"
                value={selectedOrder?.order_name || 'Не выбран'}
                tone={selectedOrder ? 'primary' : 'neutral'}
              />
            </div>

            <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted/50 p-1">
              <button
                type="button"
                className="btn-source-kind relative h-10 overflow-hidden rounded-lg px-3 text-sm font-medium transition-colors"
                onClick={() => setSelectedSourceKind('aggregation')}
                aria-pressed={selectedSourceKind === 'aggregation'}
              >
                {selectedSourceKind === 'aggregation' ? (
                  <motion.span
                    layoutId="labels-source-kind"
                    className="absolute inset-0 rounded-lg bg-slate-200/80 dark:bg-slate-800"
                    transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                  />
                ) : null}
                <span
                  className={cn(
                    'relative z-10 flex h-full items-center justify-center',
                    selectedSourceKind === 'aggregation' ? 'text-foreground' : 'text-muted-foreground',
                  )}
                >
                  Агрегаты
                </span>
              </button>
              <button
                type="button"
                className="btn-source-kind relative h-10 overflow-hidden rounded-lg px-3 text-sm font-medium transition-colors"
                onClick={() => setSelectedSourceKind('marking')}
                aria-pressed={selectedSourceKind === 'marking'}
              >
                {selectedSourceKind === 'marking' ? (
                  <motion.span
                    layoutId="labels-source-kind"
                    className="absolute inset-0 rounded-lg bg-slate-200/80 dark:bg-slate-800"
                    transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                  />
                ) : null}
                <span
                  className={cn(
                    'relative z-10 flex h-full items-center justify-center',
                    selectedSourceKind === 'marking' ? 'text-foreground' : 'text-muted-foreground',
                  )}
                >
                  Коды маркировки
                </span>
              </button>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <MarkingField label="Формат">
                <SelectNative
                  value={effectiveSheetFormat}
                  onChange={(event) => {
                    setSelectedSheetFormat(event.target.value)
                    setSelectedTemplatePath('')
                  }}
                >
                  <option value="">Выберите формат</option>
                  {sheetFormats.map((format) => (
                    <option key={format.key} value={format.key}>
                      {format.label}
                    </option>
                  ))}
                </SelectNative>
              </MarkingField>
              <MarkingField label="Принтер">
                <SelectNative value={effectivePrinter} onChange={(event) => setSelectedPrinter(event.target.value)}>
                  <option value="">Выберите принтер</option>
                  {printers.map((printer) => (
                    <option key={printer} value={printer}>
                      {printer}
                    </option>
                  ))}
                </SelectNative>
              </MarkingField>
              <MarkingField label="Дата изготовления">
                <DateInput value={manufactureDate} onChange={setManufactureDate} aria-label="Дата изготовления" />
              </MarkingField>
              <MarkingField label="Срок годности">
                <DateInput value={expirationDate} onChange={setExpirationDate} aria-label="Срок годности" />
              </MarkingField>
              <MarkingField label="Количество">
                <Input
                  type="number"
                  min={1}
                  value={quantityValue}
                  onChange={(event) => setQuantityValue(event.target.value)}
                  placeholder="При необходимости"
                />
              </MarkingField>
              <MarkingField label="Режим печати">
                <SelectNative
                  value={printScope}
                  onChange={(event) => setPrintScope(event.target.value as 'all' | 'single' | 'range')}
                >
                  <option value="all">Весь файл</option>
                  <option value="single">Одна этикетка</option>
                  <option value="range">Диапазон</option>
                </SelectNative>
              </MarkingField>
              {printScope === 'single' ? (
                <MarkingField label="Номер записи">
                  <Input
                    type="number"
                    min={1}
                    value={recordNumber}
                    onChange={(event) => setRecordNumber(Number(event.target.value) || 1)}
                  />
                </MarkingField>
              ) : null}
              {printScope === 'range' ? (
                <>
                  <MarkingField label="С">
                    <Input
                      type="number"
                      min={1}
                      value={rangeStart}
                      onChange={(event) => setRangeStart(Number(event.target.value) || 1)}
                    />
                  </MarkingField>
                  <MarkingField label="По">
                    <Input
                      type="number"
                      min={1}
                      value={rangeEnd}
                      onChange={(event) => setRangeEnd(Number(event.target.value) || 1)}
                    />
                  </MarkingField>
                </>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => setTemplatePickerOpen(true)}>
                Выбрать шаблон
              </Button>
              <Button type="button" variant="outline" onClick={() => setFilePickerOpen(true)}>
                {selectedSourceKind === 'aggregation' ? 'Выбрать агрегаты' : 'Выбрать коды'}
              </Button>
            </div>

            <div className="flex flex-wrap gap-2">
              <Badge tone={selectedTemplate ? 'info' : 'secondary'}>
                {selectedTemplate ? selectedTemplate.name : 'Шаблон не выбран'}
              </Badge>
              <Badge tone={selectedFile ? 'info' : 'secondary'}>
                {selectedFile ? `${selectedFile.name} (${selectedFile.record_count})` : 'Файл не выбран'}
              </Badge>
            </div>

            {manualEnabled ? (
              <div className="space-y-3 rounded-2xl border border-border bg-muted/20 p-4">
                <div className="text-sm font-medium text-foreground">
                  {manualPrompt || 'Заполните поля вручную'}
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <MarkingField label="GTIN">
                    <Input
                      value={manualFields.gtin}
                      onChange={(event) =>
                        setManualFields((current) => ({ ...current, gtin: event.target.value }))
                      }
                    />
                  </MarkingField>
                  <MarkingField label="Размер">
                    <Input
                      value={manualFields.size}
                      onChange={(event) =>
                        setManualFields((current) => ({ ...current, size: event.target.value }))
                      }
                    />
                  </MarkingField>
                  <MarkingField label="Партия">
                    <Input
                      value={manualFields.batch}
                      onChange={(event) =>
                        setManualFields((current) => ({ ...current, batch: event.target.value }))
                      }
                    />
                  </MarkingField>
                  <MarkingField label="Цвет">
                    <Input
                      value={manualFields.color}
                      onChange={(event) =>
                        setManualFields((current) => ({ ...current, color: event.target.value }))
                      }
                    />
                  </MarkingField>
                  <MarkingField label="Ед. в упаковке">
                    <Input
                      value={manualFields.units_per_pack}
                      onChange={(event) =>
                        setManualFields((current) => ({ ...current, units_per_pack: event.target.value }))
                      }
                    />
                  </MarkingField>
                </div>
              </div>
            ) : null}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setPrintDialogOpen(false)}>
                Отмена
              </Button>
              <Button type="button" onClick={() => printMutation.mutate()} disabled={printMutation.isPending}>
                <Printer className="h-4 w-4" />
                {printMutation.isPending ? 'Печать...' : 'Выполнить печать'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={templatePickerOpen} onOpenChange={setTemplatePickerOpen}>
        <DialogContent title="Выбрать шаблон" className="max-w-3xl">
          <div className="space-y-4">
            <SearchInput
              placeholder="Поиск шаблона"
              value={templateSearch}
              onChange={setTemplateSearch}
            />
            <div className="overflow-hidden rounded-2xl border border-border">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-background">
                  <TableRow>
                    <TableHead className="w-10" />
                    <TableHead>Шаблон</TableHead>
                    <TableHead>Источник</TableHead>
                    <TableHead>Путь</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {templateRows.visibleRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                        Нет подходящих шаблонов
                      </TableCell>
                    </TableRow>
                  ) : (
                    templateRows.visibleRows.map((template) => {
                      const isSelected = selectedTemplatePath === template.path
                      return (
                        <TableRow
                          key={template.path}
                          className={cn(
                            'cursor-pointer hover:bg-muted/40',
                            isSelected && 'bg-muted/60 hover:bg-muted/60',
                          )}
                          onClick={() => {
                            setSelectedTemplatePath(template.path)
                            setTemplatePickerOpen(false)
                          }}
                        >
                          <TableCell>{renderSelectionBadge(isSelected)}</TableCell>
                          <TableCell className="font-medium">{template.name}</TableCell>
                          <TableCell>{template.category}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {template.relative_path}
                          </TableCell>
                        </TableRow>
                      )
                    })
                  )}
                </TableBody>
              </Table>
              <MarkingPagination
                page={templateRows.page}
                totalPages={templateRows.totalPages}
                shown={templateRows.shown}
                total={templateRows.total}
                from={templateRows.from}
                to={templateRows.to}
                onPageChange={templateRows.setPage}
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={filePickerOpen} onOpenChange={setFilePickerOpen}>
        <DialogContent
          title={selectedSourceKind === 'aggregation' ? 'Выбрать агрегаты' : 'Выбрать коды'}
          className="max-w-3xl"
        >
          <div className="space-y-4">
            <SearchInput
              placeholder="Поиск файла"
              value={fileSearch}
              onChange={setFileSearch}
            />
            <div className="overflow-hidden rounded-2xl border border-border">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-background">
                  <TableRow>
                    <TableHead className="w-10" />
                    <TableHead>Файл</TableHead>
                    <TableHead>Папка</TableHead>
                    <TableHead className="text-right">Записей</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fileRows.visibleRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                        Нет файлов для выбора
                      </TableCell>
                    </TableRow>
                  ) : (
                    fileRows.visibleRows.map((file) => {
                      const isSelected = selectedFilePath === file.path
                      return (
                        <TableRow
                          key={file.path}
                          className={cn(
                            'cursor-pointer hover:bg-muted/40',
                            isSelected && 'bg-muted/60 hover:bg-muted/60',
                          )}
                          onClick={() => {
                            if (selectedSourceKind === 'aggregation') {
                              setSelectedAggregationPath(file.path)
                            } else {
                              setSelectedMarkingPath(file.path)
                            }
                            setFilePickerOpen(false)
                          }}
                        >
                          <TableCell>{renderSelectionBadge(isSelected)}</TableCell>
                          <TableCell className="font-medium">{file.name}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {file.folder_name}
                          </TableCell>
                          <TableCell className="text-right">{file.record_count}</TableCell>
                        </TableRow>
                      )
                    })
                  )}
                </TableBody>
              </Table>
              <MarkingPagination
                page={fileRows.page}
                totalPages={fileRows.totalPages}
                shown={fileRows.shown}
                total={fileRows.total}
                from={fileRows.from}
                to={fileRows.to}
                onPageChange={fileRows.setPage}
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
