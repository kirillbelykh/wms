import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart3,
  Boxes,
  ClipboardList,
  Clock,
  Factory,
  KeyRound,
  Layers3,
  LogOut,
  Package,
  PackageSearch,
  PanelLeftOpen,
  Printer,
  RefreshCw,
  RotateCcw,
  ScanLine,
  Settings,
  Shield,
  Smartphone,
  Users,
  Warehouse,
  X,
  type LucideIcon,
} from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import logo from '@/assets/logo.png'
import { getMe } from '@/api/client'
import menuLogo from '@/assets/menu_logo_3.png'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { ReorderList } from '@/components/ui/reorder-list'
import {
  canViewChzPage,
  canViewEmployees,
  canViewHistory,
  canViewItems,
  canViewMarkingAggregation,
  canViewMarkingChz,
  canViewMarkingIntro,
  canViewMarkingLabels,
  canViewMarkingOrders,
  canViewMarkingTsd,
  canViewMarkingTurnover,
  canViewMoves,
  canViewOrders,
  canViewProduction,
  canViewReports,
  canViewStocks,
  canViewWarehouses,
  hasPermission,
} from '@/lib/sectionAccess'
import { unsubscribeFromPushNotifications } from '@/lib/pushNotifications'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/authStore'

const DESKTOP_SIDEBAR_OPEN_WIDTH = 256
const DESKTOP_SIDEBAR_COLLAPSED_WIDTH = 64

const sidebarTransition = {
  duration: 0.28,
  ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
}

const textTransition = {
  duration: 0.16,
  ease: 'easeOut' as const,
}

type NavItem = {
  to: string
  label: string
  mobileLabel: string
  icon: LucideIcon
  group: 'main' | 'admin'
}

type SecondaryNavItem = {
  to: string
  label: string
  icon: LucideIcon
}

type TooltipState = {
  label: string
  top: number
  left: number
}
function SidebarTooltip({ tooltip }: { tooltip: TooltipState | null }) {
  if (!tooltip || typeof document === 'undefined') return null

  const style: CSSProperties = {
    position: 'fixed',
    top: tooltip.top,
    left: tooltip.left,
    transform: 'translateY(calc(-50% - 10px))',
  }

  return createPortal(
    <motion.div
      initial={{ opacity: 0, x: -4 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -4 }}
      transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
      style={style}
      className="pointer-events-none z-[9999] whitespace-nowrap rounded-lg bg-[#202123] px-3 py-1.5 text-xs font-semibold leading-none text-white shadow-xl"
    >
      {tooltip.label}
    </motion.div>,
    document.body,
  )
}

const MENU_ORDER_STORAGE_KEY = 'wms_menu_order_v1'
const DESKTOP_SIDEBAR_STORAGE_KEY = 'wms_desktop_sidebar_open_v1'

const navItems: NavItem[] = [
  { to: '/warehouses', label: 'Склады', mobileLabel: 'Склады', icon: Warehouse, group: 'main' },
  { to: '/items', label: 'Номенклатура', mobileLabel: 'Товары', icon: PackageSearch, group: 'main' },
  { to: '/stocks', label: 'Остатки', mobileLabel: 'Остатки', icon: Package, group: 'main' },
  { to: '/orders', label: 'Заказы', mobileLabel: 'Заказы', icon: ClipboardList, group: 'main' },
  { to: '/production', label: 'Производство', mobileLabel: 'Произв.', icon: Factory, group: 'main' },
  { to: '/employees', label: 'Сотрудники', mobileLabel: 'Сотр.', icon: Users, group: 'main' },
  { to: '/reports', label: 'Отчеты', mobileLabel: 'Отчеты', icon: BarChart3, group: 'main' },
  { to: '/move', label: 'Перемещения', mobileLabel: 'Перемещ.', icon: Boxes, group: 'main' },
  { to: '/history', label: 'История операций', mobileLabel: 'История', icon: Clock, group: 'main' },
  { to: '/settings', label: 'Настройки', mobileLabel: 'Настр.', icon: Settings, group: 'main' },
  { to: '/chz', label: 'Запрос ЧЗ', mobileLabel: 'Запрос ЧЗ', icon: Shield, group: 'main' },
]

const markingNavItems: NavItem[] = [
  {
    to: '/marking/turnover',
    label: 'Оборот кодов',
    mobileLabel: 'Коды',
    icon: ScanLine,
    group: 'main',
  },
  {
    to: '/marking/aggregation',
    label: 'Агрегация',
    mobileLabel: 'Агрег.',
    icon: Layers3,
    group: 'main',
  },
]

function getTurnoverSubItems(
  permissionsUser: ReturnType<typeof useAuthStore.getState>['user'],
): SecondaryNavItem[] {
  const items: SecondaryNavItem[] = []

  if (canViewMarkingOrders(permissionsUser)) {
    items.push({
      to: '/marking/turnover/orders',
      label: 'Заказ и получение',
      icon: ClipboardList,
    })
  }

  if (canViewMarkingIntro(permissionsUser)) {
    items.push({
      to: '/marking/turnover/intro',
      label: 'Ввод в оборот',
      icon: RefreshCw,
    })
  }

  if (canViewMarkingChz(permissionsUser)) {
    items.push({
      to: '/marking/turnover/chz',
      label: 'Запрос ЧЗ',
      icon: Shield,
    })
  }

  if (canViewMarkingTsd(permissionsUser)) {
    items.push({
      to: '/marking/turnover/tsd',
      label: 'Задание на ТСД',
      icon: Smartphone,
    })
  }

  if (canViewMarkingLabels(permissionsUser)) {
    items.push({
      to: '/marking/turnover/labels',
      label: 'Печать этикеток',
      icon: Printer,
    })
  }

  return items
}

const adminItems: NavItem[] = [
  { to: '/admin/users', label: 'Пользователи', mobileLabel: 'Пользов.', icon: Users, group: 'admin' },
  { to: '/admin/roles', label: 'Роли и права', mobileLabel: 'Права', icon: KeyRound, group: 'admin' },
]

function isNavItemVisible(item: NavItem, isAdmin: boolean, permissionsUser: ReturnType<typeof useAuthStore.getState>['user']) {
  switch (item.to) {
    case '/warehouses':
      return canViewWarehouses(permissionsUser)
    case '/items':
      return canViewItems(permissionsUser)
    case '/stocks':
      return canViewStocks(permissionsUser)
    case '/orders':
      return canViewOrders(permissionsUser)
    case '/production':
      return canViewProduction(permissionsUser)
    case '/employees':
      return canViewEmployees(permissionsUser)
    case '/reports':
      return canViewReports(permissionsUser)
    case '/move':
      return canViewMoves(permissionsUser)
    case '/history':
      return canViewHistory(permissionsUser)
    case '/chz':
      return canViewChzPage(permissionsUser)
    case '/settings':
      return true
    case '/marking/turnover':
      return canViewMarkingTurnover(permissionsUser)
    case '/marking/aggregation':
      return canViewMarkingAggregation(permissionsUser)
    case '/admin/users':
      return isAdmin || hasPermission(permissionsUser, 'manage_users')
    case '/admin/roles':
      return isAdmin || hasPermission(permissionsUser, 'manage_roles')
    default:
      return true
  }
}

function readMenuOrder(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const parsed = JSON.parse(window.localStorage.getItem(MENU_ORDER_STORAGE_KEY) || '[]')
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : []
  } catch {
    return []
  }
}

function writeMenuOrder(order: string[]) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(MENU_ORDER_STORAGE_KEY, JSON.stringify(order))
}

function readDesktopSidebarOpen() {
  if (typeof window === 'undefined') return true

  const savedValue = window.localStorage.getItem(DESKTOP_SIDEBAR_STORAGE_KEY)
  if (savedValue === 'true') return true
  if (savedValue === 'false') return false

  return true
}

function writeDesktopSidebarOpen(value: boolean) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(DESKTOP_SIDEBAR_STORAGE_KEY, String(value))
}

function getConfigurableNavigationItems(
  isAdmin: boolean,
  permissionsUser: ReturnType<typeof useAuthStore.getState>['user'],
) {
  return [...navItems, ...markingNavItems, ...adminItems].filter((item) =>
    isNavItemVisible(item, isAdmin, permissionsUser),
  )
}

function applyMenuOrder(items: NavItem[], menuOrder: string[]) {
  const orderIndex = new Map(menuOrder.map((path, index) => [path, index]))
  return [...items].sort((left, right) => {
    const leftIndex = orderIndex.get(left.to)
    const rightIndex = orderIndex.get(right.to)
    if (leftIndex !== undefined && rightIndex !== undefined) return leftIndex - rightIndex
    if (leftIndex !== undefined) return -1
    if (rightIndex !== undefined) return 1
    return items.indexOf(left) - items.indexOf(right)
  })
}

function getNavigationItems({
  isAdmin,
  permissionsUser,
  menuOrder = [],
}: {
  isAdmin: boolean
  permissionsUser: ReturnType<typeof useAuthStore.getState>['user']
  menuOrder?: string[]
}) {
  return applyMenuOrder(getConfigurableNavigationItems(isAdmin, permissionsUser), menuOrder)
}

const titles: Record<string, string> = {
  '/warehouses': '',
  '/items': '',
  '/stocks': '',
  '/orders': '',
  '/production': '',
  '/employees': '',
  '/reports': '',
  '/move': '',
  '/marking/turnover': 'Оборот кодов',
  '/marking/turnover/orders': 'Заказ и получение',
  '/marking/turnover/intro': 'Ввод в оборот',
  '/marking/turnover/tsd': 'Задание на ТСД',
  '/marking/turnover/labels': 'Печать этикеток',
  '/marking/aggregation': 'Агрегация',
  '/history': '',
  '/settings': '',
  '/chz': '',
  '/admin/users': '',
  '/admin/roles': '',
}

type TouchPoint = {
  x: number
  y: number
}

type TwoFingerSwipeState = {
  x: number
  y: number
  distance: number
  hasNavigated: boolean
  mode: 'pending' | 'swipe' | 'pinch'
}

const SWIPE_THRESHOLD = 70
const SWIPE_LOCK_THRESHOLD = 25
const PINCH_LOCK_DELTA = 25
const DIRECTION_LOCK_RATIO = 1.25

function getTouchCenter(touches: TouchList): TouchPoint {
  return {
    x: (touches[0].clientX + touches[1].clientX) / 2,
    y: (touches[0].clientY + touches[1].clientY) / 2,
  }
}

function getTouchDistance(touches: TouchList): number {
  const dx = touches[0].clientX - touches[1].clientX
  const dy = touches[0].clientY - touches[1].clientY

  return Math.hypot(dx, dy)
}

function isBlockedSwipeTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false

  return Boolean(
    target.closest(
      'input, textarea, select, [contenteditable="true"], [data-swipe-ignore="true"]',
    ),
  )
}

function getCurrentSectionIndex(pathname: string, sectionPaths: string[]): number {
  return sectionPaths.findIndex((path) => pathname === path || pathname.startsWith(`${path}/`))
}

function Navigation({
  collapsed = false,
  isAdmin = false,
  permissionsUser = null,
  menuOrder = [],
  onNavigate,
}: {
  collapsed?: boolean
  isAdmin?: boolean
  permissionsUser?: ReturnType<typeof useAuthStore.getState>['user']
  menuOrder?: string[]
  onNavigate?: () => void
}) {
  const items = getNavigationItems({ isAdmin, permissionsUser, menuOrder })

  const [tooltip, setTooltip] = useState<TooltipState | null>(null)

  const showTooltip = (label: string, element: HTMLElement) => {
    if (!collapsed) return

    const rect = element.getBoundingClientRect()
    setTooltip({
      label,
      top: Math.round(rect.top + rect.height / 2),
      left: rect.right + 12,
    })
  }

  const hideTooltip = () => {
    setTooltip(null)
  }

  return (
    <>
      <div className="flex flex-col gap-1">
      {items.map((item) => {
        const Icon = item.icon

        return (
          <Fragment key={item.to}>
            <div className="relative">
              <NavLink
                to={item.to}
                onClick={onNavigate}
                onMouseEnter={(event) => showTooltip(item.label, event.currentTarget)}
                onMouseLeave={hideTooltip}
                onFocus={(event) => showTooltip(item.label, event.currentTarget)}
                onBlur={hideTooltip}
                className={({ isActive }) =>
                  cn(
                    'focus-ring flex h-10 w-full items-center overflow-hidden rounded-xl text-sm font-medium text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground',
                    isActive && 'bg-slate-200/80 text-foreground dark:bg-slate-800',
                  )
                }
              >
                <span className="flex h-10 w-12 shrink-0 items-center justify-center">
                  <Icon className="h-5 w-5 shrink-0" />
                </span>

                <AnimatePresence initial={false}>
                  {!collapsed && (
                    <motion.span
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={textTransition}
                      className="min-w-0 flex-1 truncate whitespace-nowrap pr-3"
                    >
                      {item.label}
                    </motion.span>
                  )}
                </AnimatePresence>
              </NavLink>
            </div>
          </Fragment>
        )
      })}
      </div>
      <AnimatePresence>
        <SidebarTooltip tooltip={tooltip} />
      </AnimatePresence>
    </>
  )
}

function SecondaryNavigation({
  title,
  items,
  onNavigate,
}: {
  title: string
  items: SecondaryNavItem[]
  onNavigate?: () => void
}) {
  return (
    <div className="space-y-3">
      <div className="px-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {title}
      </div>

      <div className="flex flex-col gap-1">
        {items.map((item) => {
          const Icon = item.icon

          return (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  'flex h-10 w-full items-center gap-2 overflow-hidden rounded-xl px-3 text-sm font-medium transition-colors duration-200',
                  isActive
                    ? 'bg-slate-200/80 text-foreground dark:bg-slate-800'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )
              }
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{item.label}</span>
            </NavLink>
          )
        })}
      </div>
    </div>
  )
}

function SidebarBrand({
  collapsed = false,
  onClose,
  onLogoClick,
}: {
  collapsed?: boolean
  onClose?: () => void
  onLogoClick?: () => void
}) {
  const handleLogoClick = () => {
    onLogoClick?.()
  }

  return (
    <div className="mb-4 flex h-12 shrink-0 items-center justify-between">
      <div className="flex min-w-0 items-center">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center">
          <motion.img
            src={menuLogo}
            alt="Grundlage"
            onClick={onLogoClick ? handleLogoClick : undefined}
            onMouseDown={(event) => event.preventDefault()}
            whileHover={onLogoClick ? { scale: 1.04 } : undefined}
            whileTap={onLogoClick ? { scale: 0.96 } : undefined}
            transition={{ duration: 0.14, ease: 'easeOut' }}
            className={cn(
              'block h-10 w-10 shrink-0 select-none object-contain border-0 bg-transparent shadow-none',
              'outline-none ring-0 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0',
              'active:outline-none active:ring-0 dark:invert dark:brightness-110',
              onLogoClick && 'cursor-pointer',
            )}
            draggable={false}
            style={{
              WebkitTapHighlightColor: 'transparent',
              outline: 'none',
              border: 'none',
              boxShadow: 'none',
            }}
          />
        </span>

        <AnimatePresence initial={false}>
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={textTransition}
              className="min-w-0 overflow-hidden pr-2"
            >
              <p className="truncate text-sm font-semibold leading-tight text-foreground">
                Grundlage
              </p>
              <p className="truncate text-xs text-muted-foreground">WMS</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {onClose && (
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Закрыть меню">
          <X className="h-5 w-5" />
        </Button>
      )}
    </div>
  )
}

function MobileNav({
  isAdmin = false,
  permissionsUser = null,
  menuOrder = [],
}: {
  isAdmin?: boolean
  permissionsUser?: ReturnType<typeof useAuthStore.getState>['user']
  menuOrder?: string[]
}) {
  const items = getNavigationItems({ isAdmin, permissionsUser, menuOrder })

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-30 border-t border-border bg-card/95 px-2 py-2 shadow-[0_-10px_30px_rgba(15,23,42,0.08)] backdrop-blur md:hidden"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.5rem)' }}
    >
      <div className="flex gap-1 overflow-x-auto scrollbar-hide">
        {items.map((item) => {
          const Icon = item.icon

          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'focus-ring flex flex-shrink-0 flex-col items-center justify-center gap-1 rounded-xl px-3 py-2 text-[11px] font-medium leading-tight text-muted-foreground transition-colors',
                  isActive && 'bg-indigo-50 text-primary dark:bg-indigo-950 dark:text-indigo-200',
                )
              }
            >
              <Icon className="h-5 w-5" />
              <span className="whitespace-nowrap text-[10px]">{item.mobileLabel ?? item.label}</span>
            </NavLink>
          )
        })}
      </div>
    </nav>
  )
}

function MenuOrderDialog({
  open,
  onOpenChange,
  isAdmin,
  permissionsUser,
  menuOrder,
  onMenuOrderChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  isAdmin: boolean
  permissionsUser: ReturnType<typeof useAuthStore.getState>['user']
  menuOrder: string[]
  onMenuOrderChange: (order: string[]) => void
}) {
  const configurableItems = getConfigurableNavigationItems(isAdmin, permissionsUser)
  const orderedItems = applyMenuOrder(configurableItems, menuOrder)

  const commitOrder = (items: NavItem[]) => {
    onMenuOrderChange(items.map((item) => item.to))
  }

  const resetOrder = () => {
    onMenuOrderChange([])
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Порядок меню" className="max-w-lg">
        <div className="space-y-4">
          <ReorderList
            items={orderedItems}
            getId={(item) => item.to}
            getLabel={(item) => item.label}
            onReorder={commitOrder}
            label="Разделы меню"
          >
            {(item) => {
              const Icon = item.icon
              return (
                <div className="flex items-center gap-2.5">
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <p className="truncate text-[13px] font-medium text-foreground">{item.label}</p>
                </div>
              )
            }}
          </ReorderList>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={resetOrder}>
              <RotateCcw className="h-4 w-4" />
              Сбросить
            </Button>
            <Button onClick={() => onOpenChange(false)}>Готово</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function AppLayout() {
  const location = useLocation()
  const navigate = useNavigate()

  const [desktopSidebarOpen, setDesktopSidebarOpen] = useState(() => readDesktopSidebarOpen())
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [menuSettingsOpen, setMenuSettingsOpen] = useState(false)
  const [menuOrder, setMenuOrder] = useState<string[]>(() => readMenuOrder())

  const logout = useAuthStore((state) => state.logout)
  const setUser = useAuthStore((state) => state.setUser)
  const user = useAuthStore((state) => state.user)

  const isAdmin = user?.role === 'admin'
  const turnoverSubItems = useMemo(() => getTurnoverSubItems(user), [user])
  const showTurnoverSidebar =
    location.pathname.startsWith('/marking/turnover') && turnoverSubItems.length > 0

  const sectionPaths = useMemo(() => {
    return getNavigationItems({ isAdmin, permissionsUser: user, menuOrder }).map((item) => item.to)
  }, [isAdmin, menuOrder, user])

  const touchStartRef = useRef<TwoFingerSwipeState | null>(null)

  useEffect(() => {
    const handleTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 2) {
        touchStartRef.current = null
        return
      }

      if (isBlockedSwipeTarget(event.target)) {
        touchStartRef.current = null
        return
      }

      const center = getTouchCenter(event.touches)

      touchStartRef.current = {
        x: center.x,
        y: center.y,
        distance: getTouchDistance(event.touches),
        hasNavigated: false,
        mode: 'pending',
      }
    }

    const handleTouchMove = (event: TouchEvent) => {
      const start = touchStartRef.current

      if (!start || event.touches.length !== 2) return

      const center = getTouchCenter(event.touches)
      const currentDistance = getTouchDistance(event.touches)

      const dx = center.x - start.x
      const dy = center.y - start.y

      const absDx = Math.abs(dx)
      const absDy = Math.abs(dy)
      const pinchDelta = Math.abs(currentDistance - start.distance)

      const isLandscape =
        typeof window.matchMedia === 'function'
          ? window.matchMedia('(orientation: landscape)').matches
          : window.innerWidth > window.innerHeight

      const primaryMove = isLandscape ? absDy : absDx
      const secondaryMove = isLandscape ? absDx : absDy

      const looksLikeSwipe =
        primaryMove >= SWIPE_LOCK_THRESHOLD &&
        primaryMove > secondaryMove * DIRECTION_LOCK_RATIO

      const looksLikePinch =
        pinchDelta >= PINCH_LOCK_DELTA &&
        pinchDelta > primaryMove * 0.8

      if (start.mode === 'pending') {
        if (looksLikePinch) {
          start.mode = 'pinch'
          return
        }

        if (looksLikeSwipe) {
          start.mode = 'swipe'
        } else {
          return
        }
      }

      if (start.mode === 'pinch') return

      if (event.cancelable) {
        event.preventDefault()
      }

      if (start.hasNavigated) return

      const currentIndex = getCurrentSectionIndex(location.pathname, sectionPaths)

      if (currentIndex === -1) return

      const nextIndex = isLandscape ? (() => {
        const isVerticalSwipe =
          absDy >= SWIPE_THRESHOLD && absDy > absDx * DIRECTION_LOCK_RATIO

        if (!isVerticalSwipe) return null

        return dy > 0 ? currentIndex - 1 : currentIndex + 1
      })() : (() => {
        const isHorizontalSwipe =
          absDx >= SWIPE_THRESHOLD && absDx > absDy * DIRECTION_LOCK_RATIO

        if (!isHorizontalSwipe) return null

        return dx < 0 ? currentIndex + 1 : currentIndex - 1
      })()

      if (nextIndex === null || nextIndex < 0 || nextIndex >= sectionPaths.length) return

      start.hasNavigated = true
      navigate(sectionPaths[nextIndex])
    }

    const handleTouchEnd = (event: TouchEvent) => {
      if (event.touches.length === 0) {
        touchStartRef.current = null
      }
    }

    const handleTouchCancel = () => {
      touchStartRef.current = null
    }

    window.addEventListener('touchstart', handleTouchStart, { passive: true })
    window.addEventListener('touchmove', handleTouchMove, { passive: false })
    window.addEventListener('touchend', handleTouchEnd, { passive: true })
    window.addEventListener('touchcancel', handleTouchCancel, { passive: true })

    return () => {
      window.removeEventListener('touchstart', handleTouchStart)
      window.removeEventListener('touchmove', handleTouchMove)
      window.removeEventListener('touchend', handleTouchEnd)
      window.removeEventListener('touchcancel', handleTouchCancel)
    }
  }, [location.pathname, navigate, sectionPaths])

  const meQuery = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: getMe,
    retry: false,
  })

  useEffect(() => {
    if (meQuery.data) setUser(meQuery.data)
  }, [meQuery.data, setUser])

  useEffect(() => {
    writeDesktopSidebarOpen(desktopSidebarOpen)
  }, [desktopSidebarOpen])

  const currentTitle =
    titles[location.pathname] ??
    (location.pathname.startsWith('/marking/turnover')
      ? 'Оборот кодов'
      : location.pathname.startsWith('/marking/aggregation')
        ? 'Агрегация'
      : location.pathname === '/chz'
      ? 'ЧЗ'
      : location.pathname.startsWith('/items/')
      ? ''
      : location.pathname.startsWith('/orders/') && location.pathname.endsWith('/pick-operations')
        ? ''
        : location.pathname.startsWith('/orders/')
          ? ''
          : location.pathname.startsWith('/production/tasks/')
            ? ''
            : location.pathname.startsWith('/production/')
              ? ''
              : location.pathname.startsWith('/stocks/')
                ? ''
                : 'WMS')

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

  const handleMenuOrderChange = (nextOrder: string[]) => {
    setMenuOrder(nextOrder)
    writeMenuOrder(nextOrder)
  }

  return (
    <div
      className="min-h-screen bg-background"
      style={{
        touchAction: 'manipulation',
        overscrollBehaviorY: 'contain',
      }}
    >
      <motion.aside
        initial={false}
        animate={{
          width: desktopSidebarOpen
            ? DESKTOP_SIDEBAR_OPEN_WIDTH
            : DESKTOP_SIDEBAR_COLLAPSED_WIDTH,
        }}
        transition={sidebarTransition}
        className="fixed left-0 top-0 z-20 hidden h-screen overflow-hidden border-r border-border bg-card px-2 py-3 md:flex md:flex-col"
        onWheel={(event) => event.stopPropagation()}
        onTouchMove={(event) => event.stopPropagation()}
      >
        <SidebarBrand
          collapsed={!desktopSidebarOpen}
          onLogoClick={() => setDesktopSidebarOpen((value) => !value)}
        />

        <nav
          className="sidebar-scroll flex-1 overflow-y-auto overscroll-contain pb-4"
          style={{ touchAction: 'pan-y', WebkitOverflowScrolling: 'touch' }}
        >
          <Navigation
            collapsed={!desktopSidebarOpen}
            isAdmin={isAdmin}
            permissionsUser={user}
            menuOrder={menuOrder}
          />
        </nav>

        <div className="space-y-2 border-t border-border pt-3">
          <Button
            variant="ghost"
            onClick={() => setMenuSettingsOpen(true)}
            className="h-9 w-full overflow-hidden rounded-xl p-0 text-muted-foreground hover:text-foreground"
            aria-label="Настроить порядок меню"
            title={!desktopSidebarOpen ? 'Порядок меню' : undefined}
          >
            <span className="flex h-9 w-12 shrink-0 items-center justify-center">
              <Settings className="h-4 w-4 shrink-0" />
            </span>

            <AnimatePresence initial={false}>
              {desktopSidebarOpen && (
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={textTransition}
                  className="min-w-0 flex-1 truncate whitespace-nowrap pr-3 text-left text-xs"
                >
                  Порядок меню
                </motion.span>
              )}
            </AnimatePresence>
          </Button>

          <Button
            variant="ghost"
            onClick={handleLogout}
            className="h-10 w-full overflow-hidden rounded-xl p-0 text-muted-foreground hover:text-foreground"
            aria-label="Выйти"
            title={!desktopSidebarOpen ? 'Выйти' : undefined}
          >
            <span className="flex h-10 w-12 shrink-0 items-center justify-center">
              <LogOut className="h-5 w-5 shrink-0" />
            </span>

            <AnimatePresence initial={false}>
              {desktopSidebarOpen && (
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={textTransition}
                  className="min-w-0 flex-1 truncate whitespace-nowrap pr-3 text-left"
                >
                  Выйти
                </motion.span>
              )}
            </AnimatePresence>
          </Button>
        </div>
      </motion.aside>

      <AnimatePresence initial={false}>
        {showTurnoverSidebar ? (
          <motion.aside
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className={cn(
              'fixed top-0 z-10 hidden h-screen w-56 overflow-hidden border-r border-border bg-card/98 px-3 py-4 md:flex md:flex-col',
              desktopSidebarOpen ? 'left-64' : 'left-16',
            )}
            onWheel={(event) => event.stopPropagation()}
            onTouchMove={(event) => event.stopPropagation()}
          >
            <div className="sidebar-scroll flex-1 overflow-y-auto overscroll-contain">
              <SecondaryNavigation title="Оборот кодов" items={turnoverSubItems} />
            </div>
          </motion.aside>
        ) : null}
      </AnimatePresence>

      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <motion.button
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="absolute inset-0 bg-black/40"
            aria-label="Закрыть меню"
            onClick={() => setMobileSidebarOpen(false)}
          />

          <motion.aside
            initial={{ x: -288 }}
            animate={{ x: 0 }}
            transition={sidebarTransition}
            className="relative flex h-full w-72 flex-col border-r border-border bg-card px-3 py-3 shadow-2xl"
            onWheel={(event) => event.stopPropagation()}
            onTouchMove={(event) => event.stopPropagation()}
          >
            <SidebarBrand onClose={() => setMobileSidebarOpen(false)} />

            <nav
              className="scrollbar-hide flex-1 overflow-y-auto overscroll-contain pb-4"
              style={{ touchAction: 'pan-y', WebkitOverflowScrolling: 'touch' }}
            >
              <Navigation
                isAdmin={isAdmin}
                permissionsUser={user}
                menuOrder={menuOrder}
                onNavigate={() => setMobileSidebarOpen(false)}
              />

              {showTurnoverSidebar ? (
                <div className="mt-4 border-t border-border pt-4">
                  <SecondaryNavigation
                    title="Оборот кодов"
                    items={turnoverSubItems}
                    onNavigate={() => setMobileSidebarOpen(false)}
                  />
                </div>
              ) : null}
            </nav>

            <div className="space-y-2 border-t border-border pt-3">
              <Button
                variant="ghost"
                onClick={() => setMenuSettingsOpen(true)}
                className="h-10 w-full justify-start gap-3 rounded-xl px-3 text-muted-foreground hover:text-foreground"
              >
                <Settings className="h-5 w-5" />
                <span>Порядок меню</span>
              </Button>
              <Button
                variant="ghost"
                onClick={handleLogout}
                className="h-10 w-full justify-start gap-3 rounded-xl px-3 text-muted-foreground hover:text-foreground"
              >
                <LogOut className="h-5 w-5" />
                <span>Выйти</span>
              </Button>
            </div>
          </motion.aside>
        </div>
      )}

      <div
        className={cn(
          'min-h-screen transition-[padding-left] duration-[280ms] ease-[cubic-bezier(0.22,1,0.36,1)]',
          desktopSidebarOpen && showTurnoverSidebar && 'md:pl-[30rem]',
          desktopSidebarOpen && !showTurnoverSidebar && 'md:pl-64',
          !desktopSidebarOpen && showTurnoverSidebar && 'md:pl-[18rem]',
          !desktopSidebarOpen && !showTurnoverSidebar && 'md:pl-16',
        )}
      >
        <header className="sticky top-0 z-10 border-b border-border bg-background/90 backdrop-blur">
          <div className="flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setMobileSidebarOpen(true)}
                className="md:hidden"
                aria-label="Открыть меню"
              >
                <PanelLeftOpen className="h-5 w-5" />
              </Button>

              <div className="min-w-0">
                <h1 className="truncate text-base font-semibold sm:text-lg">{currentTitle}</h1>

                <p className="hidden truncate text-sm text-muted-foreground sm:block">
                  {user?.username ?? (meQuery.isLoading ? 'Проверяем сессию' : 'Складская система')}
                </p>
              </div>
            </div>

            <div className="pointer-events-none absolute left-1/2 top-1/2 block -translate-x-1/2 -translate-y-1/2">
              <img
                src={logo}
                alt="WMS Logo"
                className="h-12 w-auto object-contain opacity-90 transition-opacity hover:opacity-100 dark:invert dark:brightness-110 sm:h-[84px] md:h-[72px]"
              />
            </div>

            <Button variant="ghost" size="icon" onClick={handleLogout} aria-label="Выйти">
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </header>

        <motion.main
          key={location.pathname}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18 }}
          className="pb-36 md:pb-8"
        >
          <Outlet />
        </motion.main>
      </div>

      <MobileNav isAdmin={isAdmin} permissionsUser={user} menuOrder={menuOrder} />
      <MenuOrderDialog
        open={menuSettingsOpen}
        onOpenChange={setMenuSettingsOpen}
        isAdmin={isAdmin}
        permissionsUser={user}
        menuOrder={menuOrder}
        onMenuOrderChange={handleMenuOrderChange}
      />
    </div>
  )
}
