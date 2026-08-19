self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    payload = {}
  }

  const title = payload.title || 'WMS'
  const options = {
    body: payload.body || 'Новое событие в системе',
    icon: payload.icon || '/favicon.svg',
    badge: payload.badge || '/favicon.svg',
    tag: payload.tag || 'wms-notification',
    requireInteraction: Boolean(payload.requireInteraction),
    renotify: true,
    vibrate: payload.vibrate || [180, 80, 180],
    data: {
      url: payload.url || '/orders',
    },
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL(event.notification.data?.url || '/orders', self.location.origin).href

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          client.navigate(url)
          return client.focus()
        }
      }
      return self.clients.openWindow(url)
    }),
  )
})
