import { create } from 'zustand'
import type { ThemeMode } from '@/types/wms'

const THEME_KEY = 'wms_theme'
const WAREHOUSE_KEY = 'wms_current_warehouse'

function readTheme(): ThemeMode {
  const saved = localStorage.getItem(THEME_KEY)
  return saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'system'
}

function readWarehouseId() {
  const saved = Number(localStorage.getItem(WAREHOUSE_KEY))
  return Number.isFinite(saved) && saved > 0 ? saved : null
}

interface AppState {
  theme: ThemeMode
  currentWarehouseId: number | null
  setTheme: (theme: ThemeMode) => void
  setCurrentWarehouseId: (warehouseId: number | null) => void
}

export const useAppStore = create<AppState>((set) => ({
  theme: readTheme(),
  currentWarehouseId: readWarehouseId(),
  setTheme: (theme) => {
    localStorage.setItem(THEME_KEY, theme)
    set({ theme })
  },
  setCurrentWarehouseId: (warehouseId) => {
    if (warehouseId) localStorage.setItem(WAREHOUSE_KEY, String(warehouseId))
    else localStorage.removeItem(WAREHOUSE_KEY)
    set({ currentWarehouseId: warehouseId })
  },
}))
