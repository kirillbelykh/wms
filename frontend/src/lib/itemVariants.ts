import type { Item, Stock } from '@/types/wms'

export type VariantSelection = {
  item_title: string
  item_size: string
  item_color: string
}

export type AvailableStockOption = {
  id: number
  item_id: number
  title: string
  size: string | null
  color: string | null
  venchik: string | null
  pairs_quantity: number
  batch_number: string | null
  label: string
}

function normalize(value?: string | null) {
  return (value ?? '').trim()
}

export function normalizeVariantDisplayValue(value?: string | null) {
  const rawValue = normalize(value)
  if (!rawValue) return ''

  const normalizedNumber = rawValue.replace(',', '.')
  if (/^\d+(?:\.\d+)?$/.test(normalizedNumber)) {
    const parsed = Number(normalizedNumber)
    if (Number.isFinite(parsed)) {
      return parsed.toFixed(1)
    }
  }

  return rawValue
}

export function normalizeVariantComparableValue(value?: string | null) {
  return normalizeVariantDisplayValue(value).replace(',', '.').toLowerCase()
}

function compareVariantValue(left?: string | null, right?: string | null) {
  return normalizeVariantComparableValue(left) === normalizeVariantComparableValue(right)
}

export function getDistinctVariantTitles<T extends { title: string }>(variants: T[]) {
  return Array.from(new Set(variants.map((variant) => normalize(variant.title)).filter(Boolean))).sort((left, right) =>
    left.localeCompare(right, 'ru'),
  )
}

export function getDistinctVariantSizes<T extends { title: string; size?: string | null }>(
  variants: T[],
  title: string,
) {
  return Array.from(
    new Set(
      variants
        .filter((variant) => compareVariantValue(variant.title, title))
        .map((variant) => normalizeVariantDisplayValue(variant.size))
        .filter(Boolean),
    ),
  ).sort((left, right) => left.localeCompare(right, 'ru'))
}

export function getDistinctVariantColors<T extends { title: string; size?: string | null; color?: string | null }>(
  variants: T[],
  title: string,
  size: string,
) {
  return Array.from(
    new Set(
      variants
        .filter(
          (variant) => compareVariantValue(variant.title, title) && compareVariantValue(variant.size, size),
        )
        .map((variant) => normalize(variant.color))
        .filter(Boolean),
    ),
  ).sort((left, right) => left.localeCompare(right, 'ru'))
}

export function filterCatalogItemsByVariant(items: Item[], selection: VariantSelection) {
  return items.filter((item) => {
    if (selection.item_title && !compareVariantValue(item.title, selection.item_title)) return false
    if (selection.item_size && !compareVariantValue(item.size, selection.item_size)) return false
    if (selection.item_color && !compareVariantValue(item.color, selection.item_color)) return false
    return true
  })
}

export function resolveCatalogItemId(items: Item[], selection: VariantSelection) {
  const matches = filterCatalogItemsByVariant(items, selection)
  return matches.length === 1 ? matches[0].id : 0
}

export function filterStockOptionsByVariant(stocks: AvailableStockOption[], selection: VariantSelection) {
  return stocks.filter((stock) => {
    if (selection.item_title && !compareVariantValue(stock.title, selection.item_title)) return false
    if (selection.item_size && !compareVariantValue(stock.size, selection.item_size)) return false
    if (selection.item_color && !compareVariantValue(stock.color, selection.item_color)) return false
    return true
  })
}

export function buildAvailableStockOption(stock: Stock, item: Item): AvailableStockOption {
  const details = []
  const size = normalizeVariantDisplayValue(stock.size)
  if (size) details.push(`Размер: ${size}`)
  if (stock.color) details.push(`Цвет: ${stock.color}`)
  if (stock.venchik) details.push(`Венчик: ${stock.venchik}`)
  if (stock.batch_number) details.push(`Партия: ${stock.batch_number}`)
  return {
    id: stock.id,
    item_id: stock.item_id,
    title: item.title,
    size: size || null,
    color: stock.color ?? null,
    venchik: stock.venchik ?? null,
    pairs_quantity: stock.pairs_quantity,
    batch_number: stock.batch_number ?? null,
    label: `${item.title}${details.length > 0 ? ` | ${details.join(' | ')}` : ''} | Доступно: ${stock.pairs_quantity} пар`,
  }
}
