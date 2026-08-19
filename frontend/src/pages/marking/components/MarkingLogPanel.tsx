import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Activity, RefreshCcw, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { withAgentFetchOptions } from '../agentFetch'

type MarkingLogChannel =
  | 'orders'
  | 'chz'
  | 'download'
  | 'intro'
  | 'tsd'
  | 'aggregation'
  | 'labels'

interface MarkingLogPanelProps {
  agentUrl: string
  channel: MarkingLogChannel
  title?: string
  description?: string
  className?: string
}

async function fetchLogs(agentUrl: string, channel: MarkingLogChannel): Promise<string[]> {
  const response = await fetch(`${agentUrl}/api/call/get_logs`, withAgentFetchOptions(agentUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ args: [channel] }),
  }))

  if (!response.ok) {
    throw new Error('Не удалось получить лог операций')
  }

  const payload = await response.json()

  if (!Array.isArray(payload)) {
    throw new Error(payload?.error || 'Не удалось получить лог операций')
  }

  return payload
}

export function MarkingLogPanel({
  agentUrl,
  channel,
  title = 'История',
  description,
  className,
}: MarkingLogPanelProps) {
  const queryClient = useQueryClient()

  const logsQuery = useQuery<string[]>({
    queryKey: ['marking-logs', agentUrl, channel],
    queryFn: () => fetchLogs(agentUrl, channel),
    refetchInterval: 10000,
    staleTime: 10000,
    refetchOnMount: false,
  })

  const clearMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`${agentUrl}/api/call/clear_logs`, withAgentFetchOptions(agentUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ args: [channel] }),
      }))

      if (!response.ok) {
        throw new Error('Не удалось очистить лог')
      }

      const payload = await response.json()

      if (!payload?.success) {
        throw new Error(payload?.error || 'Не удалось очистить лог')
      }

      return payload
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marking-logs', agentUrl, channel] })
    },
  })

  const logs = logsQuery.data || []

  return (
    <Card className={cn('shadow-sm', className)}>
      <Card.Header className="space-y-3 border-b border-border pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted text-muted-foreground">
              <Activity className="h-4 w-4" />
            </div>

            <div className="space-y-1">
              <Card.Title className="text-base text-foreground">{title}</Card.Title>
              {description ? (
                <p className="text-xs leading-5 text-muted-foreground">{description}</p>
              ) : null}
            </div>
          </div>

          <Badge tone={logs.length > 0 ? 'info' : 'secondary'}>{logs.length} записей</Badge>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => logsQuery.refetch()}
            disabled={logsQuery.isFetching}
            aria-label="Обновить"
            title="Обновить"
          >
            <RefreshCcw className={cn('h-4 w-4', logsQuery.isFetching && 'animate-spin')} />
          </Button>

          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => clearMutation.mutate()}
            disabled={clearMutation.isPending || logs.length === 0}
          >
            <Trash2 className="h-4 w-4" />
            Очистить
          </Button>
        </div>
      </Card.Header>

      <Card.Content className="pt-4">
        <div className="max-h-[34rem] overflow-y-auto rounded-xl border border-border bg-white p-3">
          {logsQuery.isLoading ? (
            <div className="py-10 text-center text-sm text-muted-foreground">Загрузка...</div>
          ) : logs.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              Пока нет записей.
            </div>
          ) : (
            <div className="space-y-2">
              {logs
                .slice()
                .reverse()
                .map((line, index) => (
                  <div
                    key={`${line}-${index}`}
                    className="rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs leading-5 text-foreground"
                  >
                    {line}
                  </div>
                ))}
            </div>
          )}
        </div>
      </Card.Content>
    </Card>
  )
}
