import type { ReactNode } from 'react'
import { AlertDialog } from '@heroui/react'

import { Button } from './button'

interface ConfirmDialogProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  title: string
  description: string
  confirmLabel?: string
  onConfirm: () => void
  children?: ReactNode
}

function ConfirmDialogPanel({
  title,
  description,
  confirmLabel,
  onConfirm,
}: {
  title: string
  description: string
  confirmLabel: string
  onConfirm: () => void
}) {
  return (
    <AlertDialog.Container size="sm" placement="center">
      <AlertDialog.Dialog className="sm:max-w-[400px]">
        <AlertDialog.CloseTrigger />
        <AlertDialog.Header>
          <AlertDialog.Icon status="danger" />
          <AlertDialog.Heading>{title}</AlertDialog.Heading>
        </AlertDialog.Header>
        <AlertDialog.Body>
          <p>{description}</p>
        </AlertDialog.Body>
        <AlertDialog.Footer>
          <Button slot="close" variant="outline">
            Отмена
          </Button>
          <Button slot="close" variant="danger" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </AlertDialog.Footer>
      </AlertDialog.Dialog>
    </AlertDialog.Container>
  )
}

/**
 * HeroUI AlertDialog (Default anatomy: Icon → Heading → Body → Footer).
 * API ConfirmDialog сохранён для существующих экранов.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Подтвердить',
  onConfirm,
  children,
}: ConfirmDialogProps) {
  const panel = (
    <ConfirmDialogPanel
      title={title}
      description={description}
      confirmLabel={confirmLabel}
      onConfirm={onConfirm}
    />
  )

  // Controlled: Backdrop держит isOpen (как в HeroUI docs)
  if (open !== undefined) {
    return (
      <>
        {children}
        <AlertDialog.Backdrop isOpen={open} onOpenChange={onOpenChange} variant="blur">
          {panel}
        </AlertDialog.Backdrop>
      </>
    )
  }

  return (
    <AlertDialog>
      {children}
      <AlertDialog.Backdrop variant="blur">{panel}</AlertDialog.Backdrop>
    </AlertDialog>
  )
}

export { AlertDialog }
export const AlertDialogTrigger = ({
  children,
}: {
  children?: ReactNode
  asChild?: boolean
}) => <>{children}</>
