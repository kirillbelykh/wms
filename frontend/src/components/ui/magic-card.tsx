import { motion, useMotionTemplate, useMotionValue } from 'framer-motion'
import { useCallback, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

type MagicCardProps = {
  children?: ReactNode
  className?: string
  /** Радиус spotlight / border glow */
  gradientSize?: number
  /** Цвет spotlight под курсором */
  gradientColor?: string
  /** Начало градиентной обводки */
  gradientFrom?: string
  /** Конец градиентной обводки */
  gradientTo?: string
}

/**
 * Mouse-follow gradient border + soft spotlight (Magic UI MagicCard).
 * Цвета нейтральные под WMS — без purple/pink дефолтов Magic UI.
 */
export function MagicCard({
  children,
  className,
  gradientSize = 220,
  gradientColor = 'var(--magic-spotlight)',
  gradientFrom = 'var(--magic-gradient-from)',
  gradientTo = 'var(--magic-gradient-to)',
}: MagicCardProps) {
  const mouseX = useMotionValue(-gradientSize)
  const mouseY = useMotionValue(-gradientSize)

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const rect = event.currentTarget.getBoundingClientRect()
      mouseX.set(event.clientX - rect.left)
      mouseY.set(event.clientY - rect.top)
    },
    [mouseX, mouseY],
  )

  const reset = useCallback(() => {
    mouseX.set(-gradientSize)
    mouseY.set(-gradientSize)
  }, [gradientSize, mouseX, mouseY])

  return (
    <motion.div
      className={cn(
        'group relative isolate overflow-hidden rounded-[inherit] border border-transparent',
        className,
      )}
      onPointerEnter={reset}
      onPointerLeave={reset}
      onPointerMove={handlePointerMove}
      style={{
        background: useMotionTemplate`
          linear-gradient(hsl(var(--wms-card)) 0 0) padding-box,
          radial-gradient(${gradientSize}px circle at ${mouseX}px ${mouseY}px,
            ${gradientFrom},
            ${gradientTo},
            hsl(var(--wms-border)) 100%
          ) border-box
        `,
      }}
    >
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-px z-30 rounded-[inherit] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background: useMotionTemplate`
            radial-gradient(${gradientSize}px circle at ${mouseX}px ${mouseY}px, ${gradientColor}, transparent 100%)
          `,
        }}
      />
      <div className="relative z-10">{children}</div>
    </motion.div>
  )
}
