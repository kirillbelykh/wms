import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from '@/lib/toast'
import { canUsePushNotifications, requestBrowserPushPermission, syncPushSubscription } from '@/lib/pushNotifications'
import { orderStatusLabel } from '@/lib/utils'
import { useAuthStore } from '@/stores/authStore'

// Глобальный сокет
let socket: WebSocket | null = null
let pingInterval: NodeJS.Timeout | null = null
let isConnecting = false
let reconnectTimer: NodeJS.Timeout | null = null
const messageCache = new Map<string, number>()
const PUSH_PROMPT_STORAGE_KEY = 'wms_push_prompt_seen_v1'

async function subscribeToPushNotifications() {
  if (!canUsePushNotifications() || Notification.permission !== 'granted') return
  await syncPushSubscription()
}

async function requestPushPermissionAndSubscribe() {
  if (!canUsePushNotifications()) {
    toast.error('Браузер не поддерживает push-уведомления')
    return
  }

  const permission = await requestBrowserPushPermission()
  if (permission !== 'granted') {
    toast.info('Push-уведомления не включены')
    return
  }

  await subscribeToPushNotifications()
  toast.success('Push-уведомления включены')
}

function ensurePushNotificationsPrompt() {
  if (!canUsePushNotifications()) return

  if (Notification.permission === 'granted') {
    void subscribeToPushNotifications().catch((error) => {
      console.warn('Failed to subscribe to push notifications:', error)
    })
    return
  }

  if (Notification.permission === 'denied' || localStorage.getItem(PUSH_PROMPT_STORAGE_KEY)) return

  localStorage.setItem(PUSH_PROMPT_STORAGE_KEY, '1')
  toast.info('Включить системные push-уведомления?', {
    duration: 12000,
    action: {
      label: 'Включить',
      onClick: () => {
        void requestPushPermissionAndSubscribe().catch((error) => {
          console.error('Failed to enable push notifications:', error)
          toast.error('Не удалось включить push-уведомления')
        })
      },
    },
  })
}

function playNotificationSound() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = 'sine'
    osc.frequency.value = 880
    gain.gain.value = 0.15
    osc.start()
    gain.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime + 0.3)
    osc.stop(ctx.currentTime + 0.3)
  } catch {
    // Sound playback can be blocked by browser autoplay policy.
  }
}

function connectWebSocket(token: string) {
  if (isConnecting) {
    console.log('⏳ Already connecting, skipping...')
    return
  }
  
  if (socket && socket.readyState === WebSocket.OPEN) {
    console.log('♻️ Socket already open')
    return
  }

  if (socket && socket.readyState === WebSocket.CONNECTING) {
    console.log('⏳ Socket is connecting...')
    return
  }

  isConnecting = true
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
  const url = `${protocol}://${window.location.host}/ws?token=${encodeURIComponent(token)}`
  console.log('🔌 Connecting WebSocket:', url)

  try {
    socket = new WebSocket(url)
  } catch (err) {
    console.error('❌ Failed to create WebSocket:', err)
    isConnecting = false
    return
  }

  socket.onopen = () => {
    console.log('✅ WebSocket connected')
    isConnecting = false
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    if (pingInterval) clearInterval(pingInterval)
    pingInterval = setInterval(() => {
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send('ping')
      }
    }, 30000)
  }

  socket.onmessage = (event) => {
    // Защита от ошибок в обработчике
    try {
      if (event.data === 'pong') return

      let msg
      try {
        msg = JSON.parse(event.data)
      } catch {
        console.warn('⚠️ Non-JSON message:', event.data)
        return
      }

      console.log('📨 WS message:', msg)

      if (msg.error) {
        console.error('❌ WS error:', msg.error)
        return
      }

      // Обработка события
      try {
        handleMessage(msg.event, msg.data)
      } catch (e) {
        console.error('❌ Error handling message:', e)
      }
    } catch (e) {
      console.error('❌ Fatal error in onmessage:', e)
    }
  }

  socket.onclose = (event) => {
    console.log('🔌 WebSocket closed:', event.code, event.reason)
    isConnecting = false
    if (pingInterval) {
      clearInterval(pingInterval)
      pingInterval = null
    }

    // Переподключение, если не было ошибки политики
    if (event.code !== 1008) {
      if (reconnectTimer) clearTimeout(reconnectTimer)
      reconnectTimer = setTimeout(() => {
        const token = localStorage.getItem('wms_token')
        if (token) {
          console.log('🔄 Reconnecting...')
          connectWebSocket(token)
        }
      }, 5000)
    }
  }

  socket.onerror = (error) => {
    console.error('⚠️ WebSocket error:', error)
    isConnecting = false
  }
}

// Обработка сообщений
function handleMessage(event: string, data: any) {
  const orderLabel = data?.order_name ? `заказа ${data.order_name}` : `заказа #${data?.order_id}`

  if (event === 'order_created') {
    const key = `order_${data.order_id}`
    const now = Date.now()
    if (messageCache.get(key) && now - messageCache.get(key)! < 3000) {
      console.log('⏭️ Duplicate ignored')
      return
    }
    messageCache.set(key, now)

    playNotificationSound()
    toast.success(`🆕 Новый заказ: ${data.order_name}`, {
      description: `Создан: ${data.created_by}`,
      duration: 10000,
      action: {
        label: 'Открыть',
        onClick: () => window.location.href = `/orders/${data.order_id}`,
      },
    })
  }

  if (event === 'order_deleted') {
    toast.info(`🗑️ Заказ #${data.order_id} удалён`, { duration: 5000 })
  }

  if (event === 'order_updated') {
    toast.info(`✏️ Заказ #${data.order_id} обновлён`, { duration: 3000 })
  }

  if (event === 'order_status_changed') {
    toast.info(`Статус ${orderLabel}: ${orderStatusLabel(data.status)}`, { duration: 3000 })
  }

  if (event === 'chz_request_created') {
    toast.info(`Запрос ЧЗ отправлен для ${orderLabel}`, { duration: 4000 })
  }

  if (event === 'chz_request_acknowledged') {
    toast.info(`Оператор ЧЗ принял ${orderLabel}`, { duration: 4000 })
  }

  if (event === 'manual_chz_requested') {
    toast.info(`Создан ручной запрос ЧЗ${data?.order_name ? `: ${data.order_name}` : ''}`, { duration: 4000 })
  }

  if (event === 'manual_chz_acknowledged') {
    toast.info(`Ручной запрос ЧЗ взят в работу${data?.order_name ? `: ${data.order_name}` : ''}`, { duration: 4000 })
  }

  if (event === 'manual_chz_ready') {
    playNotificationSound()
    toast.success(`Коды ЧЗ готовы${data?.order_name ? `: ${data.order_name}` : ''}`, { duration: 6000 })
  }

  if (event === 'chz_codes_ready') {
    playNotificationSound()
    toast.success(`Для ${orderLabel} ЧЗ готовы!`, {
      duration: 7000,
      action: {
        label: 'Открыть',
        onClick: () => window.location.href = `/orders/${data.order_id}`,
      },
    })
  }

  if (event === 'production_order_created') {
    toast.info(`Новое производственное задание: ${data.name}`, { duration: 4000 })
  }

  if (event === 'production_supply_requested') {
    toast.info(`Для задания ${data.name} запрошены ресурсы`, { duration: 4000 })
  }

  
  if (event === 'production_supply_fulfilled') {
    toast.success(`Заявка на ресурсы выполнена для ${data.name}`, { duration: 4000 })
  }

  if (event === 'production_ready_to_work') {
    playNotificationSound()
    toast.success(`Задание ${data.name} готово к работе`, { duration: 5000 })
  }

  if (event === 'production_chz_requested') {
    toast.info(`Для задания ${data.name} отправлен запрос ЧЗ`, { duration: 4000 })
  }

  if (event === 'production_chz_acknowledged') {
    toast.info('Оператор ЧЗ взял в работу производственный запрос', { duration: 4000 })
  }

  if (event === 'production_chz_ready') {
    playNotificationSound()
    toast.success(`Для производственного задания #${data.production_order_id} ЧЗ готовы!`, { duration: 5000 })
  }

  if (event === 'production_stock_transferred') {
    toast.success(`Готовая продукция по заданию ${data.name} передана на склад`, { duration: 4000 })
  }

  // Обновляем список заказов
  if (event === 'production_completed') {
    toast.info(`Задание ${data.name} отмечено как выполненное`, { duration: 4000 })
  }

  const queryClient = (window as any).__queryClient
  if (queryClient) {
    queryClient.invalidateQueries({ queryKey: ['orders'] })
    queryClient.invalidateQueries({ queryKey: ['chz-registry'] })
    queryClient.invalidateQueries({ queryKey: ['production-orders'] })
    if (data?.order_id) {
      queryClient.invalidateQueries({ queryKey: ['picking', data.order_id] })
      queryClient.invalidateQueries({ queryKey: ['packing-proposal', data.order_id] })
    }
  }
}

// Закрыть сокет
function closeWebSocket() {
  if (socket) {
    try {
      socket.close()
    } catch {
      // Socket may already be closed by the browser.
    }
    socket = null
  }
  if (pingInterval) {
    clearInterval(pingInterval)
    pingInterval = null
  }
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  isConnecting = false
}

export function useRealtimeNotifications() {
  const token = useAuthStore((state) => state.token)
  const queryClient = useQueryClient()

  // Сохраняем queryClient глобально для доступа из обработчика
  useEffect(() => {
    ;(window as any).__queryClient = queryClient
    return () => {
      ;(window as any).__queryClient = null
    }
  }, [queryClient])

  // Управление WebSocket
  useEffect(() => {
    if (!token) {
      closeWebSocket()
      return
    }

    if (socket && socket.readyState === WebSocket.OPEN) {
      console.log('♻️ Using existing WebSocket')
      return
    }

    if (socket && socket.readyState === WebSocket.CONNECTING) {
      console.log('⏳ WebSocket connecting...')
      return
    }

    // Подключаемся
    connectWebSocket(token)
    ensurePushNotificationsPrompt()
    const syncOnFocus = () => {
      if (Notification.permission === 'granted') {
        void subscribeToPushNotifications().catch((error) => {
          console.warn('Failed to refresh push subscription:', error)
        })
      }
    }
    window.addEventListener('focus', syncOnFocus)

    // Очистка при размонтировании
    return () => {
      window.removeEventListener('focus', syncOnFocus)
      // НЕ закрываем сокет, чтобы он жил дольше компонента
    }
  }, [token])
}
