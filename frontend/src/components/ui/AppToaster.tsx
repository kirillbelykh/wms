import {
  Alert,
  Button,
  Spinner,
  Toast,
} from '@heroui/react'
import type { ComponentProps, ReactNode } from 'react'

type ToastContent = {
  title?: ReactNode
  description?: ReactNode
  variant?: 'default' | 'accent' | 'success' | 'warning' | 'danger'
  actionProps?: ComponentProps<typeof Button>
  isLoading?: boolean
}

function alertStatus(variant?: ToastContent['variant']) {
  if (!variant || variant === 'default') return undefined
  return variant
}

export function AppToaster() {
  return (
    <Toast.Provider className="z-[100]" gap={12} maxVisibleToasts={4} placement="top end" scaleFactor={0} width={420}>
      {({ toast: item }) => {
        const content = (item.content ?? {}) as ToastContent
        const loading = Boolean(content.isLoading)
        const status = alertStatus(content.variant)

        return (
          <Toast
            className="!border-0 !bg-transparent !p-0 !shadow-none"
            placement="top end"
            scaleFactor={0}
            toast={item}
            variant={content.variant}
          >
            <Alert className="w-full min-w-[320px]" status={status}>
              <Alert.Indicator>{loading ? <Spinner size="sm" /> : null}</Alert.Indicator>
              <Alert.Content>
                {content.title ? <Alert.Title>{content.title}</Alert.Title> : null}
                {content.description ? (
                  <Alert.Description>{content.description}</Alert.Description>
                ) : null}
                {content.actionProps?.children ? (
                  <Button className="mt-2 sm:hidden" size="sm" {...content.actionProps} />
                ) : null}
              </Alert.Content>
              {content.actionProps?.children ? (
                <Button className="hidden sm:flex" size="sm" {...content.actionProps} />
              ) : null}
              <Toast.CloseButton />
            </Alert>
          </Toast>
        )
      }}
    </Toast.Provider>
  )
}
