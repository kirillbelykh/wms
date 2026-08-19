import { create } from 'zustand'

interface PickingState {
  activeOrderId: number | null
  currentIndex: number
  setActiveOrderId: (orderId: number | null) => void
  setCurrentIndex: (index: number) => void
  reset: () => void
}

export const usePickingStore = create<PickingState>((set) => ({
  activeOrderId: null,
  currentIndex: 0,
  setActiveOrderId: (activeOrderId) => set({ activeOrderId, currentIndex: 0 }),
  setCurrentIndex: (currentIndex) => set({ currentIndex }),
  reset: () => set({ activeOrderId: null, currentIndex: 0 }),
}))
