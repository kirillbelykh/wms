import type { KeyboardEvent } from 'react'

const INTERACTIVE_SELECTOR = [
  'button',
  'a',
  'input',
  'select',
  'textarea',
  '[role="button"]',
  '[role="link"]',
  '[data-interactive="true"]',
].join(', ')

export function isEventFromInteractiveElement(target: EventTarget | null) {
  return target instanceof HTMLElement && target.closest(INTERACTIVE_SELECTOR) !== null
}

export function activateWithKeyboard(event: KeyboardEvent<HTMLElement>, onActivate: () => void) {
  if (event.key !== 'Enter' && event.key !== ' ') return
  event.preventDefault()
  onActivate()
}
