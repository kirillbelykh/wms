import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from '@/lib/toast'
import { Play } from 'lucide-react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { DateInput } from '@/components/ui/date-picker'
import { Input } from '@/components/ui/input'
import { formatDateInputValue } from '@/lib/utils'
import { MarkingField, MarkingMetric, MarkingPanel } from '../marking-ui'
import { introduceOrders } from '../api'
import {
  clearMarkingTransientStatuses,
  setMarkingTransientStatuses,
} from '../transient-state'

function yearsFromNow(offsetYears: number) {
  const value = new Date()
  value.setFullYear(value.getFullYear() + offsetYears)
  return formatDateInputValue(value)
}

interface MarkingIntroDialogProps {
  agentUrl: string
  open: boolean
  onOpenChange: (open: boolean) => void
  documentIds: string[]
  documentNames?: string[]
  onSuccess?: () => Promise<void> | void
}

export function MarkingIntroDialog({
  agentUrl,
  open,
  onOpenChange,
  documentIds,
  documentNames = [],
  onSuccess,
}: MarkingIntroDialogProps) {
  const queryClient = useQueryClient()
  const [productionDate, setProductionDate] = useState(() => formatDateInputValue(new Date()))
  const [expirationDate, setExpirationDate] = useState(() => yearsFromNow(2))
  const [batchNumber, setBatchNumber] = useState('')

  useEffect(() => {
    if (!open) return
    setProductionDate(formatDateInputValue(new Date()))
    setExpirationDate(yearsFromNow(2))
    setBatchNumber('')
  }, [open])

  const uniqueNames = useMemo(
    () => Array.from(new Set(documentNames.filter(Boolean))).slice(0, 4),
    [documentNames],
  )

  const introduceMutation = useMutation({
    mutationFn: async () => {
      if (!documentIds.length) {
        throw new Error('Не выбраны документы для ввода в оборот')
      }

      return introduceOrders(
        agentUrl,
        documentIds,
        productionDate,
        expirationDate,
        batchNumber,
      )
    },
    onMutate: () => {
      setMarkingTransientStatuses(queryClient, 'turnover', agentUrl, documentIds, {
        label: 'Вводим в оборот...',
        spinning: true,
      })
      toast.info('Ввод в оборот выполняется')
    },
    onSuccess: async (payload) => {
      const errors = payload.errors || []
      const results = payload.results || []

      if (errors.length > 0) {
        toast.warning(`Ввод выполнен частично: ${results.length}/${documentIds.length}`)
      } else {
        toast.success(`Ввод в оборот выполнен: ${results.length || documentIds.length}`)
      }

      onOpenChange(false)
      await onSuccess?.()
      clearMarkingTransientStatuses(queryClient, 'turnover', agentUrl, documentIds)
    },
    onError: (error: Error) => {
      clearMarkingTransientStatuses(queryClient, 'turnover', agentUrl, documentIds)
      toast.error(error.message)
    },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Ввод в оборот" className="max-w-2xl">
        <div className="space-y-4">
          <MarkingPanel
            title="Параметры документа"
            description="Параметры применятся ко всем выбранным заказам кодов."
            stats={
              <>
                <MarkingMetric label="Документов" value={documentIds.length} tone="primary" />
                {uniqueNames[0] ? (
                  <MarkingMetric label="Первый документ" value={uniqueNames[0]} tone="secondary" />
                ) : null}
              </>
            }
          >
            <div className="grid gap-3 md:grid-cols-3">
              <MarkingField label="Дата производства">
                <DateInput
                  value={productionDate}
                  onChange={setProductionDate}
                  aria-label="Дата производства"
                />
              </MarkingField>
              <MarkingField label="Срок годности">
                <DateInput
                  value={expirationDate}
                  onChange={setExpirationDate}
                  aria-label="Срок годности"
                />
              </MarkingField>
              <MarkingField label="Номер партии">
                <Input
                  value={batchNumber}
                  onChange={(event) => setBatchNumber(event.target.value)}
                  placeholder="Введите номер партии"
                />
              </MarkingField>
            </div>
          </MarkingPanel>

          {uniqueNames.length > 0 ? (
            <div className="rounded-2xl border border-border bg-muted/20 p-4">
              <div className="text-sm font-medium text-foreground">Документы</div>
              <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                {uniqueNames.map((name) => (
                  <div key={name}>{name}</div>
                ))}
                {documentNames.length > uniqueNames.length ? (
                  <div>И еще {documentNames.length - uniqueNames.length}</div>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={introduceMutation.isPending}
            >
              Отмена
            </Button>
            <Button
              type="button"
              onClick={() => introduceMutation.mutate()}
              disabled={introduceMutation.isPending || documentIds.length === 0}
            >
              <Play className="h-4 w-4" />
              {introduceMutation.isPending ? 'Выполняется...' : 'Выполнить'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
