// frontend/src/stores/authStore.ts
import { create } from 'zustand'
import { getStoredToken, setStoredToken, clearTokens, getStoredRefreshToken } from '@/api/client'
import type { User } from '@/types/wms'

interface AuthState {
  token: string | null
  user: User | null
  setToken: (token: string | null) => void
  setUser: (user: User | null) => void
  logout: () => void
  isAdmin: () => boolean
  hasRole: (roles: string[]) => boolean
}

export const useAuthStore = create<AuthState>((set, get) => {
  const initialToken = typeof window !== 'undefined' ? getStoredToken() : null

  return {
    token: initialToken,
    user: null,
    setToken: (token) => {
      setStoredToken(token)
      set({ token })
    },
    setUser: (user) => set({ user }),
    logout: () => {
      clearTokens()
      set({ token: null, user: null })
    },
    isAdmin: () => get().user?.role === 'admin',
    hasRole: (roles: string[]) => {
      const userRole = get().user?.role
      return userRole ? roles.includes(userRole) : false
    },
  }
})