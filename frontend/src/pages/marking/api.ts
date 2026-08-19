import { withAgentFetchOptions } from './agentFetch'

export interface MarkingOrderQueueItem {
  uid: string
  order_name: string
  simpl_name: string
  gtin: string
  size: string
  color: string
  venchik: string
  units_per_pack: string
  codes_count: number
  full_name?: string
  tnved_code?: string
}

export interface MarkingOrderRecord {
  document_id: string
  order_name: string
  status: string
  status_raw?: string
  full_name?: string
  gtin?: string
  created_at?: string
  updated_at?: string
  codes_count?: number
  requested_codes_count?: number | null
  received_codes_count?: number | null
  positions_count?: number | null
  comment?: string
  product_group?: string
  source_status?: string
}

export interface OrdersState {
  queue: MarkingOrderQueueItem[]
  session_orders: MarkingOrderRecord[]
  history: MarkingOrderRecord[]
  deleted_orders?: MarkingOrderRecord[]
}

export interface OptionsResponse {
  simplified_options: string[]
  color_options: string[]
  size_options: string[]
  units_options: Array<string | number>
  venchik_options: string[]
}

export interface DownloadItem {
  document_id: string
  order_name: string
  full_name: string
  gtin: string
  status: string
  codes_count?: number
  requested_codes_count?: number | null
  received_codes_count?: number | null
}

export interface DownloadState {
  items: DownloadItem[]
  printers: string[]
  default_printer: string
}

export interface SubmitOrderQueueResponse extends AgentActionResponse {
  results?: Array<MarkingOrderRecord & { download_item?: DownloadItem }>
  errors?: Array<{ order_name?: string; error: string }>
  state?: OrdersState
}

export interface IntroItem {
  document_id: string
  order_name: string
  full_name: string
  gtin: string
  status: string
  status_summary?: string
  created_at?: string
  updated_at?: string
  codes_count?: number
  requested_codes_count?: number | null
}

export interface IntroState {
  items: IntroItem[]
  live_updated_at?: number | null
}

export interface OrderDetailsField {
  label: string
  value: string
  raw_key: string
}

export interface OrderDetailsResponse {
  success: boolean
  fields: OrderDetailsField[]
  document_id: string
  source_type: string
  error?: string
}

interface AgentActionResponse {
  success?: boolean
  error?: string
  [key: string]: unknown
}

async function postToAgent<T>(agentUrl: string, method: string, args: unknown[] = []): Promise<T> {
  const response = await fetch(`${agentUrl}/api/call/${method}`, withAgentFetchOptions(agentUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ args }),
  }))

  if (!response.ok) {
    throw new Error(`Ошибка связи с локальным агентом: HTTP ${response.status}`)
  }

  return (await response.json()) as T
}

function ensurePayload<T extends AgentActionResponse>(payload: T, fallbackMessage: string): T {
  if (payload?.success === false) {
    throw new Error(String(payload.error || fallbackMessage))
  }
  if (typeof payload?.error === 'string' && !('success' in payload)) {
    throw new Error(payload.error || fallbackMessage)
  }
  return payload
}

export async function getMarkingOptions(agentUrl: string) {
  return ensurePayload(
    await postToAgent<OptionsResponse & AgentActionResponse>(agentUrl, 'get_options'),
    'Не удалось загрузить справочники маркировки',
  )
}

export async function getOrdersState(agentUrl: string, forceSync = false) {
  return ensurePayload(
    await postToAgent<OrdersState & AgentActionResponse>(agentUrl, 'get_orders_view_state', [forceSync]),
    'Не удалось загрузить список заказов маркировки',
  )
}

export async function getDownloadState(agentUrl: string) {
  return ensurePayload(
    await postToAgent<DownloadState & AgentActionResponse>(agentUrl, 'get_download_state'),
    'Не удалось загрузить состояние получения кодов',
  )
}

export async function getIntroState(agentUrl: string) {
  return ensurePayload(
    await postToAgent<IntroState & AgentActionResponse>(agentUrl, 'get_intro_state'),
    'Не удалось загрузить список для ввода в оборот',
  )
}

export async function getOrderDetails(agentUrl: string, documentId: string) {
  const payload = await postToAgent<OrderDetailsResponse>(agentUrl, 'get_order_details', [documentId])
  if (payload.success === false) {
    throw new Error(payload.error || 'Не удалось получить детали документа')
  }
  return payload
}

export async function addOrderItem(
  agentUrl: string,
  payload: {
    order_name: string
    name: string
    gtin: string
    size: string
    color: string
    venchik: string
    units_per_pack: string
    codes_count: number
    mode: 'params' | 'gtin'
  },
) {
  return ensurePayload(
    await postToAgent<AgentActionResponse & { queue?: MarkingOrderQueueItem[] }>(agentUrl, 'add_order_item', [payload]),
    'Не удалось добавить позицию в очередь',
  )
}

export async function submitOrderQueue(agentUrl: string) {
  return ensurePayload(
    await postToAgent<SubmitOrderQueueResponse>(agentUrl, 'submit_order_queue'),
    'Не удалось отправить очередь заказов',
  )
}

export async function clearOrderQueue(agentUrl: string) {
  return ensurePayload(
    await postToAgent<AgentActionResponse & { queue?: MarkingOrderQueueItem[] }>(agentUrl, 'clear_order_queue'),
    'Не удалось очистить очередь',
  )
}

export async function removeOrderQueueItem(agentUrl: string, uid: string) {
  return ensurePayload(
    await postToAgent<AgentActionResponse & { queue?: MarkingOrderQueueItem[] }>(agentUrl, 'remove_order_item', [uid]),
    'Не удалось удалить позицию из очереди',
  )
}

export async function deleteOrder(agentUrl: string, documentId: string) {
  return ensurePayload(
    await postToAgent<AgentActionResponse>(agentUrl, 'delete_order', [documentId]),
    'Не удалось отправить заказ в архив',
  )
}

export async function restoreDeletedOrder(agentUrl: string, documentId: string) {
  return ensurePayload(
    await postToAgent<AgentActionResponse>(agentUrl, 'restore_deleted_order', [documentId]),
    'Не удалось вернуть заказ из архива',
  )
}

export async function syncDownloadStatuses(agentUrl: string, autoDownload: boolean) {
  return ensurePayload(
    await postToAgent<AgentActionResponse & { state?: DownloadState }>(agentUrl, 'sync_download_statuses', [autoDownload]),
    'Не удалось обновить статусы получения кодов',
  )
}

export async function manualDownloadOrder(agentUrl: string, documentId: string) {
  return ensurePayload(
    await postToAgent<AgentActionResponse>(agentUrl, 'manual_download_order', [documentId]),
    'Не удалось получить коды по заказу',
  )
}

export async function printDownloadOrder(
  agentUrl: string,
  documentId: string,
  printerName: string,
  recordNumber?: string | null,
) {
  return ensurePayload(
    await postToAgent<AgentActionResponse>(agentUrl, 'print_download_order', [
      documentId,
      printerName,
      recordNumber || null,
    ]),
    'Не удалось отправить печать 30x20',
  )
}

export async function introduceOrders(
  agentUrl: string,
  documentIds: string[],
  productionDate: string,
  expirationDate: string,
  batchNumber: string,
) {
  const payload = await postToAgent<
    AgentActionResponse & {
      results?: Array<{ document_id: string }>
      errors?: Array<{ document_id: string; error: string }>
      state?: IntroState
    }
  >(agentUrl, 'introduce_orders', [
    documentIds,
    productionDate || null,
    expirationDate || null,
    batchNumber || null,
  ])

  if (payload.success === false && !payload.results && !payload.errors) {
    throw new Error(String(payload.error || 'Не удалось выполнить ввод в оборот'))
  }
  if (typeof payload.error === 'string' && !payload.results && !payload.errors) {
    throw new Error(payload.error)
  }

  return payload
}
