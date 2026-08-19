import { motion } from 'framer-motion'
import { AlertTriangle, Trash2 } from 'lucide-react'

import { ConfirmDialog } from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'

type WarehouseLike = {
  id: number
  name: string
}

interface WarehouseSummaryCardProps {
  warehouse: WarehouseLike
  isSelected: boolean
  onSelect: (id: number) => void
  stockCount: number
  totalPairs: number
  cellCount: number
  occupiedCells: number
  onDelete?: (id: number) => void
  deleteDescription?: string
}

export function WarehouseSummaryCard({
  warehouse,
  isSelected,
  onSelect,
  stockCount,
  totalPairs,
  cellCount,
  occupiedCells,
  onDelete,
  deleteDescription,
}: WarehouseSummaryCardProps) {
  const occupancyPercent = cellCount > 0 ? (occupiedCells / cellCount) * 100 : 0
  const isCrowded = occupancyPercent >= 80

  return (
    <motion.div
      layout
      whileHover={{ y: -4, scale: 1.01 }}
      whileTap={{ scale: 0.992 }}
      transition={{ type: 'spring', stiffness: 260, damping: 22 }}
      className="group relative"
    >
      <button
        type="button"
        onClick={() => onSelect(warehouse.id)}
        className={cn(
          'w-full rounded-2xl border p-3.5 pr-11 text-left transition-all duration-200',
          'bg-gradient-to-br from-white via-white to-slate-50 shadow-sm',
          'dark:from-slate-950 dark:via-slate-950 dark:to-slate-900',
          isSelected
            ? 'border-primary bg-primary/5 shadow-lg ring-1 ring-primary/20'
            : 'border-border hover:border-primary/40 hover:shadow-md',
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">Склад</div>
            <div className="mt-1 text-base font-semibold">№{warehouse.name}</div>
          </div>
          {isCrowded ? <AlertTriangle className="mt-1 h-4 w-4 text-amber-500" /> : null}
        </div>
        <div className="mt-3">
          <Progress
            value={occupancyPercent}
            label="Занятость"
            valueLabel={`${occupiedCells}/${cellCount || 0} · ${Math.round(occupancyPercent)}%`}
            color={isCrowded ? 'warning' : 'accent'}
          />
        </div>
      </button>

      {onDelete ? (
        <ConfirmDialog
          title="Удалить склад?"
          description={deleteDescription ?? `Удалить склад "${warehouse.name}"?`}
          confirmLabel="Удалить"
          onConfirm={() => onDelete(warehouse.id)}
        >
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-3 top-3 h-8 w-8 rounded-full bg-background/85 opacity-0 shadow-sm backdrop-blur transition-opacity group-hover:opacity-100"
            onClick={(event) => event.stopPropagation()}
          >
            <Trash2 className="h-4 w-4 text-muted-foreground hover:text-red-600" />
          </Button>
        </ConfirmDialog>
      ) : null}
    </motion.div>
  )
}
