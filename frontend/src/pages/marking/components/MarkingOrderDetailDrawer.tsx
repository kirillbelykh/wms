import { useEffect, useState } from 'react'
import { Archive, Download, PackageCheck, Printer, RotateCcw } from 'lucide-react'
import { Dialog, DrawerContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input, SelectNative } from '@/components/ui/input'
import { formatDate } from '@/lib/utils'
import {
  type DownloadItem,
  type IntroItem,
  type MarkingOrderRecord,
} from '../api'
import { MarkingMetric, MarkingPanel, MarkingStatusBadge } from '../marking-ui'

type DrawerOrder = MarkingOrderRecord | IntroItem | DownloadItem

interface MarkingOrderDetailDrawerProps {
  agentUrl: string
  open: boolean
  onOpenChange: (open: boolean) => void
  order?: DrawerOrder | null
  archived?: boolean
  printers?: string[]
  defaultPrinter?: string
  onDownload?: (documentId: string) => Promise<unknown> | void
  onArchive?: (documentId: string) => Promise<unknown> | void
  onRestore?: (documentId: string) => Promise<unknown> | void
  onPrint?: (documentId: string, printerName: string, recordNumber?: string | null) => Promise<unknown> | void
  onOpenIntro?: (documentId: string, orderName: string) => void
  downloading?: boolean
  archiving?: boolean
  restoring?: boolean
  printing?: boolean
}

export function MarkingOrderDetailDrawer({
  agentUrl,
  open,
  onOpenChange,
  order,
  archived = false,
  printers = [],
  defaultPrinter = '',
  onDownload,
  onArchive,
  onRestore,
  onPrint,
  onOpenIntro,
  downloading = false,
  archiving = false,
  restoring = false,
  printing = false,
}: MarkingOrderDetailDrawerProps) {
  const [printerName, setPrinterName] = useState('')
  const [recordNumber, setRecordNumber] = useState('')

  useEffect(() => {
    if (!open) return
    setPrinterName(defaultPrinter)
    setRecordNumber('')
  }, [defaultPrinter, open, order?.document_id])

  if (!order) {
    return null
  }

  const effectivePrinter =
    printerName || (defaultPrinter && printers.includes(defaultPrinter) ? defaultPrinter : '')
  const orderWithCounts = order as unknown as Record<string, unknown>
  const codesCount = [
    orderWithCounts.requested_codes_count,
    orderWithCounts.codes_count,
    orderWithCounts.requestedCodesCount,
    orderWithCounts.codesCount,
    orderWithCounts.received_codes_count,
    orderWithCounts.receivedCodesCount,
  ].reduce<number | undefined>((max, value) => {
    const next = Number(value)
    if (!Number.isFinite(next)) return max
    return max === undefined ? next : Math.max(max, next)
  }, undefined)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DrawerContent title={order.order_name || 'Детали документа'} className="max-w-2xl">
        <div className="space-y-4">
          <MarkingPanel
            title={order.order_name || 'Документ'}
            description={order.full_name || 'Детали по документу маркировки и связанным операциям.'}
            stats={
              <>
                <MarkingMetric
                  label="ID"
                  value={order.document_id || '—'}
                  tone="secondary"
                />
                <MarkingMetric
                  label="Кодов"
                  value={codesCount ?? '—'}
                  tone="primary"
                />
                <MarkingMetric
                  label="Обновлен"
                  value={formatDate(('updated_at' in order && order.updated_at) || undefined)}
                  tone="neutral"
                />
              </>
            }
            actions={<MarkingStatusBadge status={order.status || '—'} />}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-border bg-muted/20 p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Основные данные
                </div>
                <div className="mt-3 space-y-2 text-sm">
                  <div>
                    <div className="text-muted-foreground">GTIN</div>
                    <div className="font-medium text-foreground">{order.gtin || '—'}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Создан</div>
                    <div className="font-medium text-foreground">
                      {formatDate(('created_at' in order && order.created_at) || undefined)}
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-muted/20 p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Операции
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {onDownload ? (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => void onDownload(order.document_id)}
                      disabled={downloading}
                    >
                      <Download className="h-4 w-4" />
                      {downloading ? 'Получаем...' : 'Получить коды'}
                    </Button>
                  ) : null}
                  {onOpenIntro ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => onOpenIntro(order.document_id, order.order_name)}
                    >
                      <PackageCheck className="h-4 w-4" />
                      Ввести в оборот
                    </Button>
                  ) : null}
                  {!archived && onArchive ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void onArchive(order.document_id)}
                      disabled={archiving}
                    >
                      <Archive className="h-4 w-4" />
                      {archiving ? 'Архивируем...' : 'В архив'}
                    </Button>
                  ) : null}
                  {archived && onRestore ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void onRestore(order.document_id)}
                      disabled={restoring}
                    >
                      <RotateCcw className="h-4 w-4" />
                      {restoring ? 'Возвращаем...' : 'Вернуть'}
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          </MarkingPanel>

          {onPrint && printers.length > 0 ? (
            <MarkingPanel
              title="Печать 30x20"
              description="Печать файлов маркировки по выбранному документу."
              className="border-sky-100"
            >
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_160px_auto]">
                <SelectNative
                  value={effectivePrinter}
                  onChange={(event) => setPrinterName(event.target.value)}
                >
                  <option value="">Выберите принтер</option>
                  {printers.map((printer) => (
                    <option key={printer} value={printer}>
                      {printer}
                    </option>
                  ))}
                </SelectNative>
                <Input
                  type="number"
                  min={1}
                  step={1}
                  value={recordNumber}
                  onChange={(event) => setRecordNumber(event.target.value)}
                  placeholder="№ этикетки"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void onPrint(order.document_id, effectivePrinter, recordNumber || null)}
                  disabled={!effectivePrinter || printing}
                >
                  <Printer className="h-4 w-4" />
                  {printing ? 'Печатаем...' : 'Напечатать'}
                </Button>
              </div>
            </MarkingPanel>
          ) : null}
        </div>
      </DrawerContent>
    </Dialog>
  )
}
