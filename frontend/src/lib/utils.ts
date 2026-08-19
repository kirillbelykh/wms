import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { Cell, Order, Stock } from '@/types/wms'

export const MSK_TIME_ZONE = 'Europe/Moscow'

const dateTimeFormatter = new Intl.DateTimeFormat('ru-RU', {
  timeZone: MSK_TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

const shortDateFormatter = new Intl.DateTimeFormat('ru-RU', {
  timeZone: MSK_TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
})

function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value)
}

function getMskDateParts(value: string | Date) {
  const date = toDate(value)
  const formatted = new Intl.DateTimeFormat('en-CA', {
    timeZone: MSK_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)

  const parts = Object.fromEntries(formatted.map((part) => [part.type, part.value]))
  return {
    year: parts.year ?? '0000',
    month: parts.month ?? '01',
    day: parts.day ?? '01',
  }
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCoordinate(cell: Pick<Cell, 'rack' | 'tier' | 'cell'>) {
  return `${cell.rack}-${cell.tier}-${cell.cell}`
}

export function formatDate(date?: string | Date | null): string {
  if (!date) return '—'
  return dateTimeFormatter.format(toDate(date))
}

export function formatShortDate(date?: string | Date | null): string {
  if (!date) return '—'
  return shortDateFormatter.format(toDate(date))
}

export function formatDateInputValue(date?: string | Date | null): string {
  if (!date) return ''
  const parts = getMskDateParts(date)
  return `${parts.year}-${parts.month}-${parts.day}`
}

export function todayInMsk(): string {
  return formatDateInputValue(new Date())
}

export function dateInputToMskIso(value?: string | null): string | undefined {
  if (!value) return undefined
  return `${value}T00:00:00+03:00`
}

export function sameMskDay(a: Date | string, b: Date | string) {
  return formatDateInputValue(a) === formatDateInputValue(b)
}

export function inMskDateRange(value: string, from: string, to: string) {
  if (!value) return false
  const dateKey = formatDateInputValue(value)
  if (from && dateKey < from) return false
  if (to && dateKey > to) return false
  return true
}

export function calculateOrderProgress(order: Order | undefined): { picked: number; total: number; percent: number } {
  if (!order?.items) return { picked: 0, total: 0, percent: 0 }

  let total = 0
  let picked = 0

  for (const item of order.items) {
    total += item.pairs_quantity
    picked += item.picked_pairs
  }

  return {
    picked,
    total,
    percent: total > 0 ? Math.round((picked / total) * 100) : 0,
  }
}

export function orderStatusLabel(status: string): string {
  switch (status) {
    case 'pending':
      return 'Ожидает'
    case 'processing':
      return 'В обработке'
    case 'picking':
      return 'Сборка'
    case 'packed':
      return 'Отобран'
    case 'partially_packed':
      return 'Отобран частично'
    case 'shipped':
      return 'Отгружен'
    case 'delivered':
      return 'Доставлен'
    case 'cancelled':
      return 'Отменён'
    case 'reformulated':
      return 'Расформирован'
    case 'pick_edited':
      return 'Изменен отбор'
    case 'edited':
      return 'Редактирован'
    default:
      return status
  }
}

export function orderStatusTone(status: string): 'success' | 'warning' | 'danger' | 'neutral' | 'secondary' | 'info' {
  switch (status) {
    case 'delivered':
    case 'packed':
      return 'success'
    case 'partially_packed':
      return 'warning'
    case 'cancelled':
      return 'danger'
    case 'picking':
    case 'processing':
      return 'warning'
    case 'shipped':
      return 'info'
    case 'reformulated':
    case 'edited':
      return 'neutral'
    case 'pick_edited':
      return 'secondary'
    default:
      return 'neutral'
  }
}

export function orderItemStatusLabel(status: string): string {
  switch (status) {
    case 'pending':
      return 'Ожидает'
    case 'picking':
      return 'В отборе'
    case 'picked':
      return 'Отобрано'
    case 'cancelled':
      return 'Отменено'
    default:
      return status
  }
}

export function orderItemStatusTone(status: string): 'success' | 'warning' | 'danger' | 'neutral' | 'secondary' | 'info' {
  switch (status) {
    case 'picked':
      return 'success'
    case 'picking':
      return 'warning'
    case 'cancelled':
      return 'danger'
    default:
      return 'neutral'
  }
}

export function chzRequestStatusLabel(status: string): string {
  switch (status) {
    case 'requested':
      return 'Запрошен'
    case 'acknowledged':
      return 'Принят оператором'
    case 'ready':
      return 'Готов'
    case 'cancelled':
      return 'Отменен'
    default:
      return status
  }
}

export function chzRequestStatusTone(status: string): 'success' | 'warning' | 'danger' | 'neutral' | 'secondary' | 'info' {
  switch (status) {
    case 'ready':
      return 'success'
    case 'acknowledged':
      return 'info'
    case 'requested':
      return 'warning'
    case 'cancelled':
      return 'danger'
    default:
      return 'neutral'
  }
}

export function inventoryTypeLabel(type?: string | null): string {
  switch (type) {
    case 'raw_material':
      return 'Сырье'
    case 'consumable':
      return 'Расходники'
    case 'finished_goods':
    default:
      return 'Готовая продукция'
  }
}

export function inventoryTypeShortLabel(type?: string | null): string {
  switch (type) {
    case 'raw_material':
      return 'Сырье'
    case 'consumable':
      return 'Расходники'
    case 'finished_goods':
    default:
      return 'ГП'
  }
}

export function inventoryTypeUnitLabel(type?: string | null): string {
  return type === 'consumable' ? 'шт' : 'пар'
}

export function availablePairs(stock?: Stock | null) {
  if (!stock) return 0
  return stock.pairs_quantity
}

export function getCellStatus(cell: Cell, fullThreshold = 20) {
  const pairs = cell.stock?.pairs_quantity ?? 0
  if (pairs <= 0) return 'free'
  if (pairs >= fullThreshold) return 'full'
  if (pairs > 0) return 'partial'
  return 'free'
}

export function getErrorMessage(error: unknown) {
  if (typeof error === 'object' && error && 'response' in error) {
    const response = (error as { response?: { data?: unknown } }).response
    const data = response?.data
    if (typeof data === 'string') return data
    if (typeof data === 'object' && data && 'detail' in data) {
      const detail = (data as { detail?: unknown }).detail
      if (typeof detail === 'string') return detail
      if (Array.isArray(detail)) return detail.map(String).join(', ')
    }
  }
  if (error instanceof Error) return error.message
  return 'Не удалось выполнить запрос'
}

export function numberOrZero(value: FormDataEntryValue | null) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export function chzRegistryStatusLabel(status?: string | null): string {
  switch (status) {
    case 'requested':
      return 'Создан'
    case 'acknowledged':
      return 'В работе'
    case 'ready':
      return 'Готов'
    case 'cancelled':
      return 'Отменен'
    default:
      return status || 'Неизвестно'
  }
}

export function chzSourceLabel(source?: string | null): string {
  switch (source) {
    case 'production':
      return 'Производство'
    case 'manual':
      return 'Ручной запрос'
    case 'shipment':
    default:
      return 'Отгрузка'
  }
}
