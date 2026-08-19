import { useEffect, useState } from 'react'
import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { AppToaster } from '@/components/ui/AppToaster'
import { AppLayout } from '@/components/layout/AppLayout'
import { useAuthStore } from '@/stores/authStore'
import { useAppStore } from '@/stores/appStore'
import { ItemDetailPage } from '@/pages/ItemDetailPage'
import { ItemsPage } from '@/pages/ItemsPage'
import { LoginPage } from '@/pages/LoginPage'
import { OrderDetailPage } from '@/pages/OrderDetailPage'
import { OrdersPage } from '@/pages/OrdersPage'
import { PickingPage } from '@/pages/PickingPage'
import { ProductionPage } from '@/pages/ProductionPage'
import { ProductionDetailPage } from '@/pages/ProductionDetailPage'
import { ProductionTaskDetailPage } from '@/pages/ProductionTaskDetailPage'
import { ReportsPage } from '@/pages/ReportsPage'
import { EmployeesPage } from '@/pages/EmployeesPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { WarehousesPage } from '@/pages/WarehousesPage'
import { StockPage } from '@/pages/StockPage'
import { MovePage } from '@/pages/MovePage'
import { PickOperationsPage } from '@/pages/PickOperationsPage'
import { useRealtimeNotifications } from '@/hooks/useRealtimeNotifications'
import { HistoryPage } from '@/pages/HistoryPage'
import AdminUsersPage from '@/pages/AdminUsersPage'
import AdminRolesPage from '@/pages/AdminRolesPage'
import { ChzPage } from '@/pages/ChzPage'
import { MarkingPage } from "@/pages/marking/MarkingPage";
function ThemeBridge() {
  const theme = useAppStore((state) => state.theme)

  useEffect(() => {
    const root = document.documentElement
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const shouldUseDark = theme === 'dark' || (theme === 'system' && media.matches)
      root.classList.toggle('dark', shouldUseDark)
    }

    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [theme])

  return null
}

function ProtectedRoute() {
  const token = useAuthStore((state) => state.token)

  if (!token) {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}

export default function App() {
  useRealtimeNotifications()
  return (
    <>
      <ThemeBridge />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/picking/:orderId" element={<PickingPage />} />
          <Route element={<AppLayout />}>
            <Route path="/" element={<Navigate to="/orders" replace />} />
            <Route path="/warehouses" element={<WarehousesPage />} />
            <Route path="/items" element={<ItemsPage />} />
            <Route path="/items/:id" element={<ItemDetailPage />} />
            <Route path="/orders" element={<OrdersPage />} />
            <Route path="/orders/:id" element={<OrderDetailPage />} />
            <Route path="/production" element={<ProductionPage />} />
            <Route path="/production/:id" element={<ProductionDetailPage />} />
            <Route path="/production/tasks/:taskKey" element={<ProductionTaskDetailPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/employees" element={<EmployeesPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/stocks" element={<StockPage />} />
            <Route path="/move" element={<MovePage />} />
            <Route path="/chz" element={<ChzPage />} />
            <Route path="/marking/*" element={<MarkingPage />} />
            <Route path="/orders/:orderId/pick-operations" element={<PickOperationsPage />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="/admin/users" element={<AdminUsersPage />} />
            <Route path="/admin/roles" element={<AdminRolesPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/orders" replace />} />
      </Routes>
      <AppToaster />
    </>
  )
}
