import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { RefreshCcw, WifiOff } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  canViewMarking,
  canViewMarkingAggregation,
  canViewMarkingChz,
  canViewMarkingIntro,
  canViewMarkingLabels,
  canViewMarkingOrders,
  canViewMarkingTsd,
  canViewMarkingTurnover,
  defaultMarkingPath,
  defaultMarkingTurnoverPath,
} from '@/lib/sectionAccess'
import { useAuthStore } from '@/stores/authStore'
import { cn } from '@/lib/utils'
import { AggregationTab, ChzTab, LabelsTab, TsdTab } from './tabs'
import { withAgentFetchOptions } from './agentFetch'
import { CodeIntroWorkspace } from './workspaces/CodeIntroWorkspace'
import { CodeOrdersWorkspace } from './workspaces/CodeOrdersWorkspace'

type MarkingArea = 'turnover' | 'aggregation'
type TurnoverViewKey = 'orders' | 'intro' | 'chz' | 'tsd' | 'labels'
type LocalAgentStatus = 'checking' | 'ready' | 'offline' | 'wrong-user'

interface LocalAgentHealth {
  ok: boolean
  mode: string
  time: number
  bound_user?: string | null
  requested_user?: string | null
  user_match?: boolean
  embedded_mode?: boolean
  allowed_origins?: string[]
}

const LOCAL_AGENT_URLS = [
  'http://127.0.0.1:8787',
  'http://localhost:8787',
  'https://127.0.0.1:8788',
  'https://localhost:8788',
]

const LAN_AGENT_URL_STORAGE_KEY = 'marking-agent-lan-url'

function normalizeAgentUrl(value: string) {
  const prepared = value.trim()
  if (!prepared) return ''

  const withProtocol = /^https?:\/\//i.test(prepared) ? prepared : `http://${prepared}`

  try {
    const url = new URL(withProtocol)
    if (!url.hostname) return ''
    if (!url.port) {
      url.port = url.protocol === 'https:' ? '8788' : '8787'
    }
    url.pathname = ''
    url.search = ''
    url.hash = ''
    return url.toString().replace(/\/$/, '')
  } catch {
    return ''
  }
}

function buildCustomAgentUrls(value: string) {
  const normalized = normalizeAgentUrl(value)
  if (!normalized) return []

  const urls = [normalized]

  try {
    const url = new URL(normalized)
    const fallback = new URL(normalized)
    if (url.protocol === 'http:') {
      fallback.protocol = 'https:'
      fallback.port = '8788'
    } else {
      fallback.protocol = 'http:'
      fallback.port = '8787'
    }
    urls.push(fallback.toString().replace(/\/$/, ''))
  } catch {
    return urls
  }

  return Array.from(new Set(urls))
}

async function probeLocalAgent(baseUrl: string, username: string): Promise<LocalAgentHealth> {
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), 2500)

  try {
    const init = withAgentFetchOptions(baseUrl, {
      method: 'GET',
      signal: controller.signal,
    })

    const response = await fetch(
      `${baseUrl}/api/health?username=${encodeURIComponent(username)}`,
      init,
    )

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    return (await response.json()) as LocalAgentHealth
  } finally {
    window.clearTimeout(timeoutId)
  }
}

function isTurnoverViewKey(value: string | null): value is TurnoverViewKey {
  return value === 'orders' || value === 'intro' || value === 'chz' || value === 'tsd' || value === 'labels'
}

function parseMarkingPath(pathname: string): {
  area: MarkingArea
  turnoverView: TurnoverViewKey | null
} {
  const segments = pathname.split('/').filter(Boolean)
  const area = segments[1] === 'aggregation' ? 'aggregation' : 'turnover'
  const subsection = segments[2] ?? null

  return {
    area,
    turnoverView: isTurnoverViewKey(subsection) ? subsection : null,
  }
}

function legacyMarkingRedirect(pathname: string) {
  if (pathname.startsWith('/marking/shipping/tsd')) {
    return '/marking/turnover/tsd'
  }

  if (pathname.startsWith('/marking/shipping/labels')) {
    return '/marking/turnover/labels'
  }

  if (pathname.startsWith('/marking/turnover/withdrawal')) {
    return '/marking/turnover/orders'
  }

  return null
}

export function MarkingPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.user)
  const isUserLoaded = Boolean(user)
  const canAccess = canViewMarking(user)

  const [status, setStatus] = useState<LocalAgentStatus>('checking')
  const [activeBaseUrl, setActiveBaseUrl] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [reloadSeed, setReloadSeed] = useState(() => Date.now())
  const [customAgentUrl, setCustomAgentUrl] = useState(() => (
    window.localStorage.getItem(LAN_AGENT_URL_STORAGE_KEY) ?? ''
  ))

  const { area, turnoverView } = useMemo(
    () => parseMarkingPath(location.pathname),
    [location.pathname],
  )

  const legacyRedirect = useMemo(
    () => legacyMarkingRedirect(location.pathname),
    [location.pathname],
  )

  const availableTurnoverViews = useMemo<TurnoverViewKey[]>(() => {
    const items: TurnoverViewKey[] = []

    if (canViewMarkingOrders(user)) items.push('orders')
    if (canViewMarkingIntro(user)) items.push('intro')
    if (canViewMarkingChz(user)) items.push('chz')
    if (canViewMarkingTsd(user)) items.push('tsd')
    if (canViewMarkingLabels(user)) items.push('labels')

    return items
  }, [user])

  const customAgentUrls = useMemo(() => buildCustomAgentUrls(customAgentUrl), [customAgentUrl])
  const agentUrls = useMemo(() => (
    Array.from(new Set([...LOCAL_AGENT_URLS, ...customAgentUrls]))
  ), [customAgentUrls])

  const activeTurnoverView = useMemo<TurnoverViewKey>(() => {
    if (turnoverView && availableTurnoverViews.includes(turnoverView)) {
      return turnoverView
    }

    return availableTurnoverViews[0] ?? 'orders'
  }, [availableTurnoverViews, turnoverView])

  useEffect(() => {
    if (!user || !canAccess) {
      return
    }

    if (legacyRedirect) {
      navigate(legacyRedirect, { replace: true })
      return
    }

    if (area === 'aggregation') {
      if (!canViewMarkingAggregation(user)) {
        navigate(defaultMarkingPath(user), { replace: true })
      }
      return
    }

    if (!canViewMarkingTurnover(user)) {
      navigate(defaultMarkingPath(user), { replace: true })
      return
    }

    if (!turnoverView || !availableTurnoverViews.includes(turnoverView)) {
      navigate(defaultMarkingTurnoverPath(user), { replace: true })
    }
  }, [
    area,
    availableTurnoverViews,
    canAccess,
    legacyRedirect,
    navigate,
    turnoverView,
    user,
  ])

  useEffect(() => {
    if (!canAccess || !user?.username) {
      return
    }

    let cancelled = false

    const run = async () => {
      setStatus('checking')
      setErrorMessage(null)

      let mismatchResult: { baseUrl: string; payload: LocalAgentHealth } | null = null

      for (const baseUrl of agentUrls) {
        try {
          const payload = await probeLocalAgent(baseUrl, user.username)
          if (!payload.ok) {
            continue
          }

          if (payload.user_match === false) {
            mismatchResult = { baseUrl, payload }
            continue
          }

          if (!cancelled) {
            setActiveBaseUrl(baseUrl)
            setStatus('ready')
          }
          return
        } catch {
          continue
        }
      }

      if (cancelled) {
        return
      }

      if (mismatchResult) {
        setActiveBaseUrl(mismatchResult.baseUrl)
        setStatus('wrong-user')
        setErrorMessage(
          mismatchResult.payload.bound_user
            ? `Локальный агент привязан к пользователю ${mismatchResult.payload.bound_user}.`
            : 'Локальный агент не привязан к текущему пользователю.',
        )
        return
      }

      setActiveBaseUrl(null)
      setStatus('offline')
      setErrorMessage('Локальный агент не отвечает на localhost или указанный IP.')
    }

    void run().catch(() => {
      if (!cancelled) {
        setStatus('offline')
        setErrorMessage('Не удалось связаться с локальным агентом.')
      }
    })

    return () => {
      cancelled = true
    }
  }, [agentUrls, canAccess, reloadSeed, user?.username])

  const handleRefresh = () => {
    setReloadSeed(Date.now())
  }

  const handleSaveCustomAgentUrl = () => {
    const normalized = normalizeAgentUrl(customAgentUrl)
    if (!normalized) {
      setErrorMessage('Укажите IP компьютера с CRPT server, например 192.168.1.23.')
      return
    }

    window.localStorage.setItem(LAN_AGENT_URL_STORAGE_KEY, normalized)
    setCustomAgentUrl(normalized)
    setReloadSeed(Date.now())
  }

  const workspaceKey =
    status === 'ready'
      ? area === 'aggregation'
        ? 'aggregation'
        : activeTurnoverView
      : status

  const renderUnavailableState = () => (
    <Card>
      <Card.Content className="pt-5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <WifiOff className="h-4 w-4" />
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium text-foreground">
              {status === 'wrong-user'
                ? 'Нужно перепривязать локальный агент'
                : 'Локальный агент недоступен'}
            </div>
            <div className="text-sm leading-6 text-muted-foreground">
              {errorMessage || 'Проверьте локальный агент маркировки и повторите обновление.'}
            </div>
            <div className="grid gap-2 pt-2 sm:grid-cols-[minmax(0,22rem)_auto]">
              <Input
                value={customAgentUrl}
                onChange={(event) => setCustomAgentUrl(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    handleSaveCustomAgentUrl()
                  }
                }}
                placeholder="IP CRPT server, например 192.168.1.23"
              />
              <Button type="button" variant="outline" onClick={handleSaveCustomAgentUrl}>
                Подключить
              </Button>
            </div>
            <p className="text-xs leading-5 text-muted-foreground">
              Если CRPT server запущен на другом ПК в этой Wi-Fi сети, укажите его IP.
              Порт можно не писать: система попробует 8787 и 8788 автоматически.
            </p>
          </div>
        </div>
      </Card.Content>
    </Card>
  )

  const renderTurnoverWorkspace = () => {
    if (!activeBaseUrl || status !== 'ready') {
      return renderUnavailableState()
    }

    switch (activeTurnoverView) {
      case 'intro':
        return <CodeIntroWorkspace agentUrl={activeBaseUrl} />
      case 'chz':
        return <ChzTab agentUrl={activeBaseUrl} />
      case 'tsd':
        return <TsdTab agentUrl={activeBaseUrl} />
      case 'labels':
        return <LabelsTab agentUrl={activeBaseUrl} />
      case 'orders':
      default:
        return <CodeOrdersWorkspace agentUrl={activeBaseUrl} />
    }
  }

  const renderAggregationWorkspace = () => {
    if (!activeBaseUrl || status !== 'ready') {
      return renderUnavailableState()
    }

    return <AggregationTab agentUrl={activeBaseUrl} />
  }

  if (!isUserLoaded) {
    return (
      <div className="page-shell">
        <Card>
          <Card.Header>
            <Card.Title>Загружаем доступ</Card.Title>
          </Card.Header>
          <Card.Content className="pt-0 text-sm text-muted-foreground">
            Проверяем права пользователя и подключение к локальному агенту.
          </Card.Content>
        </Card>
      </div>
    )
  }

  if (!canAccess) {
    return (
      <div className="page-shell">
        <Card>
          <Card.Header>
            <Card.Title>Раздел недоступен</Card.Title>
          </Card.Header>
          <Card.Content className="pt-0 text-sm text-muted-foreground">
            Доступ к маркировке настраивается через роли и права.
          </Card.Content>
        </Card>
      </div>
    )
  }

  return (
    <div className="page-shell space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            tone={
              status === 'ready'
                ? 'success'
                : status === 'checking'
                  ? 'info'
                  : status === 'wrong-user'
                    ? 'warning'
                    : 'danger'
            }
          >
            {status === 'ready'
              ? 'Online'
              : status === 'checking'
                ? 'Проверка'
                : status === 'wrong-user'
                  ? 'Нужна привязка'
                  : 'Offline'}
          </Badge>

          {status !== 'ready' && errorMessage ? (
            <span className="text-sm text-muted-foreground">{errorMessage}</span>
          ) : null}
        </div>

        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={handleRefresh}
          aria-label="Обновить"
          title="Обновить"
        >
          <RefreshCcw className={cn('h-4 w-4', status === 'checking' && 'animate-spin')} />
        </Button>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={workspaceKey}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
        >
          {status === 'ready' && area === 'aggregation' ? renderAggregationWorkspace() : null}
          {status === 'ready' && area === 'turnover' ? renderTurnoverWorkspace() : null}
          {status !== 'ready' ? renderUnavailableState() : null}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
