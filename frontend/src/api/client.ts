import axios from 'axios'
import type {
  ApiMoveResult,
  Cell,
  CellCreate,
  ChzRegistryBulkAction,
  ChzRegistryEntry,
  ChzRequest,
  Employee,
  EmployeeDepartment,
  EmployeeShift,
  HistoryLog,
  HistoryPageResponse,
  Item,
  ItemCreate,
  LoginCredentials,
  ManualChzRequestCreate,
  Order,
  OrderCreate,
  OrderStatus,
  PackingProposalResponse,
  PickItemRequest,
  PickItemResponse,
  PickingListItem,
  PickOperation,
  ProductionLaborEntry,
  ProductionLaborReport,
  ProductionOrder,
  ProductionTaskType,
  Stock,
  StockCreate,
  StockMoveRequest,
  StockUpdate,
  TokenResponse,
  User,
  Warehouse,
} from '@/types/wms'

export const AUTH_TOKEN_KEY = 'wms_token'
export const REFRESH_TOKEN_KEY = 'wms_refresh_token'

// --- Token helpers ---
export function getStoredToken(): string | null {
  return localStorage.getItem(AUTH_TOKEN_KEY)
}

export function setStoredToken(token: string | null) {
  if (token) {
    localStorage.setItem(AUTH_TOKEN_KEY, token)
  } else {
    localStorage.removeItem(AUTH_TOKEN_KEY)
  }
}

export function getStoredRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY)
}

export function setStoredRefreshToken(token: string | null) {
  if (token) {
    localStorage.setItem(REFRESH_TOKEN_KEY, token)
  } else {
    localStorage.removeItem(REFRESH_TOKEN_KEY)
  }
}

export function clearTokens() {
  localStorage.removeItem(AUTH_TOKEN_KEY)
  localStorage.removeItem(REFRESH_TOKEN_KEY)
}

function getBaseURL(): string {
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'http://localhost:8000'
    }
    // Продакшен: API на том же домене через Nginx proxy (/api/)
    return `${window.location.protocol}//${window.location.host}/api`
  }
  return 'http://localhost:8000'
}

// --- Refresh flag to prevent infinite loop ---
let isRefreshing = false
let failedQueue: Array<{
  resolve: (token: string) => void
  reject: (error: unknown) => void
}> = []

function processQueue(error: unknown, token: string | null = null) {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error)
    } else {
      resolve(token!)
    }
  })
  failedQueue = []
}

// --- Axios instance ---
export const api = axios.create({
  withCredentials: true,
})

api.interceptors.request.use((config) => {
  config.baseURL = getBaseURL()
  const token = getStoredToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Response interceptor with auto-refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config

    // Если 401 и это не запрос на refresh и не повторная попытка
    if (error?.response?.status === 401 && !originalRequest._retry && !originalRequest.url?.includes('/auth/refresh')) {
      
      if (isRefreshing) {
        // Если уже идёт обновление — ставим запрос в очередь
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject })
        }).then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`
          return api(originalRequest)
        })
      }

      originalRequest._retry = true
      isRefreshing = true

      const refreshToken = getStoredRefreshToken()
      
      if (!refreshToken) {
        clearTokens()
        if (typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
          window.location.href = '/login'
        }
        return Promise.reject(error)
      }

      try {
        const { data } = await axios.post(`${getBaseURL()}/auth/refresh`, {
          refresh_token: refreshToken,
        })
        
        setStoredToken(data.access_token)
        processQueue(null, data.access_token)
        
        originalRequest.headers.Authorization = `Bearer ${data.access_token}`
        return api(originalRequest)
      } catch (refreshError) {
        processQueue(refreshError, null)
        clearTokens()
        if (typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
          window.location.href = '/login'
        }
        return Promise.reject(refreshError)
      } finally {
        isRefreshing = false
      }
    }

    return Promise.reject(error)
  },
)

// --- Auth API ---
export async function login(credentials: { username: string; password: string }) {
  const body = new URLSearchParams()
  body.set('username', credentials.username)
  body.set('password', credentials.password)
  const { data } = await api.post<TokenResponse>('/auth/login', body, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  })
  setStoredToken(data.access_token)
  setStoredRefreshToken(data.refresh_token)
  return data
}

export async function register(credentials: LoginCredentials) {
  const { data } = await api.post<User>('/auth/register', credentials)
  return data
}

export async function getMe() {
  const { data } = await api.get<User>('/auth/me')
  return data
}

// --- Admin API ---
export async function getUsers(skip = 0, limit = 100): Promise<User[]> {
  const { data } = await api.get('/admin/users', { params: { skip, limit } })
  return data
}

export async function getUser(userId: number): Promise<User> {
  const { data } = await api.get(`/admin/users/${userId}`)
  return data
}

export async function updateUser(userId: number, payload: Partial<User> & { password?: string }): Promise<User> {
  const { data } = await api.patch(`/admin/users/${userId}`, payload)
  return data
}

export async function deactivateUser(userId: number): Promise<{ message: string }> {
  const { data } = await api.delete(`/admin/users/${userId}`)
  return data
}

export async function getAdminStats(): Promise<{ total_users: number; active_users: number }> {
  const { data } = await api.get('/admin/stats')
  return data
}

// --- Warehouses ---
export async function getWarehouses() {
  const { data } = await api.get<Warehouse[]>('/warehouses')
  return data
}

export async function createWarehouse(payload: { name: string }) {
  const { data } = await api.post<Warehouse>('/warehouses', payload)
  return data
}

export async function deleteWarehouse(warehouseId: number) {
  await api.delete(`/warehouses/${warehouseId}`)
}

// --- Cells ---
export async function getCells(warehouseId?: number | null) {
  const { data } = await api.get<Cell[]>('/cells', {
    params: warehouseId ? { warehouse_id: warehouseId } : undefined,
  })
  return data
}

export async function createCell(payload: CellCreate) {
  const { data } = await api.post<Cell>('/cells', payload)
  return data
}

export async function updateCell(cellId: number, payload: Partial<CellCreate>) {
  const { data } = await api.patch<Cell>(`/cells/${cellId}`, payload)
  return data
}

export async function deleteCell(cellId: number) {
  await api.delete(`/cells/${cellId}`)
}

// --- Items ---
export async function getItems() {
  const { data } = await api.get<Item[]>('/items')
  return data
}

export async function createItem(payload: ItemCreate) {
  const { data } = await api.post<Item>('/items', payload)
  return data
}

export async function updateItem(itemId: number, payload: Partial<ItemCreate>) {
  const { data } = await api.patch<Item>(`/items/${itemId}`, payload)
  return data
}

export async function deleteItem(itemId: number) {
  await api.delete(`/items/${itemId}`)
}

// --- Stocks ---
export async function getStocks() {
  const { data } = await api.get<Stock[]>('/stocks')
  return data
}

export async function getStocksByItem(itemId: number) {
  const { data } = await api.get<Stock[]>(`/stocks/item/${itemId}`)
  return data
}

export async function createStock(cellId: number, payload: StockCreate) {
  const { data } = await api.post<Stock>(`/stocks/cell/${cellId}`, payload)
  return data
}

export async function updateStock(stockId: number, payload: StockUpdate) {
  const { data } = await api.patch<Stock>(`/stocks/${stockId}`, payload)
  return data
}

export async function withdrawStock(stockId: number, pairsQuantity: number) {
  const { data } = await api.post<Stock>(`/stocks/${stockId}/withdraw`, {
    pairs_quantity: pairsQuantity,
  })
  return data
}

export async function moveStock(stockId: number, payload: StockMoveRequest) {
  const { data } = await api.post<ApiMoveResult>(`/stocks/${stockId}/move`, payload)
  return data
}

export async function deleteStock(stockId: number) {
  await api.delete(`/stocks/${stockId}`)
}

export async function bulkDeleteStocks(stockIds: number[]) {
  const { data } = await api.post<{ deleted_count: number; stock_ids: number[] }>('/stocks/bulk-delete', {
    stock_ids: stockIds,
  })
  return data
}

// --- Orders ---
export async function getOrders(params?: {
  approved?: boolean
  status?: OrderStatus | 'all'
  shipping_date?: string
  shipping_date_from?: string
  shipping_date_to?: string
}) {
  const query = {
    ...params,
    status: params?.status && params.status !== 'all' ? params.status : undefined,
  }
  const { data } = await api.get<Order[]>('/orders', { params: query })
  return data
}

export async function getOrder(orderId: number) {
  const { data } = await api.get<Order>(`/orders/${orderId}`)
  return data
}

export async function createOrder(payload: OrderCreate) {
  const { data } = await api.post<Order>('/orders', payload)
  return data
}

export async function updateOrder(orderId: number, payload: Partial<OrderCreate>) {
  const { data } = await api.patch<Order>(`/orders/${orderId}`, payload)
  return data
}

export async function updateOrderStatus(orderId: number, status: OrderStatus) {
  const { data } = await api.patch<Order>(`/orders/${orderId}`, { status })
  return data
}

export async function startOrderPicking(orderId: number) {
  const { data } = await api.post<Order>(`/picking/${orderId}/start`)
  return data
}

export async function shipOrder(orderId: number) {
  const { data } = await api.post<Order>(`/orders/${orderId}/ship`)
  return data
}

export async function deleteOrder(orderId: number) {
  await api.delete(`/orders/${orderId}`)
}

// ✅ Исправленная функция updateSuggestedStock
export async function updateSuggestedStock(
  orderId: number,
  orderItemId: number,
  stockId: number
): Promise<Order> {
  const { data } = await api.patch(`/orders/${orderId}/items/${orderItemId}/suggested-stock`, {
    stock_id: stockId,
  })
  return data
}

// --- Picking ---
export async function getPickingList(orderId: number) {
  const { data } = await api.get<PickingListItem[]>(`/orders/${orderId}/picking-list`)
  return data
}

export async function pickItem(payload: PickItemRequest) {
  const { data } = await api.post<PickItemResponse>('/picking/pick', payload)
  return data
}

export async function completePicking(orderId: number) {
  const { data } = await api.post<Order | { message?: string }>(`/picking/${orderId}/complete`)
  return data
}

export async function cancelPicking(orderId: number) {
  const { data } = await api.post<{ message: string }>(`/picking/${orderId}/cancel`)
  return data
}

export async function refreshStocks() {
  const { data } = await api.get<Stock[]>('/stocks')
  return data
}

export async function getPickOperations(orderId: number): Promise<PickOperation[]> {
  const { data } = await api.get(`/picking/orders/${orderId}/pick-operations`)
  return data
}

export async function deletePickOperation(operationId: number): Promise<void> {
  await api.delete(`/picking/pick-operations/${operationId}`)
}

export async function updatePickOperation(operationId: number, pairsQuantity: number): Promise<PickOperation> {
  const { data } = await api.patch(`/picking/pick-operations/${operationId}`, {
    pairs_quantity: pairsQuantity
  })
  return data
}

export async function getPackingProposal(orderId: number) {
  const { data } = await api.get<PackingProposalResponse>(`/picking/${orderId}/packing-proposal`)
  return data
}

// --- CHZ ---
export async function requestChz(orderId: number, payload: { order_item_ids: number[]; comment?: string }) {
  const { data } = await api.post<ChzRequest>(`/orders/${orderId}/chz-requests`, payload)
  return data
}

export async function getOrderChzRequests(orderId: number) {
  const { data } = await api.get<ChzRequest[]>(`/orders/${orderId}/chz-requests`)
  return data
}

export async function markOrderChzReady(orderId: number) {
  const { data } = await api.post<ChzRequest>(`/orders/${orderId}/chz-ready`)
  return data
}

export async function getChzRegistry() {
  const { data } = await api.get<ChzRegistryEntry[]>('/chz/registry')
  return data
}

export async function archiveChzRegistryEntries(payload: ChzRegistryBulkAction) {
  const { data } = await api.post<ChzRegistryEntry[]>('/chz/registry/archive', payload)
  return data
}

export async function createManualChzRequest(payload: ManualChzRequestCreate) {
  const { data } = await api.post('/chz/manual-requests', payload)
  return data
}

// --- Push notifications ---
export async function getPushPublicKey(): Promise<{ public_key: string }> {
  const { data } = await api.get('/push/public-key')
  return data
}

export async function savePushSubscription(payload: PushSubscriptionJSON) {
  const { data } = await api.post('/push/subscriptions', payload)
  return data
}

export async function deletePushSubscription(payload: PushSubscriptionJSON) {
  await api.delete('/push/subscriptions', { data: payload })
}

export type PushTestResponse = {
  sent: boolean
  sent_count: number
}

export async function sendTestPushNotification(endpoint: string): Promise<PushTestResponse> {
  const { data } = await api.post('/push/test', { endpoint })
  return data
}

export type NotificationPreferenceOption = {
  key: string
  label: string
  description: string
  enabled: boolean
}

export type NotificationPreferencesResponse = {
  options: NotificationPreferenceOption[]
}

export async function getNotificationPreferences(): Promise<NotificationPreferencesResponse> {
  const { data } = await api.get('/push/preferences')
  return data
}

export async function updateNotificationPreferences(preferences: Record<string, boolean>): Promise<NotificationPreferencesResponse> {
  const { data } = await api.patch('/push/preferences', { preferences })
  return data
}

// --- History ---
export async function getHistory(params?: {
  operation_type?: string
  user_id?: number
  from_date?: string
  to_date?: string
  limit?: number
  offset?: number
}) {
  const { data } = await api.get<HistoryPageResponse>('/history', { params })
  return data
}

export async function rollbackHistory(logId: number) {
  const { data } = await api.post(`/history/${logId}/rollback`)
  return data
}

export async function getOrderAuditLogs(orderId: number): Promise<HistoryLog[]> {
  const { data } = await api.get<HistoryLog[]>(`/orders/${orderId}/audit-logs`)
  return data
}

// --- Employees ---
export async function getEmployees(includeInactive = false): Promise<Employee[]> {
  const { data } = await api.get<Employee[]>('/employees', {
    params: includeInactive ? { include_inactive: true } : undefined,
  })
  return data
}

export async function createEmployee(payload: {
  full_name: string
  position?: string | null
  department: EmployeeDepartment
}): Promise<Employee> {
  const { data } = await api.post<Employee>('/employees', payload)
  return data
}

export async function updateEmployee(
  employeeId: number,
  payload: Partial<{
    full_name: string
    position: string | null
    department: EmployeeDepartment
    is_active: boolean
  }>,
): Promise<Employee> {
  const { data } = await api.patch<Employee>(`/employees/${employeeId}`, payload)
  return data
}

export async function deleteEmployee(employeeId: number, options?: { hard?: boolean }): Promise<Employee> {
  const { data } = await api.delete<Employee>(`/employees/${employeeId}`, {
    params: options?.hard ? { hard: true } : undefined,
  })
  return data
}

export async function getEmployeeShifts(params?: {
  date_from?: string
  date_to?: string
}): Promise<EmployeeShift[]> {
  const { data } = await api.get<EmployeeShift[]>('/employee-shifts', { params })
  return data
}

export async function createEmployeeShift(payload: {
  employee_id: number
  work_date: string
  start_time: string
  end_time: string
  department: EmployeeDepartment
  comment?: string | null
}): Promise<EmployeeShift> {
  const { data } = await api.post<EmployeeShift>('/employee-shifts', payload)
  return data
}

export async function deleteEmployeeShift(shiftId: number): Promise<void> {
  await api.delete(`/employee-shifts/${shiftId}`)
}

// --- Production ---
export async function getProductionOrders() {
  const { data } = await api.get<ProductionOrder[]>('/production-orders')
  return data
}

export async function getProductionOrder(productionOrderId: number) {
  const { data } = await api.get<ProductionOrder>(`/production-orders/${productionOrderId}`)
  return data
}

export async function createProductionOrder(payload: {
  name: string
  task_type?: ProductionTaskType
  priority: number
  comment?: string
  related_order_id?: number | null
  items: {
    item_id: number
    pairs_quantity: number
    item_size?: string | null   // ✅ Добавить
    item_color?: string | null  // ✅ Добавить
  }[]
}) {
  const { data } = await api.post<ProductionOrder>('/production-orders', payload)
  return data
}

export async function deleteProductionOrder(productionOrderId: number) {
  await api.delete(`/production-orders/${productionOrderId}`)
}

export async function updateProductionOrder(
  productionOrderId: number,
  payload: {
    name?: string
    task_type?: ProductionTaskType
    priority?: number
    comment?: string
    related_order_id?: number | null
    batch_number?: string
    production_date?: string
  },
) {
  const { data } = await api.patch<ProductionOrder>(`/production-orders/${productionOrderId}`, payload)
  return data
}

export async function createProductionSupplyRequest(
  productionOrderId: number,
  payload: {
    request_type: 'raw_material' | 'consumable'
    comment?: string
    items: { 
      item_id: number
      quantity: number
      size?: string
      manufacturer?: string
      stock_id?: number
      production_order_item_id?: number  // <-- добавляем
    }[]
  },
) {
  const { data } = await api.post<ProductionOrder>(`/production-orders/${productionOrderId}/supply-requests`, payload)
  return data
}


export async function createAutomaticProductionSupplyRequest(
  productionOrderId: number,
  payload: {
    request_type: 'raw_material' | 'consumable'
    comment?: string
  },
) {
  const { data } = await api.post<ProductionOrder>(`/production-orders/${productionOrderId}/supply-requests/auto`, payload)
  return data
}

export async function createProductionReceiptRequest(
  productionOrderId: number,
  payload: { production_order_item_id: number; quantity: number; comment?: string },
) {
  const { data } = await api.post<ProductionOrder>(`/production-orders/${productionOrderId}/receipt-requests`, payload)
  return data
}

export async function startProductionSupplyRequest(supplyRequestId: number) {
  const { data } = await api.post<ProductionOrder>(`/production-orders/supply-requests/${supplyRequestId}/start`)
  return data
}

export async function fulfillProductionSupplyRequest(
  supplyRequestId: number,
  payload: { items: { request_item_id: number; stock_id?: number | null; cell_id?: number | null; quantity: number }[] },
) {
  const { data } = await api.post<ProductionOrder>(`/production-orders/supply-requests/${supplyRequestId}/fulfill`, payload)
  return data
}

export async function startProductionOrder(
  productionOrderId: number,
  payload: { batch_number: string; production_date: string },
) {
  const { data } = await api.post<ProductionOrder>(`/production-orders/${productionOrderId}/start`, payload)
  return data
}

export async function completeProductionOrder(productionOrderId: number) {
  const { data } = await api.post<ProductionOrder>(`/production-orders/${productionOrderId}/complete`)
  return data
}

export async function updateProductionOrderItemProduced(
  productionOrderId: number,
  productionOrderItemId: number,
  payload: { produced_pairs: number; comment?: string }  // <-- добавляем comment
) {
  const { data } = await api.patch<ProductionOrder>(
    `/production-orders/${productionOrderId}/items/${productionOrderItemId}/produced`,
    payload,
  )
  return data
}

export async function transferProductionToStock(
  productionOrderId: number,
  payload: { production_order_item_id: number; cell_id: number; pairs_quantity: number },
) {
  const { data } = await api.post<ProductionOrder>(`/production-orders/${productionOrderId}/transfer`, payload)
  return data
}

export async function requestProductionChz(
  productionOrderId: number,
  payload: { production_order_item_ids?: number[]; comment?: string },
) {
  const { data } = await api.post<ProductionOrder>(`/production-orders/${productionOrderId}/chz-requests`, payload)
  return data
}

export async function getAvailableStocks(inventoryType: 'raw_material' | 'consumable') {
  const { data } = await api.get('/production-orders/available-stocks', {
    params: { inventory_type: inventoryType }
  })
  return data
}

export interface ProductionHistory {
  id: number
  production_order_item_id: number
  old_produced_pairs: number
  new_produced_pairs: number
  changed_by_user_id: number | null
  changed_by_username: string
  comment: string | null
  created_at: string
}

export async function getProductionHistory(orderId: number): Promise<ProductionHistory[]> {
  // ❌ Было: /production/${orderId}/history
  // ✅ Правильно: /production-orders/${orderId}/history
  const response = await api.get(`/production-orders/${orderId}/history`)
  return response.data
}


export async function updateProductionOrderItemBatchDate(
  productionOrderId: number,
  productionOrderItemId: number,
  payload: { batch_number?: string; production_date?: string },
) {
  const { data } = await api.patch<ProductionOrder>(
    `/production-orders/${productionOrderId}/items/${productionOrderItemId}/batch-date`,
    payload,
  )
  return data
}


export async function getProductionOrderAuditLogs(orderId: number): Promise<HistoryLog[]> {
  const { data } = await api.get<HistoryLog[]>(`/production-orders/${orderId}/audit-logs`)
  return data
}

export async function getProductionLaborEntries(productionOrderId: number): Promise<ProductionLaborEntry[]> {
  const { data } = await api.get<ProductionLaborEntry[]>(`/production-orders/${productionOrderId}/labor`)
  return data
}

export async function createProductionLaborEntries(
  productionOrderId: number,
  payload: {
    work_date: string
    start_time: string
    end_time: string
    people_count: number
    employee_ids: number[]
    comment?: string | null
  },
): Promise<ProductionLaborEntry[]> {
  const { data } = await api.post<ProductionLaborEntry[]>(`/production-orders/${productionOrderId}/labor`, payload)
  return data
}

export async function deleteProductionLaborEntry(
  productionOrderId: number,
  entryId: number,
): Promise<void> {
  await api.delete(`/production-orders/${productionOrderId}/labor/${entryId}`)
}

export async function getProductionLaborReport(params?: {
  date_from?: string
  date_to?: string
}): Promise<ProductionLaborReport> {
  const { data } = await api.get<ProductionLaborReport>('/reports/production-labor', { params })
  return data
}
