import { deletePushSubscription, getPushPublicKey, savePushSubscription } from '@/api/client'

export type BrowserPushPermission = NotificationPermission | 'unsupported'

export interface PushDeviceStatus {
  supported: boolean
  secureContext: boolean
  permission: BrowserPushPermission
  subscribed: boolean
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = `${base64String}${padding}`.replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)

  for (let index = 0; index < rawData.length; index += 1) {
    outputArray[index] = rawData.charCodeAt(index)
  }

  return outputArray
}

function arrayBufferToUrlBase64(buffer: ArrayBuffer | null | undefined) {
  if (!buffer) return ''

  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }

  return window.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function subscriptionUsesPublicKey(subscription: PushSubscription, publicKey: string) {
  return arrayBufferToUrlBase64(subscription.options.applicationServerKey) === publicKey
}

export function canUsePushNotifications() {
  return (
    typeof window !== 'undefined' &&
    window.isSecureContext &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

export async function getPushRegistration() {
  if (!canUsePushNotifications()) return null
  return navigator.serviceWorker.register('/wms-push-sw.js')
}

export async function getCurrentPushSubscription() {
  const registration = await getPushRegistration()
  if (!registration) return null
  return registration.pushManager.getSubscription()
}

export async function getPushDeviceStatus(): Promise<PushDeviceStatus> {
  if (!canUsePushNotifications()) {
    return {
      supported: false,
      secureContext: typeof window !== 'undefined' ? window.isSecureContext : false,
      permission: 'unsupported',
      subscribed: false,
    }
  }

  const subscription = await getCurrentPushSubscription()
  return {
    supported: true,
    secureContext: window.isSecureContext,
    permission: Notification.permission,
    subscribed: Boolean(subscription),
  }
}

export async function requestBrowserPushPermission() {
  if (!canUsePushNotifications()) return 'unsupported' as const
  return Notification.requestPermission()
}

export async function syncPushSubscription() {
  if (!canUsePushNotifications() || Notification.permission !== 'granted') {
    return null
  }

  const registration = await getPushRegistration()
  if (!registration) return null

  const { public_key: publicKey } = await getPushPublicKey()
  let existingSubscription = await registration.pushManager.getSubscription()

  if (existingSubscription && !subscriptionUsesPublicKey(existingSubscription, publicKey)) {
    await deletePushSubscription(existingSubscription.toJSON()).catch(() => undefined)
    await existingSubscription.unsubscribe()
    existingSubscription = null
  }

  const subscription =
    existingSubscription ||
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    }))

  await savePushSubscription(subscription.toJSON())
  return subscription
}

export async function unsubscribeFromPushNotifications() {
  const subscription = await getCurrentPushSubscription()
  if (!subscription) return false

  await deletePushSubscription(subscription.toJSON())
  await subscription.unsubscribe()
  return true
}
