import { toast as herouiToast } from '@heroui/react'

type ToastOptions = {
  description?: string
  duration?: number
  action?: {
    label: string
    onClick: () => void
  }
}

function mapOptions(options?: ToastOptions) {
  if (!options) return undefined

  return {
    description: options.description,
    timeout: options.duration,
    actionProps: options.action
      ? {
          children: options.action.label,
          onPress: options.action.onClick,
        }
      : undefined,
  }
}

export const toast = Object.assign(
  (title: string, options?: ToastOptions) => herouiToast(title, mapOptions(options)),
  {
    success: (title: string, options?: ToastOptions) =>
      herouiToast.success(title, mapOptions(options)),
    error: (title: string, options?: ToastOptions) =>
      herouiToast.danger(title, mapOptions(options)),
    info: (title: string, options?: ToastOptions) =>
      herouiToast.info(title, mapOptions(options)),
    warning: (title: string, options?: ToastOptions) =>
      herouiToast.warning(title, mapOptions(options)),
    dismiss: (id?: string | number) => {
      if (id == null) {
        herouiToast.clear()
        return
      }
      herouiToast.close(String(id))
    },
    clear: () => herouiToast.clear(),
  },
)
