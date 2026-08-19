// frontend/src/hooks/useAuthQuery.ts
import { useQuery, type UseQueryOptions } from '@tanstack/react-query'
import { getStoredToken } from '@/api/client'

export function useAuthQuery<TData = unknown, TError = Error>(
  options: UseQueryOptions<TData, TError>
) {
  // ✅ Читаем токен напрямую из localStorage, а не из store
  const token = typeof window !== 'undefined' ? getStoredToken() : null
  
  return useQuery<TData, TError>({
    ...options,
    // Запрос выполняется только если есть токен
    enabled: !!token && (options.enabled !== false),
  })
}