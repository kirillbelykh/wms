import type { User } from '@/types/wms'

type MaybeUser = User | null | undefined

function permissionSet(user: MaybeUser): Set<string> {
  return new Set(user?.permissions ?? [])
}

export function hasPermission(user: MaybeUser, permission: string): boolean {
  return permissionSet(user).has(permission)
}

export function hasAnyPermission(user: MaybeUser, permissions: string[]): boolean {
  const current = permissionSet(user)
  return permissions.some((permission) => current.has(permission))
}

export function canViewWarehouses(user: MaybeUser): boolean {
  return hasAnyPermission(user, [
    'view_warehouses',
    'create_warehouse',
    'update_warehouse',
    'delete_warehouse',
  ])
}

export function canViewItems(user: MaybeUser): boolean {
  return hasAnyPermission(user, [
    'view_items',
    'create_item',
    'update_item',
    'delete_item',
  ])
}

export function canViewStocks(user: MaybeUser): boolean {
  return hasAnyPermission(user, [
    'view_stocks',
    'create_stock',
    'update_stock',
    'withdraw_stock',
    'delete_stock',
  ])
}

export function canViewMoves(user: MaybeUser): boolean {
  return hasAnyPermission(user, [
    'view_moves',
    'move_stock',
  ])
}

export function canViewOrders(user: MaybeUser): boolean {
  return hasAnyPermission(user, [
    'view_orders',
    'create_order',
    'update_order',
    'delete_order',
    'pick_item',
    'update_pick',
    'delete_pick',
    'complete_picking',
  ])
}

export function canViewProduction(user: MaybeUser): boolean {
  return hasAnyPermission(user, [
    'view_production_order',
    'view_production',
    'create_production_order',
    'update_production_order',
    'delete_production_order',
    'request_production_supplies',
    'fulfill_production_supplies',
    'start_production',
    'complete_production',
    'transfer_production_to_stock',
    'request_production_chz',
    'manage_production_labor',
  ])
}

export function canViewReports(user: MaybeUser): boolean {
  return hasAnyPermission(user, ['view_admin_stats', 'view_reports'])
}

export function canViewEmployees(user: MaybeUser): boolean {
  return hasAnyPermission(user, [
    'view_employees',
    'manage_employees',
    'manage_employee_shifts',
  ])
}

export function canViewHistory(user: MaybeUser): boolean {
  return hasPermission(user, 'view_history')
}

export function canViewChzPage(user: MaybeUser): boolean {
  return hasAnyPermission(user, [
    'view_chz_registry',
    'create_manual_chz_request',
    'request_production_chz',
  ])
}

export function canViewMarking(user: MaybeUser): boolean {
  return hasAnyPermission(user, [
    'view_marking',
    'view_marking_turnover',
    'view_marking_orders',
    'view_marking_intro',
    'view_marking_chz',
    'view_marking_aggregation',
    'view_marking_tsd',
    'view_marking_labels',
  ])
}

export function canViewMarkingTurnover(user: MaybeUser): boolean {
  return hasAnyPermission(user, [
    'view_marking_turnover',
    'view_marking_orders',
    'view_marking_intro',
    'view_marking_chz',
    'view_marking_tsd',
    'view_marking_labels',
  ])
}

export function canViewMarkingOrders(user: MaybeUser): boolean {
  return hasAnyPermission(user, [
    'view_marking_orders',
    'view_marking_turnover',
  ])
}

export function canViewMarkingIntro(user: MaybeUser): boolean {
  return hasAnyPermission(user, [
    'view_marking_intro',
    'view_marking_turnover',
  ])
}

export function canViewMarkingWithdrawal(user: MaybeUser): boolean {
  return hasAnyPermission(user, [
    'view_marking_withdrawal',
    'view_marking_turnover',
  ])
}

export function canViewMarkingChz(user: MaybeUser): boolean {
  return hasAnyPermission(user, [
    'view_marking_chz',
    'view_marking_turnover',
  ])
}

export function canViewMarkingAggregation(user: MaybeUser): boolean {
  return hasAnyPermission(user, [
    'view_marking_aggregation',
    'view_marking',
  ])
}

export function canViewMarkingShipping(user: MaybeUser): boolean {
  return hasAnyPermission(user, [
    'view_marking_tsd',
    'view_marking_labels',
    'view_marking_turnover',
  ])
}

export function canViewMarkingTsd(user: MaybeUser): boolean {
  return hasAnyPermission(user, [
    'view_marking_tsd',
    'view_marking_turnover',
  ])
}

export function canViewMarkingLabels(user: MaybeUser): boolean {
  return hasAnyPermission(user, [
    'view_marking_labels',
    'view_marking_turnover',
  ])
}

export function defaultMarkingTurnoverPath(user: MaybeUser): string {
  if (canViewMarkingOrders(user)) return '/marking/turnover/orders'
  if (canViewMarkingIntro(user)) return '/marking/turnover/intro'
  if (canViewMarkingChz(user)) return '/marking/turnover/chz'
  if (canViewMarkingTsd(user)) return '/marking/turnover/tsd'
  if (canViewMarkingLabels(user)) return '/marking/turnover/labels'
  return '/marking/aggregation'
}

export function defaultMarkingShippingPath(user: MaybeUser): string {
  if (canViewMarkingTsd(user)) return '/marking/turnover/tsd'
  if (canViewMarkingLabels(user)) return '/marking/turnover/labels'
  return '/marking/turnover/orders'
}

export function defaultMarkingPath(user: MaybeUser): string {
  if (canViewMarkingTurnover(user)) return defaultMarkingTurnoverPath(user)
  if (canViewMarkingAggregation(user)) return '/marking/aggregation'
  return '/orders'
}
