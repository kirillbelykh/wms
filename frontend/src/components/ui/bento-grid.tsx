import type { ComponentPropsWithoutRef, ReactNode } from 'react'
import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type BentoGridProps = ComponentPropsWithoutRef<'div'>

export function BentoGrid({ children, className, ...props }: BentoGridProps) {
  return (
    <div
      className={cn('grid w-full auto-rows-[22rem] grid-cols-3 gap-4', className)}
      {...props}
    >
      {children}
    </div>
  )
}

export type BentoCardProps = Omit<ComponentPropsWithoutRef<'div'>, 'children'> & {
  name: string
  className?: string
  background?: ReactNode
  Icon: React.ElementType
  description: string
  href?: string
  cta?: string
  /** Вместо ссылки — действие (например toggle уведомления) */
  onCtaClick?: () => void
  ctaDisabled?: boolean
}

export function BentoCard({
  name,
  className,
  background,
  Icon,
  description,
  href,
  cta = 'Подробнее',
  onCtaClick,
  ctaDisabled,
  ...props
}: BentoCardProps) {
  const ctaContent = (
    <>
      {cta}
      <ArrowRight className="ms-2 h-4 w-4 rtl:rotate-180" />
    </>
  )

  const ctaButton = onCtaClick ? (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="pointer-events-auto"
      onClick={onCtaClick}
      isDisabled={ctaDisabled}
    >
      {ctaContent}
    </Button>
  ) : href?.startsWith('/') ? (
    <Button variant="ghost" size="sm" className="pointer-events-auto" asChild>
      <Link to={href}>{ctaContent}</Link>
    </Button>
  ) : (
    <Button variant="ghost" size="sm" className="pointer-events-auto" asChild>
      <a href={href || '#'}>{ctaContent}</a>
    </Button>
  )

  return (
    <div
      className={cn(
        'group relative col-span-1 flex flex-col justify-between overflow-hidden rounded-xl',
        'bg-background [box-shadow:0_0_0_1px_rgba(0,0,0,.03),0_2px_4px_rgba(0,0,0,.05),0_12px_24px_rgba(0,0,0,.05)]',
        'transform-gpu dark:bg-background dark:[border:1px_solid_rgba(255,255,255,.1)] dark:[box-shadow:0_-20px_80px_-20px_#ffffff1f_inset]',
        className,
      )}
      {...props}
    >
      <div>{background}</div>

      <div className="pointer-events-none z-10 flex transform-gpu flex-col gap-1 p-6 transition-all duration-300 lg:group-hover:-translate-y-10">
        <Icon className="h-12 w-12 origin-left transform-gpu text-neutral-700 transition-all duration-300 ease-in-out group-hover:scale-75 dark:text-neutral-300" />
        <h3 className="text-xl font-semibold text-neutral-700 dark:text-neutral-300">{name}</h3>
        <p className="max-w-lg text-neutral-400">{description}</p>
      </div>

      <div className="pointer-events-none z-10 flex w-full flex-row items-center p-4 lg:hidden">
        {ctaButton}
      </div>

      <div
        className={cn(
          'pointer-events-none absolute bottom-0 hidden w-full translate-y-10 transform-gpu flex-row items-center p-4 opacity-0 transition-all duration-300 lg:flex',
          'group-hover:translate-y-0 group-hover:opacity-100',
        )}
      >
        {ctaButton}
      </div>

      <div className="pointer-events-none absolute inset-0 transform-gpu transition-all duration-300 group-hover:bg-black/[.03] group-hover:dark:bg-neutral-800/10" />
    </div>
  )
}
