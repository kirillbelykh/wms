// lib/production.ts

import type {
  EmployeeDepartment,
  ProductionChzStatus,
  ProductionOrder,
  ProductionOrderItem,
  ProductionSupplyStatus,
  ProductionSupplyType,
  ProductionTaskType,
} from '@/types/wms'

export type ProductionTone = 'success' | 'warning' | 'danger' | 'neutral' | 'secondary' | 'info'

export type ProductionWarehouseTask = {
  key: string
  orderId: number
  orderName: string
  priority: number
  createdAt: string
  requestId: number
  requestItemId: number
  requestType: ProductionSupplyType
  requestStatus: ProductionSupplyStatus
  requestComment?: string | null
  productionOrderItemId?: number | null
  itemId: number
  itemTitle: string
  itemSize?: string | null
  itemColor?: string | null      // ✅ ДОБАВЛЯЕМ цвет
  batchNumber?: string | null
  remainingQuantity: number
}

export function productionStatusLabel(status: string) {
  switch (status) {
    case 'pending':
      return 'Ожидает'
    case 'awaiting_resources':
      return 'Ожидает ресурсы'
    case 'ready_to_work':
      return 'Готов к работе'
    case 'in_progress':
      return 'В работе'
    case 'completed':
      return 'Выполнено'
    case 'partially_transferred':
      return 'Частично передано'
    case 'transferred':
      return 'Передано на склад'
    default:
      return status
  }
}

export function productionStatusTone(status: string): ProductionTone {
  switch (status) {
    case 'ready_to_work':
      return 'info'
    case 'in_progress':
      return 'warning'
    case 'completed':
    case 'transferred':
      return 'success'
    case 'partially_transferred':
      return 'secondary'
    default:
      return 'neutral'
  }
}

export function productionSupplyTypeLabel(type: ProductionSupplyType) {
  switch (type) {
    case 'raw_material':
      return 'Сырье'
    case 'consumable':
      return 'Расходники'
    case 'finished_goods_receipt':
      return 'Приемка ГП'
    default:
      return type
  }
}

export function productionSupplyTypeUnitLabel(type: ProductionSupplyType) {
  if (type === 'consumable') return 'шт'
  return 'пар'
}

export function productionSupplyStatusLabel(status: ProductionSupplyStatus) {
  switch (status) {
    case 'requested':
      return 'Ожидает'
    case 'in_progress':
      return 'В работе'
    case 'completed':
      return 'Выполнено'
    default:
      return status
  }
}

export function productionSupplyStatusTone(status: ProductionSupplyStatus): ProductionTone {
  switch (status) {
    case 'requested':
      return 'warning'
    case 'in_progress':
      return 'info'
    case 'completed':
      return 'success'
    default:
      return 'neutral'
  }
}

export function productionChzStatusLabel(status: ProductionChzStatus | string) {
  switch (status) {
    case 'requested':
      return 'Запрошен'
    case 'acknowledged':
      return 'Принят оператором'
    case 'ready':
      return 'Коды готовы'
    case 'cancelled':
      return 'Отменен'
    default:
      return status
  }
}

export function productionChzStatusTone(status: ProductionChzStatus | string): ProductionTone {
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

export function formatProductionItemLabel(item: Pick<ProductionOrderItem, 'item_title' | 'item_size'>) {
  return item.item_size ? `${item.item_title} · р. ${item.item_size}` : item.item_title
}

export function getProductionItemTransferablePairs(item: Pick<ProductionOrderItem, 'pairs_quantity' | 'produced_pairs'>) {
  return item.produced_pairs > 0 ? item.produced_pairs : item.pairs_quantity
}

export function sumProductionPairs(
  order: ProductionOrder,
  key: 'pairs_quantity' | 'produced_pairs' | 'transferred_pairs',
) {
  return order.items.reduce((total, item) => total + item[key], 0)
}

export function getProductionProgress(order: ProductionOrder) {
  const total = sumProductionPairs(order, 'pairs_quantity')
  const produced = sumProductionPairs(order, 'produced_pairs')
  return {
    produced,
    total,
    percent: total > 0 ? Math.round((produced / total) * 100) : 0,
  }
}

export function buildProductionTaskKey(requestId: number, requestItemId: number) {
  return `request-${requestId}-item-${requestItemId}`
}

export function getProductionWarehouseTasks(orders: ProductionOrder[]): ProductionWarehouseTask[] {
  return orders
    .flatMap((order) =>
      order.supply_requests.flatMap((request) =>
        request.items.flatMap((item) => {
          const remainingQuantity = Math.max(item.quantity - item.fulfilled_quantity, 0)
          if (remainingQuantity <= 0 || request.status === 'completed') return []

          // Находим связанную позицию заказа
          const relatedOrderItem = order.items.find((candidate) => candidate.id === item.production_order_item_id)

          // Определяем размер, цвет и партию в зависимости от типа задания
          let itemSize = item.size ?? item.item_size ?? relatedOrderItem?.item_size ?? null
          let itemColor = relatedOrderItem?.item_color ?? null
          let batchNumber = null

          if (request.request_type === 'finished_goods_receipt' && relatedOrderItem) {
            // ✅ Для приёмки ГП берём данные из позиции заказа
            itemSize = relatedOrderItem.item_size ?? itemSize
            itemColor = relatedOrderItem.item_color ?? null
            batchNumber = relatedOrderItem.batch_number ?? order.batch_number ?? null
          } else {
            // Для сырья и расходников используем партию заказа
            batchNumber = order.batch_number ?? null
          }

          return [
            {
              key: buildProductionTaskKey(request.id, item.id),
              orderId: order.id,
              orderName: order.name,
              priority: order.priority,
              createdAt: request.created_at,
              requestId: request.id,
              requestItemId: item.id,
              requestType: request.request_type,
              requestStatus: request.status,
              requestComment: request.comment,
              productionOrderItemId: item.production_order_item_id,
              itemId: item.item_id,
              itemTitle: item.item_title,
              itemSize: itemSize,
              itemColor: itemColor,           // ✅ цвет теперь передаётся
              batchNumber: batchNumber,
              remainingQuantity,
            } satisfies ProductionWarehouseTask,
          ]
        }),
      ),
    )
    .sort((left, right) => {
      if (left.priority !== right.priority) return right.priority - left.priority
      return left.createdAt < right.createdAt ? 1 : -1
    })
}

export function productionTaskTypeLabel(type: ProductionTaskType | string) {
  switch (type) {
    case 'packaging':
      return 'Упаковка'
    case 'unpacking':
      return 'Распаковка'
    case 'trim_cuffs':
      return 'Обрезка венчиков'
    case 'warehouse_help':
      return 'Помощь на складе'
    case 'defect_sorting':
      return 'Переборка брака'
    case 'repacking':
      return 'Переупаковка'
    case 'cleaning':
      return 'Уборка'
    default:
      return type
  }
}

export function employeeDepartmentLabel(department?: EmployeeDepartment | string | null) {
  switch (department) {
    case 'production':
      return 'Производство'
    case 'warehouse':
      return 'Склад'
    case 'other':
      return 'Другое'
    default:
      return department || '—'
  }
}

export function productionBrigadierChzStatusLabel(status?: ProductionChzStatus | string | null) {
  switch (status) {
    case 'requested':
      return 'ЧЗ запрошен'
    case 'acknowledged':
      return 'В работе'
    case 'ready':
      return 'Готов'
    case 'cancelled':
      return 'Отменен'
    default:
      return status || 'Нет запроса'
  }
}
