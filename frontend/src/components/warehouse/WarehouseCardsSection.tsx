import { useState, type ReactNode } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type WarehouseCardsSectionProps = {
  children: ReactNode
  /** Подпись выбранного склада в свёрнутом виде, например «№1» */
  selectedLabel?: string | null
  className?: string
  defaultCollapsed?: boolean
}

/**
 * Обёртка сетки WarehouseSummaryCard с маленькой кнопкой сворачивания.
 */
export function WarehouseCardsSection({
  children,
  selectedLabel,
  className,
  defaultCollapsed = false,
}: WarehouseCardsSectionProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed)

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center gap-1.5">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 text-muted-foreground"
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Развернуть склады' : 'Свернуть склады'}
          onClick={() => setCollapsed((value) => !value)}
        >
          {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
        </Button>
        <span className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
          {collapsed
            ? selectedLabel
              ? `Склад ${selectedLabel}`
              : 'Склады скрыты'
            : 'Склады'}
        </span>
      </div>
      {!collapsed ? children : null}
    </div>
  )
}
