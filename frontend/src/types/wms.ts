export type ThemeMode = 'light' | 'dark' | 'system'

export interface User {
  id: number
  username: string
  email?: string | null
  role: string
  permissions?: string[]
  full_name: string | null
  is_active: boolean
  created_at: string
  last_login: string | null
}

export interface TokenResponse {
  access_token: string
  refresh_token: string
  token_type: string
}

export interface LoginCredentials {
  username: string
  password: string
}

export interface Item {
  id: number
  title: string
  name: string
  product_type: string
  size: string
  color: string
  inventory_type: 'finished_goods' | 'raw_material' | 'consumable'
  max_pairs_per_box: number
  created_at: string
  updated_at?: string | null
}

export interface ItemCreate {
  title: string
  name: string
  product_type: string
  size: string
  color: string
  inventory_type?: 'finished_goods' | 'raw_material' | 'consumable'
  max_pairs_per_box?: number
}

export interface Stock {
  id: number
  item_id: number
  item?: Item  // ✅ Добавить поле item
  cell_id: number
  pairs_quantity: number
  reserved_pairs?: number | null
  pairs_per_box?: number | null
  batch_number?: string | null
  size?: string | null
  color?: string | null
  venchik?: string | null
  inventory_type: 'finished_goods' | 'raw_material' | 'consumable'
  manufacturer?: string | null
  created_at: string
  updated_at: string
}

export interface StockCreate {
  item_id: number
  pairs_quantity: number
  pairs_per_box?: number | null
  batch_number?: string | null
  size?: string | null
  color?: string | null
  venchik?: string | null
  inventory_type?: 'finished_goods' | 'raw_material' | 'consumable'
  manufacturer?: string | null
}

export interface StockUpdate {
  pairs_quantity?: number
  pairs_per_box?: number | null
  batch_number?: string | null
  size?: string | null
  color?: string | null
  venchik?: string | null
  inventory_type?: 'finished_goods' | 'raw_material' | 'consumable'
  manufacturer?: string | null
}

export interface Cell {
  id: number
  rack: number
  tier: number
  cell: number
  warehouse_id: number
  total_pairs?: number
  occupied?: boolean
  stock?: Stock | null
}

export interface CellCreate {
  rack: number
  tier: number
  cell: number
  warehouse_id: number
}

export interface Warehouse {
  id: number
  name: string
  cells: Cell[]
}

export type OrderStatus =
  | 'pending'
  | 'processing'
  | 'picking'
  | 'packed'
  | 'partially_packed'
  | 'shipped'
  | 'delivered'
  | 'cancelled'
  | 'reformulated'
  | 'pick_edited'
  | 'edited'

export type OrderItemStatus = 'pending' | 'picking' | 'picked' | 'cancelled'
export type ChzRequestStatus = 'requested' | 'acknowledged' | 'ready' | 'cancelled'

export interface OrderCreate {
  name: string
  order_type: string
  priority: number
  customer: string
  supplier?: string
  comment?: string
  invoice?: string
  transport_company?: string
  approved?: boolean
  shipping_date?: string
  items: {
    stock_id?: number | null
    item_id?: number | null
    item_title?: string | null
    item_size?: string | null
    item_color?: string | null
    pairs_quantity: number
  }[]
}

export interface OrderItem {
  id: number
  order_id: number
  item_id: number
  item_name?: string
  item_size?: string | null
  item_color?: string | null
  item_venchik?: string | null
  batch_number?: string | null
  pairs_quantity: number
  picked_pairs: number
  status: OrderItemStatus
  suggested_stock_id?: number | null
  suggested_cell_location?: string | null
  waiting_for_production?: boolean
  created_at?: string
  updated_at?: string
}

export interface ChzRequestItem {
  id: number
  order_item_id?: number | null
  item_id?: number | null
  pairs_quantity: number
  item_title: string
  item_size?: string | null
  item_color?: string | null
  batch_number?: string | null
}

export interface ChzRequest {
  id: number
  requested_by_user_id?: number | null
  requested_by_username?: string | null
  request_type?: string | null
  status: ChzRequestStatus
  is_active: boolean
  comment?: string | null
  external_request_id?: string | null
  requested_at: string
  acknowledged_at?: string | null
  ready_at?: string | null
  items: ChzRequestItem[]
}

export interface Order {
  id: number
  name: string
  order_type: string
  priority: number
  status: OrderStatus
  customer: string
  supplier?: string
  comment?: string
  invoice?: string
  transport_company?: string
  approved: boolean
  shipping_date?: string
  actual_shipping_date?: string
  upd_gl?: string
  items: OrderItem[]
  total_pairs?: number
  requires_chz?: boolean
  active_chz_request?: ChzRequest | null
  created_at: string
  updated_at?: string
}

export type ProductionOrderStatus =
  | 'pending'
  | 'awaiting_resources'
  | 'ready_to_work'
  | 'in_progress'
  | 'completed'
  | 'partially_transferred'
  | 'transferred'

export type ProductionSupplyType = 'raw_material' | 'consumable' | 'finished_goods_receipt'
export type ProductionSupplyStatus = 'requested' | 'in_progress' | 'completed'
export type ProductionChzStatus = 'requested' | 'acknowledged' | 'ready' | 'cancelled'
export type ProductionTaskType =
  | 'packaging'
  | 'unpacking'
  | 'trim_cuffs'
  | 'warehouse_help'
  | 'defect_sorting'
  | 'repacking'
  | 'cleaning'
export type EmployeeDepartment = 'production' | 'warehouse' | 'other'

export interface Employee {
  id: number
  full_name: string
  position?: string | null
  department: EmployeeDepartment
  is_active: boolean
  created_at: string
  updated_at?: string | null
}

export interface EmployeeShift {
  id: number
  employee_id: number
  employee_name?: string | null
  work_date: string
  start_time: string
  end_time: string
  department: EmployeeDepartment
  comment?: string | null
  created_at: string
}

export interface ProductionLaborEntry {
  id: number
  production_order_id: number
  employee_id?: number | null
  employee_name?: string | null
  work_date: string
  start_time: string
  end_time: string
  people_count: number
  comment?: string | null
  created_by_user_id?: number | null
  created_at: string
}

export interface ProductionLaborReport {
  date_from: string
  date_to: string
  tasks: {
    production_order_id: number
    production_order_name: string
    task_type: ProductionTaskType | string
    product?: string | null
    raw_material?: string | null
    batch_number?: string | null
    size?: string | null
    quantity: number
    periods: {
      start_time: string
      end_time: string
      people_count: number
      employee_names: string[]
    }[]
  }[]
  employees: {
    employee_id?: number | null
    employee_name: string
    department?: EmployeeDepartment | null
    hours: number
  }[]
}

export interface ProductionOrderItem {
  id: number
  item_id: number
  item_title: string
  item_size?: string | null
  item_color?: string | null
  pairs_quantity: number
  produced_pairs: number
  transferred_pairs: number
  batch_number?: string | null        // <-- добавлено
  production_date?: string | null      // <-- добавлено
}


export interface ProductionOrderItemCreate {
  item_id: number
  pairs_quantity: number
  item_size?: string | null  // ✅ Добавить
  item_color?: string | null // ✅ Добавить
}


export interface ProductionSupplyRequestItem {
  id: number
  item_id: number
  production_order_item_id?: number | null
  item_title: string
  item_size?: string | null
  quantity: number
  fulfilled_quantity: number
  size?: string | null
  manufacturer?: string | null
  selected_stock_id?: number | null
  selected_cell_id?: number | null
  selected_cell_location?: string | null
}

export interface ProductionSupplyRequest {
  id: number
  request_type: ProductionSupplyType
  status: ProductionSupplyStatus
  comment?: string | null
  items: ProductionSupplyRequestItem[]
  created_at: string
  updated_at?: string | null
}

export interface ProductionChzRequestItem {
  id: number
  production_order_item_id?: number | null
  item_id?: number | null
  pairs_quantity: number
  item_title: string
  item_size?: string | null
  item_color?: string | null
  batch_number?: string | null
}

export interface ProductionChzRequest {
  id: number
  production_order_id?: number | null
  order_name?: string | null
  requested_by_user_id?: number | null
  requested_by_username?: string | null
  request_type?: string | null
  status: ProductionChzStatus
  is_active: boolean
  comment?: string | null
  external_request_id?: string | null
  requested_at: string
  acknowledged_at?: string | null
  ready_at?: string | null
  items: ProductionChzRequestItem[]
}

export interface ProductionOrder {
  id: number
  name: string
  task_type: ProductionTaskType
  status: ProductionOrderStatus
  priority: number
  comment?: string | null
  related_order_id?: number | null
  related_order_name?: string | null
  batch_number?: string | null
  production_date?: string | null
  created_by_user_id?: number | null
  brigadier_user_id?: number | null
  items: ProductionOrderItem[]
  supply_requests: ProductionSupplyRequest[]
  labor_entries?: ProductionLaborEntry[]
  active_chz_request?: ProductionChzRequest | null
  created_at: string
  updated_at?: string | null
}

export interface PickingListItem {
  order_item_id: number
  item_id: number
  item_name: string
  item_size?: string | null
  item_color?: string | null
  item_venchik?: string | null
  batch_number?: string | null
  pairs_required: number
  picked_pairs: number
  suggested_cell_location?: string | null
  suggested_stock_id?: number | null
  available_pairs: number
  waiting_for_production?: boolean
}

export interface PickItemRequest {
  order_item_id: number
  stock_id: number
  pairs_quantity: number
}

export interface PickItemResponse {
  order_item_id: number
  picked_pairs: number
  remaining_to_pick: number
  stock_remaining: number
  is_completed: boolean
}

export interface StockMoveRequest {
  to_cell_id: number
  pairs_quantity: number
}

export interface ApiMoveResult {
  message?: string
  [key: string]: unknown
}

export interface PickOperation {
  id: number
  order_item_id: number
  stock_id?: number | null
  cell_id?: number | null
  item_id?: number | null
  pairs_quantity: number
  pairs_per_box?: number | null
  batch_number?: string | null
  size?: string | null
  color?: string | null
  venchik?: string | null
  picked_at: string
  user_id?: number
}

export interface PackingProposalItem {
  order_item_id: number
  item_name: string
  size: string | null
  color: string | null
  batch: string | null
  venchik: string | null 
  pairs_quantity: number
}
export interface PackingProposalGroup {
  group_number: number
  item_title: string
  color: string | null
  total_pairs: number
  can_merge: boolean
  is_mixed: boolean  
  items: PackingProposalItem[]
}

export interface PackingProposalResponse {
  has_proposals: boolean
  proposals: PackingProposalGroup[]
}

export interface HistoryLog {
  id: number
  operation_type: string
  user_id?: number | null
  item_id?: number | null
  stock_id?: number | null
  cell_id?: number | null
  warehouse_id?: number | null
  quantity?: number | null
  details?: Record<string, unknown> | null
  created_at: string
  user_email?: string | null
  user_username?: string | null
  item_title?: string | null
  cell_coord?: string | null
  warehouse_name?: string | null
  can_rollback?: boolean
}

export interface HistoryPageResponse {
  items: HistoryLog[]
  total: number
  limit: number
  offset: number
}

export interface ManualChzRequestCreate {
  item_id: number
  pairs_quantity: number
  item_size?: string | null
  item_color?: string | null
  item_venchik?: string | null
  batch_number?: string | null
  comment?: string | null
}

export interface ChzRegistryEntry {
  request_id: number
  source: 'shipment' | 'production' | 'manual' | string
  status: ChzRequestStatus | string
  is_active: boolean
  order_id?: number | null
  production_order_id?: number | null
  order_name?: string | null
  author?: string | null
  comment?: string | null
  requested_at: string
  acknowledged_at?: string | null
  ready_at?: string | null
  item_id?: number | null
  item_title: string
  item_size?: string | null
  item_color?: string | null
  item_venchik?: string | null
  batch_number?: string | null
  pairs_quantity: number
}

export interface ChzRegistryBulkAction {
  entries: Array<{
    source: string
    request_id: number
  }>
}
