import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '@/api/client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { useAuthStore } from '@/stores/authStore'

interface Permission {
  id: number
  code: string
  description: string
  group: string
}

interface Role {
  id: number
  name: string
  description: string
  is_system: boolean
  permissions: Permission[]
}

const GROUP_LABELS: Record<string, string> = {
  warehouses: 'Склады',
  items: 'Номенклатура',
  cells: 'Ячейки',
  stocks: 'Остатки',
  orders: 'Заказы',
  picking: 'Отбор',
  production: 'Производство',
  marking: 'Маркировка',
  admin: 'Администрирование',
}

const GROUP_ORDER = [
  'warehouses',
  'items',
  'cells',
  'stocks',
  'orders',
  'picking',
  'production',
  'marking',
  'admin',
]

const ROLE_LABELS: Record<string, string> = {
  admin: 'Администратор',
  manager: 'Менеджер',
  storekeeper: 'Кладовщик',
  brigadier: 'Бригадир',
  operator: 'Оператор',
  viewer: 'Наблюдатель',
}

const HIDDEN_PERMISSION_CODES = new Set([
  'view_marking_withdrawal',
  'view_marking_chz',
  'view_marking_shipping',
  'view_chz_registry',
])

const MENU_PERMISSION_CODES = new Set([
  'view_warehouses',
  'view_items',
  'view_stocks',
  'view_orders',
  'view_production',
  'view_admin_stats',
  'view_moves',
  'view_history',
  'view_marking_turnover',
  'view_marking_orders',
  'view_marking_intro',
  'view_marking_tsd',
  'view_marking_labels',
  'view_marking_aggregation',
  'manage_users',
  'manage_roles',
])

function PermissionToggle({
  permission,
  selected,
  onToggle,
}: {
  permission: Permission
  selected: boolean
  onToggle: () => void
}) {
  return (
    <Checkbox
      isSelected={selected}
      onChange={onToggle}
      description={permission.code}
      className="w-full rounded-xl border border-border bg-background px-3 py-3 transition-colors duration-150 hover:bg-muted/40"
    >
      {permission.description}
    </Checkbox>
  )
}

export default function AdminRolesPage() {
  const currentUser = useAuthStore((state) => state.user)
  const token = useAuthStore((state) => state.token)
  const [roles, setRoles] = useState<Role[]>([])
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [editRole, setEditRole] = useState<Role | null>(null)
  const [selectedPerms, setSelectedPerms] = useState<number[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)

    const [rolesResponse, permissionsResponse] = await Promise.all([
      api.get('/admin/roles'),
      api.get('/admin/roles/permissions'),
    ])

    setRoles(rolesResponse.data)
    setPermissions(permissionsResponse.data)
    setLoading(false)
  }, [])

  useEffect(() => {
    if (currentUser?.role === 'admin') {
      void Promise.resolve().then(loadData)
    }
  }, [currentUser?.role, loadData])

  const visiblePermissions = useMemo(
    () => permissions.filter((permission) => !HIDDEN_PERMISSION_CODES.has(permission.code)),
    [permissions],
  )

  const menuPermissions = useMemo(
    () =>
      visiblePermissions
        .filter((permission) => MENU_PERMISSION_CODES.has(permission.code))
        .sort((left, right) => left.description.localeCompare(right.description, 'ru')),
    [visiblePermissions],
  )

  const groupedPermissions = useMemo(() => {
    const result = visiblePermissions
      .filter((permission) => !MENU_PERMISSION_CODES.has(permission.code))
      .reduce<Record<string, Permission[]>>((accumulator, permission) => {
        const current = accumulator[permission.group] ?? []
        current.push(permission)
        accumulator[permission.group] = current
        return accumulator
      }, {})

    return Object.entries(result)
      .sort(([left], [right]) => {
        const leftIndex = GROUP_ORDER.indexOf(left)
        const rightIndex = GROUP_ORDER.indexOf(right)

        if (leftIndex === -1 && rightIndex === -1) {
          return left.localeCompare(right, 'ru')
        }

        if (leftIndex === -1) return 1
        if (rightIndex === -1) return -1
        return leftIndex - rightIndex
      })
      .map(([group, groupPermissions]) => [
        group,
        groupPermissions.sort((left, right) =>
          left.description.localeCompare(right.description, 'ru'),
        ),
      ] as const)
  }, [visiblePermissions])

  const handleEdit = (role: Role) => {
    setEditRole(role)
    setSelectedPerms(role.permissions.map((permission) => permission.id))
  }

  const togglePermission = (permissionId: number) => {
    setSelectedPerms((current) =>
      current.includes(permissionId)
        ? current.filter((id) => id !== permissionId)
        : [...current, permissionId],
    )
  }

  const handleSave = async () => {
    if (!editRole) return

    try {
      setSaving(true)
      await api.patch(`/admin/roles/${editRole.id}`, { permission_ids: selectedPerms })
      setEditRole(null)
      await loadData()
    } finally {
      setSaving(false)
    }
  }

  if (token && !currentUser) {
    return (
      <div className="mx-auto max-w-6xl space-y-6 p-3 sm:p-6">
        <Card>
          <Card.Content className="pt-6 text-sm text-muted-foreground">
            Проверяем права доступа...
          </Card.Content>
        </Card>
      </div>
    )
  }

  if (!currentUser || currentUser.role !== 'admin') {
    return (
      <div className="mx-auto max-w-6xl space-y-6 p-3 sm:p-6">
        <Card>
          <Card.Content className="pt-6 text-sm text-muted-foreground">
            Нет доступа к настройке ролей.
          </Card.Content>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-3 sm:p-6">
      <Card>
        <Card.Header>
          <Card.Title>Роли и права</Card.Title>
        </Card.Header>

        <Card.Content>
          {loading ? (
            <p>Загрузка...</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                    <th className="p-3">Роль</th>
                    <th className="hidden p-3 sm:table-cell">Тип</th>
                    <th className="hidden p-3 sm:table-cell">Прав</th>
                    <th className="p-3">Действия</th>
                  </tr>
                </thead>

                <tbody>
                  {roles.map((role) => (
                    <tr key={role.id} className="border-b hover:bg-muted/50">
                      <td className="p-3">
                        <div className="font-semibold">{ROLE_LABELS[role.name] || role.name}</div>
                        <div className="text-xs text-muted-foreground sm:hidden">
                          {role.permissions.length} прав
                        </div>
                      </td>

                      <td className="hidden p-3 sm:table-cell">
                        <Badge tone={role.is_system ? 'warning' : 'neutral'}>
                          {role.is_system ? 'Системная' : 'Пользовательская'}
                        </Badge>
                      </td>

                      <td className="hidden p-3 sm:table-cell">{role.permissions.length}</td>

                      <td className="p-3">
                        <Button variant="outline" size="sm" onClick={() => handleEdit(role)}>
                          Настроить
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card.Content>
      </Card>

      <Dialog open={editRole !== null} onOpenChange={() => setEditRole(null)}>
        <DialogContent title={`Права: ${ROLE_LABELS[editRole?.name || ''] || editRole?.name || ''}`} className="max-w-5xl">
          <div className="max-h-[72vh] space-y-5 overflow-y-auto pr-1">
            <div className="rounded-2xl border border-border bg-muted/10 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="space-y-1">
                  <div className="text-sm font-semibold text-foreground">Разделы меню</div>
                  <div className="text-sm text-muted-foreground">
                    Эти галочки управляют тем, какие пункты и подразделы видны пользователю в боковом меню.
                  </div>
                </div>

                <Badge tone="secondary">{menuPermissions.length} пунктов</Badge>
              </div>

              <div className="mt-4 grid gap-2 md:grid-cols-2">
                {menuPermissions.map((permission) => (
                  <PermissionToggle
                    key={permission.id}
                    permission={permission}
                    selected={selectedPerms.includes(permission.id)}
                    onToggle={() => togglePermission(permission.id)}
                  />
                ))}
              </div>
            </div>

            {groupedPermissions.map(([group, groupPermissions]) => (
              <div key={group} className="rounded-2xl border border-border bg-card p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-foreground">
                    {GROUP_LABELS[group] || group}
                  </div>
                  <Badge tone="neutral">{groupPermissions.length}</Badge>
                </div>

                <div className="grid gap-2 md:grid-cols-2">
                  {groupPermissions.map((permission) => (
                    <PermissionToggle
                      key={permission.id}
                      permission={permission}
                      selected={selectedPerms.includes(permission.id)}
                      onToggle={() => togglePermission(permission.id)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEditRole(null)} disabled={saving}>
              Отмена
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Сохранение...' : 'Сохранить'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
