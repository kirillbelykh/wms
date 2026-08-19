import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  LogOut,
  Monitor,
  Moon,
  Sun,
  Check,
  Bell,
  BellOff,
  BellRing,
  RefreshCw,
  Send,
  PackagePlus,
  FilePenLine,
  Tags,
  Factory,
  Boxes,
  BadgeCheck,
  type LucideIcon,
} from 'lucide-react'
import { getMe, getNotificationPreferences, sendTestPushNotification, updateNotificationPreferences } from '@/api/client'
import { BentoCard, BentoGrid } from '@/components/ui/bento-grid'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  getCurrentPushSubscription,
  getPushDeviceStatus,
  requestBrowserPushPermission,
  syncPushSubscription,
  unsubscribeFromPushNotifications,
  type PushDeviceStatus,
} from '@/lib/pushNotifications'
import { useAppStore } from '@/stores/appStore'
import { useAuthStore } from '@/stores/authStore'
import type { ThemeMode } from '@/types/wms'
import { formatDate, cn, getErrorMessage } from '@/lib/utils'
import { toast } from '@/lib/toast'

const themeOptions: { value: ThemeMode; label: string; icon: typeof Sun; gradient: string }[] = [
  {
    value: 'light',
    label: 'Светлая',
    icon: Sun,
    gradient: 'from-amber-50 to-yellow-100 dark:from-amber-950/30 dark:to-yellow-950/20',
  },
  {
    value: 'dark',
    label: 'Тёмная',
    icon: Moon,
    gradient: 'from-slate-100 to-indigo-100 dark:from-slate-800/50 dark:to-indigo-950/30',
  },
  {
    value: 'system',
    label: 'Системная',
    icon: Monitor,
    gradient: 'from-blue-50 to-cyan-100 dark:from-blue-950/30 dark:to-cyan-950/20',
  },
]

const NOTIFICATION_ICONS: Record<string, LucideIcon> = {
  order_created: PackagePlus,
  order_updates: FilePenLine,
  marking: Tags,
  production: Factory,
  production_supplies: Boxes,
  production_marking: BadgeCheck,
}

export function SettingsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const theme = useAppStore((state) => state.theme)
  const setTheme = useAppStore((state) => state.setTheme)
  const logout = useAuthStore((state) => state.logout)
  const [pushStatus, setPushStatus] = useState<PushDeviceStatus | null>(null)
  const [pushBusy, setPushBusy] = useState(false)
  const userQuery = useQuery({ queryKey: ['auth', 'me'], queryFn: getMe })
  const notificationPreferencesQuery = useQuery({
    queryKey: ['push', 'preferences'],
    queryFn: getNotificationPreferences,
  })
  const user = userQuery.data

  const refreshPushStatus = async () => {
    setPushStatus(await getPushDeviceStatus())
  }

  const notificationPreferencesMutation = useMutation({
    mutationFn: updateNotificationPreferences,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['push', 'preferences'] })
      toast.success('Настройки уведомлений сохранены')
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  const testPushMutation = useMutation({
    mutationFn: async () => {
      const subscription = await getCurrentPushSubscription()
      if (!subscription?.endpoint) {
        throw new Error('На этом устройстве нет активной push-подписки')
      }
      return sendTestPushNotification(subscription.endpoint)
    },
    onSuccess: (result) => {
      if (result.sent) {
        toast.success('Тестовое push-уведомление отправлено')
      } else {
        toast.error('Не удалось отправить тестовое уведомление')
      }
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  useEffect(() => {
    void refreshPushStatus().catch((error) => {
      console.warn('Failed to load push status:', error)
    })
  }, [])

  const handleLogout = async () => {
    try {
      await unsubscribeFromPushNotifications()
    } catch (error) {
      console.warn('Failed to unsubscribe from push notifications during logout:', error)
    } finally {
      logout()
      navigate('/login', { replace: true })
    }
  }

  const toggleNotificationPreference = (key: string, enabled: boolean) => {
    const current = notificationPreferencesQuery.data?.options ?? []
    const preferences = Object.fromEntries(current.map((option) => [option.key, option.enabled]))
    notificationPreferencesMutation.mutate({ ...preferences, [key]: enabled })
  }

  const enablePushNotifications = async () => {
    setPushBusy(true)
    try {
      const permission = await requestBrowserPushPermission()
      if (permission !== 'granted') {
        toast.info('Разрешение на push-уведомления не выдано')
        return
      }
      await syncPushSubscription()
      toast.success('Push-уведомления включены на этом устройстве')
    } catch (error) {
      toast.error(getErrorMessage(error))
    } finally {
      setPushBusy(false)
      await refreshPushStatus()
    }
  }

  const reconnectPushNotifications = async () => {
    setPushBusy(true)
    try {
      await syncPushSubscription()
      toast.success('Push-подписка обновлена')
    } catch (error) {
      toast.error(getErrorMessage(error))
    } finally {
      setPushBusy(false)
      await refreshPushStatus()
    }
  }

  const disablePushNotifications = async () => {
    setPushBusy(true)
    try {
      const removed = await unsubscribeFromPushNotifications()
      toast.success(removed ? 'Push-уведомления отключены на этом устройстве' : 'Активной push-подписки не найдено')
    } catch (error) {
      toast.error(getErrorMessage(error))
    } finally {
      setPushBusy(false)
      await refreshPushStatus()
    }
  }

  return (
    <section className="page-shell space-y-5">
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Карточка выбора темы */}
        <Card>
          <Card.Header>
            <Card.Title>Оформление</Card.Title>
          </Card.Header>
          <Card.Content>
            <div className="grid grid-cols-3 gap-3">
              {themeOptions.map((option) => {
                const Icon = option.icon
                const isActive = theme === option.value

                return (
                  <button
                    key={option.value}
                    onClick={() => setTheme(option.value)}
                    className={cn(
                      'relative flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all duration-200',
                      'bg-gradient-to-br',
                      option.gradient,
                      isActive
                        ? 'border-primary shadow-lg shadow-primary/20 scale-105'
                        : 'border-border hover:border-primary/50 hover:shadow-md hover:scale-102',
                    )}
                  >
                    {/* Галочка выбора */}
                    {isActive && (
                      <div className="absolute -top-2 -right-2 rounded-full bg-primary p-1 shadow-md">
                        <Check className="h-3 w-3 text-primary-foreground" />
                      </div>
                    )}

                    {/* Иконка */}
                    <div
                      className={cn(
                        'rounded-full p-3 transition-colors',
                        isActive
                          ? 'bg-primary/20 text-primary'
                          : 'bg-muted text-muted-foreground group-hover:text-foreground',
                      )}
                    >
                      <Icon className="h-6 w-6" />
                    </div>

                    {/* Название */}
                    <div className="text-center">
                      <div
                        className={cn(
                          'text-sm font-medium transition-colors',
                          isActive ? 'text-primary' : 'text-muted-foreground',
                        )}
                      >
                        {option.label}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>

            {/* Текущий статус */}
            <div className="mt-4 rounded-lg bg-muted/50 p-3 text-center text-sm text-muted-foreground">
              {theme === 'light' && (
                <div className="flex items-center justify-center gap-2">
                  <Sun className="h-4 w-4 text-amber-500" />
                  Используется светлая тема
                </div>
              )}
              {theme === 'dark' && (
                <div className="flex items-center justify-center gap-2">
                  <Moon className="h-4 w-4 text-indigo-500" />
                  Используется тёмная тема
                </div>
              )}
              {theme === 'system' && (
                <div className="flex items-center justify-center gap-2">
                  <Monitor className="h-4 w-4 text-blue-500" />
                  Тема соответствует настройкам системы
                </div>
              )}
            </div>
          </Card.Content>
        </Card>

        {/* Карточка пользователя */}
        <Card>
          <Card.Header>
            <Card.Title>Профиль</Card.Title>
          </Card.Header>
          <Card.Content className="space-y-5">
            <div className="space-y-3">
              <div className="rounded-lg border bg-muted/30 p-4">
                <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Email
                </div>
                <div className="mt-1 text-lg font-semibold">{user?.username ?? "—"}</div>
              </div>
              <div className="rounded-lg border bg-muted/30 p-4">
                <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Дата регистрации
                </div>
                <div className="mt-1 text-lg font-semibold">{formatDate(user?.created_at)}</div>
              </div>
            </div>
            <Button variant="outline" className="w-full" onClick={handleLogout}>
              <LogOut className="h-4 w-4 mr-2" />
              Выйти из аккаунта
            </Button>
          </Card.Content>
        </Card>
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          <h2 className="text-lg font-semibold">Уведомления</h2>
        </div>

        {notificationPreferencesQuery.isLoading ? (
          <div className="grid auto-rows-[16rem] grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-full min-h-64 rounded-xl" />
            ))}
          </div>
        ) : (
          <BentoGrid className="auto-rows-[16rem] grid-cols-1 md:grid-cols-2 lg:grid-cols-3 lg:grid-rows-3">
            <BentoCard
              name="Push на устройстве"
              description={
                pushStatus?.supported === false
                  ? 'Браузер или текущий протокол не поддерживает системные уведомления.'
                  : pushStatus?.permission === 'denied'
                    ? 'Разрешение браузера отклонено. Разрешите уведомления в настройках сайта.'
                    : pushStatus?.subscribed
                      ? 'Системные уведомления приходят даже без открытой вкладки WMS.'
                      : 'Разрешите push, чтобы получать оповещения как в мессенджере.'
              }
              Icon={pushStatus?.subscribed ? BellRing : BellOff}
              cta={pushStatus?.subscribed ? 'Отключить push' : 'Включить push'}
              onCtaClick={() => {
                if (pushStatus?.subscribed) void disablePushNotifications()
                else void enablePushNotifications()
              }}
              ctaDisabled={pushBusy || pushStatus?.supported === false}
              className="lg:col-start-2 lg:col-end-3 lg:row-start-1 lg:row-end-4"
              background={
                <div className="absolute inset-0 overflow-hidden">
                  <div
                    className={cn(
                      'absolute -top-16 -right-10 h-56 w-56 rounded-full opacity-40 blur-2xl',
                      pushStatus?.subscribed ? 'bg-emerald-400/40' : 'bg-amber-400/30',
                    )}
                  />
                  <div className="absolute top-6 right-4 z-20 flex max-w-[14rem] flex-col gap-2 opacity-80 transition-all duration-300 group-hover:opacity-100">
                    <Button
                      size="sm"
                      variant="outline"
                      className="pointer-events-auto justify-start"
                      onClick={() => void reconnectPushNotifications()}
                      isDisabled={pushBusy || pushStatus?.permission !== 'granted'}
                    >
                      <RefreshCw className="h-4 w-4" />
                      Переподключить
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="pointer-events-auto justify-start"
                      onClick={() => testPushMutation.mutate()}
                      isDisabled={testPushMutation.isPending || pushStatus?.subscribed !== true}
                    >
                      <Send className="h-4 w-4" />
                      Проверить
                    </Button>
                  </div>
                </div>
              }
            />

            {(notificationPreferencesQuery.data?.options ?? []).slice(0, 4).map((option, index) => {
              const Icon = NOTIFICATION_ICONS[option.key] ?? Bell
              const slotClass = [
                'lg:col-start-1 lg:col-end-2 lg:row-start-1 lg:row-end-3',
                'lg:col-start-1 lg:col-end-2 lg:row-start-3 lg:row-end-4',
                'lg:col-start-3 lg:col-end-4 lg:row-start-1 lg:row-end-2',
                'lg:col-start-3 lg:col-end-4 lg:row-start-2 lg:row-end-4',
              ][index]

              return (
                <BentoCard
                  key={option.key}
                  name={option.label}
                  description={option.description}
                  Icon={Icon}
                  cta={option.enabled ? 'Отключить' : 'Включить'}
                  onCtaClick={() => toggleNotificationPreference(option.key, !option.enabled)}
                  ctaDisabled={notificationPreferencesMutation.isPending}
                  className={slotClass}
                  background={
                    <div className="absolute inset-0 overflow-hidden">
                      <div
                        className={cn(
                          'absolute -top-20 -right-16 h-48 w-48 rounded-full opacity-50 blur-2xl transition-colors',
                          option.enabled ? 'bg-sky-400/35' : 'bg-slate-300/40 dark:bg-slate-600/30',
                        )}
                      />
                      <div
                        className={cn(
                          'absolute top-5 right-5 rounded-full px-2.5 py-1 text-xs font-medium',
                          option.enabled
                            ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                            : 'bg-muted text-muted-foreground',
                        )}
                      >
                        {option.enabled ? 'Вкл' : 'Выкл'}
                      </div>
                    </div>
                  }
                />
              )
            })}
          </BentoGrid>
        )}

        {!notificationPreferencesQuery.isLoading &&
        (notificationPreferencesQuery.data?.options?.length ?? 0) > 4 ? (
          <BentoGrid className="auto-rows-[14rem] grid-cols-1 md:grid-cols-2">
            {(notificationPreferencesQuery.data?.options ?? []).slice(4).map((option) => {
              const Icon = NOTIFICATION_ICONS[option.key] ?? Bell
              return (
                <BentoCard
                  key={option.key}
                  name={option.label}
                  description={option.description}
                  Icon={Icon}
                  cta={option.enabled ? 'Отключить' : 'Включить'}
                  onCtaClick={() => toggleNotificationPreference(option.key, !option.enabled)}
                  ctaDisabled={notificationPreferencesMutation.isPending}
                  className="md:col-span-1"
                  background={
                    <div className="absolute inset-0 overflow-hidden">
                      <div
                        className={cn(
                          'absolute -top-20 -right-16 h-48 w-48 rounded-full opacity-50 blur-2xl',
                          option.enabled ? 'bg-sky-400/35' : 'bg-slate-300/40 dark:bg-slate-600/30',
                        )}
                      />
                      <div
                        className={cn(
                          'absolute top-5 right-5 rounded-full px-2.5 py-1 text-xs font-medium',
                          option.enabled
                            ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                            : 'bg-muted text-muted-foreground',
                        )}
                      >
                        {option.enabled ? 'Вкл' : 'Выкл'}
                      </div>
                    </div>
                  }
                />
              )
            })}
          </BentoGrid>
        ) : null}
      </div>

      {/* Информация о системе */}
      <Card>
        <Card.Header>
          <Card.Title>О системе</Card.Title>
        </Card.Header>
        <Card.Content>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg border bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950/30 dark:to-blue-950/20 p-4 text-center">
              <div className="text-2xl font-bold text-blue-600">GRUNDLAGE</div>
              <div className="text-sm text-muted-foreground mt-1">WMS</div>
            </div>
            <div className="rounded-lg border bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-950/30 dark:to-emerald-950/20 p-4 text-center">
              <div className="text-2xl font-bold text-emerald-600">v 0.1.0</div>
              <div className="text-sm text-muted-foreground mt-1">Версия приложения</div>
            </div>
          </div>
        </Card.Content>
      </Card>
    </section>
  )
}
