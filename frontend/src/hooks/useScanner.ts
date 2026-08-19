import { useEffect, useRef } from 'react'

interface ScannerOptions {
  enabled?: boolean
  timeout?: number
  minLength?: number
}

export function useScanner(
  onScan: (value: string) => void,
  { enabled = true, timeout = 80, minLength = 2 }: ScannerOptions = {},
) {
  const bufferRef = useRef('')
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    if (!enabled) return

    const resetTimer = () => {
      if (timerRef.current) window.clearTimeout(timerRef.current)
      timerRef.current = window.setTimeout(() => {
        bufferRef.current = ''
      }, timeout)
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return

      if (event.key === 'Enter') {
        const value = bufferRef.current.trim()
        bufferRef.current = ''
        if (value.length >= minLength) onScan(value)
        return
      }

      if (event.key.length === 1) {
        bufferRef.current += event.key
        resetTimer()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      if (timerRef.current) window.clearTimeout(timerRef.current)
    }
  }, [enabled, minLength, onScan, timeout])
}
