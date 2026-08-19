import type { ReactNode, RefObject } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, LoaderCircle, Maximize2, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button, type ButtonProps } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export type MarkingTone = 'neutral' | 'success' | 'warning' | 'danger' | 'primary' | 'secondary' | 'info'

export function markingStatusTone(status?: string | null): MarkingTone {
  const lower = String(status || '').toLowerCase()

  if (
    lower.includes('архив') ||
    lower.includes('archive') ||
    lower.includes('cancelled') ||
    lower.includes('отмен')
  ) {
    return 'neutral'
  }

  if (
    lower.includes('ошибка') ||
    lower.includes('error') ||
    lower.includes('failed') ||
    lower.includes('отказ') ||
    lower.includes('reject')
  ) {
    return 'danger'
  }

  if (
    lower.includes('готов') ||
    lower.includes('ready') ||
    lower.includes('completed') ||
    lower.includes('скачан') ||
    lower.includes('загружен') ||
    lower.includes('доступен') ||
    lower.includes('зарегистрирован') ||
    lower.includes('введен') ||
    lower.includes('введён') ||
    lower.includes('в обороте') ||
    lower.includes('на тсд') ||
    lower.includes('approved') ||
    lower.includes('заверш') ||
    lower.includes('выполн')
  ) {
    return 'success'
  }

  if (
    lower.includes('ожидает') ||
    lower.includes('ожидание') ||
    lower.includes('процесс') ||
    lower.includes('обработка') ||
    lower.includes('скачива') ||
    lower.includes('вводим') ||
    lower.includes('проведени') ||
    lower.includes('создан') ||
    lower.includes('созда') ||
    lower.includes('очеред') ||
    lower.includes('pending') ||
    lower.includes('queued') ||
    lower.includes('acknowledged') ||
    lower.includes('в работе') ||
    lower.includes('подготов')
  ) {
    return 'warning'
  }

  return 'secondary'
}

export function MarkingStatusBadge({
  status,
  label,
  pending = false,
}: {
  status?: string | null
  label?: string | null
  pending?: boolean
}) {
  const content = label || status || '-'

  return (
    <Badge tone={pending ? 'warning' : markingStatusTone(content)}>
      {pending ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : null}
      {content}
    </Badge>
  )
}

export function MarkingPanel({
  title,
  description,
  actions,
  stats,
  children,
  className,
  contentClassName,
}: {
  title?: ReactNode
  description?: ReactNode
  actions?: ReactNode
  stats?: ReactNode
  children: ReactNode
  className?: string
  contentClassName?: string
}) {
  return (
    <Card className={cn('overflow-hidden', className)}>
      <Card.Content className={cn('space-y-4 pt-5', contentClassName)}>
        {(title || actions || description || stats) && (
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 space-y-1">
              {title && <h3 className="truncate text-base font-medium text-foreground">{title}</h3>}
              {description && <div className="text-sm leading-5 text-muted-foreground">{description}</div>}
              {stats && <div className="flex flex-wrap gap-2 pt-1">{stats}</div>}
            </div>
            {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
          </div>
        )}
        {children}
      </Card.Content>
    </Card>
  )
}

export function MarkingField({
  label,
  children,
  className,
}: {
  label: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <label className={cn('block space-y-1.5 text-sm font-medium text-foreground', className)}>
      <span>{label}</span>
      {children}
    </label>
  )
}

export function MarkingMetric({ label, value, tone = 'neutral' }: { label: string; value: ReactNode; tone?: MarkingTone }) {
  return (
    <Badge tone={tone} className="gap-1 whitespace-nowrap">
      <span className="text-muted-foreground/80">{label}</span>
      <span>{value}</span>
    </Badge>
  )
}

export function MarkingToolbar({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex flex-wrap items-center gap-2', className)}>{children}</div>
}

export function MarkingTableControls({
  filters,
  metrics,
  actions,
  className,
}: {
  filters?: ReactNode
  metrics?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('space-y-3', className)}>
      {(filters || metrics) ? (
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-2">{filters}</div>
          {metrics ? <div className="flex flex-wrap items-center gap-2 lg:justify-end">{metrics}</div> : null}
        </div>
      ) : null}
      {actions ? <div className="flex flex-wrap items-center justify-center gap-2">{actions}</div> : null}
    </div>
  )
}

export function MarkingIconButton({
  label,
  children,
  className,
  title,
  variant = 'outline',
  ...props
}: Omit<ButtonProps, 'children' | 'size'> & {
  label: string
  children: ReactNode
}) {
  return (
    <Button
      type="button"
      variant={variant}
      size="sm"
      className={cn('h-10 min-w-10 px-3', className)}
      aria-label={label}
      title={title || label}
      {...props}
    >
      {children}
      <span>{label}</span>
    </Button>
  )
}

export function MarkingEmpty({ children = 'Нет данных', className }: { children?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex min-h-28 items-center justify-center rounded-md border border-dashed border-border bg-muted/20 px-4 text-center text-sm text-muted-foreground', className)}>
      {children}
    </div>
  )
}

export function MarkingLoadMore({
  markerRef,
  hasMore,
  shown,
  total,
}: {
  markerRef?: RefObject<HTMLDivElement | null>
  hasMore: boolean
  shown: number
  total: number
}) {
  if (total === 0) {
    return null
  }

  return (
    <div ref={markerRef} className="flex h-12 items-center justify-center border-t border-border bg-muted/10 text-xs text-muted-foreground">
      {hasMore ? 'Загрузка следующих строк...' : `Показано ${shown} из ${total}`}
    </div>
  )
}

export function MarkingPagination({
  page,
  totalPages,
  shown,
  total,
  from,
  to,
  onPageChange,
}: {
  page: number
  totalPages: number
  shown: number
  total: number
  from: number
  to: number
  onPageChange: (page: number) => void
}) {
  if (total === 0) {
    return null
  }

  return (
    <div className="flex flex-col gap-2 border-t border-border bg-muted/10 px-3 py-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
      <span>
        Показано {from}-{to} из {total}
      </span>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 px-2"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          aria-label="Предыдущая страница"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="min-w-20 text-center">
          {page}/{totalPages}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 px-2"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          aria-label="Следующая страница"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      <span className="sr-only">На странице {shown} строк</span>
    </div>
  )
}

export function MarkingTableViewport({
  children,
  fullscreen = false,
  maxHeight = 'max-h-[600px]',
}: {
  children: ReactNode
  fullscreen?: boolean
  maxHeight?: string
}) {
  return (
    <div
      className={cn(
        'overflow-auto rounded-md border border-border bg-card',
        fullscreen ? 'h-[calc(100vh-10rem)] max-h-none' : maxHeight,
      )}
    >
      {children}
    </div>
  )
}

export function MarkingTablePanel({
  title,
  description,
  actions,
  stats,
  footer,
  children,
  className,
  maxHeight,
}: {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  stats?: ReactNode
  footer?: ReactNode
  children: (context: { fullscreen: boolean }) => ReactNode
  className?: string
  maxHeight?: string
}) {
  const [fullscreen, setFullscreen] = useState(false)

  const fullScreenButton = (
    <Button variant="outline" size="sm" onClick={() => setFullscreen(true)} aria-label="Открыть таблицу на весь экран">
      <Maximize2 className="h-4 w-4" />
    </Button>
  )

  return (
    <>
      <Card className={cn('overflow-hidden', className)}>
        <Card.Content className="space-y-4 pt-5">
          {(title || description) ? (
            <div className="space-y-1">
              {title ? <h3 className="truncate text-base font-medium text-foreground">{title}</h3> : null}
              {description ? <div className="text-sm leading-5 text-muted-foreground">{description}</div> : null}
            </div>
          ) : null}

          {(actions || fullScreenButton) ? (
            <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
              {actions ? <div className="min-w-0 flex-1">{actions}</div> : <div />}
              <div className="flex shrink-0 items-center gap-2 md:justify-end">
                {fullScreenButton}
              </div>
            </div>
          ) : null}

          {stats ? <div className="flex flex-wrap gap-2">{stats}</div> : null}

          {!fullscreen ? (
            <MarkingTableViewport maxHeight={maxHeight}>
              {children({ fullscreen: false })}
            </MarkingTableViewport>
          ) : null}
          {footer}
        </Card.Content>
      </Card>

      {fullscreen && (
        <div className="fixed inset-0 z-50 bg-background/95 p-3 backdrop-blur-sm sm:p-5">
          <div className="flex h-full flex-col overflow-hidden rounded-lg border border-border bg-card shadow-2xl">
            <div className="flex flex-col gap-3 border-b border-border p-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0 space-y-2">
                <h3 className="truncate text-base font-semibold">{title}</h3>
                {description && <div className="mt-1 text-sm text-muted-foreground">{description}</div>}
                {stats ? <div className="flex flex-wrap gap-2">{stats}</div> : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {actions}
                <Button variant="ghost" size="icon" onClick={() => setFullscreen(false)} aria-label="Закрыть полноэкранную таблицу">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="min-h-0 flex-1 p-4">
              <MarkingTableViewport fullscreen>{children({ fullscreen: true })}</MarkingTableViewport>
            </div>
            {footer && <div className="border-t border-border p-4">{footer}</div>}
          </div>
        </div>
      )}
    </>
  )
}

export function useIncrementalRows<T>(items: T[], pageSize = 30) {
  const [page, setPage] = useState(1)
  const markerRef = useRef<HTMLDivElement | null>(null)

  const visibleRows = useMemo(() => items.slice(0, page * pageSize), [items, page, pageSize])
  const hasMore = visibleRows.length < items.length

  useEffect(() => {
    const node = markerRef.current
    if (!node || !hasMore) {
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setPage((current) => current + 1)
        }
      },
      { rootMargin: '240px' },
    )

    observer.observe(node)
    return () => observer.disconnect()
  }, [hasMore, visibleRows.length])

  return {
    visibleRows,
    hasMore,
    markerRef,
    shown: visibleRows.length,
    total: items.length,
    page,
    setPage,
  }
}

export function usePaginatedRows<T>(items: T[], pageSize = 30) {
  const [page, setPage] = useState(1)
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize))

  useEffect(() => {
    setPage((current) => Math.min(Math.max(current, 1), totalPages))
  }, [items.length, totalPages])

  const visibleRows = useMemo(() => {
    const safePage = Math.min(Math.max(page, 1), totalPages)
    const start = (safePage - 1) * pageSize
    return items.slice(start, start + pageSize)
  }, [items, page, pageSize, totalPages])

  const safePage = Math.min(Math.max(page, 1), totalPages)
  const from = items.length === 0 ? 0 : (safePage - 1) * pageSize + 1
  const to = Math.min(safePage * pageSize, items.length)

  return {
    visibleRows,
    shown: visibleRows.length,
    total: items.length,
    page: safePage,
    totalPages,
    from,
    to,
    setPage,
  }
}

export function inputDateValue(offsetYears = 0) {
  const value = new Date()
  value.setFullYear(value.getFullYear() + offsetYears)
  return value.toISOString().slice(0, 10)
}
